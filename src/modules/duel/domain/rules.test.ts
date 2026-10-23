import { describe, expect, it } from 'vitest'
import {
  CHALLENGE_TTL_MS,
  MASTER_ID,
  MAX_HEALS,
  MAX_HP,
  MAX_ROUNDS,
  type Move,
  ROUND_MS,
  type Stake,
} from './content'
import { type DuelEvent, type DuelState, evolve, initialState, isActive } from './duel'
import { checkAvailability, type DuelCommand, decide, resolveRound } from './rules'
import { requestsFor } from './saga'

const T0 = Date.UTC(2026, 0, 1)

/** Applique une commande acceptée ; renvoie le nouvel état, les événements et les demandes de la saga. */
function play(state: DuelState, command: DuelCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    current = evolve(current, event)
    requests.push(...requestsFor(current, event))
  }
  return { state: current, events: decision.events, requests }
}

/** Mise d'Alice, et la mise doublée que reçoit le vainqueur : du bois et de la pierre, combinés. */
const STAKE = { wood: 60, stone: 20 }
const BOTH_STAKES = { wood: 120, stone: 40 }

const issue = (stake: Record<string, number> = STAKE): DuelCommand => ({
  type: 'IssueChallenge',
  duelId: 'd1',
  challengerId: 'alice',
  challengerName: 'Alice',
  opponentId: 'bob',
  stake: stake as Stake,
  seed: 42,
})
const result = (step: string, outcome: 'withdrawn' | 'refused'): DuelCommand => ({
  type: 'RecordTransferResult',
  transferId: `d1:${step}`,
  outcome,
})
const choose = (playerId: string, round: number, move: Move): DuelCommand => ({
  type: 'ChooseMove',
  playerId,
  round,
  move,
})

// Défi lancé, mise d'Alice prélevée, défi accepté par Bob, mise de Bob prélevée.
const reserving = play(initialState, issue()).state
const pending = play(reserving, result('stake-challenger', 'withdrawn')).state
const accepting = play(pending, {
  type: 'AcceptChallenge',
  playerId: 'bob',
  playerName: 'Bob',
}).state
const fighting = play(accepting, result('stake-opponent', 'withdrawn')).state

/** Joue une suite de manches, chaque duelliste choisissant la passe indiquée. */
function fight(state: DuelState, rounds: [Move, Move][], now = T0) {
  let current = state
  const requests = []
  for (const [a, b] of rounds) {
    current = play(current, choose('alice', current.round, a), now).state
    const last = play(current, choose('bob', current.round, b), now)
    current = last.state
    requests.push(...last.requests)
  }
  return { state: current, requests }
}

describe('Duel - lancement du défi', () => {
  it('règle 1 : refuse une mise vide, hors des bornes, ou d’une ressource inconnue', () => {
    const invalid: Record<string, number>[] = [
      {},
      { wood: 9 },
      { stone: 501 },
      { gold: 10.5 },
      { wood: -10 },
      { iron: 50 },
      { wood: 50, stone: 5 },
    ]
    for (const stake of invalid) {
      expect(decide(initialState, issue(stake), T0)).toEqual({
        ok: false,
        error: { code: 'INVALID_STAKE' },
      })
    }
  })

  it('règle 1 : accepte du bois, de la pierre ou de l’or, seuls ou combinés', () => {
    const valid: Record<string, number>[] = [
      { wood: 10 },
      { stone: 500 },
      { gold: 50 },
      { wood: 50, stone: 20, gold: 10 },
    ]
    for (const stake of valid) expect(decide(initialState, issue(stake), T0).ok).toBe(true)
  })

  it('règle 2 : refuse un défi lancé à soi-même, ou au maître d’armes', () => {
    const self = { ...issue(), opponentId: 'alice' } as DuelCommand
    expect(decide(initialState, self, T0)).toEqual({
      ok: false,
      error: { code: 'SELF_CHALLENGE' },
    })
    const master = { ...issue(), opponentId: MASTER_ID } as DuelCommand
    expect(decide(initialState, master, T0)).toEqual({
      ok: false,
      error: { code: 'INVALID_OPPONENT' },
    })
  })

  it('règle 3 : refuse un duel à un joueur qui en a déjà un actif', () => {
    const busy = new Set(['bob'])
    expect(checkAvailability(['alice', 'bob'], busy)).toEqual({
      code: 'PLAYER_BUSY',
      playerId: 'bob',
    })
    expect(checkAvailability(['alice', 'carol'], busy)).toBeNull()
    // Le maître d'armes peut entraîner plusieurs joueurs à la fois.
    expect(checkAvailability(['carol', MASTER_ID], new Set([MASTER_ID]))).toBeNull()

    // Un défi en attente et un duel en cours occupent les joueurs ; un duel fini, non.
    expect([reserving, pending, accepting, fighting].every(isActive)).toBe(true)
    const declined = play(pending, { type: 'DeclineChallenge', playerId: 'bob' }).state
    expect(isActive(declined)).toBe(false)
  })

  it('règle 6 : prélève la mise du joueur qui lance le défi, et annule le défi en cas de refus', () => {
    const issued = play(initialState, issue())
    expect(issued.state.status).toBe('reserving')
    expect(issued.requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'd1:stake-challenger',
        playerId: 'alice',
        resources: STAKE,
      },
    ])

    const unfunded = play(reserving, result('stake-challenger', 'refused'))
    expect(unfunded.state).toMatchObject({ status: 'cancelled', cancelReason: 'unfunded' })
    // Rien n'a été prélevé : il n'y a rien à rendre.
    expect(unfunded.requests).toEqual([])
  })

  it('ignore une réponse du Village en double, ou qui ne correspond pas à l’étape en cours', () => {
    expect(decide(pending, result('stake-challenger', 'withdrawn'), T0)).toEqual({
      ok: true,
      events: [],
    })
    expect(decide(pending, result('stake-opponent', 'withdrawn'), T0)).toEqual({
      ok: true,
      events: [],
    })
  })
})

describe('Duel - réponse au défi', () => {
  it('règle 4 : seul l’adversaire répond au défi, seul son lanceur l’annule', () => {
    for (const type of ['AcceptChallenge', 'DeclineChallenge'] as const) {
      for (const playerId of ['alice', 'carol']) {
        const command = { type, playerId, playerName: playerId } as DuelCommand
        expect(decide(pending, command, T0)).toEqual({
          ok: false,
          error: { code: 'NOT_OPPONENT' },
        })
      }
    }
    expect(decide(pending, { type: 'CancelChallenge', playerId: 'bob' }, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_CHALLENGER' },
    })
    // Une fois le défi accepté, il ne peut plus être annulé.
    expect(decide(accepting, { type: 'CancelChallenge', playerId: 'alice' }, T0)).toEqual({
      ok: false,
      error: { code: 'WRONG_STATUS', status: 'accepting' },
    })
  })

  it('règle 5 : un défi sans réponse expire 10 minutes après son lancement', () => {
    const accept: DuelCommand = { type: 'AcceptChallenge', playerId: 'bob', playerName: 'Bob' }
    expect(decide(pending, accept, T0 + CHALLENGE_TTL_MS - 1).ok).toBe(true)
    expect(decide(pending, accept, T0 + CHALLENGE_TTL_MS)).toEqual({
      ok: false,
      error: { code: 'WRONG_STATUS', status: 'cancelled' },
    })

    // L'expiration est enregistrée à son échéance, et non à l'instant où elle est constatée.
    const late = play(pending, { type: 'CheckDeadline' }, T0 + 3 * CHALLENGE_TTL_MS)
    expect(late.events).toEqual([
      { type: 'ChallengeCancelled', data: { reason: 'expired', at: T0 + CHALLENGE_TTL_MS } },
    ])
  })

  it('règle 7 : prélève la mise de l’adversaire, et rend la première mise si elle est refusée', () => {
    const accepted = play(pending, { type: 'AcceptChallenge', playerId: 'bob', playerName: 'Bob' })
    expect(accepted.requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'd1:stake-opponent',
        playerId: 'bob',
        resources: STAKE,
      },
    ])
    // Le nom de l'adversaire n'est connu qu'à son acceptation : il est alors le joueur connecté.
    expect(reserving.opponent.name).toBe('')
    expect(accepted.state.opponent.name).toBe('Bob')

    const started = play(accepting, result('stake-opponent', 'withdrawn'))
    expect(started.state).toMatchObject({ status: 'fighting', round: 1, deadline: T0 + ROUND_MS })

    // Compensation : la mise d'Alice, déjà prélevée, lui est rendue.
    const aborted = play(accepting, result('stake-opponent', 'refused'))
    expect(aborted.state).toMatchObject({ status: 'cancelled', cancelReason: 'opponent-unfunded' })
    expect(aborted.requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'd1:refund-challenger',
        playerId: 'alice',
        resources: STAKE,
      },
    ])
  })

  it('règle 8 : un défi refusé, annulé ou expiré rend sa mise au joueur qui l’a lancé', () => {
    const refund = [
      {
        kind: 'deposit',
        transferId: 'd1:refund-challenger',
        playerId: 'alice',
        resources: STAKE,
      },
    ]
    const declined = play(pending, { type: 'DeclineChallenge', playerId: 'bob' })
    expect(declined.state.cancelReason).toBe('declined')
    expect(declined.requests).toEqual(refund)

    const withdrawn = play(pending, { type: 'CancelChallenge', playerId: 'alice' })
    expect(withdrawn.state.cancelReason).toBe('withdrawn')
    expect(withdrawn.requests).toEqual(refund)

    const expired = play(pending, { type: 'CheckDeadline' }, T0 + CHALLENGE_TTL_MS)
    expect(expired.state.cancelReason).toBe('expired')
    expect(expired.requests).toEqual(refund)
  })
})

describe('Duel - les manches', () => {
  it('règle 9 : chaque duelliste commence avec 30 points de vie, qui ne dépassent jamais 30', () => {
    expect(fighting.challenger.hp).toBe(MAX_HP)
    expect(fighting.opponent.hp).toBe(MAX_HP)
    // Se soigner à 30 points de vie ne fait pas dépasser le maximum.
    const healed = fight(fighting, [['heal', 'heal']]).state
    expect([healed.challenger.hp, healed.opponent.hp]).toEqual([MAX_HP, MAX_HP])
  })

  it('règle 10 : une passe par duelliste, pour la manche en cours seulement', () => {
    const chosen = play(fighting, choose('alice', 1, 'attack')).state
    expect(decide(chosen, choose('alice', 1, 'defend'), T0)).toEqual({
      ok: false,
      error: { code: 'ALREADY_CHOSEN' },
    })
    expect(decide(fighting, choose('alice', 2, 'attack'), T0)).toEqual({
      ok: false,
      error: { code: 'ROUND_OVER', round: 1 },
    })
    expect(decide(fighting, choose('carol', 1, 'attack'), T0)).toEqual({
      ok: false,
      error: { code: 'NOT_A_DUELIST' },
    })
    expect(decide(pending, choose('alice', 1, 'attack'), T0)).toEqual({
      ok: false,
      error: { code: 'WRONG_STATUS', status: 'pending' },
    })
  })

  it('résout la manche dès que les deux duellistes ont choisi', () => {
    const half = play(fighting, choose('alice', 1, 'attack'))
    expect(half.state.round).toBe(1)
    const both = play(half.state, choose('bob', 1, 'defend'))
    expect(both.state.round).toBe(2)
    expect(both.state.rounds).toEqual([
      {
        round: 1,
        moves: { alice: 'attack', bob: 'defend' },
        missed: [],
        hp: { alice: 30, bob: 28 },
      },
    ])
  })

  // Règle 12 : chaque ligne du tableau de la fiche, à partir de 20 points de vie pour que les
  // soins soient visibles. [passe A, passe B, effet sur A, effet sur B]
  const table: [Move, Move, number, number][] = [
    ['attack', 'attack', -6, -6],
    ['attack', 'defend', 0, -2],
    ['attack', 'counter', -8, 0],
    ['attack', 'heal', 0, -6],
    ['defend', 'defend', 0, 0],
    ['defend', 'counter', 0, -2],
    ['defend', 'heal', 0, 5],
    ['counter', 'counter', -2, -2],
    ['counter', 'heal', -2, 5],
    ['heal', 'heal', 5, 5],
  ]
  it.each(table)('règle 12 : %s contre %s donne %i et %i', (a, b, onA, onB) => {
    const wounded: DuelState = {
      ...fighting,
      challenger: { ...fighting.challenger, hp: 20 },
      opponent: { ...fighting.opponent, hp: 20 },
    }
    // Dans les deux sens : le tableau ne dépend pas du rôle des duellistes.
    for (const [first, second, onFirst, onSecond] of [
      [a, b, onA, onB],
      [b, a, onB, onA],
    ] as const) {
      const state = fight(wounded, [[first, second]]).state
      expect(state.challenger.hp).toBe(20 + onFirst)
      expect(state.opponent.hp).toBe(20 + onSecond)
    }
  })

  it('règle 13 : un duelliste se soigne au plus 3 fois par duel', () => {
    const healed = fight(
      fighting,
      Array.from({ length: MAX_HEALS }, () => ['heal', 'defend'] as [Move, Move]),
    ).state
    expect(healed.challenger.heals).toBe(MAX_HEALS)
    expect(decide(healed, choose('alice', healed.round, 'heal'), T0)).toEqual({
      ok: false,
      error: { code: 'NO_HEAL_LEFT' },
    })
    // L'adversaire, lui, peut encore se soigner.
    expect(decide(healed, choose('bob', healed.round, 'heal'), T0).ok).toBe(true)
  })

  it('règle 14 : un duelliste qui n’a pas choisi à l’échéance est réputé s’être défendu', () => {
    const chosen = play(fighting, choose('alice', 1, 'attack')).state
    const due = play(chosen, { type: 'CheckDeadline' }, T0 + ROUND_MS)
    expect(due.events[0]).toMatchObject({
      type: 'RoundResolved',
      data: { moves: { alice: 'attack', bob: 'defend' }, missed: ['bob'], hp: { bob: 28 } },
    })
    // La manche suivante a sa propre échéance, comptée depuis celle de la manche résolue.
    expect(due.state.deadline).toBe(T0 + 2 * ROUND_MS)
  })

  it('règle 14 : deux manches manquées d’affilée font perdre le duel par abandon', () => {
    // Bob manque la manche 1, joue la 2, puis manque la 3 : il n'est pas encore éliminé.
    let state = play(fighting, choose('alice', 1, 'defend')).state
    state = play(state, { type: 'CheckDeadline' }, T0 + ROUND_MS).state
    state = fight(state, [['defend', 'defend']], T0 + ROUND_MS).state
    state = play(state, choose('alice', 3, 'defend'), T0 + ROUND_MS).state
    state = play(state, { type: 'CheckDeadline' }, T0 + 2 * ROUND_MS).state
    expect(state).toMatchObject({ status: 'fighting', opponent: { missed: 1 } })

    // Il manque aussi la manche 4 : Alice gagne par abandon.
    state = play(state, choose('alice', 4, 'defend'), T0 + 2 * ROUND_MS).state
    const ended = play(state, { type: 'CheckDeadline' }, T0 + 3 * ROUND_MS)
    expect(ended.state.result).toEqual({ outcome: 'won', winnerId: 'alice', reason: 'forfeit' })
  })

  it('règle 14 : enregistre toutes les manches échues, chacune à sa propre échéance', () => {
    // Personne ne joue pendant deux manches : les deux abandonnent, le duel est nul.
    const ended = play(fighting, { type: 'CheckDeadline' }, T0 + 10 * ROUND_MS)
    expect(ended.events.map((event) => event.type)).toEqual([
      'RoundResolved',
      'RoundResolved',
      'DuelEnded',
    ])
    expect(ended.state.result).toEqual({ outcome: 'draw', winnerId: null, reason: 'forfeit' })
  })
})

describe('Duel - fin du duel', () => {
  it('règle 15 : le duelliste dont les points de vie tombent à zéro perd', () => {
    // Bob se soigne trois fois sous les attaques (-18), puis échange deux attaques (-12).
    const { state } = fight(fighting, [
      ['attack', 'heal'],
      ['attack', 'heal'],
      ['attack', 'heal'],
      ['attack', 'attack'],
      ['attack', 'attack'],
    ])
    expect(state.opponent.hp).toBe(0)
    expect(state).toMatchObject({
      status: 'finished',
      deadline: null,
      result: { outcome: 'won', winnerId: 'alice', reason: 'knockout' },
    })
  })

  it('règle 15 : deux duellistes à terre à la même manche font un duel nul', () => {
    const { state } = fight(
      fighting,
      Array.from({ length: 5 }, () => ['attack', 'attack'] as [Move, Move]),
    )
    expect(state.result).toEqual({ outcome: 'draw', winnerId: null, reason: 'knockout' })
  })

  it('règle 15 : après la 12e manche, le duelliste qui a le plus de points de vie gagne', () => {
    const rounds = Array.from({ length: MAX_ROUNDS }, () => ['attack', 'defend'] as [Move, Move])
    const before = fight(fighting, rounds.slice(1)).state
    expect(before.status).toBe('fighting')
    const { state } = fight(before, rounds.slice(0, 1))
    expect(state.opponent.hp).toBe(MAX_HP - 2 * MAX_ROUNDS)
    expect(state.result).toEqual({ outcome: 'won', winnerId: 'alice', reason: 'rounds' })

    const even = Array.from({ length: MAX_ROUNDS }, () => ['defend', 'defend'] as [Move, Move])
    expect(fight(fighting, even).state.result).toEqual({
      outcome: 'draw',
      winnerId: null,
      reason: 'rounds',
    })
  })

  it('règle 16 : le vainqueur reçoit les deux mises ; en cas de nul, chacun récupère la sienne', () => {
    const won = fight(fighting, [
      ['attack', 'heal'],
      ['attack', 'heal'],
      ['attack', 'heal'],
      ['attack', 'attack'],
      ['attack', 'attack'],
    ])
    expect(won.requests).toEqual([
      { kind: 'deposit', transferId: 'd1:payout', playerId: 'alice', resources: BOTH_STAKES },
    ])

    const draw = fight(
      fighting,
      Array.from({ length: 5 }, () => ['attack', 'attack'] as [Move, Move]),
    )
    expect(draw.requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'd1:refund-challenger',
        playerId: 'alice',
        resources: STAKE,
      },
      {
        kind: 'deposit',
        transferId: 'd1:refund-opponent',
        playerId: 'bob',
        resources: STAKE,
      },
    ])
  })
})

describe('Duel - entraînement contre le maître d’armes', () => {
  const train: DuelCommand = {
    type: 'StartTraining',
    duelId: 't1',
    playerId: 'alice',
    playerName: 'Alice',
    seed: 7,
  }

  it('règle 17 : commence aussitôt, sans mise ni mouvement d’or', () => {
    const started = play(initialState, train)
    expect(started.state).toMatchObject({
      training: true,
      stake: {},
      status: 'fighting',
      opponent: { id: MASTER_ID },
    })
    expect(started.requests).toEqual([])
  })

  it('règle 17 : le maître d’armes joue aussitôt que le joueur a choisi, et ne rapporte rien', () => {
    let state = play(initialState, train).state
    const requests = []
    while (state.status === 'fighting') {
      const next = play(state, choose('alice', state.round, 'attack'))
      state = next.state
      requests.push(...next.requests)
    }
    // Face à des attaques répétées, le maître d'armes contre : Alice finit par tomber.
    expect(state.rounds.at(-1)?.moves[MASTER_ID]).toBe('counter')
    expect(state.result).toMatchObject({ outcome: 'won', winnerId: MASTER_ID })
    expect(requests).toEqual([])
  })

  it('règle 17 : la résolution est la même quel que soit le moment où elle est calculée', () => {
    const state = play(initialState, train).state
    const first: DuelEvent[] = resolveRound(state, T0 + 1)
    const again: DuelEvent[] = resolveRound(state, T0 + 1)
    expect(again).toEqual(first)
  })
})
