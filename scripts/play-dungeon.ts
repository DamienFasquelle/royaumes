/**
 * Joue plusieurs expéditions du Donjon d'affilée, au nom d'un joueur existant.
 *
 *   $env:BASE_URL = 'https://royaumes-live.vercel.app'
 *   $env:PLAYER_EMAIL = '...'; $env:PLAYER_PASSWORD = '...'
 *   pnpm exec tsx scripts/play-dungeon.ts [expéditions] [easy|hard] [compagnons]
 *
 * Le script se connecte, puis, pour chaque expédition : l'ouvre, ajoute les compagnons
 * demandés, la lance, ouvre les portes et combat jusqu'à la victoire ou la défaite.
 * Les identifiants sont lus dans l'environnement : ils ne sont jamais écrits dans le dépôt.
 */
import type { Action, GameView } from '@/modules/dungeon/contracts'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.PLAYER_EMAIL
const PASSWORD = process.env.PLAYER_PASSWORD
const runs = Number(process.argv[2] ?? 1)
const difficulty = process.argv[3] ?? 'easy'
const companions = Number(process.argv[4] ?? 0)

/** En dessous de cette part de ses points de vie, le héros se soigne au lieu d'attaquer. */
const HEAL_BELOW = 0.4
/** Délai entre deux consultations, lorsque le script attend une échéance. */
const POLL_MS = 2_000
/** Nombre maximal de commandes par expédition, pour ne jamais boucler indéfiniment. */
const MAX_STEPS = 500

if (!EMAIL || !PASSWORD) {
  console.error('Variables PLAYER_EMAIL et PLAYER_PASSWORD requises.')
  process.exit(1)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Connexion : renvoie les cookies de session, et l'identifiant du joueur. */
async function signIn() {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`Connexion refusée (${res.status}) : ${await res.text()}`)
  const cookie = res.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ')
  const body = (await res.json()) as { user: { id: string; name: string } }
  return { cookie, user: body.user }
}

const { cookie, user } = await signIn()
console.log(`Connecté en tant que ${user.name} sur ${BASE}`)

/**
 * Commande sur l'API du Donjon. Renvoie la vue de l'expédition, ou l'erreur métier :
 * une erreur attendue (manche déjà résolue, tour d'un autre héros) n'interrompt pas le script.
 */
async function call(path: string, body: unknown = {}) {
  const res = await fetch(`${BASE}/api/dungeon${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, cookie },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as {
    gameId?: string
    view?: GameView
    error?: { code: string }
  }
  if (res.status >= 500 || res.status === 401) {
    throw new Error(`${path} : ${res.status} ${JSON.stringify(json)}`)
  }
  return json
}

const get = async (gameId: string) =>
  (await fetch(`${BASE}/api/dungeon/games/${gameId}`, { headers: { cookie } }).then((res) =>
    res.json(),
  )) as { view: GameView }

/** Action du héros : se soigner s'il est mal en point, sinon frapper le monstre le plus faible. */
function chooseAction(view: GameView): Action {
  const me = view.heroes.find((hero) => hero.id === user.id)
  if (me && me.hp / me.maxHp < HEAL_BELOW) return { type: 'heal', target: me.id }
  const target = view.monsters.filter((monster) => monster.hp > 0).sort((a, b) => a.hp - b.hp)[0]
  return target ? { type: 'attack', target: target.id } : { type: 'defend' }
}

/** Joue une expédition jusqu'à son terme ; renvoie la vue finale. */
async function play(): Promise<GameView> {
  const created = await call('/games', { difficulty })
  if (!created.gameId || !created.view)
    throw new Error(`Ouverture refusée : ${created.error?.code}`)
  const gameId = created.gameId
  const path = `/games/${gameId}`
  for (let n = 0; n < companions; n++) await call(`${path}/companion`)
  let view = (await call(`${path}/start`)).view ?? (await get(gameId)).view

  for (let step = 0; step < MAX_STEPS; step++) {
    if (view.phase === 'won' || view.phase === 'lost') return view
    const me = view.heroes.find((hero) => hero.id === user.id)

    let result: Awaited<ReturnType<typeof call>> | null = null
    if (view.phase === 'exploring' && view.turnHeroId === user.id) {
      result = await call(`${path}/door`)
    } else if (view.phase === 'combat' && me && me.hp > 0 && !me.ready) {
      result = await call(`${path}/action`, { round: view.round, action: chooseAction(view) })
    } else if (view.deadline !== null && view.deadline <= Date.now()) {
      // Tour d'un compagnon, ou héros hors de combat : l'échéance fait avancer l'expédition.
      result = await call(`${path}/deadline`)
    } else {
      await sleep(POLL_MS)
    }
    view = result?.view ?? (await get(gameId)).view
  }
  throw new Error(`Expédition ${gameId} : trop d'étapes, abandon.`)
}

let won = 0
let gold = 0
for (let run = 1; run <= runs; run++) {
  const started = Date.now()
  const view = await play()
  if (view.phase === 'won') won++
  gold += view.loot
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `Expédition ${run}/${runs} : ${view.phase === 'won' ? 'victoire' : 'défaite'}, ` +
      `salle ${view.room + 1}/${view.roomCount}, ${view.loot} or, ${seconds} s`,
  )
}
console.log(`Bilan : ${won} victoire(s) sur ${runs}, ${gold} or ramassé.`)
