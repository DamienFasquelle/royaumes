/**
 * Intelligence artificielle du maître d'armes, l'adversaire des duels d'entraînement (règle 17).
 * C'est une fonction pure : le même historique et la même graine donnent toujours la même passe.
 */
import { MOVES, type Move } from './content'

/** Passe qui répond le mieux à chaque passe de l'adversaire, selon le tableau de résolution. */
export const RESPONSE: Record<Move, Move> = {
  attack: 'counter',
  defend: 'heal',
  counter: 'heal',
  heal: 'attack',
}

/** Situation présentée au maître d'armes au moment de la résolution de la manche. */
export interface MasterContext {
  /** Passes jouées par son adversaire aux manches précédentes. */
  history: Move[]
  /** Soins qu'il lui reste (règle 13). */
  healsLeft: number
  seed: number
  round: number
}

/**
 * 1. Le maître d'armes attend la passe que son adversaire a le plus souvent jouée.
 *    Une égalité, et en particulier la première manche, est départagée par la graine du duel.
 * 2. Il joue la passe qui y répond ; s'il devait se soigner sans le pouvoir, il se défend.
 */
export function chooseMasterMove({ history, healsLeft, seed, round }: MasterContext): Move {
  const counts = MOVES.map((move) => history.filter((played) => played === move).length)
  const most = Math.max(...counts)
  const candidates = MOVES.filter((_, index) => counts[index] === most)
  const expected = candidates[((seed >>> 0) + round) % candidates.length]
  const response = RESPONSE[expected]
  return response === 'heal' && healsLeft <= 0 ? 'defend' : response
}
