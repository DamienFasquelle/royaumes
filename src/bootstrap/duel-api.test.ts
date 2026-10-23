import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { type DuelView, MASTER_ID, type Move } from '@/modules/duel/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Mise ordinaire des tests : du bois et de la pierre, combinés. */
const STAKE = { wood: 60, stone: 20 }

/**
 * Application de test où Alice, Bob et Carol ont fondé leur village : chacun dispose de
 * 100 bois, 50 pierre et aucun or. L'horloge reste figée tant que le test ne la fait pas
 * avancer : les villages ne produisent rien, et les stocks ne varient que par les duels.
 */
async function duelWithVillages() {
  const api = await createTestApi()
  for (const player of ['alice', 'bob', 'carol']) {
    await api.post('/api/realm/village', { name: `Village de ${player}` }, player)
  }
  return api
}

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player: string): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/** Lance au nom d'Alice un défi à Bob, et renvoie l'identifiant du duel. */
async function challengeBob(api: TestApi, stake: Record<string, number> = STAKE) {
  const res = await api.post('/api/duel/duels', { opponentId: 'bob', stake }, 'alice')
  return ((await res.json()) as { duelId: string; view: DuelView }).duelId
}

/** Vue d'un duel pour un joueur. */
async function viewOf({ get }: TestApi, duelId: string, player: string) {
  const res = await get(`/api/duel/duels/${duelId}`, player)
  return ((await res.json()) as { view: DuelView }).view
}

/** Joue une manche : Alice, puis Bob, choisissent leur passe. */
async function round(api: TestApi, duelId: string, a: Move, b: Move) {
  const { round } = await viewOf(api, duelId, 'alice')
  await api.post(`/api/duel/duels/${duelId}/move`, { round, move: a }, 'alice')
  return api.post(`/api/duel/duels/${duelId}/move`, { round, move: b }, 'bob')
}

describe('API du module Duel', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/duel/duels', null)).status).toBe(401)
    expect(
      (await api.post('/api/duel/duels', { opponentId: 'bob', stake: STAKE }, null)).status,
    ).toBe(401)
    expect((await api.post('/api/duel/training', {}, null)).status).toBe(401)
  })

  it('valide le corps des requêtes (400)', async () => {
    const api = await duelWithVillages()
    const invalid = [
      {},
      { opponentId: 'bob', stake: {} },
      { opponentId: 'bob', stake: { wood: 5 } },
      { opponentId: 'bob', stake: { iron: 50 } },
      { opponentId: 'bob', stake: 50 },
      { opponentId: '', stake: STAKE },
    ]
    for (const body of invalid) expect((await api.post('/api/duel/duels', body)).status).toBe(400)

    const duelId = await challengeBob(api)
    await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')
    const move = (body: unknown) => api.post(`/api/duel/duels/${duelId}/move`, body)
    expect((await move({ round: 1, move: 'fuir' })).status).toBe(400)
    expect((await move({ round: 0, move: 'attack' })).status).toBe(400)
  })

  it('lance un défi (201) et prélève la mise du joueur qui le lance', async () => {
    const api = await duelWithVillages()
    const res = await api.post('/api/duel/duels', { opponentId: 'bob', stake: STAKE })
    expect(res.status).toBe(201)
    const { view } = (await res.json()) as { view: DuelView }
    // La saga a progressé jusqu'au défi en attente pendant la requête.
    expect(view).toMatchObject({ status: 'pending', role: 'challenger', stake: STAKE })
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 40, stone: 30 })
  })

  it('accepte une mise d’une seule ressource, quelle qu’elle soit', async () => {
    const api = await duelWithVillages()
    await challengeBob(api, { stone: 50 })
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 100, stone: 0 })
  })

  it('refuse un défi à soi-même (422)', async () => {
    const api = await duelWithVillages()
    const res = await api.post('/api/duel/duels', { opponentId: 'alice', stake: STAKE })
    expect(res.status).toBe(422)
  })

  it('annule le défi lorsque le joueur qui le lance n’a pas les ressources de la mise', async () => {
    const api = await duelWithVillages()
    // Un village est fondé sans or.
    const res = await api.post('/api/duel/duels', { opponentId: 'bob', stake: { gold: 10 } })
    const { view } = (await res.json()) as { view: DuelView }
    expect(view).toMatchObject({ status: 'cancelled', cancelReason: 'unfunded' })
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 100, stone: 50, gold: 0 })
  })

  it('réserve la vue et les commandes d’un duel à ses duellistes', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api)

    expect((await api.get(`/api/duel/duels/${duelId}`, 'carol')).status).toBe(404)
    expect((await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'carol')).status).toBe(403)
    expect((await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'alice')).status).toBe(403)
    expect((await api.post(`/api/duel/duels/${duelId}/cancel`, {}, 'bob')).status).toBe(403)
    expect((await api.post(`/api/duel/duels/${duelId}/deadline`, {}, 'carol')).status).toBe(404)
  })

  it('joue un duel complet, et verse les deux mises au vainqueur', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api)

    const res = await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')
    expect(((await res.json()) as { view: DuelView }).view).toMatchObject({
      status: 'fighting',
      rival: { name: 'alice' },
    })
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 40, stone: 30 })

    // Bob se soigne trois fois sous les attaques, puis échange deux attaques : il tombe.
    for (const b of ['heal', 'heal', 'heal', 'attack', 'attack'] as Move[]) {
      await round(api, duelId, 'attack', b)
    }
    expect((await viewOf(api, duelId, 'bob')).result).toEqual({
      outcome: 'won',
      winnerId: 'alice',
      reason: 'knockout',
    })
    // Aucune ressource n'est créée ni perdue : Alice reçoit les deux mises.
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 160, stone: 70 })
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 40, stone: 30 })
  })

  it('refuse une seconde passe pour la même manche (409)', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api)
    await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')

    const move = { round: 1, move: 'attack' }
    expect((await api.post(`/api/duel/duels/${duelId}/move`, move)).status).toBe(200)
    expect((await api.post(`/api/duel/duels/${duelId}/move`, move)).status).toBe(409)
    // La passe d'Alice reste cachée à Bob tant que la manche n'est pas résolue.
    expect((await viewOf(api, duelId, 'bob')).rival).toMatchObject({ ready: true, move: null })
  })

  it('rend sa mise au joueur qui a lancé le défi, si l’adversaire n’a pas les ressources', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api, { stone: 30 })
    // Bob place toute sa pierre en séquestre au Marché : il n'en a plus pour couvrir la mise.
    await api.post('/api/market/offers', { give: { stone: 50 }, want: { wood: 10 } }, 'bob')

    const res = await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')
    expect(((await res.json()) as { view: DuelView }).view).toMatchObject({
      status: 'cancelled',
      cancelReason: 'opponent-unfunded',
    })
    // Compensation : la mise d'Alice lui est rendue, et Bob n'a rien perdu.
    expect((await stockOf(api, 'alice')).stone).toBe(50)
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 100, stone: 0 })
  })

  it('refuse un défi à un joueur qui a déjà un duel actif (409)', async () => {
    const api = await duelWithVillages()
    await challengeBob(api)
    const res = await api.post('/api/duel/duels', { opponentId: 'bob', stake: STAKE }, 'carol')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'PLAYER_BUSY', playerId: 'bob' } })
  })

  it('rend la mise d’un défi refusé, annulé ou expiré', async () => {
    const api = await duelWithVillages()

    const declined = await challengeBob(api)
    await api.post(`/api/duel/duels/${declined}/decline`, {}, 'bob')
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 100, stone: 50 })

    const cancelled = await challengeBob(api)
    const res = await api.post(`/api/duel/duels/${cancelled}/cancel`, {}, 'alice')
    expect(((await res.json()) as { view: DuelView }).view.cancelReason).toBe('withdrawn')
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 100, stone: 50 })

    const expired = await challengeBob(api, { stone: 40 })
    api.advance(10)
    const checked = await api.post(`/api/duel/duels/${expired}/deadline`, {}, 'bob')
    expect(((await checked.json()) as { view: DuelView }).view.cancelReason).toBe('expired')
    // La production des dix minutes (6 pierre par minute) s'ajoute à la mise rendue.
    expect((await stockOf(api, 'alice')).stone).toBe(50 + 60)
  })

  it('présente au joueur ses duels actifs, lancés ou reçus', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api)

    const list = async (player: string) =>
      ((await (await api.get('/api/duel/duels', player)).json()) as { duels: DuelView[] }).duels
    expect(await list('alice')).toMatchObject([{ duelId, role: 'challenger' }])
    expect(await list('bob')).toMatchObject([{ duelId, role: 'opponent', status: 'pending' }])
    expect(await list('carol')).toEqual([])
  })

  it('commence un entraînement (201) contre le maître d’armes, sans mouvement de ressources', async () => {
    const api = await duelWithVillages()
    const res = await api.post('/api/duel/training', {}, 'carol')
    expect(res.status).toBe(201)
    const { duelId, view } = (await res.json()) as { duelId: string; view: DuelView }
    expect(view).toMatchObject({ training: true, stake: {}, rival: { id: MASTER_ID } })

    // Le maître d'armes répond aussitôt : la manche est résolue dès que Carol a choisi.
    const moved = await api.post(
      `/api/duel/duels/${duelId}/move`,
      { round: 1, move: 'defend' },
      'carol',
    )
    expect(((await moved.json()) as { view: DuelView }).view.round).toBe(2)
    expect(await stockOf(api, 'carol')).toMatchObject({ wood: 100, stone: 50, gold: 0 })
  })

  it('résout la manche échue par la commande d’échéance', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api)
    await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')
    await api.post(`/api/duel/duels/${duelId}/move`, { round: 1, move: 'attack' }, 'alice')

    api.advance(1)
    const res = await api.post(`/api/duel/duels/${duelId}/deadline`, {}, 'alice')
    const { view } = (await res.json()) as { view: DuelView }
    expect(view.rounds[0]).toMatchObject({ missed: ['bob'], moves: { bob: 'defend' } })
  })
})

describe('Duel - données personnelles', () => {
  it('exporte les duels du joueur, sans le nom ni les passes de son adversaire', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api)
    await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')
    await round(api, duelId, 'attack', 'counter')

    const { sections } = await (await api.get('/api/account/export', 'bob')).json()
    expect(sections.duel).toEqual({
      duels: [
        {
          duelId,
          role: 'opponent',
          training: false,
          stake: STAKE,
          issuedAt: expect.any(Number),
          moves: ['counter'],
          result: null,
        },
      ],
    })
    expect(JSON.stringify(sections.duel)).not.toContain('attack')
  })

  it('remplace le nom du joueur effacé dans les événements des duels', async () => {
    const api = await duelWithVillages()
    const duelId = await challengeBob(api)
    await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')
    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'bob' } })

    const rows = await api.db.execute(
      sql`SELECT data FROM platform.events WHERE stream = ${`duel-${duelId}`}
          AND type = 'ChallengeAccepted'`,
    )
    const [{ data }] = (rows as unknown as { rows: { data: Record<string, unknown> }[] }).rows
    expect(data).toMatchObject({ opponentId: 'bob', opponentName: 'Joueur effacé' })
    expect((await viewOf(api, duelId, 'alice')).rival.name).toBe('Joueur effacé')
  })
})

describe('Duel - avec le Village extrait', () => {
  it('joue un duel complet avec le Village extrait, sans créer ni perdre de ressource', async () => {
    const api = await createTestApi({ villageService: true })
    await api.post('/api/realm/village', { name: 'Valombre' }, 'alice')
    await api.post('/api/realm/village', { name: 'Roche-Haute' }, 'bob')

    const duelId = await challengeBob(api)
    const accepted = await api.post(`/api/duel/duels/${duelId}/accept`, {}, 'bob')
    expect(((await accepted.json()) as { view: DuelView }).view.status).toBe('fighting')

    for (const b of ['heal', 'heal', 'heal', 'attack', 'attack'] as Move[]) {
      await round(api, duelId, 'attack', b)
    }
    // Les mises ont été prélevées puis versées par le service, au moyen des mêmes messages.
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 160, stone: 70 })
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 40, stone: 30 })
  })
})
