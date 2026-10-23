import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { DuelService } from './application/duel-service'
import { ChallengeInput, ChooseMoveInput, type DuelError } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<DuelError['code'], 403 | 404 | 409 | 422> = {
  DUEL_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  INVALID_STAKE: 422,
  SELF_CHALLENGE: 422,
  INVALID_OPPONENT: 422,
  PLAYER_BUSY: 409,
  NOT_OPPONENT: 403,
  NOT_CHALLENGER: 403,
  NOT_A_DUELIST: 403,
  WRONG_STATUS: 409,
  ROUND_OVER: 409,
  ALREADY_CHOSEN: 409,
  NO_HEAL_LEFT: 409,
}

/**
 * Sous-application Hono du module Duel, montée sur /api/duel.
 * Le joueur est toujours celui que l'authentification a identifié (c.var.userId) :
 * seule la route de défi désigne un autre joueur, l'adversaire, qui n'agit pas pour autant.
 */
export function createDuelApi(service: DuelService) {
  return (
    new Hono<AppEnv>()
      // Duels actifs du joueur : ses défis lancés ou reçus, et son duel en cours.
      .get('/duels', async (c) => c.json({ duels: await service.list(c.var.userId) }))

      // Défi lancé à un autre joueur, avec une mise en or.
      .post('/duels', validateJson(ChallengeInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const { opponentId, stake } = c.req.valid('json')
        const { duelId, result } = await service.challenge(player, opponentId, stake)
        return result.ok
          ? c.json({ duelId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Duel d'entraînement contre le maître d'armes, sans mise.
      .post('/training', async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const { duelId, result } = await service.train(player)
        return result.ok
          ? c.json({ duelId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Vue d'un duel, réservée à ses deux duellistes.
      .get('/duels/:id', async (c) => {
        const view = await service.getView(c.req.param('id'), c.var.userId)
        return view ? c.json({ view }) : c.json({ error: { code: 'DUEL_NOT_FOUND' as const } }, 404)
      })

      .post('/duels/:id/accept', async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await service.accept(c.req.param('id'), player)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/duels/:id/decline', async (c) => {
        const result = await service.decline(c.req.param('id'), c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/duels/:id/cancel', async (c) => {
        const result = await service.cancel(c.req.param('id'), c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/duels/:id/move', validateJson(ChooseMoveInput), async (c) => {
        const { round, move } = c.req.valid('json')
        const result = await service.chooseMove(c.req.param('id'), c.var.userId, round, move)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Commande d'échéance, envoyée par l'interface lorsque son compte à rebours atteint zéro.
      .post('/duels/:id/deadline', async (c) => {
        const result = await service.checkDeadline(c.req.param('id'), c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type DuelApi = ReturnType<typeof createDuelApi>
