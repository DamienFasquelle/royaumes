'use client'
import { hc } from 'hono/client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { HpBar } from '@/ui/hp-bar'
import { SceneLoading } from '@/ui/scene-loading'
import { useCountdown } from '@/ui/use-countdown'
import type { DungeonApi } from './api'
import {
  type Action,
  DIFFICULTIES,
  type Difficulty,
  type Effect,
  type GameError,
  type GameView,
  gameChannel,
  MAX_HEROES,
  MONSTERS,
  type Monster,
  type OpenGame,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<DungeonApi>('/api/dungeon')

/** Scènes 3D, chargées à la demande et seulement dans le navigateur. */
const DungeonWorld = dynamic(() => import('./scene/dungeon-world').then((m) => m.DungeonWorld), {
  ssr: false,
  loading: () => <SceneLoading text="Les torches s'allument..." />,
})
const DungeonGate = dynamic(() => import('./scene/dungeon-gate').then((m) => m.DungeonGate), {
  ssr: false,
  loading: () => <SceneLoading text="La brume s'écarte..." />,
})

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: GameError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  GAME_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: "Cette action n'est plus possible.",
  GAME_FULL: "L'expédition est complète.",
  ALREADY_JOINED: "Vous faites déjà partie de l'expédition.",
  NOT_A_MEMBER: "Vous ne faites pas partie de l'expédition.",
  NOT_HOST: "Seul l'hôte peut lancer l'expédition.",
  NOT_YOUR_TURN: "Ce n'est pas votre tour.",
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
}

/** Libellé et description de chaque niveau de difficulté. */
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Facile', hard: 'Difficile' }
const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  easy: 'Les monstres frappent sans calcul.',
  hard: 'Les monstres frappent plus fort et visent les héros affaiblis.',
}

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

// ---------------------------------------------------------------------------
// Entrée du donjon : expéditions ouvertes et préparation
// ---------------------------------------------------------------------------

/** Écran d'accueil du Donjon : expéditions ouvertes et ouverture d'une expédition. */
export function DungeonLobby() {
  const router = useRouter()
  const [games, setGames] = useState<OpenGame[] | undefined>(undefined)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const res = await client.games.$get()
    if (res.ok) setGames((await res.json()).games)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open() {
    setBusy(true)
    const res = await client.games.$post({ json: { difficulty } })
    if (res.ok) router.push(`/dungeon/${(await res.json()).gameId}`)
    else setBusy(false)
  }

  return (
    <section className="stage" aria-label="Entrée du donjon">
      <DungeonGate />
      <div className="hud">
        <div className="hud-header">
          <h1>
            <Entity kind="dungeon" /> Donjon
          </h1>
          <p className="tagline">
            Rassemblez une compagnie et descendez affronter le troll des profondeurs.
          </p>
        </div>
        <div className="hud-side">
          <div className="hud-panel" data-important="true">
            <h2>Nouvelle expédition</h2>
            <p className="muted">
              Six salles, des trésors, et un troll au plus profond. Jusqu'à {MAX_HEROES} héros,
              joueurs ou compagnons.
            </p>
            <h3>Difficulté</h3>
            <div className="moves">
              {DIFFICULTIES.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={difficulty === level}
                  onClick={() => setDifficulty(level)}
                >
                  <span className="glyph" aria-hidden="true">
                    {level === 'easy' ? '🗡️' : '💀'}
                  </span>
                  {DIFFICULTY_LABELS[level]}
                  <small>{DIFFICULTY_HINTS[level]}</small>
                </button>
              ))}
            </div>
            <div className="actions">
              <button type="button" onClick={open} disabled={busy}>
                Ouvrir l'expédition
              </button>
            </div>
          </div>
          <section className="hud-panel" aria-label="Expéditions ouvertes">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>Expéditions ouvertes</h2>
              <button className="link" type="button" onClick={refresh}>
                Actualiser
              </button>
            </div>
            {games?.length === 0 && (
              <p className="muted">Aucune compagnie ne se prépare pour le moment.</p>
            )}
            <ul className="games">
              {games?.map((game) => (
                <li key={game.gameId}>
                  <span>
                    Compagnie de {game.hostName}{' '}
                    <span className="muted">
                      ({game.heroCount}/{MAX_HEROES} héros)
                    </span>
                  </span>
                  <Link className="button secondary" href={`/dungeon/${game.gameId}`}>
                    Rejoindre
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Expédition
// ---------------------------------------------------------------------------

/** Nom affiché d'un monstre, numéroté si la salle en contient plusieurs du même type. */
function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

/** Description d'une action, telle que le joueur l'a choisie. */
function describeAction(action: Action, nameOf: (id: string) => string) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  return 'se défendre'
}

/** Préposition « de » devant un verbe à l'infinitif, élidée devant une voyelle. */
const ofVerb = (text: string) => (/^[aeéiou]/i.test(text) ? `d'${text}` : `de ${text}`)

/** Description d'un effet de la dernière manche. */
function describeEffect(effect: Effect, nameOf: (id: string) => string) {
  return effect.kind === 'damage'
    ? `${nameOf(effect.source)} inflige ${effect.amount} dégâts à ${nameOf(effect.target)}`
    : `${nameOf(effect.source)} rend ${effect.amount} points de vie à ${nameOf(effect.target)}`
}

/** Écran d'une expédition : préparation, exploration, combat et fin de l'expédition. */
export function DungeonGame({ gameId, userId }: { gameId: string; userId: string }) {
  // undefined : chargement en cours ; null : expédition introuvable.
  const [view, setView] = useState<GameView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [healTarget, setHealTarget] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const param = { id: gameId }

  // REQUÊTE : lecture de la vue de l'expédition, filtrée pour le joueur.
  const refresh = useCallback(async () => {
    const res = await client.games[':id'].$get({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : seuls les membres écoutent le canal de l'expédition. Le canal ne transmet
  // aucune donnée : chaque notification provoque une relecture de la vue filtrée.
  const status = useChannel(view?.isMember ? gameChannel(gameId) : null, refresh)

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  function handle(body: { view: GameView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  const addCompanion = async () =>
    handle(await (await client.games[':id'].companion.$post({ param })).json())
  const join = async () => handle(await (await client.games[':id'].join.$post({ param })).json())
  const start = async () => handle(await (await client.games[':id'].start.$post({ param })).json())
  const openDoor = async () =>
    handle(await (await client.games[':id'].door.$post({ param })).json())
  async function act(action: Action) {
    if (!view || sending) return
    // Un seul envoi à la fois : un double clic ne soumet pas deux actions.
    setSending(true)
    const res = await client.games[':id'].action.$post({
      param,
      json: { round: view.round, action },
    })
    handle(await res.json())
    setSending(false)
  }

  // ÉCHÉANCE : lorsque le compte à rebours d'une manche ou d'un tour d'exploration atteint
  // zéro, la commande d'échéance fait enregistrer la suite de l'expédition, et donc
  // notifier tous les membres.
  const checkDeadline = useCallback(async () => {
    const res = await client.games[':id'].deadline.$post({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
  }, [gameId])
  const remaining = useCountdown(
    view?.isMember && (view.phase === 'combat' || view.phase === 'exploring')
      ? view.deadline
      : null,
    checkDeadline,
  )

  // Cible par défaut : le premier monstre debout ; elle suit les monstres qui tombent.
  const standingMonsters = view?.monsters.filter((m) => m.hp > 0) ?? []
  const standingHeroes = view?.heroes.filter((h) => h.hp > 0) ?? []
  const currentTarget =
    target && standingMonsters.some((m) => m.id === target)
      ? target
      : (standingMonsters[0]?.id ?? null)
  const currentHeal =
    healTarget && standingHeroes.some((h) => h.id === healTarget)
      ? healTarget
      : ([...standingHeroes].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]?.id ?? null)

  const header = (
    <div className="hud-header">
      <h1>
        <Entity kind="dungeon" /> Expédition
        {view && <span className="muted"> · {DIFFICULTY_LABELS[view.difficulty]}</span>}
      </h1>
      {view && view.phase !== 'lobby' && (
        <p className="tagline">
          Salle {Math.max(1, view.room + 1)} sur {view.roomCount} · <Entity kind="gold" />{' '}
          {view.loot} or ramassé
        </p>
      )}
      {view?.isMember && (
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </div>
  )

  if (view === undefined) {
    return (
      <section className="stage" aria-label="Expédition">
        <SceneLoading text="Les torches s'allument..." />
      </section>
    )
  }
  if (view === null) {
    return (
      <section className="stage" aria-label="Expédition">
        <DungeonGate />
        <div className="hud">
          {header}
          <div className="hud-side">
            <div className="hud-panel">
              <p className="error">{ERRORS.GAME_NOT_FOUND}</p>
              <Link className="button secondary" href="/dungeon">
                Retour à l'entrée du donjon
              </Link>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // Noms des combattants, pour décrire les actions et les effets.
  const nameOf = (id: string) => {
    const hero = view.heroes.find((h) => h.id === id)
    if (hero) return hero.name
    const monster = view.monsters.find((m) => m.id === id)
    return monster ? monsterName(monster, view.monsters) : id
  }
  const me = view.heroes.find((hero) => hero.id === userId)
  const urgent = remaining !== null && remaining <= 5

  return (
    <section className="stage" aria-label="Expédition">
      <DungeonWorld view={view} userId={userId} target={currentTarget} onTarget={setTarget} />
      <div className="hud">
        {header}

        {/* La compagnie : un récapitulatif accessible de ce que montre la scène. */}
        <div className="hud-left">
          <section className="hud-panel" aria-label="Compagnie">
            <h2>Compagnie</h2>
            <div className="heroes">
              {view.heroes.map((hero) => (
                <div key={hero.id} className="fighter" data-down={hero.hp <= 0}>
                  <span>
                    <Entity kind={hero.companion ? 'companion' : 'hero'} /> {hero.name}
                    {hero.id === view.hostId && <span className="muted"> (hôte)</span>}
                  </span>
                  <HpBar hp={hero.hp} maxHp={hero.maxHp} />
                  {view.phase === 'combat' && hero.ready && <span className="ok">prêt</span>}
                  {view.turnHeroId === hero.id && <span className="ok">à son tour</span>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="hud-side">
          {/* Préparation : rejoindre, compagnons, lancement. */}
          {view.phase === 'lobby' && (
            <div className="hud-panel" data-important="true">
              <h2>Préparation de l'expédition</h2>
              <dl className="stats">
                <dt>Difficulté</dt>
                <dd>{DIFFICULTY_LABELS[view.difficulty]}</dd>
                <dt>Compagnie</dt>
                <dd>
                  {view.heroes.length} / {MAX_HEROES} héros
                </dd>
              </dl>
              <p className="muted">
                Communiquez l'adresse de cette page aux joueurs que vous souhaitez inviter.
              </p>
              <div className="actions">
                {!view.isMember && view.heroes.length < MAX_HEROES && (
                  <button type="button" onClick={join}>
                    Rejoindre la compagnie
                  </button>
                )}
                {view.isHost && view.heroes.length < MAX_HEROES && (
                  <button type="button" className="secondary" onClick={addCompanion}>
                    <Entity kind="companion" /> Recruter un compagnon
                  </button>
                )}
                {view.isHost && (
                  <button type="button" onClick={start}>
                    ⚔️ Entrer dans le donjon
                  </button>
                )}
              </div>
              {view.isMember && !view.isHost && (
                <p className="muted">En attente du lancement par l'hôte.</p>
              )}
            </div>
          )}

          {/* Exploration : ouvrir la porte suivante, à tour de rôle. */}
          {view.phase === 'exploring' && (
            <div className="hud-panel" data-important={view.turnHeroId === userId}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>Exploration</h2>
                {remaining !== null && (
                  <span
                    className="countdown"
                    data-urgent={urgent}
                    title="La porte s'ouvrira d'elle-même"
                  >
                    {remaining} s
                  </span>
                )}
              </div>
              <p>
                {view.currentRoom?.kind === 'treasure' &&
                  `Un trésor de ${view.currentRoom.gold} or rejoint le butin.`}
                {view.currentRoom?.kind === 'empty' && 'La salle est vide et silencieuse.'}
                {view.currentRoom?.kind === 'monsters' && 'La salle a été nettoyée.'}
                {!view.currentRoom && 'Les héros se tiennent devant la première porte.'}
              </p>
              {view.turnHeroId === userId ? (
                <button type="button" onClick={openDoor}>
                  <Entity kind="door" /> Ouvrir la porte suivante
                </button>
              ) : (
                <p className="muted">
                  Au tour de {nameOf(view.turnHeroId ?? '')} d'ouvrir la porte.
                </p>
              )}
            </div>
          )}

          {/* Fin de l'expédition. */}
          {(view.phase === 'won' || view.phase === 'lost') && (
            <div className="hud-panel verdict" data-outcome={view.phase}>
              <h2>{view.phase === 'won' ? '🏆 Victoire !' : '💀 Défaite...'}</h2>
              <p>
                {view.phase === 'won'
                  ? 'Le troll est vaincu. La compagnie remonte à la lumière.'
                  : 'La compagnie est tombée dans les profondeurs.'}
              </p>
              <p>
                Butin de l'expédition : <Entity kind="gold" /> {view.loot} or
              </p>
              <Link className="button" href="/dungeon">
                Retour à l'entrée du donjon
              </Link>
            </div>
          )}

          {/* Dernière manche, connue de tous une fois résolue. */}
          {view.lastRound && (
            <section className="hud-panel" aria-label="Dernière manche">
              <h2>Manche {view.lastRound.round}</h2>
              <ul className="log log-scroll">
                {Object.entries(view.lastRound.actions).map(([heroId, action]) => (
                  <li key={heroId}>
                    {nameOf(heroId)} a choisi {ofVerb(describeAction(action, nameOf))}.
                  </li>
                ))}
                {view.lastRound.effects.map((effect) => (
                  <li
                    key={`${effect.kind}-${effect.source}-${effect.target}`}
                    data-kind={effect.kind}
                  >
                    {describeEffect(effect, nameOf)}.
                  </li>
                ))}
              </ul>
            </section>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        {/* Combat : compte à rebours et choix de l'action. */}
        {view.phase === 'combat' && (
          <div className="hud-bottom">
            <div className="hud-panel" data-important="true">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>
                  Combat · salle {view.room + 1}, manche {view.round}
                </h2>
                {remaining !== null && (
                  <span className="countdown" data-urgent={urgent}>
                    {remaining} s
                  </span>
                )}
              </div>
              {me && me.hp > 0 && !me.action && (
                <>
                  <div className="moves">
                    <button
                      type="button"
                      disabled={!currentTarget || sending}
                      onClick={() =>
                        currentTarget && act({ type: 'attack', target: currentTarget })
                      }
                    >
                      <span className="glyph" aria-hidden="true">
                        🗡️
                      </span>
                      Attaquer
                      <small>{currentTarget ? nameOf(currentTarget) : 'aucune cible'}</small>
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => act({ type: 'defend' })}
                    >
                      <span className="glyph" aria-hidden="true">
                        🛡️
                      </span>
                      Se défendre
                      <small>Divise par deux les dégâts reçus</small>
                    </button>
                    <button
                      type="button"
                      disabled={!currentHeal || sending}
                      onClick={() => currentHeal && act({ type: 'heal', target: currentHeal })}
                    >
                      <span className="glyph" aria-hidden="true">
                        🧪
                      </span>
                      Soigner
                      <small>{currentHeal ? nameOf(currentHeal) : 'personne'}</small>
                    </button>
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <span className="muted">Cible :</span>
                    {standingMonsters.map((monster) => (
                      <button
                        key={monster.id}
                        type="button"
                        className="secondary"
                        aria-pressed={monster.id === currentTarget}
                        onClick={() => setTarget(monster.id)}
                      >
                        <Entity kind={monster.kind} /> {monsterName(monster, view.monsters)}
                      </button>
                    ))}
                    <span className="muted">Soin :</span>
                    <select
                      aria-label="Héros à soigner"
                      value={currentHeal ?? ''}
                      onChange={(e) => setHealTarget(e.target.value)}
                    >
                      {standingHeroes.map((hero) => (
                        <option key={hero.id} value={hero.id}>
                          {hero.name} ({hero.hp}/{hero.maxHp})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {me?.action && (
                <p className="muted">
                  Votre choix : {describeAction(me.action, nameOf)}. En attente des autres héros.
                </p>
              )}
              {me && me.hp <= 0 && <p className="muted">Votre héros est à terre.</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
