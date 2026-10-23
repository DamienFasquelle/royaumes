import { describe, expect, it } from 'vitest'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Commence au nom d'alice un entraînement contre le maître d'armes. */
async function startTraining({ post }: TestApi) {
  const { duelId } = (await (await post('/api/duel/training', {})).json()) as { duelId: string }
  return duelId
}

/** Lit un flux jusqu'à sa fermeture volontaire, au nom d'un joueur. */
async function readStream({ get }: TestApi, duelId: string, player: string) {
  const res = await get(`/api/stream/duel-${duelId}`, player)
  return { status: res.status, body: await res.text() }
}

describe('Temps réel du Duel', () => {
  it("réserve le canal d'un duel à ses duellistes (403)", async () => {
    const api = await createTestApi()
    const duelId = await startTraining(api)

    expect((await readStream(api, duelId, 'alice')).status).toBe(200)
    expect((await readStream(api, duelId, 'bob')).status).toBe(403)
  })

  it('signale la résolution des manches sans révéler les passes', async () => {
    const api = await createTestApi()
    const duelId = await startTraining(api)
    await api.post(`/api/duel/duels/${duelId}/move`, { round: 1, move: 'counter' })

    const { body } = await readStream(api, duelId, 'alice')
    expect(body).toContain('"type":"MoveChosen"')
    expect(body).toContain('"type":"RoundResolved"')
    expect(body).not.toContain('counter')
  })
})
