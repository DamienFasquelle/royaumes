'use client'
import { hc } from 'hono/client'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RESOURCES, type Resource } from '@/modules/realm/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { ConfirmDialog } from '@/ui/confirm'
import { Entity } from '@/ui/entity'
import { SceneLoading } from '@/ui/scene-loading'
import { look } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import type { MarketApi } from './api'
import {
  type Amounts,
  MARKET_CHANNEL,
  type MarketList,
  type OfferError,
  type OfferStatus,
  type OfferSummary,
  type OfferView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<MarketApi>('/api/market')

/** Place du marché en 3D, chargée à la demande et seulement dans le navigateur. */
const MarketWorld = dynamic(() => import('./scene/market-world').then((m) => m.MarketWorld), {
  ssr: false,
  loading: () => <SceneLoading text="Les marchands dressent leurs étals..." />,
})

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Libellé de chaque état d'une offre. */
const OFFER_STATUS: Record<OfferStatus, string> = {
  reserving: 'Réservation en cours',
  open: 'Ouverte',
  settling: 'Règlement en cours',
  completed: 'Échange conclu',
  rejected: 'Refusée : stock insuffisant',
  withdrawn: 'Retirée',
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<OfferError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide.',
  OFFER_NOT_FOUND: 'Offre introuvable.',
  ALREADY_EXISTS: 'Offre déjà publiée.',
  NOT_OPEN: "L'offre n'est plus disponible.",
  OWN_OFFER: 'Vous ne pouvez pas accepter votre propre offre.',
  NOT_SELLER: 'Seul le vendeur peut retirer son offre.',
  EXPIRED: "L'offre a expiré.",
  NOT_EXPIRED: "L'offre n'a pas expiré.",
}

/** Délai entre deux relectures, et nombre maximal de relectures, comme pour le Classement. */
const RETRY_MS = 1_000
const MAX_READS = 10

/** Affiche des quantités de ressources : « 60 bois, 30 pierre ». */
function AmountsText({ amounts }: { amounts: Amounts }) {
  return (
    <>
      {Object.entries(amounts).map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

/** Compte rendu d'une commande, à partir de la vue de l'offre renvoyée par l'API. */
function outcomeOf(view: OfferView): string {
  if (view.missing && view.status === 'open') {
    const missing = Object.entries(view.missing)
      .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
      .join(', ')
    return `Paiement refusé : il vous manque ${missing}.`
  }
  return OFFER_STATUS[view.status]
}

/** Durée restante avant l'échéance d'une offre : « 23 h », « 12 min ». */
function timeLeft(expiresAt: number) {
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h` : `${minutes} min`
}

/** Écran du Marché : la place et ses étals, la publication d'une offre, les échanges. */
export function MarketScreen() {
  const [list, setList] = useState<MarketList | undefined>(undefined)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<OfferSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const notify = useToast()
  // Formulaire de publication : une ressource cédée et une ressource demandée.
  const [give, setGive] = useState<{ resource: Resource; amount: number }>({
    resource: 'wood',
    amount: 50,
  })
  const [want, setWant] = useState<{ resource: Resource; amount: number }>({
    resource: 'stone',
    amount: 25,
  })

  // REQUÊTE : la consultation distribue la boîte d'envoi, puis rattrape la projection.
  const refresh = useCallback(async () => {
    const res = await client.offers.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setList(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : même mécanisme que le Classement (TD8), la liste est relue jusqu'à ce que
  // la projection ait atteint la position de l'événement annoncé.
  const wanted = useRef(0)
  const following = useRef(false)
  const status = useChannel(MARKET_CHANNEL, async (event) => {
    wanted.current = Math.max(wanted.current, event.position)
    if (following.current) return
    following.current = true
    try {
      for (let read = 0; read < MAX_READS; read++) {
        if ((await refresh()) >= wanted.current) return
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
      }
    } finally {
      following.current = false
    }
  })

  // COMMANDES : chaque réponse contient la vue de l'offre, ou une erreur. Une notification
  // n'annonce un échange conclu qu'après la confirmation du serveur.
  async function handle(res: Response) {
    const body = (await res.json()) as { view: OfferView } | { error: { code: string } }
    if ('error' in body) {
      setMessage({ text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.', error: true })
    } else {
      const failed = body.view.status === 'rejected' || !!body.view.missing
      setMessage({ text: outcomeOf(body.view), error: failed })
      if (body.view.status === 'completed')
        notify('Échange conclu : les marchandises sont livrées.', 'gold')
    }
    await refresh()
  }

  async function run(send: () => Promise<Response>) {
    if (busy) return
    setBusy(true)
    await handle(await send())
    setBusy(false)
  }
  const publish = () =>
    run(() =>
      client.offers.$post({
        json: { give: { [give.resource]: give.amount }, want: { [want.resource]: want.amount } },
      }),
    )
  const acceptOffer = (id: string) => {
    setConfirming(null)
    return run(() => client.offers[':id'].accept.$post({ param: { id } }))
  }
  const withdrawOffer = (id: string) =>
    run(() => client.offers[':id'].withdraw.$post({ param: { id } }))

  const offers = list?.offers ?? []
  const mine = offers.filter((offer) => offer.mine)
  const others = offers.filter((offer) => !offer.mine)
  const current = offers.find((offer) => offer.offerId === selected) ?? null

  /** Sélecteur d'une ressource et de sa quantité. */
  const picker = (
    label: string,
    value: { resource: Resource; amount: number },
    onChange: (value: { resource: Resource; amount: number }) => void,
  ) => (
    <div className="row" style={{ gap: 6 }}>
      <label htmlFor={`${label}-amount`} style={{ minWidth: 70 }}>
        {label}
      </label>
      <input
        id={`${label}-amount`}
        className="amount"
        type="number"
        min={1}
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
      />
      <select
        aria-label={`Ressource : ${label}`}
        value={value.resource}
        onChange={(e) => onChange({ ...value, resource: e.target.value as Resource })}
      >
        {RESOURCES.map((resource) => (
          <option key={resource} value={resource}>
            {look(resource).label}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <section className="stage" aria-label="Marché">
      <MarketWorld offers={offers} selected={selected} onSelect={setSelected} />
      <div className="hud">
        <div className="hud-header">
          <h1>
            <Entity kind="market" /> Marché
          </h1>
          <p className="tagline">
            Marchands et voyageurs échangent ici bois, pierre et or, sous l'œil des gardes.
          </p>
          <span className="status" data-status={status}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        <div className="hud-side">
          {current && (
            <div className="hud-panel" data-important="true">
              <button
                type="button"
                className="secondary icon panel-close"
                aria-label="Fermer"
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
              <h2>{current.mine ? 'Votre étal' : `Étal de ${current.sellerName}`}</h2>
              <dl className="stats">
                <dt>Cède</dt>
                <dd>
                  <AmountsText amounts={current.give} />
                </dd>
                <dt>Demande</dt>
                <dd>
                  <AmountsText amounts={current.want} />
                </dd>
                <dt>État</dt>
                <dd>{OFFER_STATUS[current.status]}</dd>
                <dt>Échéance</dt>
                <dd>dans {timeLeft(current.expiresAt)}</dd>
              </dl>
              {current.mine
                ? current.status === 'open' && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => withdrawOffer(current.offerId)}
                    >
                      Retirer l'offre
                    </button>
                  )
                : current.status === 'open' && (
                    <button type="button" disabled={busy} onClick={() => setConfirming(current)}>
                      Conclure l'échange
                    </button>
                  )}
            </div>
          )}

          <div className="hud-panel">
            <h2>Proposer un échange</h2>
            {picker('Je cède', give, setGive)}
            {picker('contre', want, setWant)}
            <p className="muted">
              Les ressources cédées sont mises en séquestre dès la publication, et rendues si
              l'offre est retirée ou expire.
            </p>
            <button type="button" onClick={publish} disabled={busy}>
              Dresser l'étal
            </button>
          </div>
          {message && (
            <p className={message.error ? 'error' : 'hud-panel'} role="status">
              {message.text}
            </p>
          )}

          <section className="hud-panel" aria-label="Vos offres">
            <h2>Vos offres</h2>
            {mine.length === 0 && <p className="muted">Aucune offre en cours.</p>}
            <ul className="offers">
              {mine.map((offer) => (
                <li key={offer.offerId} data-selected={offer.offerId === selected}>
                  <span>
                    <AmountsText amounts={offer.give} /> contre <AmountsText amounts={offer.want} />{' '}
                    <span className="muted">({OFFER_STATUS[offer.status]})</span>
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSelected(offer.offerId)}
                  >
                    Voir
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="hud-panel" aria-label="Offres des autres joueurs">
            <h2>Offres des autres joueurs</h2>
            {others.length === 0 && <p className="muted">Aucune offre disponible.</p>}
            <ul className="offers">
              {others.map((offer) => (
                <li key={offer.offerId} data-selected={offer.offerId === selected}>
                  <span>
                    {offer.sellerName} cède <AmountsText amounts={offer.give} /> contre{' '}
                    <AmountsText amounts={offer.want} />
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSelected(offer.offerId)}
                  >
                    Voir
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Conclure l'échange"
          confirmLabel="Payer et recevoir"
          onConfirm={() => acceptOffer(confirming.offerId)}
          onCancel={() => setConfirming(null)}
        >
          <p>
            Vous payez <AmountsText amounts={confirming.want} /> à {confirming.sellerName}, et
            recevez <AmountsText amounts={confirming.give} />.
          </p>
          <p className="muted">
            Si votre village n'a pas de quoi payer, rien n'est prélevé et l'offre reste ouverte.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}
