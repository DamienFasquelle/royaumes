import { eq } from 'drizzle-orm'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { DUEL_CHANNEL_PREFIX } from '../contracts'
import { MASTER_ID, MASTER_NAME } from '../domain/content'
import type { DuelEvent } from '../domain/duel'
import { activeDuels } from './schema'

/** Identifiant du duel tiré du nom de son flux : « duel-7f3a » donne « 7f3a ». */
const duelIdOf = (event: StoredEvent) => event.stream.slice(DUEL_CHANNEL_PREFIX.length)

/** Projection des duels actifs, construite à partir des événements du Duel. */
export const activeDuelsProjection: Projection = {
  name: 'duel-active-duels',
  version: 1,
  eventTypes: [
    'ChallengeIssued',
    'TrainingStarted',
    'ChallengerStakeReserved',
    'ChallengeAccepted',
    'DuelStarted',
    'ChallengeCancelled',
    'DuelEnded',
  ],

  async apply(stored, tx) {
    const event = { type: stored.type, data: stored.data } as DuelEvent
    const duelId = duelIdOf(stored)
    /** Change l'état du duel dans la table. */
    const setStatus = (status: string) =>
      tx.update(activeDuels).set({ status }).where(eq(activeDuels.duelId, duelId))

    switch (event.type) {
      case 'ChallengeIssued':
        await tx.insert(activeDuels).values({
          duelId,
          challengerId: event.data.challengerId,
          challengerName: event.data.challengerName,
          opponentId: event.data.opponentId,
          opponentName: '',
          training: false,
          stake: event.data.stake,
          status: 'reserving',
          issuedAt: event.data.at,
        })
        return
      case 'TrainingStarted':
        await tx.insert(activeDuels).values({
          duelId,
          challengerId: event.data.playerId,
          challengerName: event.data.playerName,
          opponentId: MASTER_ID,
          opponentName: MASTER_NAME,
          training: true,
          stake: {},
          status: 'fighting',
          issuedAt: event.data.at,
        })
        return
      case 'ChallengerStakeReserved':
        await setStatus('pending')
        return
      case 'ChallengeAccepted':
        await tx
          .update(activeDuels)
          .set({ status: 'accepting', opponentName: event.data.opponentName })
          .where(eq(activeDuels.duelId, duelId))
        return
      case 'DuelStarted':
        await setStatus('fighting')
        return
      // États finaux : le duel quitte la table.
      case 'ChallengeCancelled':
      case 'DuelEnded':
        await tx.delete(activeDuels).where(eq(activeDuels.duelId, duelId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(activeDuels)
  },
}
