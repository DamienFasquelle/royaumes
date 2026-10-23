'use client'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

/** Ton d'une notification : sa couleur suit la charte (succès, avertissement, danger, prestige). */
export type ToastKind = 'info' | 'success' | 'warning' | 'danger' | 'gold'

interface Toast {
  id: number
  kind: ToastKind
  text: ReactNode
}

/** Durée d'affichage d'une notification, alignée sur l'animation de sortie de la feuille de style. */
const TOAST_MS = 5_000

const ToastContext = createContext<(text: ReactNode, kind?: ToastKind) => void>(() => {})

/**
 * Notifications discrètes du royaume, empilées en bas de l'écran. Elles annoncent des
 * événements réels (ressources reçues, bâtiment amélioré, duel terminé), jamais des faits
 * inventés pour l'animation.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = useCallback((text: ReactNode, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), TOAST_MS)
  }, [])

  const value = useMemo(() => notify, [notify])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-kind={toast.kind} role="status">
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Fonction d'envoi d'une notification. */
export const useToast = () => useContext(ToastContext)
