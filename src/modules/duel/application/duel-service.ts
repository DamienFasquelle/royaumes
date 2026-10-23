import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { DUEL_TOPICS } from '../contracts'
import type { Move, Stake } from '../domain/content'
import { type DuelEvent, type DuelState, evolve, isActive } from '../domain/duel'
import { checkAvailability, type DuelCommand, type DuelError, decide } from '../domain/rules'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type DuelView, toView } from '../domain/view'
import type { ActiveDuelsReader } from './active-duels-reader'
import type { DuelRepository } from './duel-repository'

/** Résultat d'une commande d'un joueur : la vue du duel, ou l'erreur métier. */
export type CommandResult = { ok: true; view: DuelView } | { ok: false; error: DuelError }

/** Joueur à l'origine d'une commande. */
export interface Player {
  id: string
  name: string
}

/**
 * Nombre maximal de tentatives d'une commande. Les deux duellistes et la réponse du Village
 * peuvent écrire au même instant dans le flux du duel : une tentative de plus que d'écrivains.
 */
const MAX_ATTEMPTS = 4

export interface DuelServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'un nouveau duel ; un UUID aléatoire par défaut. */
  newId?: () => string
  /** Graine d'un nouveau duel ; un entier aléatoire sur 32 bits par défaut. */
  newSeed?: () => number
}

/** Traduit une demande de la saga en message de la boîte d'envoi, adressé au Village. */
function toMessage(request: SagaRequest): NewMessage {
  const payload = {
    transferId: request.transferId,
    playerId: request.playerId,
    resources: request.resources,
  }
  return request.kind === 'withdraw'
    ? // Adresse de retour : la réponse du Village fera progresser la saga.
      { topic: REALM_TOPICS.withdraw, payload: { ...payload, replyTo: DUEL_TOPICS.stakeResult } }
    : { topic: REALM_TOPICS.deposit, payload }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état du duel. */
function messagesFor(state: DuelState, events: DuelEvent[]): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request))
  }
  return messages
}

const notFound: CommandResult = { ok: false, error: { code: 'DUEL_NOT_FOUND' } }

/**
 * Service applicatif du Duel : orchestre le domaine, la persistance et la saga des mises.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createDuelService(
  repo: DuelRepository,
  reader: ActiveDuelsReader,
  {
    dispatch,
    clock = () => Date.now(),
    newId = () => crypto.randomUUID(),
    newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0],
  }: DuelServiceOptions,
) {
  /**
   * Décide et enregistre une commande sur un duel, avec les messages de la saga.
   * En cas de conflit de version, l'ensemble est rejoué sur l'état à jour : aucun message
   * n'a été enregistré par la tentative refusée.
   */
  function process(duelId: string, command: DuelCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(duelId)
      const decision = decide(state, command, clock())
      if (!decision.ok || decision.events.length === 0) return decision
      await repo.save(duelId, version, decision.events, messagesFor(state, decision.events))
      return decision
    }, MAX_ATTEMPTS)
  }

  /** Vue d'un duel pour un joueur, relue dans le journal ; null s'il n'en est pas duelliste. */
  async function viewOf(duelId: string, viewerId: string) {
    const { state } = await repo.load(duelId)
    return toView(state, viewerId, clock())
  }

  /**
   * Commande d'un joueur : la décision est enregistrée, puis la boîte d'envoi distribuée.
   * Dans le cas ordinaire, la saga a progressé jusqu'à son prochain état stable lorsque
   * la vue est renvoyée.
   */
  async function execute(
    duelId: string,
    viewerId: string,
    command: DuelCommand,
  ): Promise<CommandResult> {
    const decision = await process(duelId, command)
    if (!decision.ok) return decision
    await dispatch()
    const view = await viewOf(duelId, viewerId)
    return view ? { ok: true, view } : notFound
  }

  /**
   * Joueurs occupés par un duel actif (règle 3). Chaque duel signalé par le modèle de lecture
   * est d'abord mis à jour dans le journal : un défi expiré, ou un duel abandonné dont les
   * manches sont échues, libère ainsi ses duellistes, et rend leurs mises.
   */
  async function busyPlayers(playerIds: string[]) {
    const busy = new Set<string>()
    for (const duelId of await reader.activeDuelIds(playerIds)) {
      await process(duelId, { type: 'CheckDeadline' })
      const { state } = await repo.load(duelId)
      if (isActive(state)) {
        busy.add(state.challenger.id)
        busy.add(state.opponent.id)
      }
    }
    return busy
  }

  /**
   * Lance un défi au nom d'un joueur.
   * DETTE TECHNIQUE (DT-011) : la disponibilité des deux joueurs est vérifiée avant le lancement,
   * et non dans la même transaction. Deux défis lancés au même instant au même joueur peuvent
   * être acceptés tous les deux.
   */
  async function challenge(player: Player, opponentId: string, stake: Stake) {
    const duelId = newId()
    const unavailable = checkAvailability(
      [player.id, opponentId],
      await busyPlayers([player.id, opponentId]),
    )
    if (unavailable) return { duelId, result: { ok: false, error: unavailable } as const }
    const result = await execute(duelId, player.id, {
      type: 'IssueChallenge',
      duelId,
      challengerId: player.id,
      challengerName: player.name,
      opponentId,
      stake,
      seed: newSeed(),
    })
    return { duelId, result }
  }

  /** Commence un duel d'entraînement contre le maître d'armes. */
  async function train(player: Player) {
    const duelId = newId()
    const unavailable = checkAvailability([player.id], await busyPlayers([player.id]))
    if (unavailable) return { duelId, result: { ok: false, error: unavailable } as const }
    const result = await execute(duelId, player.id, {
      type: 'StartTraining',
      duelId,
      playerId: player.id,
      playerName: player.name,
      seed: newSeed(),
    })
    return { duelId, result }
  }

  /** Accepte un défi, au nom de l'adversaire désigné. */
  const accept = (duelId: string, player: Player) =>
    execute(duelId, player.id, {
      type: 'AcceptChallenge',
      playerId: player.id,
      playerName: player.name,
    })

  /** Refuse un défi, au nom de l'adversaire désigné. */
  const decline = (duelId: string, playerId: string) =>
    execute(duelId, playerId, { type: 'DeclineChallenge', playerId })

  /** Annule un défi, au nom du joueur qui l'a lancé. */
  const cancel = (duelId: string, playerId: string) =>
    execute(duelId, playerId, { type: 'CancelChallenge', playerId })

  /** Choisit la passe d'un duelliste pour une manche. */
  const chooseMove = (duelId: string, playerId: string, round: number, move: Move) =>
    execute(duelId, playerId, { type: 'ChooseMove', playerId, round, move })

  /**
   * Enregistre les échéances passées d'un duel. Elle est réservée à ses duellistes :
   * un autre joueur n'apprend même pas que le duel existe.
   */
  async function checkDeadline(duelId: string, playerId: string): Promise<CommandResult> {
    if (!(await viewOf(duelId, playerId))) return notFound
    return execute(duelId, playerId, { type: 'CheckDeadline' })
  }

  /** Vue d'un duel pour un joueur ; null s'il n'existe pas ou si ce joueur n'y participe pas. */
  const getView = (duelId: string, viewerId: string) => viewOf(duelId, viewerId)

  /**
   * Duels actifs du joueur : ses défis lancés ou reçus, et son duel en cours. La boîte d'envoi
   * est d'abord distribuée, et les échéances passées enregistrées : une saga interrompue
   * reprend, et un défi expiré rend sa mise, dès que le joueur consulte ses duels.
   */
  async function list(viewerId: string): Promise<DuelView[]> {
    await dispatch()
    const views: DuelView[] = []
    for (const duelId of await reader.activeDuelIds([viewerId])) {
      await process(duelId, { type: 'CheckDeadline' })
      const view = await viewOf(duelId, viewerId)
      if (view && view.status !== 'finished' && view.status !== 'cancelled') views.push(view)
    }
    if (views.length > 0) await dispatch()
    return views
  }

  /**
   * Étape de la saga, déclenchée par un message. Une erreur métier y est une anomalie :
   * elle est levée, et le message sera retenté.
   */
  async function step(duelId: string, command: DuelCommand) {
    const decision = await process(duelId, command)
    if (!decision.ok) throw new Error(`Duel ${duelId} : ${decision.error.code}`)
  }

  return {
    challenge,
    train,
    accept,
    decline,
    cancel,
    chooseMove,
    checkDeadline,
    getView,
    list,
    step,
  }
}

/** Type du service, déduit de sa fabrique : utilisé par l'API et les gestionnaires du module. */
export type DuelService = ReturnType<typeof createDuelService>
