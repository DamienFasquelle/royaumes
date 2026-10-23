/**
 * Vue filtrée d'un duel : ce qu'un duelliste a le droit de connaître.
 * L'API ne renvoie jamais l'état complet, seulement cette vue.
 */
import { MASTER_ID, MAX_HEALS, MAX_HP, MAX_ROUNDS, type Move, type Stake } from './content'
import {
  type CancelReason,
  type Duelist,
  type DuelResult,
  type DuelState,
  type DuelStatus,
  evolve,
  isDuelist,
  type ResolvedRound,
} from './duel'
import { settle } from './rules'

export interface DuelistView {
  id: string
  name: string
  hp: number
  maxHp: number
  healsLeft: number
  /** Vrai si le duelliste a choisi sa passe ; toujours vrai pour le maître d'armes, qui n'attend pas. */
  ready: boolean
  /** Passe choisie pour la manche en cours : connue de son seul auteur, null pour l'adversaire. */
  move: Move | null
}

export interface DuelView {
  duelId: string
  training: boolean
  /** Ressources mises en jeu par chaque duelliste. */
  stake: Stake
  status: DuelStatus
  cancelReason: CancelReason | null
  /** Rôle du joueur qui consulte la vue. */
  role: 'challenger' | 'opponent'
  me: DuelistView
  rival: DuelistView
  round: number
  maxRounds: number
  /** Échéance de la manche en cours, ou null hors combat. */
  deadline: number | null
  /** Échéance de la réponse au défi. */
  expiresAt: number
  /** Manches résolues, dont les passes sont désormais révélées. */
  rounds: ResolvedRound[]
  result: DuelResult | null
}

/**
 * Calcule la vue d'un duel pour le joueur viewerId, à l'instant now, ou null si le duel
 * n'existe pas ou si ce joueur n'en est pas l'un des duellistes. Les échéances passées sont
 * appliquées dans la vue, mais rien n'est enregistré : une lecture n'écrit jamais.
 */
export function toView(state: DuelState, viewerId: string, now: number): DuelView | null {
  if (!state.exists || viewerId === MASTER_ID || !isDuelist(state, viewerId)) return null
  const current = settle(state, now).reduce(evolve, state)
  const fighting = current.status === 'fighting'
  const role = current.challenger.id === viewerId ? 'challenger' : 'opponent'
  const [me, rival] =
    role === 'challenger'
      ? [current.challenger, current.opponent]
      : [current.opponent, current.challenger]

  // La passe de l'adversaire pour la manche en cours n'est jamais transmise (règle 11),
  // pas plus que la graine du duel, qui permettrait de prévoir le maître d'armes.
  const show = (duelist: Duelist): DuelistView => ({
    id: duelist.id,
    name: duelist.name,
    hp: duelist.hp,
    maxHp: MAX_HP,
    healsLeft: MAX_HEALS - duelist.heals,
    ready: fighting && (duelist.id === MASTER_ID || current.choices[duelist.id] !== undefined),
    move: duelist.id === viewerId ? (current.choices[duelist.id] ?? null) : null,
  })

  return {
    duelId: current.duelId,
    training: current.training,
    stake: current.stake,
    status: current.status,
    cancelReason: current.cancelReason,
    role,
    me: show(me),
    rival: show(rival),
    round: current.round,
    maxRounds: MAX_ROUNDS,
    deadline: current.deadline,
    expiresAt: current.expiresAt,
    rounds: current.rounds,
    result: current.result,
  }
}
