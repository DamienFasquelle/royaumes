'use client'
import { hc } from 'hono/client'
import dynamic from 'next/dynamic'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type ChannelEvent, type ChannelStatus, useChannel } from '@/platform/realtime/use-channel'
import { ConfirmDialog } from '@/ui/confirm'
import { Entity } from '@/ui/entity'
import { SceneLoading } from '@/ui/scene-loading'
import { look } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  type DomainError,
  MAX_LEVEL,
  RESOURCES,
  type Resource,
  type Stock,
  stockAt,
  type VillageView,
  villageChannel,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RealmApi>('/api/realm')

/** Scène 3D du Village, chargée à la demande et seulement dans le navigateur. */
const VillageWorld = dynamic(() => import('./scene/village-world').then((m) => m.VillageWorld), {
  ssr: false,
  loading: () => <SceneLoading text="Le village s'éveille..." />,
})

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: "Aucun village pour l'instant.",
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS: Record<ChannelStatus, string> = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
}

/** Ressource produite par chaque bâtiment, et description de son rôle. */
const BUILDING_INFO: Record<Building, { produces: Resource; lore: string }> = {
  sawmill: {
    produces: 'wood',
    lore: 'Les bûcherons y débitent les troncs de la forêt voisine. Le bois sert à bâtir et à commercer.',
  },
  quarry: {
    produces: 'stone',
    lore: 'On y taille la pierre de la falaise. Elle renforce les bâtiments et se négocie au Marché.',
  },
  mine: {
    produces: 'gold',
    lore: "Ses galeries suivent les veines d'or de la montagne. L'or fait la richesse du royaume.",
  },
}

/** Ressources manquantes pour couvrir un coût, à l'instant considéré. */
function missingFor(stock: Stock, cost: Partial<Stock> | null): Partial<Stock> {
  const missing: Partial<Stock> = {}
  for (const [resource, amount] of Object.entries(cost ?? {}) as [Resource, number][]) {
    const lack = Math.ceil(amount - stock[resource])
    if (lack > 0) missing[resource] = lack
  }
  return missing
}

/** Minutes avant que la production couvre ce qui manque ; null si une ressource n'est pas produite. */
function minutesUntil(missing: Partial<Stock>, rates: Stock): number | null {
  let minutes = 0
  for (const [resource, lack] of Object.entries(missing) as [Resource, number][]) {
    if (rates[resource] <= 0) return null
    minutes = Math.max(minutes, lack / rates[resource])
  }
  return Math.ceil(minutes)
}

// ---------------------------------------------------------------------------
// État du village, partagé par la bannière des ressources et l'écran du Village
// ---------------------------------------------------------------------------

interface RealmState {
  /** undefined : chargement en cours ; null : aucun village fondé. */
  view: VillageView | null | undefined
  setView: (view: VillageView) => void
  status: ChannelStatus
  /** Dernier mouvement de ressources, qui fait briller leur indicateur. */
  pulse: { kind: 'gain' | 'spend'; key: number } | null
}

const RealmContext = createContext<RealmState>({
  view: undefined,
  setView: () => {},
  status: 'connecting',
  pulse: null,
})

/** Quantités d'un mouvement de ressources, en texte : « 60 bois, 20 pierre ». */
function amountsText(resources: Partial<Stock>) {
  return Object.entries(resources)
    .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
    .join(', ')
}

/**
 * Vue du village du joueur, lue une fois puis tenue à jour par son canal temps réel.
 * Un seul abonnement sert toute la coque du jeu : la bannière des ressources, l'écran du
 * Village et les notifications des événements du royaume.
 */
export function RealmProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [pulse, setPulse] = useState<RealmState['pulse']>(null)
  const notify = useToast()

  const refresh = useCallback(async () => {
    const res = await client.village.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : chaque événement du village, y compris venu d'un autre onglet ou d'un autre
  // module (mise d'un duel, échange du Marché), provoque une relecture et une notification.
  const status = useChannel(villageChannel(userId), (event: ChannelEvent) => {
    refresh()
    const data = event.data as {
      resources?: Partial<Stock>
      building?: Building
      toLevel?: number
      name?: string
    }
    switch (event.type) {
      case 'ResourcesDeposited':
        setPulse({ kind: 'gain', key: event.position })
        notify(`Des ressources arrivent au village : ${amountsText(data.resources ?? {})}.`, 'gold')
        break
      case 'ResourcesWithdrawn':
        setPulse({ kind: 'spend', key: event.position })
        notify(`Ressources prélevées : ${amountsText(data.resources ?? {})}.`, 'warning')
        break
      case 'BuildingUpgraded':
        setPulse({ kind: 'spend', key: event.position })
        if (data.building) {
          notify(`${look(data.building).label} : niveau ${data.toLevel} atteint.`, 'success')
        }
        break
      case 'VillageFounded':
        notify(`Le village ${data.name ?? ''} est fondé.`, 'gold')
        break
    }
  })

  const value = useMemo(() => ({ view, setView, status, pulse }), [view, status, pulse])
  return <RealmContext.Provider value={value}>{children}</RealmContext.Provider>
}

/** Stock extrapolé à l'instant courant, rafraîchi deux fois par seconde, sans requête. */
function useLiveStock(view: VillageView | null | undefined): Stock | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  return view ? stockAt(view, now) : null
}

/** Ressources du joueur dans la bannière du jeu, avec leur production par minute. */
export function RealmResources() {
  const { view, pulse } = useContext(RealmContext)
  const stock = useLiveStock(view)
  if (!view || !stock) return null
  return (
    <section className="resources" aria-label="Ressources du village">
      {RESOURCES.map((resource) => (
        <span
          key={`${resource}-${pulse?.key ?? 0}`}
          className="res"
          data-pulse={pulse?.kind}
          data-tooltip={`${look(resource).label} : +${view.ratesPerMinute[resource]} par minute`}
        >
          <Entity kind={resource} /> {Math.floor(stock[resource])}
          <small>+{view.ratesPerMinute[resource]}/min</small>
        </span>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Écran du Village
// ---------------------------------------------------------------------------

/** Écran du Village : le monde 3D, la fiche du bâtiment sélectionné, la fondation. */
export function VillageScreen() {
  const { view, setView, status } = useContext(RealmContext)
  const stock = useLiveStock(view)
  const [selected, setSelected] = useState<Building | null>(null)
  const [confirming, setConfirming] = useState<Building | null>(null)
  const [celebrate, setCelebrate] = useState<{ building: Building; key: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const celebrations = useRef(0)

  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      return false
    }
    setError(null)
    setView(body.view)
    return true
  }

  // COMMANDES : la vue renvoyée par le serveur fait foi ; la célébration n'est jouée qu'après.
  async function found(name: string) {
    setBusy(true)
    handle(await (await client.village.$post({ json: { name } })).json())
    setBusy(false)
  }
  async function upgrade(building: Building) {
    setConfirming(null)
    setBusy(true)
    const ok = handle(await (await client.village.upgrade.$post({ json: { building } })).json())
    setBusy(false)
    if (ok) setCelebrate({ building, key: ++celebrations.current })
  }

  const header = (
    <div className="hud-header">
      <h1>
        <Entity kind="village" /> {view?.name ?? 'Royaumes'}
      </h1>
      <p className="tagline">Vos terres, vos bâtiments : faites prospérer le village.</p>
      <span className="status" data-status={status}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  )

  const hint = (
    <p className="hud-hint">
      Glisser : tourner · Molette ou pincer : zoomer · Clic droit : déplacer · Flèches, + et - au
      clavier
    </p>
  )

  // Aucun village : une vallée vierge, et la charte de fondation.
  if (view === null) {
    return (
      <section className="stage" aria-label="Fondation du village">
        <VillageWorld
          levels={null}
          rates={null}
          selected={null}
          onSelect={() => {}}
          celebrate={null}
        />
        <div className="hud">
          {header}
          <div className="hud-side">
            <div className="hud-panel" data-important="true">
              <h2>Fonder votre village</h2>
              <p className="muted">
                Une vallée abritée, une forêt, une falaise et une montagne riche en or : tout est
                prêt pour accueillir votre peuple.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  found(String(new FormData(e.currentTarget).get('name')))
                }}
              >
                <label htmlFor="name">Nom du village</label>
                <input id="name" name="name" required minLength={2} maxLength={30} />
                <button type="submit" disabled={busy}>
                  Fonder le village
                </button>
                {error && <p className="error">{error}</p>}
              </form>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="stage" aria-label="Village">
      <VillageWorld
        levels={view?.levels ?? null}
        rates={view?.ratesPerMinute ?? null}
        selected={selected}
        onSelect={setSelected}
        celebrate={celebrate}
      />
      <div className="hud">
        {header}
        {view && stock && (
          <div className="hud-side">
            {selected ? (
              <BuildingPanel
                building={selected}
                view={view}
                stock={stock}
                busy={busy}
                error={error}
                onUpgrade={() => setConfirming(selected)}
                onClose={() => setSelected(null)}
              />
            ) : (
              <RealmOverview view={view} stock={stock} onSelect={setSelected} />
            )}
          </div>
        )}
        {hint}
      </div>
      {confirming && view && (
        <ConfirmDialog
          title={`${view.levels[confirming] === 0 ? 'Construire' : 'Améliorer'} : ${look(confirming).label}`}
          confirmLabel="Lancer les travaux"
          onConfirm={() => upgrade(confirming)}
          onCancel={() => setConfirming(null)}
        >
          <p>Les ressources suivantes seront dépensées :</p>
          <CostList cost={view.nextCosts[confirming]} missing={{}} />
          <p className="muted">
            {look(confirming).label} passera au niveau {view.levels[confirming] + 1}.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}

/** Coût d'une amélioration, ressource par ressource, en signalant ce qui manque. */
function CostList({ cost, missing }: { cost: Partial<Stock> | null; missing: Partial<Stock> }) {
  if (!cost) return null
  return (
    <div className="cost">
      {(Object.entries(cost) as [Resource, number][]).map(([resource, amount]) => (
        <span key={resource} className="res" data-missing={missing[resource] ? 'true' : undefined}>
          <Entity kind={resource} /> {amount}
          {missing[resource] && <small>(manque {missing[resource]})</small>}
        </span>
      ))}
    </div>
  )
}

/** Vue d'ensemble du royaume : production, et prochaine action intéressante. */
function RealmOverview({
  view,
  stock,
  onSelect,
}: {
  view: VillageView
  stock: Stock
  onSelect: (building: Building) => void
}) {
  // Prochaine action : une amélioration abordable dès maintenant, sinon la plus proche.
  const options = BUILDINGS.filter((b) => view.nextCosts[b]).map((building) => {
    const missing = missingFor(stock, view.nextCosts[building])
    return { building, missing, minutes: minutesUntil(missing, view.ratesPerMinute) }
  })
  const ready = options.filter((o) => Object.keys(o.missing).length === 0)
  const soonest = options
    .filter((o) => o.minutes !== null)
    .sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0))[0]

  return (
    <div className="hud-panel">
      <h2>Votre royaume</h2>
      <h3>Production</h3>
      <dl className="stats">
        {RESOURCES.map((resource) => (
          <div key={resource} style={{ display: 'contents' }}>
            <dt>
              <Entity kind={resource} showLabel />
            </dt>
            <dd>+{view.ratesPerMinute[resource]} par minute</dd>
          </div>
        ))}
      </dl>
      <h3>Prochaine action</h3>
      {ready.length > 0 ? (
        <p>
          Vous pouvez dès maintenant{' '}
          {ready.map((o, i) => (
            <span key={o.building}>
              {i > 0 && ' ou '}
              <button className="link" type="button" onClick={() => onSelect(o.building)}>
                {view.levels[o.building] === 0 ? 'construire' : 'améliorer'} la{' '}
                {look(o.building).label.toLowerCase()}
              </button>
            </span>
          ))}
          .
        </p>
      ) : soonest ? (
        <p>
          <button className="link" type="button" onClick={() => onSelect(soonest.building)}>
            {look(soonest.building).label}
          </button>{' '}
          : ressources réunies dans {soonest.minutes} min environ, au rythme actuel.
        </p>
      ) : (
        <p className="muted">
          Échangez des ressources au Marché pour financer votre prochaine construction.
        </p>
      )}
      <h3>Bâtiments</h3>
      <ul className="games">
        {BUILDINGS.map((building) => (
          <li key={building}>
            <span>
              <Entity kind={building} showLabel />{' '}
              <span className="muted">
                {view.levels[building] === 0 ? 'non construite' : `niveau ${view.levels[building]}`}
              </span>
            </span>
            <button type="button" className="secondary" onClick={() => onSelect(building)}>
              Voir
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Fiche d'un bâtiment : niveau, production, coût de la prochaine amélioration. */
function BuildingPanel({
  building,
  view,
  stock,
  busy,
  error,
  onUpgrade,
  onClose,
}: {
  building: Building
  view: VillageView
  stock: Stock
  busy: boolean
  error: string | null
  onUpgrade: () => void
  onClose: () => void
}) {
  const level = view.levels[building]
  const info = BUILDING_INFO[building]
  const rate = view.ratesPerMinute[info.produces]
  const cost = view.nextCosts[building]
  const missing = missingFor(stock, cost)
  const affordable = !!cost && Object.keys(missing).length === 0
  // La production est proportionnelle au niveau : la suivante se déduit de l'actuelle.
  const nextRate = level > 0 ? (rate / level) * (level + 1) : null

  return (
    <div className="hud-panel" data-important="true">
      <button
        type="button"
        className="secondary icon panel-close"
        aria-label="Fermer"
        onClick={onClose}
      >
        ✕
      </button>
      <h2>
        <Entity kind={building} /> {look(building).label}
      </h2>
      <p className="muted">{info.lore}</p>
      <dl className="stats">
        <dt>Niveau</dt>
        <dd>
          {level} / {MAX_LEVEL}
        </dd>
        <dt>Production</dt>
        <dd>
          {level === 0
            ? 'aucune'
            : `+${rate} ${look(info.produces).label.toLowerCase()} par minute`}
        </dd>
      </dl>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(level / MAX_LEVEL) * 100}%` }} />
      </div>
      {cost ? (
        <>
          <h3>{level === 0 ? 'Construction' : `Amélioration au niveau ${level + 1}`}</h3>
          <CostList cost={cost} missing={missing} />
          {nextRate !== null && (
            <p className="muted">
              Production après les travaux : +{nextRate} {look(info.produces).label.toLowerCase()}{' '}
              par minute.
            </p>
          )}
          <button type="button" disabled={!affordable || busy} onClick={onUpgrade}>
            {level === 0 ? 'Construire' : 'Améliorer'}
          </button>
          {!affordable && (
            <p className="muted">
              Il vous manque {amountsText(missing)}
              {(() => {
                const minutes = minutesUntil(missing, view.ratesPerMinute)
                return minutes !== null ? ` : environ ${minutes} min au rythme actuel.` : '.'
              })()}
            </p>
          )}
        </>
      ) : (
        <p className="ok">Niveau maximal atteint.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
