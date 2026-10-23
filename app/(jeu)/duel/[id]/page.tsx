import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { DuelArena } from '@/modules/duel/ui'

/** Page d'un duel. Son adresse contient l'identifiant du duel, réservé à ses deux duellistes. */
export default async function DuelArenaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser(await headers())
  return <DuelArena duelId={id} userId={user?.id ?? ''} />
}
