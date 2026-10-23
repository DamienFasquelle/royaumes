/**
 * Domaine du Duel : l'état d'un duel, ses événements et leur application, selon le modèle
 * decider. L'état résume aussi l'avancement de la saga des mises (prélèvements auprès du
 * Village). Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */
import { MASTER_ID, MASTER_NAME, MAX_HP, type Move, type Stake } from './content'

/**
 * États d'un duel ; les deux derniers sont finaux.
 * - reserving : la mise du joueur qui lance le défi est en cours de prélèvement ;
 * - pending : le défi attend la réponse de l'adversaire ;
 * - accepting : la mise de l'adversaire est en cours de prélèvement ;
 * - fighting : le duel se joue, manche après manche.
 */
export type DuelStatus =
  | 'reserving'
  | 'pending'
  | 'accepting'
  | 'fighting'
  | 'finished'
  | 'cancelled'

/** Motif de l'annulation d'un défi, avant que le duel ait commencé. */
export type CancelReason =
  /** La mise du joueur qui lance le défi a été refusée par son village (règle 6). */
  | 'unfunded'
  /** L'adversaire a refusé le défi, ou son lanceur l'a annulé (règles 4 et 8). */
  | 'declined'
  | 'withdrawn'
  /** Le défi n'a pas reçu de réponse à temps (règle 5). */
  | 'expired'
  /** La mise de l'adversaire a été refusée par son village : c'est la compensation (règle 7). */
  | 'opponent-unfunded'

/** Issue d'un duel terminé (règles 14 et 15). */
export interface DuelResult {
  outcome: 'won' | 'draw'
  winnerId: string | null
  reason: 'knockout' | 'rounds' | 'forfeit'
}

export interface Duelist {
  id: string
  name: string
  hp: number
  /** Soins déjà utilisés (règle 13). */
  heals: number
  /** Manches manquées d'affilée (règle 14). */
  missed: number
}

/** Manche résolue : les passes révélées des deux duellistes, et les points de vie qui en résultent. */
export interface ResolvedRound {
  round: number
  moves: Record<string, Move>
  /** Duellistes qui n'avaient pas choisi à l'échéance. */
  missed: string[]
  hp: Record<string, number>
}

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface DuelState {
  /** Faux tant que le duel n'a pas été lancé. */
  exists: boolean
  duelId: string
  /** Vrai pour un duel d'entraînement contre le maître d'armes, sans mise (règle 16). */
  training: boolean
  seed: number
  /** Ressources mises en jeu par chaque duelliste ; aucune pour un entraînement. */
  stake: Stake
  challenger: Duelist
  opponent: Duelist
  status: DuelStatus
  cancelReason: CancelReason | null
  issuedAt: number
  /** Échéance de la réponse au défi (règle 5). */
  expiresAt: number
  round: number
  /** Échéance de la manche en cours ; null hors combat. */
  deadline: number | null
  /** Passes choisies pour la manche en cours, gardées secrètes jusqu'à sa résolution (règle 11). */
  choices: Record<string, Move>
  rounds: ResolvedRound[]
  result: DuelResult | null
}

const noDuelist: Duelist = { id: '', name: '', hp: MAX_HP, heals: 0, missed: 0 }
const newDuelist = (id: string, name: string): Duelist => ({ ...noDuelist, id, name })

export const initialState: DuelState = {
  exists: false,
  duelId: '',
  training: false,
  seed: 0,
  stake: {},
  challenger: noDuelist,
  opponent: noDuelist,
  status: 'reserving',
  cancelReason: null,
  issuedAt: 0,
  expiresAt: 0,
  round: 0,
  deadline: null,
  choices: {},
  rounds: [],
  result: null,
}

/** Les deux duellistes, celui qui a lancé le défi en premier. */
export const duelistsOf = (state: DuelState): [Duelist, Duelist] => [
  state.challenger,
  state.opponent,
]

/** Vrai si le joueur est l'un des deux duellistes. */
export const isDuelist = (state: DuelState, playerId: string) =>
  state.challenger.id === playerId || state.opponent.id === playerId

/** Un duel actif occupe ses deux duellistes (règle 3). */
export const isActive = (state: DuelState) =>
  state.exists && state.status !== 'finished' && state.status !== 'cancelled'

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type DuelEvent =
  | {
      type: 'ChallengeIssued'
      data: {
        duelId: string
        challengerId: string
        challengerName: string
        opponentId: string
        stake: Stake
        seed: number
        at: number
        expiresAt: number
      }
    }
  | {
      type: 'TrainingStarted'
      data: {
        duelId: string
        playerId: string
        playerName: string
        seed: number
        deadline: number
        at: number
      }
    }
  | { type: 'ChallengerStakeReserved'; data: { at: number } }
  /** Le nom de l'adversaire n'est connu qu'à son acceptation : il est alors le joueur connecté. */
  | { type: 'ChallengeAccepted'; data: { opponentId: string; opponentName: string; at: number } }
  | { type: 'DuelStarted'; data: { deadline: number; at: number } }
  | { type: 'ChallengeCancelled'; data: { reason: CancelReason; at: number } }
  | { type: 'MoveChosen'; data: { playerId: string; round: number; move: Move; at: number } }
  | {
      type: 'RoundResolved'
      data: ResolvedRound & { nextDeadline: number | null; at: number }
    }
  | { type: 'DuelEnded'; data: DuelResult & { at: number } }

// ---------------------------------------------------------------------------
// Identifiants des mouvements de ressources
// ---------------------------------------------------------------------------

/**
 * Identifiant d'un mouvement de ressources : il est déterminé par le duel et par l'étape de
 * la saga, et sert de clé d'idempotence au Village. Chaque étape n'a lieu qu'une fois par duel.
 */
export const transferIdOf = (duelId: string, step: string) => `${duelId}:${step}`

/** Identifiant du duel auquel se rapporte un mouvement. */
export const duelIdOf = (transferId: string) => transferId.slice(0, transferId.indexOf(':'))

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

/** Applique une fonction au duelliste désigné, quel que soit son rôle. */
function updateDuelist(state: DuelState, id: string, change: (d: Duelist) => Duelist): DuelState {
  if (state.challenger.id === id) return { ...state, challenger: change(state.challenger) }
  if (state.opponent.id === id) return { ...state, opponent: change(state.opponent) }
  return state
}

export function evolve(state: DuelState, event: DuelEvent): DuelState {
  switch (event.type) {
    case 'ChallengeIssued': {
      const { data } = event
      return {
        ...initialState,
        exists: true,
        duelId: data.duelId,
        seed: data.seed,
        stake: data.stake,
        challenger: newDuelist(data.challengerId, data.challengerName),
        opponent: newDuelist(data.opponentId, ''),
        status: 'reserving',
        issuedAt: data.at,
        expiresAt: data.expiresAt,
      }
    }
    case 'TrainingStarted': {
      const { data } = event
      return {
        ...initialState,
        exists: true,
        duelId: data.duelId,
        training: true,
        seed: data.seed,
        challenger: newDuelist(data.playerId, data.playerName),
        opponent: newDuelist(MASTER_ID, MASTER_NAME),
        status: 'fighting',
        issuedAt: data.at,
        round: 1,
        deadline: data.deadline,
      }
    }
    case 'ChallengerStakeReserved':
      return { ...state, status: 'pending' }
    case 'ChallengeAccepted':
      return {
        ...state,
        status: 'accepting',
        opponent: { ...state.opponent, name: event.data.opponentName },
      }
    case 'DuelStarted':
      return { ...state, status: 'fighting', round: 1, deadline: event.data.deadline }
    case 'ChallengeCancelled':
      return { ...state, status: 'cancelled', cancelReason: event.data.reason }
    case 'MoveChosen':
      return { ...state, choices: { ...state.choices, [event.data.playerId]: event.data.move } }
    case 'RoundResolved': {
      const { round, moves, missed, hp, nextDeadline } = event.data
      let next: DuelState = {
        ...state,
        round: round + 1,
        deadline: nextDeadline,
        choices: {},
        rounds: [...state.rounds, { round, moves, missed, hp }],
      }
      for (const id of Object.keys(moves)) {
        next = updateDuelist(next, id, (duelist) => ({
          ...duelist,
          hp: hp[id],
          heals: duelist.heals + (moves[id] === 'heal' ? 1 : 0),
          missed: missed.includes(id) ? duelist.missed + 1 : 0,
        }))
      }
      return next
    }
    case 'DuelEnded': {
      const { outcome, winnerId, reason } = event.data
      return { ...state, status: 'finished', deadline: null, result: { outcome, winnerId, reason } }
    }
  }
}

export const replay = (events: DuelEvent[]) => events.reduce(evolve, initialState)
