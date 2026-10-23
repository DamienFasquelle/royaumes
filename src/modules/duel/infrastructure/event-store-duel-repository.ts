import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { DuelRepository } from '../application/duel-repository'
import { duelChannel } from '../contracts'
import { type DuelEvent, replay } from '../domain/duel'

/** Adaptateur du port DuelRepository fondé sur le journal d'événements. */
export function createEventStoreDuelRepository(store: EventStore): DuelRepository {
  return {
    async load(duelId) {
      const stored = await store.read(duelChannel(duelId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as DuelEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(duelId, expectedVersion, events, messages) {
      // Les événements du duel et les messages de la saga : une seule transaction.
      await store.append(
        duelChannel(duelId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
