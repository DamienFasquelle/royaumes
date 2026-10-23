'use client'
import { type ReactNode, useEffect, useRef } from 'react'

/**
 * Modale de confirmation, avant une action qui engage le joueur : une mise en jeu, une
 * dépense de ressources, une suppression. La touche Échap et le fond l'annulent ; le bouton
 * de confirmation reçoit le focus à l'ouverture.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirm = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirm.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: le clic sur le fond ferme la modale ; Échap aussi.
    // biome-ignore lint/a11y/useKeyWithClickEvents: la fermeture au clavier passe par la touche Échap.
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="hud-panel modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        data-important="true"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <div>{children}</div>
        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Annuler
          </button>
          <button
            ref={confirm}
            type="button"
            className={danger ? 'danger' : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
