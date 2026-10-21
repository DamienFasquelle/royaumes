import { asc, eq, gt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { type StoredEvent, toStored } from '../event-store/event-store'
import { events } from '../event-store/schema'
import { projections } from './schema'

/** Transaction ouverte par le moteur, dans laquelle une projection met à jour ses tables. */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Projection : modèle de lecture tenu à jour à partir du journal.
 * apply est appelée pour chaque événement de l'un des types déclarés, dans l'ordre global,
 * à l'intérieur de la transaction qui fait aussi avancer le point de reprise.
 */
export interface Projection {
  /** Nom unique, qui identifie le point de reprise de la projection. */
  name: string
  /** Types d'événements traités ; les autres sont ignorés. */
  eventTypes: string[]
  apply(event: StoredEvent, tx: DbTransaction): Promise<void>
}

/** Moteur des projections, partagé par les modules. */
export interface ProjectionRunner {
  /**
   * Applique à la projection les événements postérieurs à son point de reprise,
   * puis avance ce point. Renvoie le nombre d'événements appliqués.
   */
  catchUp(projection: Projection): Promise<number>
  /** Position du dernier événement traité par la projection ; 0 si elle n'a encore rien traité. */
  positionOf(name: string): Promise<number>
}

export interface ProjectionRunnerOptions {
  /** Horloge, en millisecondes ; l'heure réelle par défaut. Remplacée dans les tests. */
  now?: () => number
  /**
   * Délai au-delà duquel une position manquante est considérée comme définitivement perdue.
   * Une position est attribuée au début d'une insertion : tant que celle-ci n'est pas validée,
   * ou si elle est annulée, la position manque. Un écart récent peut donc encore se combler.
   */
  gapTimeoutMs?: number
}

/** Moteur des projections fondé sur les tables platform.events et platform.projections. */
export function createProjectionRunner(
  db: Db,
  { now = Date.now, gapTimeoutMs = 5_000 }: ProjectionRunnerOptions = {},
): ProjectionRunner {
  return {
    catchUp(projection) {
      return db.transaction(async (tx) => {
        // Le point de reprise est verrouillé : deux rattrapages simultanés de la même projection
        // s'exécutent l'un après l'autre, et chaque événement n'est appliqué qu'une fois.
        await tx.insert(projections).values({ name: projection.name }).onConflictDoNothing()
        const [checkpoint] = await tx
          .select({ position: projections.position })
          .from(projections)
          .where(eq(projections.name, projection.name))
          .for('update')

        // Tous les types sont lus, afin de repérer les positions manquantes.
        const rows = await tx
          .select()
          .from(events)
          .where(gt(events.position, checkpoint.position))
          .orderBy(asc(events.position))

        let position = checkpoint.position
        let applied = 0
        for (const row of rows) {
          // Écart récent : l'événement manquant peut encore être validé. On s'arrête devant lui.
          const gap = row.position !== position + 1
          if (gap && now() - row.occurredAt.getTime() < gapTimeoutMs) break

          if (projection.eventTypes.includes(row.type)) {
            await projection.apply(toStored(row), tx)
            applied++
          }
          position = row.position
        }

        if (position !== checkpoint.position) {
          await tx
            .update(projections)
            .set({ position, updatedAt: sql`now()` })
            .where(eq(projections.name, projection.name))
        }
        return applied
      })
    },

    async positionOf(name) {
      const [row] = await db
        .select({ position: projections.position })
        .from(projections)
        .where(eq(projections.name, name))
      return row?.position ?? 0
    },
  }
}
