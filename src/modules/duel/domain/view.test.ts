import { describe, expect, it } from 'vitest'
import { ROUND_MS } from './content'
import { type DuelState, evolve, initialState } from './duel'
import { type DuelCommand, decide } from './rules'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)

function apply(state: DuelState, command: DuelCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  return decision.events.reduce(evolve, state)
}

const fighting = [
  {
    type: 'IssueChallenge',
    duelId: 'd1',
    challengerId: 'alice',
    challengerName: 'Alice',
    opponentId: 'bob',
    stake: { stone: 30 },
    seed: 3,
  },
  { type: 'RecordTransferResult', transferId: 'd1:stake-challenger', outcome: 'withdrawn' },
  { type: 'AcceptChallenge', playerId: 'bob', playerName: 'Bob' },
  { type: 'RecordTransferResult', transferId: 'd1:stake-opponent', outcome: 'withdrawn' },
].reduce((state, command) => apply(state, command as DuelCommand), initialState)

describe('Duel - vue', () => {
  it('règle 11 : la passe de l’adversaire reste cachée tant que la manche n’est pas résolue', () => {
    const chosen = apply(fighting, {
      type: 'ChooseMove',
      playerId: 'alice',
      round: 1,
      move: 'counter',
    })

    const forAlice = toView(chosen, 'alice', T0)
    expect(forAlice?.me).toMatchObject({ ready: true, move: 'counter' })

    // Bob sait qu'Alice a choisi, mais pas quelle passe.
    const forBob = toView(chosen, 'bob', T0)
    expect(forBob?.rival).toMatchObject({ id: 'alice', ready: true, move: null })
    expect(JSON.stringify(forBob)).not.toContain('counter')

    // Une fois la manche résolue, les deux passes sont révélées à chacun.
    const resolved = apply(chosen, {
      type: 'ChooseMove',
      playerId: 'bob',
      round: 1,
      move: 'defend',
    })
    expect(toView(resolved, 'bob', T0)?.rounds[0].moves).toEqual({
      alice: 'counter',
      bob: 'defend',
    })
  })

  it('n’est accessible qu’aux deux duellistes, et ne transmet pas la graine', () => {
    expect(toView(fighting, 'carol', T0)).toBeNull()
    expect(toView(initialState, 'alice', T0)).toBeNull()
    expect(toView(fighting, 'bob', T0)).not.toHaveProperty('seed')
  })

  it('présente les échéances passées, sans rien enregistrer', () => {
    const view = toView(fighting, 'alice', T0 + ROUND_MS)
    expect(view?.round).toBe(2)
    expect(view?.rounds[0].missed).toEqual(['alice', 'bob'])
    expect(fighting.round).toBe(1)
  })
})
