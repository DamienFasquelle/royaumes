'use client'
import { hc } from 'hono/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { RankingApi } from '@/modules/ranking'
import type { RankingEntry } from '@/modules/ranking/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { HpBar } from '@/ui/hp-bar'
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
  unfunded: "Le défi a été annulé : votre village n'avait pas assez d'or.",
  declined: 'Le défi a été refusé.',
  withdrawn: 'Le défi a été annulé par le joueur qui l’a lancé.',
  expired: "Le défi a expiré : l'adversaire n'a pas répondu à temps.",
  'opponent-unfunded':
    "Le duel a été annulé : le village de l'adversaire n'avait pas assez d'or. La mise a été rendue.",
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

// ---------------------------------------------------------------------------
// Liste des duels et lancement d'un défi
// ---------------------------------------------------------------------------

/** Écran d'accueil du Duel : duels actifs, défi lancé à un joueur, entraînement. */
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
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await client.duels.$get()
    if (res.ok) setDuels((await res.json()).duels)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // LECTURE DU LANGAGE PUBLIÉ DU CLASSEMENT : les joueurs que l'on peut défier.
  useEffect(() => {
    ranking.players.$get().then(async (res) => {
      if (res.ok) setPlayers((await res.json()).entries.filter((e) => e.playerId !== userId))
    })
  }, [userId])

  /** Ouvre le duel créé, ou affiche l'erreur renvoyée. */
  async function open(res: Response) {
    const body = (await res.json()) as { duelId: string } | { error: ApiError }
    if ('error' in body) setError(ERRORS[body.error.code])
    else router.push(`/duel/${body.duelId}`)
  }
  async function challenge() {
    const stake = Object.fromEntries(
      STAKE_RESOURCES.filter((r) => amounts[r] !== '').map((r) => [r, Number(amounts[r])]),
    )
    open(await client.duels.$post({ json: { opponentId, stake } }))
  }
  const train = async () => open(await client.training.$post())

  return (
    <>
      <h1>
        <Entity kind="duel" /> Duels
      </h1>
      <p className="tagline">
        Croisez le fer avec un autre seigneur, ou entraînez-vous auprès du maître d'armes.
      </p>

      <section className="panel" aria-label="Vos duels">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Vos duels</h2>
          <button className="link" type="button" onClick={refresh}>
            Actualiser
          </button>
        </div>
        {duels?.length === 0 && <p className="muted">Aucun duel en cours.</p>}
        <ul className="games">
          {duels?.map((duel) => (
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
              <Link href={`/duel/${duel.duelId}`}>Voir</Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="panel row">
        <label htmlFor="opponent">Adversaire</label>
        <select id="opponent" value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
          <option value="">Choisir un joueur</option>
          {players.map((player) => (
            <option key={player.playerId} value={player.playerId}>
              {player.label}
            </option>
          ))}
        </select>
        <span>Mise</span>
        {STAKE_RESOURCES.map((resource) => (
          <label key={resource} className="row">
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
        <button type="button" onClick={challenge} disabled={!opponentId}>
          Lancer le défi
        </button>
      </div>

      <div className="panel row">
        <span className="muted">Sans mise, pour apprendre les passes d'armes.</span>
        <button type="button" onClick={train}>
          <Entity kind="master" /> S'entraîner contre le maître d'armes
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Duel
// ---------------------------------------------------------------------------

/** Écran d'un duel : réponse au défi, manches, et issue du duel. */
export function DuelArena({ duelId, userId }: { duelId: string; userId: string }) {
  // undefined : chargement en cours ; null : duel introuvable, ou réservé à d'autres joueurs.
  const [view, setView] = useState<DuelView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
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
  // donnée : chaque notification provoque une relecture de la vue filtrée.
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
  const accept = async () =>
    handle(await (await client.duels[':id'].accept.$post({ param })).json())
  const decline = async () =>
    handle(await (await client.duels[':id'].decline.$post({ param })).json())
  const cancel = async () =>
    handle(await (await client.duels[':id'].cancel.$post({ param })).json())
  async function strike(move: Move) {
    if (!view) return
    const res = await client.duels[':id'].move.$post({ param, json: { round: view.round, move } })
    handle(await res.json())
  }

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

  const title = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>
        <Entity kind="duel" /> Duel
        {view && <span className="muted"> - {describeDuel(view)}</span>}
      </h1>
      {view && (
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </div>
  )

  if (view === undefined) return title
  if (view === null) {
    return (
      <>
        {title}
        <p className="error">{ERRORS.DUEL_NOT_FOUND}</p>
        <Link href="/duel">Retour aux duels</Link>
      </>
    )
  }

  const nameOf = (id: string) => (id === view.me.id ? view.me.name : view.rival.name || id)

  return (
    <>
      {title}

      {/* Les deux duellistes. */}
      <section className="panel versus" aria-label="Duellistes">
        {[view.me, view.rival].map((duelist, index) => (
          <div
            key={duelist.id}
            className="duelist"
            data-down={duelist.hp <= 0}
            style={{ order: index === 0 ? 0 : 2 }}
          >
            <span className="portrait">
              <Entity kind={view.training && duelist.id !== userId ? 'master' : 'hero'} />
            </span>
            <span className="name">
              {duelist.name || 'En attente de réponse'}
              {duelist.id === userId && <span className="muted"> (vous)</span>}
            </span>
            <HpBar hp={duelist.hp} maxHp={duelist.maxHp} />
            <span className="muted">
              {duelist.hp}/{duelist.maxHp} PV - <Entity kind="move-heal" /> {duelist.healsLeft}
            </span>
            {view.status === 'fighting' && (
              <span className={duelist.ready ? 'ok' : 'muted'}>
                {duelist.ready ? 'en garde' : 'réfléchit...'}
              </span>
            )}
          </div>
        ))}
        <span className="vs" style={{ order: 1 }} aria-hidden="true">
          VS
        </span>
      </section>

      {/* Saga des mises en cours : la réponse du Village est attendue. */}
      {(view.status === 'reserving' || view.status === 'accepting') && (
        <div className="panel">
          <p className="muted">Prélèvement des mises auprès des villages...</p>
        </div>
      )}

      {/* Défi en attente de réponse. */}
      {view.status === 'pending' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <p>
              Mise de chacun :<StakeAmounts stake={view.stake} />. Le vainqueur emporte les deux.
            </p>
            {remaining !== null && (
              <span className="countdown" title="Le défi expirera de lui-même">
                {remaining} s
              </span>
            )}
          </div>
          {view.role === 'opponent' ? (
            <div className="actions">
              <button type="button" onClick={accept}>
                Accepter le défi
              </button>
              <button type="button" onClick={decline}>
                Refuser
              </button>
            </div>
          ) : (
            <button type="button" onClick={cancel}>
              Annuler le défi
            </button>
          )}
        </div>
      )}

      {/* Combat : compte à rebours et choix de la passe. */}
      {view.status === 'fighting' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>
              Manche {view.round} sur {view.maxRounds}
            </h2>
            {remaining !== null && <span className="countdown">{remaining} s</span>}
          </div>
          {view.me.move ? (
            <p className="muted">
              Votre passe : <Entity kind={`move-${view.me.move}`} /> {MOVE_LABELS[view.me.move]}. En
              attente de votre adversaire.
            </p>
          ) : (
            <div className="moves">
              {MOVES.map((move) => (
                <button
                  key={move}
                  type="button"
                  disabled={move === 'heal' && view.me.healsLeft === 0}
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
      )}

      {/* Issue du duel. */}
      {view.status === 'finished' && view.result && (
        <div
          className="panel verdict"
          data-outcome={
            view.result.outcome === 'draw'
              ? 'draw'
              : view.result.winnerId === userId
                ? 'won'
                : 'lost'
          }
        >
          <h2>
            {view.result.outcome === 'draw'
              ? '⚖️ Duel nul'
              : view.result.winnerId === userId
                ? '🏆 Victoire !'
                : '💀 Défaite...'}
          </h2>
          {!view.training && (
            <p>
              {view.result.outcome === 'draw' ? (
                'Chacun récupère sa mise.'
              ) : (
                <>
                  Le vainqueur emporte
                  <StakeAmounts stake={view.stake} factor={2} />.
                </>
              )}
            </p>
          )}
          <Link href="/duel">Retour aux duels</Link>
        </div>
      )}

      {view.status === 'cancelled' && view.cancelReason && (
        <div className="panel">
          <p>{CANCEL_LABELS[view.cancelReason]}</p>
          <Link href="/duel">Retour aux duels</Link>
        </div>
      )}

      {/* Journal du combat : les passes sont révélées une fois la manche terminée, avec leurs
          effets, comme dans le Donjon. La manche la plus récente vient en tête. */}
      {view.rounds.length > 0 && (
        <section className="panel" aria-label="Journal du combat">
          <h2>Journal du combat</h2>
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
                      .join(' - ')}
                  </li>
                </ul>
              </div>
            ))}
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </>
  )
}
