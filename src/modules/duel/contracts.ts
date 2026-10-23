/**
 * Entrée publique « partagée » du module Duel : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des constantes,
 * des schémas de validation et des fonctions pures.
 */
import { z } from 'zod'
import { MOVES, STAKE_MAX, STAKE_MIN } from './domain/content'

/** Quantité d'une ressource mise en jeu : un entier entre les bornes de la règle 1. */
const StakeAmount = z.number().int().min(STAKE_MIN).max(STAKE_MAX)

export type { Move, Stake, StakeResource } from './domain/content'
export {
  CHALLENGE_TTL_MS,
  MASTER_ID,
  MAX_HEALS,
  MAX_HP,
  MAX_ROUNDS,
  MOVES,
  ROUND_MS,
  STAKE_MAX,
  STAKE_MIN,
  STAKE_RESOURCES,
} from './domain/content'
export type { CancelReason, DuelResult, DuelStatus, Effect, ResolvedRound } from './domain/duel'
export type { DuelError } from './domain/rules'
export type { DuelistView, DuelView } from './domain/view'

/**
 * Corps attendu pour défier un joueur : son identifiant, et la mise. La mise est faite de bois,
 * de pierre ou d'or, au choix, éventuellement combinés : au moins une ressource, aucune autre clé.
 */
export const ChallengeInput = z.object({
  opponentId: z.string().min(1).max(100),
  stake: z
    .object({
      wood: StakeAmount.optional(),
      stone: StakeAmount.optional(),
      gold: StakeAmount.optional(),
    })
    .strict()
    .refine((stake) => Object.keys(stake).length > 0, 'Au moins une ressource est attendue'),
})

/** Corps attendu pour choisir une passe : la manche visée, et la passe elle-même. */
export const ChooseMoveInput = z.object({
  round: z.number().int().positive(),
  move: z.enum(MOVES),
})

/** Préfixe commun aux noms des flux, et des canaux, de tous les duels. */
export const DUEL_CHANNEL_PREFIX = 'duel-'

/**
 * Nom du flux qui contient les événements d'un duel. Il est identique au nom de son canal
 * temps réel : écouter ce canal, c'est recevoir les événements de ce flux.
 */
export const duelChannel = (duelId: string) => `${DUEL_CHANNEL_PREFIX}${duelId}`

/** Sujets des messages adressés au Duel. */
export const DUEL_TOPICS = {
  /** Réponse du Village au prélèvement d'une mise. */
  stakeResult: 'duel.stake-result',
} as const
