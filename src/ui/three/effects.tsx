'use client'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { PALETTE } from './palette'

/**
 * Effets visuels du combat. Ils ne font que représenter un résultat déjà décidé par le
 * serveur : un chiffre de dégâts affiche le montant enregistré dans l'événement de la manche.
 */

/** Chiffre flottant au-dessus d'un personnage : dégâts en rouge, soins en vert. */
export function FloatingNumber({
  amount,
  kind,
}: {
  amount: number
  kind: 'damage' | 'heal' | 'info'
}) {
  const text = kind === 'damage' ? `-${amount}` : kind === 'heal' ? `+${amount}` : `${amount}`
  return (
    <span className="float-number" data-kind={kind}>
      {text}
    </span>
  )
}

/** Étiquette d'un personnage ou d'un lieu : nom, jauge de points de vie, mention. */
export function NameTag({
  name,
  hp,
  maxHp,
  accent,
  note,
}: {
  name: string
  hp?: number
  maxHp?: number
  accent?: 'ally' | 'enemy' | 'self'
  note?: string
}) {
  const ratio = hp !== undefined && maxHp ? Math.max(0, Math.min(1, hp / maxHp)) : null
  return (
    <div className="name-tag" data-accent={accent}>
      <span className="name-tag-name">{name}</span>
      {ratio !== null && (
        <span className="name-tag-hp" data-low={ratio <= 0.25 && ratio > 0}>
          <span style={{ width: `${ratio * 100}%` }} />
        </span>
      )}
      {ratio !== null && (
        <span className="name-tag-value">
          {hp}/{maxHp}
        </span>
      )}
      {note && <span className="name-tag-note">{note}</span>}
    </div>
  )
}

/** Aura de soin : un anneau vert qui s'élève autour du personnage, puis s'estompe. */
export function HealAura({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  const ring = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const start = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime
    const p = Math.min(1, (clock.elapsedTime - start.current) / 1.2)
    if (ring.current) {
      ring.current.position.y = 0.1 + p * 2
      ring.current.scale.setScalar(1 + p * 0.3)
    }
    if (material.current) material.current.opacity = 0.8 * (1 - p)
  })
  return (
    <mesh ref={ring} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.5, 0.7, 32]} />
      <meshBasicMaterial ref={material} color={PALETTE.emerald} transparent depthWrite={false} />
    </mesh>
  )
}

/** Éclat d'impact : une étoile de lumière brève, à l'endroit du coup. */
export function ImpactFlash({
  position = [0, 1.2, 0],
  color = PALETTE.legendary,
}: {
  position?: [number, number, number]
  color?: string
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const start = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime
    const p = Math.min(1, (clock.elapsedTime - start.current) / 0.45)
    if (mesh.current) mesh.current.scale.setScalar(0.2 + p * 1.2)
    if (material.current) material.current.opacity = 1 - p
    if (light.current) light.current.intensity = 8 * (1 - p)
  })
  return (
    <group position={position}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[0.35, 0]} />
        <meshBasicMaterial ref={material} color={color} transparent depthWrite={false} />
      </mesh>
      <pointLight ref={light} color={color} distance={4} intensity={8} />
    </group>
  )
}
