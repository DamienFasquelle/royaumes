'use client'
import { hc } from 'hono/client'
import dynamic from 'next/dynamic'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { SceneLoading } from '@/ui/scene-loading'
import type { TavernApi } from './api'
import {
  HEARTBEAT_MS,
  MESSAGE_MAX_LENGTH,
  MESSAGE_POSTED,
  type MessageError,
  type PresentPlayer,
  TAVERN_CHANNEL,
  type TavernMessage,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<TavernApi>('/api/tavern')

/** Salle de la taverne en 3D, chargée à la demande et seulement dans le navigateur. */
const TavernWorld = dynamic(() => import('./scene/tavern-world').then((m) => m.TavernWorld), {
  ssr: false,
  loading: () => <SceneLoading text="Le tavernier ranime le feu..." />,
})

/** Durée pendant laquelle un joueur qui vient d'écrire porte sa bulle, en millisecondes. */
const SPEAKING_MS = 6_000

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Message affiché au joueur pour chaque erreur. */
function errorText(error: MessageError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'EMPTY_MESSAGE':
      return 'Le message est vide.'
    case 'MESSAGE_TOO_LONG':
      return `Le message dépasse ${error.max} caractères.`
    case 'TOO_MANY_MESSAGES':
      return `Trop de messages : réessayez dans ${Math.ceil(error.retryAfterMs / 1000)} s.`
    default:
      return 'Saisie invalide.'
  }
}

/** Ajoute des messages à la liste, sans doublon, dans l'ordre de leurs identifiants. */
function merge(list: TavernMessage[], fresh: TavernMessage[]) {
  const known = new Set(list.map((message) => message.id))
  const added = fresh.filter((message) => !known.has(message.id))
  if (added.length === 0) return list
  return [...list, ...added].sort((a, b) => a.id - b.id)
}

/** Heure d'un message : « 14:05 ». */
const timeOf = (postedAt: number) =>
  new Date(postedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Écran de la Taverne : la salle, la conversation et les joueurs présents. */
export function TavernScreen({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<TavernMessage[]>([])
  const [players, setPlayers] = useState<PresentPlayer[]>([])
  const [speaking, setSpeaking] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const list = useRef<HTMLUListElement>(null)

  /** Un joueur vient d'écrire : il porte une bulle quelques secondes. */
  const speak = useCallback((authorId: string) => {
    setSpeaking((current) => new Set(current).add(authorId))
    setTimeout(() => {
      setSpeaking((current) => {
        const next = new Set(current)
        next.delete(authorId)
        return next
      })
    }, SPEAKING_MS)
  }, [])

  // REQUÊTE : l'historique est lu une fois ; les messages suivants arrivent par le canal.
  useEffect(() => {
    client.messages.$get().then(async (res) => {
      if (!res.ok) return
      const { messages: history } = await res.json()
      setMessages((current) => merge(current, history))
    })
  }, [])

  // TEMPS RÉEL : le canal n'est pas discret, chaque événement contient le message.
  const status = useChannel(TAVERN_CHANNEL, (event) => {
    if (event.type !== MESSAGE_POSTED) return
    const message = event.data as unknown as TavernMessage
    setMessages((current) => merge(current, [message]))
    speak(message.authorId)
  })

  // Le fil défile vers le message le plus récent.
  useEffect(() => {
    if (messages.length > 0) list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages.length])

  // PRÉSENCE : un signal à l'ouverture puis à intervalle régulier ; la réponse contient
  // les joueurs présents. Le départ est signalé lorsque le joueur quitte la page.
  const heartbeat = useCallback(async () => {
    const res = await client.presence.$post()
    if (res.ok) setPlayers((await res.json()).players)
  }, [])

  useEffect(() => {
    heartbeat()
    const timer = setInterval(heartbeat, HEARTBEAT_MS)
    // sendBeacon aboutit même lorsque l'onglet est fermé ; le cookie de session est joint.
    const leave = () => navigator.sendBeacon('/api/tavern/presence/leave')
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [heartbeat])

  // COMMANDE : le message publié est affiché aussitôt, sans attendre le canal.
  async function send(e: FormEvent) {
    e.preventDefault()
    const res = await client.messages.$post({ json: { body: draft } })
    const body = (await res.json()) as
      | { message: TavernMessage }
      | { error: MessageError | { code: 'INVALID_INPUT' } }
    if ('error' in body) {
      setError(errorText(body.error))
      return
    }
    setError(null)
    setDraft('')
    setMessages((current) => merge(current, [body.message]))
    speak(body.message.authorId)
  }

  return (
    <section className="stage" aria-label="Taverne">
      <TavernWorld players={players} userId={userId} speaking={speaking} />
      <div className="hud">
        <div className="hud-header">
          <h1>
            <Entity kind="tavern" /> Taverne
          </h1>
          <p className="tagline">Une chope, un feu de cheminée, et les nouvelles du royaume.</p>
          <span className="status" data-status={status}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        <div className="hud-left">
          <section className="hud-panel" aria-label="Joueurs présents">
            <h2>Présents ({players.length})</h2>
            <ul className="presence">
              {players.map((player) => (
                <li key={player.id}>
                  {player.name}
                  {player.id === userId && <span className="muted"> (vous)</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="hud-side">
          <section className="hud-panel" aria-label="Messages">
            <h2>Conversation</h2>
            {messages.length === 0 && <p className="muted">Aucun message pour le moment.</p>}
            <ul className="messages" aria-live="polite" ref={list}>
              {messages.map((message) => (
                <li key={message.id} data-mine={message.authorId === userId || undefined}>
                  <span className="muted">{timeOf(message.postedAt)}</span>{' '}
                  <strong>{message.authorName}</strong> : {message.body}
                </li>
              ))}
            </ul>
            <form className="row" onSubmit={send} style={{ maxWidth: 'none' }}>
              <input
                aria-label="Votre message"
                placeholder="Lever sa chope et prendre la parole..."
                value={draft}
                maxLength={MESSAGE_MAX_LENGTH * 2}
                onChange={(e) => setDraft(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit">Envoyer</button>
            </form>
            {error && (
              <p className="error" role="status">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
