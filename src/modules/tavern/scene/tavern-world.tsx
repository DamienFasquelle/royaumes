'use client'
import { CameraControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { NameTag } from '@/ui/three/effects'
import { Figure } from '@/ui/three/figure'
import { GameCanvas } from '@/ui/three/game-canvas'
import { Anchor, type SceneLabel } from '@/ui/three/labels'
import { useMotionScale } from '@/ui/three/motion'
import { PALETTE } from '@/ui/three/palette'
import { Barrel, Particles } from '@/ui/three/props'
import type { PresentPlayer } from '../contracts'

/**
 * Salle de la taverne. Les clients attablés sont les joueurs réellement présents, d'après
 * la présence tenue par le module ; aucun client n'est inventé. Un joueur qui vient d'écrire
 * porte une bulle au-dessus de la tête.
 */

/** Places autour des tables : on s'y assoit dans l'ordre d'arrivée. */
const SEATS: [number, number, number, number][] = [
  [-3.2, 0, 0.8, 0],
  [-3.2, 0, -0.8, Math.PI],
  [-1.6, 0, 0, -Math.PI / 2],
  [2.2, 0, 1.4, 0],
  [2.2, 0, -0.2, Math.PI],
  [3.8, 0, 0.6, -Math.PI / 2],
  [-0.4, 0, 3.6, Math.PI],
  [0.8, 0, 3.6, Math.PI],
  [-4.6, 0, 3.4, Math.PI / 2],
  [5, 0, 3.4, -Math.PI / 2],
]

export function TavernWorld({
  players,
  userId,
  speaking,
}: {
  players: PresentPlayer[]
  userId: string
  /** Joueurs qui viennent d'écrire un message. */
  speaking: Set<string>
}) {
  const seated = players.slice(0, SEATS.length)
  const labels: SceneLabel[] = useMemo(
    () =>
      seated.map((player) => ({
        id: `patron-${player.id}`,
        content: (
          <NameTag
            name={player.name}
            accent={player.id === userId ? 'self' : undefined}
            note={speaking.has(player.id) ? '💬 parle' : undefined}
          />
        ),
      })),
    [seated, userId, speaking],
  )

  return (
    <GameCanvas
      label="La salle de la taverne en 3D, avec les joueurs présents attablés"
      camera={{ position: [0, 6, 11], fov: 45 }}
      background="#120c08"
      labels={labels}
    >
      <CameraControls
        minDistance={6}
        maxDistance={14}
        minPolarAngle={0.6}
        maxPolarAngle={1.35}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
      />
      <fog attach="fog" args={['#120c08', 12, 26]} />
      <ambientLight intensity={0.35} color="#e0b98a" />
      <hemisphereLight args={['#c9a77a', '#2a1a10', 0.7]} />
      <Room />
      {seated.map((player, i) => {
        const [x, y, z, facing] = SEATS[i]
        return (
          <Figure
            key={player.id}
            kind="patron"
            position={[x, y, z]}
            facing={facing}
            tint={player.id === userId ? PALETTE.gold : undefined}
            highlight={speaking.has(player.id)}
          >
            <Anchor id={`patron-${player.id}`} />
          </Figure>
        )
      })}
    </GameCanvas>
  )
}

/** Salle : plancher, murs de bois et de pierre, cheminée, comptoir, tables et tonneaux. */
function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 12]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.95} />
      </mesh>
      {[-7.2, -5.4, -3.6, -1.8, 0, 1.8, 3.6, 5.4, 7.2].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, 0]}>
          <planeGeometry args={[0.04, 12]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
      ))}
      <mesh position={[0, 3, -5]} receiveShadow>
        <boxGeometry args={[16, 6, 0.4]} />
        <meshStandardMaterial color="#5a3d24" roughness={0.95} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 8, 3, 0]} receiveShadow>
          <boxGeometry args={[0.4, 6, 12]} />
          <meshStandardMaterial color="#4e3420" roughness={0.95} />
        </mesh>
      ))}
      {/* Poutres du plafond. */}
      {[-4, 0, 4].map((x) => (
        <mesh key={x} position={[x, 5.2, 0]} castShadow>
          <boxGeometry args={[0.35, 0.35, 12]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
      ))}
      <Fireplace />
      <Counter />
      <Table position={[-3.2, 0, 0]} />
      <Table position={[2.2, 0, 0.6]} />
      <Table position={[0.2, 0, 4.4]} long />
      <Barrel position={[-6.8, 0, -3.8]} />
      <Barrel position={[-6.1, 0, -4.1]} scale={0.9} />
      <Barrel position={[-6.5, 0.7, -3.95]} scale={0.85} />
      {[
        [-3.2, 0.95, 0],
        [2.2, 0.95, 0.6],
        [0.2, 0.95, 4.4],
      ].map(([x, y, z]) => (
        <Candle key={`${x}:${z}`} position={[x, y, z]} />
      ))}
      <Particles
        position={[5.2, 0.8, -4.2]}
        count={30}
        area={[1.4, 2.5, 0.6]}
        color={PALETTE.ember}
        size={0.06}
        speed={0.7}
      />
    </group>
  )
}

/** Cheminée de pierre, et son feu dont la lueur danse sur la salle. */
function Fireplace() {
  const light = useRef<THREE.PointLight>(null)
  const flames = useRef<THREE.Mesh>(null)
  const motion = useMotionScale()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const flicker = 1 + motion * (Math.sin(t * 7) * 0.12 + Math.sin(t * 13) * 0.08)
    if (light.current) light.current.intensity = 14 * flicker
    if (flames.current) flames.current.scale.y = flicker
  })
  return (
    <group position={[5.2, 0, -4.4]}>
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[3, 2.8, 1.2]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={1} />
      </mesh>
      <mesh position={[0, 0.85, 0.45]}>
        <boxGeometry args={[1.9, 1.5, 0.4]} />
        <meshBasicMaterial color="#1a0d06" />
      </mesh>
      <mesh ref={flames} position={[0, 0.6, 0.6]}>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={PALETTE.amber} />
      </mesh>
      <mesh position={[0, 4.3, -0.1]}>
        <boxGeometry args={[1.4, 3, 0.9]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={1} />
      </mesh>
      <pointLight
        ref={light}
        position={[0, 1.2, 1.4]}
        color={PALETTE.ember}
        intensity={14}
        distance={16}
        decay={1.4}
        castShadow
      />
    </group>
  )
}

/** Comptoir du tavernier, chopes alignées. */
function Counter() {
  return (
    <group position={[-2.6, 0, -3.8]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 1.1, 0.9]} />
        <meshStandardMaterial color={PALETTE.darkWood} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.13, 0]}>
        <boxGeometry args={[5.2, 0.08, 1]} />
        <meshStandardMaterial color={PALETTE.wood} />
      </mesh>
      {[-1.8, -1, -0.2, 0.6, 1.4].map((x) => (
        <mesh key={x} position={[x, 1.28, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.09, 0.22, 8]} />
          <meshStandardMaterial color={PALETTE.copper} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/** Table et ses bancs. */
function Table({ position, long = false }: { position: [number, number, number]; long?: boolean }) {
  const w = long ? 3.6 : 2
  return (
    <group position={position}>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.12, 1.1]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (w / 2 - 0.2), 0.42, 0]} castShadow>
          <boxGeometry args={[0.14, 0.84, 0.9]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`bench-${side}`} position={[0, 0.45, side * 0.95]} castShadow>
          <boxGeometry args={[w, 0.1, 0.35]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
      ))}
    </group>
  )
}

/** Chandelle posée sur une table, et sa petite flamme. */
function Candle({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.24, 8]} />
        <meshStandardMaterial color={PALETTE.parchment} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <coneGeometry args={[0.04, 0.12, 6]} />
        <meshBasicMaterial color={PALETTE.flame} />
      </mesh>
      <pointLight position={[0, 0.5, 0]} color={PALETTE.flame} intensity={2.5} distance={4} />
    </group>
  )
}
