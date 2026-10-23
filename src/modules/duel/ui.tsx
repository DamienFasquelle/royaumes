'use client'
import { hc } from 'hono/client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { RankingApi } from '@/modules/ranking'
import type { RankingEntry } from '@/modules/ranking/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { ConfirmDialog } from '@/ui/confirm'
import { Entity } from '@/ui/entity'
import { HpBar } from '@/ui/hp-bar'
import { SceneLoading } from '@/ui/scene-loading'
import { useCountdown } from '@/ui/use-countdown'
import type { DuelApi } from './api'
import {
  type CancelReason,
  type DuelError,
  type DuelView,
  duelChannel,
  type Effect,
  MAX_HP,
  MOVES,
  type Move,
  type ResolvedRound,
  STAKE_MAX,
  STAKE_MIN,
  STAKE_RESOURCES,
  type Stake,
  type StakeResource,
} from './contracts'

/** Clients HTTP typés : celui du module, et celui du Classement, qui fournit la liste des joueurs. */
const client = hc<DuelApi>('/api/duel')
const ranking = hc<RankingApi>('/api/ranking')

/** Scènes 3D de l'arène, chargées à la demande et seulement dans le navigateur. */
const ArenaWorld = dynamic(() => import('./scene/arena-world').then((m) => m.ArenaWorld), {
  ssr: false,
  loading: () => <SceneLoading text="Les combattants entrent dans l'arène..." />,
})
const ArenaHall = dynamic(() => import('./scene/arena-world').then((m) => m.ArenaHall), {
  ssr: false,
  loading: () => <SceneLoading text="Les gradins se remplissent..." />,
})

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: DuelError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  DUEL_NOT_FOUND: 'Duel introuvable.',
  ALREADY_EXISTS: 'Duel déjà lancé.',
  INVALID_STAKE: `Misez au moins une ressource, chacune entre ${STAKE_MIN} et ${STAKE_MAX}.`,
  SELF_CHALLENGE: 'Vous ne pouvez pas vous défier vous-même.',
  INVALID_OPPONENT: "On ne défie pas le maître d'armes : on s'entraîne contre lui.",
  PLAYER_BUSY: 'Vous, ou votre adversaire, avez déjà un duel en cours.',
  NOT_OPPONENT: "Seul l'adversaire désigné peut répondre au défi.",
  NOT_CHALLENGER: 'Seul le joueur qui a lancé le défi peut l’annuler.',
  NOT_A_DUELIST: 'Vous ne participez pas à ce duel.',
  WRONG_STATUS: "Cette action n'est plus possible.",
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre passe.',
  NO_HEAL_LEFT: 'Vous ne pouvez plus vous soigner.',
}

/** Libellé de chaque passe d'armes. */
const MOVE_LABELS: Record<Move, string> = {
  attack: 'Attaquer',
  defend: 'Se défendre',
  counter: 'Contrer',
  heal: 'Se soigner',
}

/** Ce que fait chaque passe, rappelé sous son bouton : le joueur choisit en connaissance de cause. */
const MOVE_HINTS: Record<Move, string> = {
  attack: 'Interrompt un soin ; réduite par la défense',
  defend: 'Réduit une attaque à 2 dégâts',
  counter: 'Renvoie 8 dégâts à qui attaque',
  heal: 'Rend 5 PV, sauf si l’on vous attaque',
}

/** Catégorie d'un effet, qui donne sa couleur à la ligne du journal. */
const EFFECT_KINDS: Record<Effect['kind'], 'damage' | 'heal' | undefined> = {
  hit: 'damage',
  riposte: 'damage',
  stagger: 'damage',
  heal: 'heal',
  interrupted: undefined,
}

/** Choix d'une passe, tel qu'il est raconté dans le journal du combat. */
const MOVE_CHOICES: Record<Move, string> = {
  attack: "d'attaquer",
  defend: 'de se défendre',
  counter: 'de contrer',
  heal: 'de se soigner',
}

/** Description d'un effet d'une manche, comme celles du journal du Donjon. */
function describeEffect(effect: Effect, round: ResolvedRound, nameOf: (id: string) => string) {
  const source = nameOf(effect.source)
  const target = nameOf(effect.target)
  switch (effect.kind) {
    case 'hit':
      return round.moves[effect.target] === 'defend'
        ? `${source} inflige ${effect.amount} dégâts à ${target}, qui se défend`
        : `${source} inflige ${effect.amount} dégâts à ${target}`
    case 'riposte':
      return `${source} contre l'attaque et inflige ${effect.amount} dégâts à ${target}`
    case 'stagger':
      return `${source} contre dans le vide, se déséquilibre et perd ${effect.amount} PV`
    case 'heal':
      return effect.amount > 0
        ? `${source} se soigne et regagne ${effect.amount} PV`
        : `${source} se soigne, mais ses PV sont déjà au maximum`
    case 'interrupted':
      return `L'attaque de ${source} interrompt le soin de ${target}`
  }
}

/** Motif de l'annulation d'un défi. */
const CANCEL_LABELS: Record<CancelReason, string> = {
  unfunded: "Le défi a été annulé : votre village n'avait pas les ressources de la mise.",
  declined: 'Le défi a été refusé.',
  withdrawn: 'Le défi a été annulé par le joueur qui l’a lancé.',
  expired: "Le défi a expiré : l'adversaire n'a pas répondu à temps.",
  'opponent-unfunded':
    "Le duel a été annulé : le village de l'adversaire n'avait pas les ressources de la mise. La vôtre a été rendue.",
}

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Ressources d'une mise, chacune avec son symbole : « 🪵 60 🪨 20 ». */
function StakeAmounts({ stake, factor = 1 }: { stake: Stake; factor?: number }) {
  return (
    <>
      {STAKE_RESOURCES.filter((resource) => stake[resource]).map((resource) => (
        <span key={resource}>
          {' '}
          <Entity kind={resource} /> {(stake[resource] ?? 0) * factor}
        </span>
      ))}
    </>
  )
}

/** Description courte d'un duel, telle que la présente la liste. */
function describeDuel(view: DuelView) {
  if (view.training) return "Entraînement contre le maître d'armes"
  const rival = view.rival.name || 'votre adversaire'
  if (view.status === 'pending') {
    return view.role === 'challenger'
      ? `Défi lancé à ${rival}, en attente de sa réponse`
      : `${rival} vous défie`
  }
  return `Duel contre ${rival}`
}

/** Mise saisie dans le formulaire : les ressources laissées vides ne sont pas mises en jeu. */
function stakeOf(amounts: Record<StakeResource, string>): Stake {
  return Object.fromEntries(
    STAKE_RESOURCES.filter((r) => amounts[r] !== '').map((r) => [r, Number(amounts[r])]),
  ) as Stake
}

// ---------------------------------------------------------------------------
// Arène : duels actifs, défi lancé à un joueur, entraînement
// ---------------------------------------------------------------------------

/** Écran d'accueil de l'arène : duels actifs, défi lancé à un joueur, entraînement. */
export function DuelLobby({ userId }: { userId: string }) {
  const router = useRouter()
  const [duels, setDuels] = useState<DuelView[] | undefined>(undefined)
  const [players, setPlayers] = useState<RankingEntry[]>([])
  const [opponentId, setOpponentId] = useState('')
  // Quantité saisie pour chaque ressource ; une ressource laissée vide n'est pas mise en jeu.
  const [amounts, setAmounts] = useState<Record<StakeResource, string>>({
    wood: String(STAKE_MIN),
    stone: '',
    gold: '',
  })
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await client.duels.$get()
    if (res.ok) setDuels((await res.json()).duels)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // LECTURE DU LANGAGE PUBLIÉ DU CLASSEMENT : les joueurs que l'on peut défier.
  // DETTE TECHNIQUE (DT-013) : seuls les vingt premiers du classement sont proposés.
  useEffect(() => {
    ranking.players.$get().then(async (res) => {
      if (res.ok) setPlayers((await res.json()).entries.filter((e) => e.playerId !== userId))
    })
  }, [userId])

  /** Ouvre le duel créé, ou affiche l'erreur renvoyée par le serveur. */
  async function open(res: Response) {
    const body = (await res.json()) as { duelId: string } | { error: ApiError }
    setBusy(false)
    if ('error' in body) setError(ERRORS[body.error.code])
    else router.push(`/duel/${body.duelId}`)
  }
  async function challenge() {
    setConfirming(false)
    setBusy(true)
    open(await client.duels.$post({ json: { opponentId, stake: stakeOf(amounts) } }))
  }
  async function train() {
    setBusy(true)
    open(await client.training.$post())
  }

  const stake = stakeOf(amounts)
  const opponent = players.find((p) => p.playerId === opponentId)
  const total = Object.values(stake).reduce((sum, n) => sum + (n ?? 0), 0)
  // Contrôle de saisie pour guider le joueur ; le serveur reste seul juge de la mise.
  const inRange = Object.values(stake).every(
    (n) => Number.isInteger(n) && (n ?? 0) >= STAKE_MIN && (n ?? 0) <= STAKE_MAX,
  )
  const valid = !!opponentId && Object.keys(stake).length > 0 && inRange

  return (
    <section className="stage" aria-label="Arène des duels">
      <ArenaHall />
      <div className="hud">
        <div className="hud-header">
          <h1>
            <Entity kind="duel" /> Arène
          </h1>
          <p className="tagline">
            Croisez le fer avec un autre seigneur, ou entraînez-vous auprès du maître d'armes.
          </p>
        </div>
        <div className="hud-side">
          {duels && duels.length > 0 && (
            <section className="hud-panel" data-important="true" aria-label="Vos duels">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>Vos duels</h2>
                <button className="link" type="button" onClick={refresh}>
                  Actualiser
                </button>
              </div>
              <ul className="games">
                {duels.map((duel) => (
                  <li key={duel.duelId}>
                    <span>
                      {describeDuel(duel)}
                      {!duel.training && (
                        <span className="muted">
                          {' '}
                          (<StakeAmounts stake={duel.stake} />)
                        </span>
                      )}
                    </span>
                    <Link className="button" href={`/duel/${duel.duelId}`}>
                      Entrer
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="hud-panel" aria-label="Lancer un défi">
            <h2>Lancer un défi</h2>
            <label htmlFor="opponent">Adversaire</label>
            <select
              id="opponent"
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Choisir un joueur</option>
              {players.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.label} · {player.gamesWon} victoire(s) au Donjon
                </option>
              ))}
            </select>
            <h3>Mise de chacun</h3>
            <div className="row">
              {STAKE_RESOURCES.map((resource) => (
                <label key={resource} className="row" style={{ gap: 4 }}>
                  <Entity kind={resource} />
                  <input
                    type="number"
                    min={STAKE_MIN}
                    max={STAKE_MAX}
                    placeholder="0"
                    value={amounts[resource]}
                    onChange={(e) => setAmounts({ ...amounts, [resource]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <p className="muted">
              De {STAKE_MIN} à {STAKE_MAX} par ressource. Votre mise est prélevée dès le lancement ;
              le vainqueur emporte les deux. Un défi refusé, annulé ou sans réponse sous dix minutes
              vous la rend.
            </p>
            {!inRange && <p className="error">{ERRORS.INVALID_STAKE}</p>}
            <div className="actions">
              <button type="button" onClick={() => setConfirming(true)} disabled={!valid || busy}>
                ⚔️ Lancer le défi
              </button>
            </div>
          </section>

          <section className="hud-panel" aria-label="Entraînement">
            <h2>
              <Entity kind="master" /> Le maître d'armes
            </h2>
            <p className="muted">
              Un vétéran de l'arène, piloté par l'ordinateur. Il étudie vos habitudes et y répond.
              Sans mise, pour apprendre les passes d'armes.
            </p>
            <button type="button" className="secondary" onClick={train} disabled={busy}>
              S'entraîner
            </button>
          </section>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Lancer le défi"
          confirmLabel="Prélever ma mise et défier"
          onConfirm={challenge}
          onCancel={() => setConfirming(false)}
        >
          <p>
            Adversaire : <strong>{opponent?.label}</strong>
          </p>
          <p>
            Mise de chacun :<StakeAmounts stake={stake} /> ({total} au total).
          </p>
          <p className="muted">
            Cette mise est prélevée sur votre village dès maintenant. Elle vous est rendue si le
            défi est refusé, annulé, ou reste sans réponse dix minutes.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Duel
// ---------------------------------------------------------------------------

/** Écran d'un duel : réponse au défi, manches, et issue du duel, dans l'arène. */
export function DuelArena({ duelId, userId }: { duelId: string; userId: string }) {
  // undefined : chargement en cours ; null : duel introuvable, ou réservé à d'autres joueurs.
  const [view, setView] = useState<DuelView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmAccept, setConfirmAccept] = useState(false)
  const param = { id: duelId }

  // REQUÊTE : lecture de la vue du duel, filtrée pour le joueur.
  const refresh = useCallback(async () => {
    const res = await client.duels[':id'].$get({ param: { id: duelId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [duelId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : seuls les duellistes écoutent le canal du duel. Le canal ne transmet aucune
  // donnée : chaque notification provoque une relecture de la vue filtrée, qui ne contient
  // jamais la passe de l'adversaire avant la fin de la manche.
  const status = useChannel(view ? duelChannel(duelId) : null, refresh)

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  function handle(body: { view: DuelView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  async function command(send: () => Promise<Response>) {
    // Un seul envoi à la fois : un double clic ne soumet pas deux commandes.
    if (sending) return
    setSending(true)
    handle(await (await send()).json())
    setSending(false)
  }
  const accept = () => {
    setConfirmAccept(false)
    return command(() => client.duels[':id'].accept.$post({ param }))
  }
  const decline = () => command(() => client.duels[':id'].decline.$post({ param }))
  const cancel = () => command(() => client.duels[':id'].cancel.$post({ param }))
  const strike = (move: Move) =>
    view &&
    command(() => client.duels[':id'].move.$post({ param, json: { round: view.round, move } }))

  // ÉCHÉANCE : lorsque le compte à rebours d'une manche ou d'un défi atteint zéro, la commande
  // d'échéance fait enregistrer la suite du duel, et donc notifier les deux duellistes.
  const checkDeadline = useCallback(async () => {
    const res = await client.duels[':id'].deadline.$post({ param: { id: duelId } })
    if (res.ok) setView((await res.json()).view)
  }, [duelId])
  const remaining = useCountdown(
    view?.status === 'fighting'
      ? view.deadline
      : view?.status === 'pending'
        ? view.expiresAt
        : null,
    checkDeadline,
  )

  const header = (
    <div className="hud-header">
      <h1>
        <Entity kind="duel" /> Duel
      </h1>
      {view && (
        <p className="tagline">
          {describeDuel(view)}
          {!view.training && (
            <>
              {' '}
              · mise <StakeAmounts stake={view.stake} />
            </>
          )}
        </p>
      )}
      {view && (
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </div>
  )

  if (view === undefined) {
    return (
      <section className="stage" aria-label="Duel">
        <SceneLoading text="Les combattants entrent dans l'arène..." />
      </section>
    )
  }
  if (view === null) {
    return (
      <section className="stage" aria-label="Duel">
        <ArenaHall />
        <div className="hud">
          {header}
          <div className="hud-side">
            <div className="hud-panel">
              <p className="error">{ERRORS.DUEL_NOT_FOUND}</p>
              <Link className="button secondary" href="/duel">
                Retour à l'arène
              </Link>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const nameOf = (id: string) => (id === view.me.id ? view.me.name : view.rival.name || id)
  const urgent = remaining !== null && remaining <= 5
  const outcome =
    view.result?.outcome === 'draw' ? 'draw' : view.result?.winnerId === userId ? 'won' : 'lost'

  return (
    <section className="stage" aria-label="Duel">
      <ArenaWorld view={view} />
      <div className="hud">
        {header}

        {/* Les deux duellistes : un récapitulatif accessible de ce que montre l'arène. */}
        <div className="hud-left">
          <section className="hud-panel" aria-label="Duellistes">
            {[view.me, view.rival].map((duelist) => (
              <div key={duelist.id} className="fighter" data-down={duelist.hp <= 0}>
                <span>
                  <Entity kind={view.training && duelist.id !== userId ? 'master' : 'hero'} />{' '}
                  {duelist.name || 'En attente de réponse'}
                  {duelist.id === userId && <span className="muted"> (vous)</span>}
                </span>
                <HpBar hp={duelist.hp} maxHp={duelist.maxHp} />
                <span className="muted">
                  {duelist.hp}/{duelist.maxHp} PV · <Entity kind="move-heal" /> {duelist.healsLeft}
                </span>
                {view.status === 'fighting' && (
                  <span className={duelist.ready ? 'ok' : 'muted'}>
                    {duelist.ready ? 'en garde' : 'réfléchit...'}
                  </span>
                )}
              </div>
            ))}
          </section>
        </div>

        <div className="hud-side">
          {/* Saga des mises en cours : la réponse du Village est attendue. */}
          {(view.status === 'reserving' || view.status === 'accepting') && (
            <div className="hud-panel">
              <p className="muted">Les intendants prélèvent les mises dans les villages...</p>
            </div>
          )}

          {/* Défi en attente de réponse. */}
          {view.status === 'pending' && (
            <div className="hud-panel" data-important="true">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>Défi</h2>
                {remaining !== null && (
                  <span className="countdown" title="Le défi expirera de lui-même">
                    {remaining} s
                  </span>
                )}
              </div>
              <p>
                Mise de chacun :<StakeAmounts stake={view.stake} />. Le vainqueur emporte les deux.
              </p>
              {view.role === 'opponent' ? (
                <div className="actions">
                  <button type="button" onClick={() => setConfirmAccept(true)} disabled={sending}>
                    Accepter le défi
                  </button>
                  <button type="button" className="secondary" onClick={decline} disabled={sending}>
                    Refuser
                  </button>
                </div>
              ) : (
                <button type="button" className="secondary" onClick={cancel} disabled={sending}>
                  Annuler le défi
                </button>
              )}
            </div>
          )}

          {/* Issue du duel. */}
          {view.status === 'finished' && view.result && (
            <div className="hud-panel verdict" data-outcome={outcome}>
              <h2>
                {outcome === 'draw'
                  ? '⚖️ Duel nul'
                  : outcome === 'won'
                    ? '🏆 Victoire !'
                    : '💀 Défaite...'}
              </h2>
              {!view.training && (
                <p>
                  {outcome === 'draw' ? (
                    'Chacun récupère sa mise.'
                  ) : (
                    <>
                      {outcome === 'won' ? 'Vous emportez' : 'Votre adversaire emporte'}
                      <StakeAmounts stake={view.stake} factor={2} />.
                    </>
                  )}
                </p>
              )}
              <Link className="button" href="/duel">
                Retour à l'arène
              </Link>
            </div>
          )}

          {view.status === 'cancelled' && view.cancelReason && (
            <div className="hud-panel">
              <p>{CANCEL_LABELS[view.cancelReason]}</p>
              <Link className="button secondary" href="/duel">
                Retour à l'arène
              </Link>
            </div>
          )}

          {/* Journal du combat : les passes sont révélées une fois la manche terminée. */}
          {view.rounds.length > 0 && (
            <section className="hud-panel" aria-label="Journal du combat">
              <h2>Journal du combat</h2>
              <div className="log-scroll">
                {view.rounds
                  .map((round, index) => ({ round, before: view.rounds[index - 1]?.hp }))
                  .reverse()
                  .map(({ round, before }) => (
                    <div key={round.round}>
                      <h3>Manche {round.round}</h3>
                      <ul className="log">
                        {Object.entries(round.moves).map(([id, move]) => (
                          <li key={`move-${id}`}>
                            {round.missed.includes(id)
                              ? `${nameOf(id)} n'a pas choisi à temps : il se défend.`
                              : `${nameOf(id)} a choisi ${MOVE_CHOICES[move]}.`}
                          </li>
                        ))}
                        {round.effects.map((effect) => (
                          // Chaque duelliste n'agit qu'une fois par manche : ce triplet identifie l'effet.
                          <li
                            key={`${effect.kind}-${effect.source}-${effect.target}`}
                            data-kind={EFFECT_KINDS[effect.kind]}
                          >
                            {describeEffect(effect, round, nameOf)}.
                          </li>
                        ))}
                        {round.effects.length === 0 && <li>Aucun coup ne porte.</li>}
                        <li className="muted">
                          {Object.entries(round.hp)
                            .map(([id, hp]) => {
                              const change = hp - (before?.[id] ?? MAX_HP)
                              const sign = change > 0 ? '+' : ''
                              return `${nameOf(id)} : ${hp} PV${change !== 0 ? ` (${sign}${change})` : ''}`
                            })
                            .join(' · ')}
                        </li>
                      </ul>
                    </div>
                  ))}
              </div>
            </section>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        {/* Combat : compte à rebours et choix secret de la passe. */}
        {view.status === 'fighting' && (
          <div className="hud-bottom">
            <div className="hud-panel" data-important="true">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>
                  Manche {view.round} sur {view.maxRounds}
                </h2>
                {remaining !== null && (
                  <span className="countdown" data-urgent={urgent}>
                    {remaining} s
                  </span>
                )}
              </div>
              {view.me.move ? (
                <p>
                  <Entity kind={`move-${view.me.move}`} /> Passe verrouillée :{' '}
                  <strong>{MOVE_LABELS[view.me.move]}</strong>.{' '}
                  <span className="muted">
                    {view.rival.ready
                      ? 'Les deux passes sont choisies : révélation...'
                      : 'En attente de votre adversaire, qui ne connaît pas votre choix.'}
                  </span>
                </p>
              ) : (
                <div className="moves">
                  {MOVES.map((move) => (
                    <button
                      key={move}
                      type="button"
                      disabled={sending || (move === 'heal' && view.me.healsLeft === 0)}
                      onClick={() => strike(move)}
                    >
                      <span className="glyph">
                        <Entity kind={`move-${move}`} />
                      </span>
                      {MOVE_LABELS[move]}
                      <small>{MOVE_HINTS[move]}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {confirmAccept && (
        <ConfirmDialog
          title="Accepter le défi"
          confirmLabel="Prélever ma mise et combattre"
          onConfirm={accept}
          onCancel={() => setConfirmAccept(false)}
        >
          <p>
            Mise :<StakeAmounts stake={view.stake} />, prélevée sur votre village dès maintenant.
          </p>
          <p className="muted">
            Le vainqueur emporte les deux mises ; en cas de nul, chacun récupère la sienne.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}
