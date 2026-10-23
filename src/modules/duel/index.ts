/**
 * Entrée publique « serveur » du module Duel.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createDuelApi } from './api'
import { createDuelService } from './application/duel-service'
import { DUEL_CHANNEL_PREFIX } from './contracts'
import { createDrizzleActiveDuelsReader } from './infrastructure/drizzle-active-duels-reader'
import { createEventStoreDuelRepository } from './infrastructure/event-store-duel-repository'
import { createDuelHandlers } from './messages'
import { createDuelPersonalData } from './personal-data'

export interface DuelModuleDeps {
  /** Journal d'événements de la plateforme, fourni par la racine de composition. */
  store: EventStore
  /** Base de données, dans laquelle le module tient la liste des duels actifs. */
  db: Db
  /** Moteur des projections de la plateforme. */
  projections: ProjectionRunner
  /** Distribution de la boîte d'envoi, déclenchée par le Duel après ses commandes et lectures. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/**
 * Fabrique du module : assemble les adaptateurs, le service, l'API, la règle des canaux
 * et les gestionnaires de messages.
 */
export function createDuelModule({ store, db, projections, dispatch, clock }: DuelModuleDeps) {
  const repo = createEventStoreDuelRepository(store)
  const reader = createDrizzleActiveDuelsReader(db, projections)
  const service = createDuelService(repo, reader, { dispatch, clock })

  // Règle d'accès aux canaux des duels : seuls les deux duellistes peuvent l'écouter.
  // Le canal est discret : il ne transmet aucune donnée d'événement, car l'événement
  // MoveChosen révélerait la passe choisie par un duelliste avant la fin de la manche.
  const channelPolicy: ChannelPolicy = {
    prefix: DUEL_CHANNEL_PREFIX,
    redact: true,
    canSubscribe: async (channel, userId) => {
      const duelId = channel.slice(DUEL_CHANNEL_PREFIX.length)
      return (await service.getView(duelId, userId)) !== null
    },
  }

  return {
    api: createDuelApi(service),
    channelPolicy,
    handlers: createDuelHandlers(service),
    personalData: createDuelPersonalData(store, db),
  }
}

export type { DuelApi } from './api'
