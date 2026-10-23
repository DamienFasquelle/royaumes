import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { DUEL_CHANNEL_PREFIX } from './contracts'
import type { Move, Stake } from './domain/content'
import { activeDuels } from './infrastructure/schema'

/** Identifiant du duel d'un événement du Duel. */
const duelIdOf = (event: StoredEvent) => event.stream.slice(DUEL_CHANNEL_PREFIX.length)

/** Participation d'un joueur à un duel, telle qu'elle figure dans l'export. */
interface Participation {
  duelId: string
  role: 'challenger' | 'opponent'
  training: boolean
  stake: Stake
  issuedAt: number
  /** Passes jouées par le joueur, manche après manche. */
  moves: Move[]
  result: 'won' | 'lost' | 'draw' | 'cancelled' | null
}

/**
 * Données personnelles du Duel : le nom du joueur, copié dans les événements des duels qu'il a
 * lancés ou acceptés, et l'historique de ses duels.
 */
export function createDuelPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'duel',

    // L'export présente les participations du joueur, et non les événements eux-mêmes :
    // ceux-ci contiennent la graine des duels, le nom et les passes de l'adversaire.
    async export(playerId) {
      const stored = await store.readAll({
        streamPrefix: DUEL_CHANNEL_PREFIX,
        types: [
          'ChallengeIssued',
          'TrainingStarted',
          'ChallengeAccepted',
          'RoundResolved',
          'ChallengeCancelled',
          'DuelEnded',
        ],
      })
      const duels = new Map<string, Participation>()
      for (const event of stored) {
        const duelId = duelIdOf(event)
        const { data } = event
        if (event.type === 'ChallengeIssued' || event.type === 'TrainingStarted') {
          const training = event.type === 'TrainingStarted'
          const challengerId = training ? data.playerId : data.challengerId
          if (challengerId !== playerId && data.opponentId !== playerId) continue
          duels.set(duelId, {
            duelId,
            role: challengerId === playerId ? 'challenger' : 'opponent',
            training,
            stake: training ? {} : (data.stake as Stake),
            issuedAt: data.at as number,
            moves: [],
            result: null,
          })
          continue
        }
        const duel = duels.get(duelId)
        if (!duel) continue
        if (event.type === 'RoundResolved') {
          const move = (data.moves as Record<string, Move>)[playerId]
          if (move) duel.moves.push(move)
        } else if (event.type === 'ChallengeCancelled') {
          duel.result = 'cancelled'
        } else if (event.type === 'DuelEnded') {
          if (data.outcome === 'draw') duel.result = 'draw'
          else duel.result = data.winnerId === playerId ? 'won' : 'lost'
        }
      }
      return { duels: [...duels.values()] }
    },

    redact(event, playerId) {
      if (!event.stream.startsWith(DUEL_CHANNEL_PREFIX)) return null
      if (event.type === 'ChallengeIssued' && event.data.challengerId === playerId) {
        return event.data.challengerName === ERASED_NAME
          ? null
          : { ...event.data, challengerName: ERASED_NAME }
      }
      if (event.type === 'TrainingStarted' && event.data.playerId === playerId) {
        return event.data.playerName === ERASED_NAME
          ? null
          : { ...event.data, playerName: ERASED_NAME }
      }
      if (event.type === 'ChallengeAccepted' && event.data.opponentId === playerId) {
        return event.data.opponentName === ERASED_NAME
          ? null
          : { ...event.data, opponentName: ERASED_NAME }
      }
      return null
    },

    // La table des duels actifs contient le nom des deux duellistes.
    async erase(playerId) {
      await db
        .update(activeDuels)
        .set({ challengerName: ERASED_NAME })
        .where(eq(activeDuels.challengerId, playerId))
      await db
        .update(activeDuels)
        .set({ opponentName: ERASED_NAME })
        .where(eq(activeDuels.opponentId, playerId))
    },
  }
}
