import { describe, expect, it } from 'vitest'
import { MOVES, type Move } from './content'
import { chooseMasterMove, RESPONSE } from './master'

const context = (history: Move[], healsLeft = 3, seed = 1, round = 1) => ({
  history,
  healsLeft,
  seed,
  round,
})

describe("Maître d'armes", () => {
  it('répond à la passe la plus fréquente de son adversaire', () => {
    expect(chooseMasterMove(context(['attack', 'attack', 'defend']))).toBe('counter')
    expect(chooseMasterMove(context(['defend', 'defend', 'attack']))).toBe('heal')
    expect(chooseMasterMove(context(['counter', 'counter']))).toBe('heal')
    expect(chooseMasterMove(context(['heal', 'heal', 'defend']))).toBe('attack')
  })

  it('se défend au lieu de se soigner lorsqu’il ne le peut plus', () => {
    expect(chooseMasterMove(context(['defend'], 0))).toBe('defend')
    // Une attaque n'est pas concernée par la limite des soins.
    expect(chooseMasterMove(context(['heal'], 0))).toBe('attack')
  })

  it('départage une égalité par la graine du duel, toujours de la même façon', () => {
    // Première manche : aucune passe n'est connue, les quatre sont à égalité.
    const responses = MOVES.map((move) => RESPONSE[move])
    const first = chooseMasterMove(context([], 3, 5, 1))
    expect(responses).toContain(first)
    expect(chooseMasterMove(context([], 3, 5, 1))).toBe(first)

    // Égalité entre l'attaque et le soin : la graine choisit l'une des deux réponses.
    const tie: Move[] = ['attack', 'heal']
    const picks = [0, 1, 2, 3].map((seed) => chooseMasterMove(context(tie, 3, seed, 1)))
    expect(new Set(picks)).toEqual(new Set(['counter', 'attack']))
  })
})
