'use client'
import { useFrame, useThree } from '@react-three/fiber'
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Étiquettes de la scène : noms, jauges, chiffres de dégâts. Elles sont rendues en DOM
 * ordinaire, au-dessus du canevas, et la scène ne fait que les placer à chaque image en
 * projetant la position de leur ancre 3D à l'écran : aucun rendu React n'a lieu image par
 * image, et le texte reste net, lisible et accessible.
 */

export interface LabelStore {
  /** Ancres 3D, par identifiant d'étiquette. */
  anchors: Map<string, THREE.Object3D>
  /** Éléments DOM des étiquettes, par identifiant. */
  elements: Map<string, HTMLElement>
}

export const createLabelStore = (): LabelStore => ({ anchors: new Map(), elements: new Map() })

export const LabelContext = createContext<LabelStore>(createLabelStore())

/** Étiquette à afficher : son identifiant la relie à une ancre placée dans la scène. */
export interface SceneLabel {
  id: string
  content: ReactNode
  /** Ancre à suivre, si elle diffère de l'identifiant : un chiffre de dégâts suit sa cible. */
  anchor?: string
}

/** Point d'attache d'une étiquette dans la scène 3D. */
export function Anchor({
  id,
  position = [0, 0, 0],
}: {
  id: string
  position?: [number, number, number]
}) {
  const store = useContext(LabelContext)
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    const object = ref.current
    if (!object) return
    store.anchors.set(id, object)
    return () => {
      if (store.anchors.get(id) === object) store.anchors.delete(id)
    }
  }, [id, store])
  return <group ref={ref} position={position} />
}

/** Placement des étiquettes, image par image, à partir de la caméra de la scène. */
export function LabelTracker() {
  const store = useContext(LabelContext)
  const { camera, size } = useThree()
  const point = useRef(new THREE.Vector3())
  useFrame(() => {
    for (const [id, element] of store.elements) {
      const anchor = store.anchors.get(element.dataset.anchor ?? id)
      if (!anchor) {
        element.style.visibility = 'hidden'
        continue
      }
      anchor.getWorldPosition(point.current)
      point.current.project(camera)
      // Derrière la caméra, ou hors du champ : l'étiquette est masquée.
      const visible =
        point.current.z < 1 && Math.abs(point.current.x) < 1.2 && Math.abs(point.current.y) < 1.2
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (!visible) continue
      const x = (point.current.x * 0.5 + 0.5) * size.width
      const y = (-point.current.y * 0.5 + 0.5) * size.height
      element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
      // Les étiquettes les plus proches passent devant les plus lointaines.
      element.style.zIndex = String(Math.round((1 - point.current.z) * 1000))
    }
  })
  return null
}

/** Couche DOM des étiquettes, posée sur le canevas. */
export function LabelLayer({ labels }: { labels: SceneLabel[] }) {
  const store = useContext(LabelContext)
  return (
    <div className="scene-labels" aria-hidden="true">
      {labels.map((label) => (
        <div
          key={label.id}
          className="scene-label"
          data-anchor={label.anchor ?? label.id}
          style={{ visibility: 'hidden' }}
          ref={(element) => {
            if (element) store.elements.set(label.id, element)
            else store.elements.delete(label.id)
          }}
        >
          {label.content}
        </div>
      ))}
    </div>
  )
}
