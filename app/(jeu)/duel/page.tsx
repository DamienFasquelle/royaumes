import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { DuelLobby } from '@/modules/duel/ui'

/** Page du Duel : duels actifs du joueur, défi lancé à un joueur et entraînement. */
export default async function DuelPage() {
  const user = await currentUser(await headers())
  return <DuelLobby userId={user?.id ?? ''} />
}
