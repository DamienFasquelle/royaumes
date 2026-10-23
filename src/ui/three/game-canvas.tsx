'use client'
import { Canvas } from '@react-three/fiber'
import { type ReactNode, useEffect, useState } from 'react'
import { createLabelStore, LabelContext, LabelLayer, LabelTracker, type SceneLabel } from './labels'
import { ReducedMotionContext, usePrefersReducedMotion } from './motion'

/** Indique si le navigateur sait créer un contexte WebGL. */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export interface GameCanvasProps {
  /** Contenu de la scène : lumières, décor, personnages, caméra. */
  children: ReactNode
  /** Description de la scène, lue par les lecteurs d'écran. */
  label: string
  /** Position initiale de la caméra et champ de vision. */
  camera?: { position: [number, number, number]; fov?: number }
  /** Couleur de fond de la scène, avant le brouillard. */
  background?: string
  /** Étiquettes DOM attachées aux ancres de la scène (noms, jauges, chiffres de combat). */
  labels?: SceneLabel[]
}

/**
 * Canevas 3D commun à tous les lieux du jeu. Il n'est rendu que côté client : les scènes
 * sont importées par `next/dynamic` sans rendu serveur.
 * - Sans WebGL, un décor de repli est affiché : les panneaux de jeu, rendus en dehors du
 *   canevas, restent entièrement utilisables.
 * - La boucle de rendu s'arrête lorsque l'onglet est masqué.
 * - La résolution est plafonnée, pour ménager les appareils modestes.
 * DETTE TECHNIQUE (DT-015) : les scènes ne sont couvertes par aucun test automatisé.
 */
export function GameCanvas({
  children,
  label,
  camera,
  background = '#0a111b',
  labels = [],
}: GameCanvasProps) {
  const [store] = useState(createLabelStore)
  const [support, setSupport] = useState<boolean | null>(null)
  const [visible, setVisible] = useState(true)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    setSupport(supportsWebGL())
    const onVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (support === null) return <div className="scene scene-fallback" aria-hidden="true" />
  if (!support) {
    return (
      <div className="scene scene-fallback" role="img" aria-label={label}>
        <p>Votre navigateur ne permet pas d'afficher le monde en 3D. Le jeu reste jouable.</p>
      </div>
    )
  }

  return (
    <div className="scene" role="img" aria-label={label}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: camera?.position ?? [0, 8, 14], fov: camera?.fov ?? 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[background]} />
        <LabelContext.Provider value={store}>
          <ReducedMotionContext.Provider value={reduced}>{children}</ReducedMotionContext.Provider>
          <LabelTracker />
        </LabelContext.Provider>
      </Canvas>
      <LabelContext.Provider value={store}>
        <LabelLayer labels={labels} />
      </LabelContext.Provider>
    </div>
  )
}
