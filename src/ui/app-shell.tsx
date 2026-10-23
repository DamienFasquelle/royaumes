'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { authClient } from '@/platform/auth/client'
import { look } from './theme'

/**
 * Lieux du royaume : chaque module ajouté au jeu y reçoit une entrée. On ne change pas de
 * page, on se rend dans un lieu.
 */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
  { href: '/duel', kind: 'duel', label: 'Arène' },
  { href: '/market', kind: 'market', label: 'Marché' },
  { href: '/tavern', kind: 'tavern', label: 'Taverne' },
  { href: '/ranking', kind: 'ranking', label: 'Hall des légendes' },
]

/**
 * Coque de l'espace de jeu : blason du royaume, lieux, ressources du joueur et menu du compte.
 * Les ressources sont fournies par le module Village (`resources`) : la coque n'en connaît
 * ni l'origine ni le calcul.
 */
export function AppShell({
  userName,
  resources,
  children,
}: {
  userName: string
  resources?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()

  async function signOut() {
    // La session est supprimée côté serveur, puis la page est entièrement rechargée,
    // afin qu'aucun état de la session précédente ne subsiste dans le navigateur.
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="game">
      <header className="topbar">
        <Link href="/village" className="crest" aria-label="Royaumes, retour au village">
          <span className="crest-sigil" aria-hidden="true">
            ⚜
          </span>
          <span className="crest-name">Royaumes</span>
        </Link>
        <nav className="places" aria-label="Lieux du royaume">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            >
              <span className="place-icon" aria-hidden="true">
                {look(item.kind).glyph}
              </span>
              <span className="place-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        {resources}
        <details className="game-menu">
          <summary>{userName}</summary>
          <div>
            <Link href="/account">Mes données</Link>
            <button className="link" type="button" onClick={signOut}>
              Déconnexion
            </button>
          </div>
        </details>
      </header>
      <main>{children}</main>
    </div>
  )
}
