import type { Metadata } from 'next'
import { Cinzel, Lora } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// Polices de la charte graphique, servies par l'application elle-même : Cinzel, gravée comme
// une inscription romaine, pour les titres ; Lora, très lisible, pour le texte courant.
const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-cinzel' })
const lora = Lora({ subsets: ['latin'], variable: '--font-lora' })

// Métadonnées par défaut de toutes les pages : titre de l'onglet et description.
export const metadata: Metadata = {
  title: 'Royaumes',
  description: 'Bâtissez votre village, explorez le donjon, croisez le fer en duel.',
}

/**
 * Mise en page racine, partagée par toutes les pages de l'application.
 * Le type des propriétés est déclaré explicitement plutôt qu'au moyen du type
 * global LayoutProps généré par Next.js : ce dernier n'existe qu'après une
 * première construction, ce qui ferait échouer la vérification des types
 * sur un dépôt fraîchement cloné.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${cinzel.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  )
}
