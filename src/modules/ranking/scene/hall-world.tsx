'use client'
import { CameraControls } from '@react-three/drei'
import { useMemo } from 'react'
import { NameTag } from '@/ui/three/effects'
import { Figure } from '@/ui/three/figure'
import { GameCanvas } from '@/ui/three/game-canvas'
import { Anchor, type SceneLabel } from '@/ui/three/labels'
import { PALETTE } from '@/ui/three/palette'
import { Banner, Particles, Torch } from '@/ui/three/props'
import type { RankingEntry } from '../contracts'

/**
 * Hall des légendes : une galerie de colonnes, un tapis royal, et le podium où se dressent
 * les statues des trois premiers du classement réel. Une marche reste vide tant que le
 * classement ne compte pas assez de joueurs.
 */

/** Marches du podium : position, hauteur et métal de chaque rang. */
const STEPS: Record<1 | 2 | 3, { x: number; height: number; metal: string }> = {
  1: { x: 0, height: 1.4, metal: PALETTE.gold },
  2: { x: -2.4, height: 0.95, metal: '#c0c7d0' },
  3: { x: 2.4, height: 0.6, metal: '#c0814a' },
}

export function HallWorld({ entries, userId }: { entries: RankingEntry[]; userId: string }) {
  const podium = entries.filter((entry) => entry.rank <= 3)
  const labels: SceneLabel[] = useMemo(
    () =>
      podium.map((entry) => ({
        id: `champion-${entry.rank}`,
        content: (
          <NameTag
            name={`${entry.rank}. ${entry.label}`}
            accent={entry.playerId === userId ? 'self' : undefined}
            note={`${entry.gamesWon} victoire(s) · ${entry.gold} or`}
          />
        ),
      })),
    [podium, userId],
  )

  return (
    <GameCanvas
      label="Le hall des légendes en 3D : le podium des trois premiers du classement"
      camera={{ position: [0, 4, 11], fov: 45 }}
      background="#0b1020"
      labels={labels}
    >
      <CameraControls
        minDistance={7}
        maxDistance={16}
        minPolarAngle={0.8}
        maxPolarAngle={1.45}
        minAzimuthAngle={-0.6}
        maxAzimuthAngle={0.6}
      />
      <fog attach="fog" args={['#0b1020', 14, 32]} />
      <ambientLight intensity={0.4} color="#8796b8" />
      <hemisphereLight args={['#8a9ac0', '#20160c', 0.9]} />
      <spotLight
        position={[0, 10, 3]}
        angle={0.5}
        penumbra={0.5}
        intensity={120}
        distance={25}
        color="#ffe2a8"
        castShadow
      />

      {/* Dallage et tapis royal jusqu'au podium. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 30]} />
        <meshStandardMaterial color={PALETTE.dungeonStone} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 5]} receiveShadow>
        <planeGeometry args={[2.2, 14]} />
        <meshStandardMaterial color="#7a1e1a" roughness={0.9} />
      </mesh>
      {[-1.15, 1.15].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.015, 5]}>
          <planeGeometry args={[0.1, 14]} />
          <meshStandardMaterial color={PALETTE.gold} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 4, -4]} receiveShadow>
        <boxGeometry args={[18, 8, 0.5]} />
        <meshStandardMaterial color="#1f2738" roughness={1} />
      </mesh>

      {/* Colonnade. */}
      {[-6, -2, 2, 6, 10].flatMap((z) =>
        [-1, 1].map((side) => (
          <group key={`${z}:${side}`} position={[side * 5.5, 0, z - 4]}>
            <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.45, 0.5, 7, 12]} />
              <meshStandardMaterial color={PALETTE.wallStone} roughness={0.8} />
            </mesh>
            <mesh position={[0, 7.1, 0]}>
              <boxGeometry args={[1.2, 0.3, 1.2]} />
              <meshStandardMaterial color={PALETTE.darkStone} />
            </mesh>
            {z < 8 && <Torch position={[side * -0.55, 2.2, 0]} height={0.8} light={z === -2} />}
          </group>
        )),
      )}
      <Banner position={[-3.6, 3.2, -3.6]} color={PALETTE.sapphire} height={4} />
      <Banner position={[3.6, 3.2, -3.6]} color={PALETTE.ruby} height={4} />
      <Banner position={[0, 4.6, -3.6]} color={PALETTE.gold} height={3.4} />

      {/* Podium et statues des champions. */}
      {([1, 2, 3] as const).map((rank) => {
        const step = STEPS[rank]
        const entry = podium.find((e) => e.rank === rank)
        return (
          <group key={rank} position={[step.x, 0, -1]}>
            <mesh position={[0, step.height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.2, step.height, 2]} />
              <meshStandardMaterial color={PALETTE.wallStone} roughness={0.7} />
            </mesh>
            <mesh position={[0, step.height / 2, 1.01]}>
              <planeGeometry args={[0.7, 0.45]} />
              <meshStandardMaterial color={step.metal} metalness={0.8} roughness={0.3} />
            </mesh>
            {entry && (
              <Figure
                kind="knight"
                position={[0, step.height, 0]}
                tint={step.metal}
                victory={rank === 1}
                highlight={entry.playerId === userId}
              >
                <Anchor id={`champion-${rank}`} />
              </Figure>
            )}
          </group>
        )
      })}
      <Particles
        position={[0, 1.5, -1]}
        count={60}
        area={[6, 5, 3]}
        color={PALETTE.legendary}
        size={0.06}
        speed={0.3}
      />
    </GameCanvas>
  )
}
