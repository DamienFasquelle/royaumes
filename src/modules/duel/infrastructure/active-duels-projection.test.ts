import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { ActiveDuelsReader } from '../application/active-duels-reader'
import { MASTER_ID } from '../domain/content'
import { createDrizzleActiveDuelsReader } from './drizzle-active-duels-reader'
import { activeDuels } from './schema'

const T0 = Date.UTC(2026, 0, 1)

// Chaque test dispose d'un journal neuf et d'une table vide.
let db: Db
let store: EventStore
let reader: ActiveDuelsReader
beforeEach(async () => {
  db = await createTestDatabase()
  store = createEventStore(db)
  reader = createDrizzleActiveDuelsReader(db, createProjectionRunner(db))
})

// Fabriques d'événements du Duel.
const issued = (challengerId: string, opponentId: string, at = T0): NewEvent => ({
  type: 'ChallengeIssued',
  data: {
    duelId: '',
    challengerId,
    challengerName: challengerId,
    opponentId,
    stake: { wood: 50 },
    seed: 1,
    at,
    expiresAt: at + 1,
  },
})
const training = (playerId: string): NewEvent => ({
  type: 'TrainingStarted',
  data: { duelId: '', playerId, playerName: playerId, seed: 1, deadline: T0, at: T0 },
})

describe('Projection des duels actifs', () => {
  it('retrouve les duels d’un joueur, lancés ou reçus, les plus récents en tête', async () => {
    await store.append('duel-d1', 0, [issued('alice', 'bob')])
    await store.append('duel-d2', 0, [issued('carol', 'alice', T0 + 1000)])
    await store.append('duel-d3', 0, [issued('bob', 'carol')])

    expect(await reader.activeDuelIds(['alice'])).toEqual(['d2', 'd1'])
    expect(await reader.activeDuelIds(['dave'])).toEqual([])
  })

  it('suit l’avancement du duel, et enregistre le nom de l’adversaire à son acceptation', async () => {
    await store.append('duel-d1', 0, [
      issued('alice', 'bob'),
      { type: 'ChallengerStakeReserved', data: { at: T0 } },
      { type: 'ChallengeAccepted', data: { opponentId: 'bob', opponentName: 'Bob', at: T0 } },
    ])
    await reader.activeDuelIds(['alice'])
    expect(await db.select().from(activeDuels)).toMatchObject([
      { duelId: 'd1', status: 'accepting', opponentName: 'Bob' },
    ])
  })

  it('écarte les duels terminés ou annulés', async () => {
    await store.append('duel-d1', 0, [
      issued('alice', 'bob'),
      { type: 'ChallengeCancelled', data: { reason: 'declined', at: T0 } },
    ])
    await store.append('duel-d2', 0, [
      training('alice'),
      {
        type: 'DuelEnded',
        data: { outcome: 'won', winnerId: MASTER_ID, reason: 'knockout', at: T0 },
      },
    ])
    expect(await reader.activeDuelIds(['alice'])).toEqual([])
  })
})
