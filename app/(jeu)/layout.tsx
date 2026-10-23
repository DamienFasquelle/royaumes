import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { currentUser } from '@/bootstrap/server'
import { RealmProvider, RealmResources } from '@/modules/realm/ui'
import { AppShell } from '@/ui/app-shell'
import { ToastProvider } from '@/ui/toast'

// La mise en page dépend de la session : elle est rendue à chaque requête, jamais à l'avance.
export const dynamic = 'force-dynamic'

/**
 * Mise en page de l'espace de jeu, partagée par toutes les pages du groupe (jeu).
 * Elle vérifie sur le serveur, avant tout rendu, qu'un joueur est connecté,
 * et redirige vers la page de connexion dans le cas contraire.
 * Les notifications et l'état du village sont partagés par tous les lieux du royaume :
 * la bannière affiche les ressources du joueur où qu'il se trouve.
 */
export default async function GameLayout({ children }: { children: ReactNode }) {
  const user = await currentUser(await headers())
  if (!user) redirect('/login')
  return (
    <ToastProvider>
      <RealmProvider userId={user.id}>
        <AppShell userName={user.name} resources={<RealmResources />}>
          {children}
        </AppShell>
      </RealmProvider>
    </ToastProvider>
  )
}
