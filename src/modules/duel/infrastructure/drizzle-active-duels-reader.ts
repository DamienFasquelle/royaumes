import { desc, inArray, or } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ActiveDuelsReader } from '../application/active-duels-reader'
import { activeDuelsProjection } from './active-duels-projection'
import { activeDuels } from './schema'

/** Adaptateur du port ActiveDuelsReader, fondé sur la table des duels actifs. */
export function createDrizzleActiveDuelsReader(
  db: Db,
  projections: ProjectionRunner,
): ActiveDuelsReader {
  return {
    async activeDuelIds(playerIds) {
      await projections.catchUp(activeDuelsProjection)
      const rows = await db
        .select({ duelId: activeDuels.duelId })
        .from(activeDuels)
        .where(
          or(
            inArray(activeDuels.challengerId, playerIds),
            inArray(activeDuels.opponentId, playerIds),
          ),
        )
        .orderBy(desc(activeDuels.issuedAt))
      return rows.map((row) => row.duelId)
    },
  }
}
