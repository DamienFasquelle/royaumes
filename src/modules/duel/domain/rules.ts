/**
 * Règles du Duel, selon le modèle decider :
 *   decide(état, commande, maintenant) -> événements ou erreur métier
 * Les échéances (réponse au défi, manches) sont paresseuses : elles sont enregistrées par la
 * première commande qui suit, sans tâche de fond. Les numéros renvoient à la fiche de cadrage.
 */
import {
  ATTACK_DAMAGE,
  CHALLENGE_TTL_MS,
  DEFAULT_MOVE,
  FORFEIT_AFTER_MISSED,
  GUARDED_DAMAGE,
  HEAL_AMOUNT,
  isValidStake,
  MASTER_ID,
  MAX_HEALS,
  MAX_HP,
  MAX_ROUNDS,
  type Move,
  RIPOSTE_DAMAGE,
  ROUND_MS,
  STAGGER_DAMAGE,
  type Stake,
} from './content'
import {
  type DuelEvent,
  type Duelist,
  type DuelResult,
  type DuelState,
  type DuelStatus,
  duelistsOf,
  type Effect,
  evolve,
  isDuelist,
  transferIdOf,
} from './duel'
import { chooseMasterMove } from './master'

// ---------------------------------------------------------------------------
// Commandes : des intentions, nommées à l'impératif
// ---------------------------------------------------------------------------

export type DuelCommand =
  // Commandes des joueurs.
  | {
      type: 'IssueChallenge'
      duelId: string
      challengerId: string
      challengerName: string
      opponentId: string
      stake: Stake
      seed: number
    }
  | { type: 'StartTraining'; duelId: string; playerId: string; playerName: string; seed: number }
  | { type: 'AcceptChallenge'; playerId: string; playerName: string }
  | { type: 'DeclineChallenge'; playerId: string }
  | { type: 'CancelChallenge'; playerId: string }
  // round : la manche pour laquelle le joueur a choisi, telle qu'il l'a vue à l'écran.
  | { type: 'ChooseMove'; playerId: string; round: number; move: Move }
  // Commande de la saga, issue de la réponse du Village à un prélèvement.
  | { type: 'RecordTransferResult'; transferId: string; outcome: 'withdrawn' | 'refused' }
  // Commande d'échéance : n'a pas d'autre effet que d'enregistrer les échéances passées.
  | { type: 'CheckDeadline' }

export type DuelError =
  | { code: 'DUEL_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'INVALID_STAKE' }
  | { code: 'SELF_CHALLENGE' }
  | { code: 'INVALID_OPPONENT' }
  | { code: 'PLAYER_BUSY'; playerId: string }
  | { code: 'NOT_OPPONENT' }
  | { code: 'NOT_CHALLENGER' }
  | { code: 'NOT_A_DUELIST' }
  | { code: 'WRONG_STATUS'; status: DuelStatus }
  | { code: 'ROUND_OVER'; round: number }
  | { code: 'ALREADY_CHOSEN' }
  | { code: 'NO_HEAL_LEFT' }

export type Decision = { ok: true; events: DuelEvent[] } | { ok: false; error: DuelError }

const fail = (error: DuelError): Decision => ({ ok: false, error })
const accept = (...events: DuelEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Disponibilité des joueurs (règle 3)
// ---------------------------------------------------------------------------

/**
 * Un joueur n'a qu'un duel actif à la fois. Cette règle porte sur plusieurs duels : elle ne
 * peut pas être vérifiée par decide, qui ne voit qu'un duel. La couche application fournit
 * l'ensemble des joueurs occupés, et appelle cette fonction avant de lancer un duel.
 */
export function checkAvailability(
  playerIds: string[],
  busy: ReadonlySet<string>,
): DuelError | null {
  const taken = playerIds.find((id) => id !== MASTER_ID && busy.has(id))
  return taken ? { code: 'PLAYER_BUSY', playerId: taken } : null
}

// ---------------------------------------------------------------------------
// Résolution d'une manche
// ---------------------------------------------------------------------------

/**
 * Effets de la passe d'un duelliste, selon la passe de son adversaire (règle 12) :
 * - l'attaque porte, réduite par la défense, sauf si elle est contrée ; elle interrompt le soin ;
 * - le contre renvoie l'attaque, mais déséquilibre celui qui contre une garde ;
 * - le soin rend des points de vie s'il n'est pas interrompu, sans jamais blesser l'adversaire ;
 * - la défense n'a aucun effet propre : elle ne fait que réduire l'attaque.
 */
export function effectsOf(source: string, mine: Move, target: string, theirs: Move): Effect[] {
  const effect = (kind: Effect['kind'], to: string, amount: number): Effect[] => [
    { kind, source, target: to, amount },
  ]
  switch (mine) {
    case 'attack':
      if (theirs === 'counter') return []
      if (theirs === 'defend') return effect('hit', target, GUARDED_DAMAGE)
      return [
        ...effect('hit', target, ATTACK_DAMAGE),
        ...(theirs === 'heal' ? effect('interrupted', target, 0) : []),
      ]
    case 'counter':
      if (theirs === 'attack') return effect('riposte', target, RIPOSTE_DAMAGE)
      if (theirs === 'defend' || theirs === 'counter')
        return effect('stagger', source, STAGGER_DAMAGE)
      return []
    case 'heal':
      return theirs === 'attack' ? [] : effect('heal', source, HEAL_AMOUNT)
    case 'defend':
      return []
  }
}

/**
 * Points de vie d'un duelliste après les effets de la manche, sans jamais dépasser le maximum
 * ni descendre sous zéro. Le montant d'un soin est ramené à ce qu'il rend réellement.
 */
function applyEffects(duelist: Duelist, effects: Effect[]): [number, Effect[]] {
  let hp = duelist.hp
  const applied = effects.map((effect) => {
    if (effect.target !== duelist.id) return effect
    if (effect.kind === 'heal') {
      const amount = Math.min(effect.amount, MAX_HP - hp)
      hp += amount
      return { ...effect, amount }
    }
    if (effect.kind !== 'interrupted') hp = Math.max(0, hp - effect.amount)
    return effect
  })
  return [hp, applied]
}

/**
 * Passe d'un duelliste à la résolution : son choix, celle du maître d'armes, ou la passe par
 * défaut s'il n'a pas choisi à l'échéance (règle 14).
 */
function moveOf(state: DuelState, duelist: Duelist, rival: Duelist): Move {
  const chosen = state.choices[duelist.id]
  if (chosen) return chosen
  if (duelist.id !== MASTER_ID) return DEFAULT_MOVE
  return chooseMasterMove({
    history: state.rounds.map((round) => round.moves[rival.id]),
    healsLeft: MAX_HEALS - duelist.heals,
    seed: state.seed,
    round: state.round,
  })
}

/** Issue du duel après une manche, ou null s'il se poursuit (règles 14 et 15). */
function outcomeOf(state: DuelState, a: Duelist, b: Duelist): DuelResult | null {
  const won = (winner: Duelist, reason: DuelResult['reason']): DuelResult => ({
    outcome: 'won',
    winnerId: winner.id,
    reason,
  })
  const draw = (reason: DuelResult['reason']): DuelResult => ({
    outcome: 'draw',
    winnerId: null,
    reason,
  })

  if (a.hp <= 0 && b.hp <= 0) return draw('knockout')
  if (a.hp <= 0) return won(b, 'knockout')
  if (b.hp <= 0) return won(a, 'knockout')

  const aForfeits = a.missed >= FORFEIT_AFTER_MISSED
  const bForfeits = b.missed >= FORFEIT_AFTER_MISSED
  if (aForfeits && bForfeits) return draw('forfeit')
  if (aForfeits) return won(b, 'forfeit')
  if (bForfeits) return won(a, 'forfeit')

  if (state.round < MAX_ROUNDS) return null
  if (a.hp === b.hp) return draw('rounds')
  return won(a.hp > b.hp ? a : b, 'rounds')
}

/**
 * Résout la manche en cours à l'instant at, selon le tableau de résolution (règle 12).
 * Le résultat ne dépend que de l'état : il est le même quel que soit le moment du calcul.
 */
export function resolveRound(state: DuelState, at: number): DuelEvent[] {
  const [a, b] = duelistsOf(state)
  const moves = { [a.id]: moveOf(state, a, b), [b.id]: moveOf(state, b, a) }
  const missed = [a, b]
    .filter((duelist) => duelist.id !== MASTER_ID && state.choices[duelist.id] === undefined)
    .map((duelist) => duelist.id)
  const raw = [
    ...effectsOf(a.id, moves[a.id], b.id, moves[b.id]),
    ...effectsOf(b.id, moves[b.id], a.id, moves[a.id]),
  ]
  const [hpA, afterA] = applyEffects(a, raw)
  const [hpB, effects] = applyEffects(b, afterA)
  const hp = { [a.id]: hpA, [b.id]: hpB }

  // L'issue est calculée sur l'état qui suit la manche.
  const resolved: DuelEvent = {
    type: 'RoundResolved',
    data: {
      round: state.round,
      moves,
      missed,
      effects,
      hp,
      nextDeadline: at + ROUND_MS,
      at,
    },
  }
  const after = evolve(state, resolved)
  const result = outcomeOf(state, after.challenger, after.opponent)
  if (!result) return [resolved]
  return [
    { ...resolved, data: { ...resolved.data, nextDeadline: null } },
    { type: 'DuelEnded', data: { ...result, at } },
  ]
}

/**
 * Échéances paresseuses : renvoie les événements de toutes les échéances passées à l'instant
 * now. Chaque échéance est traitée à son propre instant, et non à l'instant now.
 */
export function settle(state: DuelState, now: number): DuelEvent[] {
  const events: DuelEvent[] = []
  let current = state
  for (;;) {
    let due: DuelEvent[]
    if (current.status === 'pending' && current.expiresAt <= now) {
      due = [{ type: 'ChallengeCancelled', data: { reason: 'expired', at: current.expiresAt } }]
    } else if (
      current.status === 'fighting' &&
      current.deadline !== null &&
      current.deadline <= now
    ) {
      due = resolveRound(current, current.deadline)
    } else {
      break
    }
    events.push(...due)
    current = due.reduce(evolve, current)
  }
  return events
}

// ---------------------------------------------------------------------------
// decide : enregistre les échéances passées, puis traite la commande
// ---------------------------------------------------------------------------

export function decide(state: DuelState, command: DuelCommand, now: number): Decision {
  const due = settle(state, now)
  const current = due.reduce(evolve, state)
  const decision = decideCommand(current, command, now)
  // Si la commande est refusée, rien n'est enregistré, pas même les échéances passées.
  return decision.ok ? { ok: true, events: [...due, ...decision.events] } : decision
}

function decideCommand(state: DuelState, command: DuelCommand, now: number): Decision {
  if (command.type === 'IssueChallenge') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    const { duelId, challengerId, challengerName, opponentId, stake, seed } = command
    if (!isValidStake(stake)) return fail({ code: 'INVALID_STAKE' })
    if (opponentId === challengerId) return fail({ code: 'SELF_CHALLENGE' })
    // On ne défie pas le maître d'armes : on s'entraîne contre lui, sans mise.
    if (opponentId === MASTER_ID) return fail({ code: 'INVALID_OPPONENT' })
    return accept({
      type: 'ChallengeIssued',
      data: {
        duelId,
        challengerId,
        challengerName,
        opponentId,
        stake,
        seed,
        at: now,
        expiresAt: now + CHALLENGE_TTL_MS,
      },
    })
  }

  if (command.type === 'StartTraining') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    const { duelId, playerId, playerName, seed } = command
    return accept({
      type: 'TrainingStarted',
      data: { duelId, playerId, playerName, seed, deadline: now + ROUND_MS, at: now },
    })
  }

  if (!state.exists) return fail({ code: 'DUEL_NOT_FOUND' })

  switch (command.type) {
    case 'AcceptChallenge':
    case 'DeclineChallenge':
      if (command.playerId !== state.opponent.id) return fail({ code: 'NOT_OPPONENT' })
      if (state.status !== 'pending') return fail({ code: 'WRONG_STATUS', status: state.status })
      return command.type === 'AcceptChallenge'
        ? accept({
            type: 'ChallengeAccepted',
            data: { opponentId: command.playerId, opponentName: command.playerName, at: now },
          })
        : accept({ type: 'ChallengeCancelled', data: { reason: 'declined', at: now } })

    case 'CancelChallenge':
      if (command.playerId !== state.challenger.id) return fail({ code: 'NOT_CHALLENGER' })
      if (state.status !== 'pending') return fail({ code: 'WRONG_STATUS', status: state.status })
      return accept({ type: 'ChallengeCancelled', data: { reason: 'withdrawn', at: now } })

    case 'ChooseMove':
      return chooseMove(state, command, now)

    case 'RecordTransferResult':
      return recordTransferResult(state, command, now)

    case 'CheckDeadline':
      // Les échéances passées ont déjà été traitées par decide : il n'y a rien d'autre à faire.
      return accept()
  }
}

/** Choix d'une passe (règles 10, 11 et 13) ; la manche est résolue dès que les deux ont choisi. */
function chooseMove(
  state: DuelState,
  command: Extract<DuelCommand, { type: 'ChooseMove' }>,
  now: number,
): Decision {
  if (state.status !== 'fighting') return fail({ code: 'WRONG_STATUS', status: state.status })
  if (command.playerId === MASTER_ID || !isDuelist(state, command.playerId)) {
    return fail({ code: 'NOT_A_DUELIST' })
  }
  if (command.round !== state.round) return fail({ code: 'ROUND_OVER', round: state.round })
  if (state.choices[command.playerId]) return fail({ code: 'ALREADY_CHOSEN' })
  const duelist = duelistsOf(state).find((d) => d.id === command.playerId)
  if (command.move === 'heal' && duelist && duelist.heals >= MAX_HEALS) {
    return fail({ code: 'NO_HEAL_LEFT' })
  }

  const chosen: DuelEvent = {
    type: 'MoveChosen',
    data: { playerId: command.playerId, round: state.round, move: command.move, at: now },
  }
  // Le maître d'armes n'attend jamais : il choisit au moment de la résolution.
  const after = evolve(state, chosen)
  const ready = duelistsOf(after).every((d) => d.id === MASTER_ID || after.choices[d.id])
  return accept(chosen, ...(ready ? resolveRound(after, now) : []))
}

/**
 * Réponse du Village à un prélèvement de mise. Seule la réponse attendue dans l'état courant
 * fait progresser la saga ; toute autre réponse (doublon, réponse tardive) est ignorée.
 */
function recordTransferResult(
  state: DuelState,
  result: Extract<DuelCommand, { type: 'RecordTransferResult' }>,
  now: number,
): Decision {
  const refused = result.outcome === 'refused'

  // Mise du joueur qui lance le défi (règle 6) : rien n'a été prélevé en cas de refus.
  if (
    state.status === 'reserving' &&
    result.transferId === transferIdOf(state.duelId, 'stake-challenger')
  ) {
    return refused
      ? accept({ type: 'ChallengeCancelled', data: { reason: 'unfunded', at: now } })
      : accept({ type: 'ChallengerStakeReserved', data: { at: now } })
  }

  // Mise de l'adversaire (règle 7) : en cas de refus, la première mise doit être rendue.
  if (
    state.status === 'accepting' &&
    result.transferId === transferIdOf(state.duelId, 'stake-opponent')
  ) {
    return refused
      ? accept({ type: 'ChallengeCancelled', data: { reason: 'opponent-unfunded', at: now } })
      : accept({ type: 'DuelStarted', data: { deadline: now + ROUND_MS, at: now } })
  }

  return accept()
}
