'use client'
import { CameraControls } from '@react-three/drei'
import { useMemo, useState } from 'react'
import { NameTag } from '@/ui/three/effects'
import { Figure } from '@/ui/three/figure'
import { GameCanvas } from '@/ui/three/game-canvas'
import { Anchor, type SceneLabel } from '@/ui/three/labels'
import { PALETTE } from '@/ui/three/palette'
import { Banner, Barrel, Crate, House, Particles, Torch } from '@/ui/three/props'
import type { OfferSummary } from '../contracts'

/**
 * Place du marché. Chaque étal représente une offre réelle de la liste du Marché, aux
 * couleurs de la ressource cédée ; les emplacements sans offre restent des étals vides.
 * Choisir un étal sélectionne l'offre correspondante dans le panneau du Marché.
 */

/** Couleur de la toile d'un étal, selon la ressource proposée. */
const AWNING: Record<string, string> = {
  wood: PALETTE.emerald,
  stone: PALETTE.sapphire,
  gold: PALETTE.gold,
}

/** Nombre d'emplacements d'étals sur la place. */
const SLOTS = 7

/** Position de chaque emplacement : deux arcs de cercle face au centre de la place. */
function slotPosition(i: number): { position: [number, number, number]; facing: number } {
  const a = Math.PI * (0.05 + (i / (SLOTS - 1)) * 0.9) + Math.PI
  const r = 9.5
  return { position: [Math.cos(a) * r, 0, Math.sin(a) * r + 2], facing: -a - Math.PI / 2 }
}

export function MarketWorld({
  offers,
  selected,
  onSelect,
}: {
  offers: OfferSummary[]
  selected: string | null
  onSelect: (offerId: string) => void
}) {
  const shown = offers.slice(0, SLOTS)
  const labels: SceneLabel[] = useMemo(
    () =>
      shown.map((offer) => ({
        id: `stall-${offer.offerId}`,
        content: (
          <NameTag
            name={offer.mine ? 'Votre étal' : `Étal de ${offer.sellerName}`}
            accent={offer.offerId === selected ? 'self' : undefined}
            note={`${Object.entries(offer.give)
              .map(([r, n]) => `${n} ${r === 'wood' ? 'bois' : r === 'stone' ? 'pierre' : 'or'}`)
              .join(', ')}`}
          />
        ),
      })),
    [shown, selected],
  )

  return (
    <GameCanvas
      label="La place du marché en 3D : un étal pour chaque offre en cours"
      camera={{ position: [0, 9, 14], fov: 45 }}
      background="#0d1626"
      labels={labels}
    >
      <CameraControls
        minDistance={8}
        maxDistance={24}
        minPolarAngle={0.5}
        maxPolarAngle={1.35}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
      />
      <fog attach="fog" args={['#0d1626', 20, 45]} />
      <ambientLight intensity={0.5} color="#8da2c6" />
      <hemisphereLight args={['#8aa4c8', '#3a2a1a', 1.1]} />
      <directionalLight
        position={[-10, 16, 10]}
        intensity={1.8}
        color="#d6def0"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      {/* Place pavée, entourée de maisons. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[40, 40]} />
        <meshStandardMaterial color={PALETTE.grassDark} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[11, 48]} />
        <meshStandardMaterial color={PALETTE.cobble} roughness={0.95} />
      </mesh>
      {[-1, 1].flatMap((side) =>
        [0, 1, 2].map((i) => (
          <House
            key={`${side}:${i}`}
            position={[side * (12 + i * 0.4), 0, -6 + i * 5]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
            stories={i === 1 ? 2 : 1}
            roof={i % 2 ? PALETTE.roofSlate : PALETTE.roof}
          />
        )),
      )}
      <House position={[-4, 0, -12]} stories={2} />
      <House position={[4, 0, -12]} roof={PALETTE.roofSlate} />

      {/* Balance du peseur public, au centre de la place. */}
      <Scales />

      {Array.from({ length: SLOTS }, (_, i) => {
        const offer = shown[i]
        const { position, facing } = slotPosition(i)
        return (
          <Stall
            key={offer?.offerId ?? `slot-${position.join(':')}`}
            position={position}
            facing={facing}
            offer={offer}
            selected={!!offer && offer.offerId === selected}
            onSelect={offer ? () => onSelect(offer.offerId) : undefined}
          />
        )
      })}

      <Banner position={[-9, 0, -8]} color={PALETTE.sapphire} height={4} />
      <Banner position={[9, 0, -8]} color={PALETTE.ruby} height={4} />
      <Torch position={[-6, 0, 6]} />
      <Torch position={[6, 0, 6]} />
      <Barrel position={[8.5, 0, 3]} />
      <Barrel position={[9.1, 0, 3.6]} scale={0.9} />
      <Crate position={[-8.6, 0.3, 3.2]} rotation={[0, 0.5, 0]} />
      <Particles count={60} area={[24, 6, 20]} color={PALETTE.legendary} size={0.04} speed={0.1} />
    </GameCanvas>
  )
}

/** Balance publique : on y pèse les marchandises échangées. */
function Scales() {
  return (
    <group position={[0, 0, 1]}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 0.8, 8]} />
        <meshStandardMaterial color={PALETTE.wallStone} />
      </mesh>
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
        <meshStandardMaterial color={PALETTE.copper} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[2.2, 0.06, 0.06]} />
        <meshStandardMaterial color={PALETTE.copper} metalness={0.7} roughness={0.35} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.05, 1.9, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.25, 0.08, 12]} />
          <meshStandardMaterial color={PALETTE.gold} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/** Étal : comptoir, toile tendue aux couleurs de la ressource, marchandises et marchand. */
function Stall({
  position,
  facing,
  offer,
  selected,
  onSelect,
}: {
  position: [number, number, number]
  facing: number
  offer?: OfferSummary
  selected: boolean
  onSelect?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const resource = offer ? Object.keys(offer.give)[0] : undefined
  const awning = resource ? AWNING[resource] : PALETTE.stone
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: groupe Three.js, et non élément HTML ; chaque offre reste accessible dans la liste du panneau.
    <group
      position={position}
      rotation={[0, facing, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
      }}
      onPointerOver={() => {
        if (!onSelect) return
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = ''
      }}
    >
      {offer && <Anchor id={`stall-${offer.offerId}`} position={[0, 3.3, 0]} />}
      {(selected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[1.7, 1.9, 40]} />
          <meshBasicMaterial color={selected ? PALETTE.legendary : PALETTE.gold} />
        </mesh>
      )}
      <mesh position={[0, 0.5, 0.4]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 1, 0.9]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.05, 1.3, -0.1]} castShadow>
          <boxGeometry args={[0.1, 2.6, 0.1]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
      ))}
      <mesh position={[0, 2.55, 0.3]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[2.5, 0.06, 1.6]} />
        <meshStandardMaterial color={awning} roughness={0.85} />
      </mesh>
      {offer &&
        resource === 'wood' &&
        [0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[-0.5 + i * 0.5, 1.12, 0.4]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.12, 0.12, 0.8, 8]} />
            <meshStandardMaterial color={PALETTE.wood} />
          </mesh>
        ))}
      {offer &&
        resource === 'stone' &&
        [0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.5 + i * 0.5, 1.15, 0.4]} castShadow>
            <boxGeometry args={[0.32, 0.28, 0.32]} />
            <meshStandardMaterial color={PALETTE.wallStone} />
          </mesh>
        ))}
      {offer &&
        resource === 'gold' &&
        [0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.5 + i * 0.5, 1.1, 0.4]} castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.18, 12]} />
            <meshStandardMaterial color={PALETTE.gold} metalness={0.85} roughness={0.25} />
          </mesh>
        ))}
      {offer && (
        <Figure
          kind="villager"
          position={[0, 0, -0.6]}
          tint={offer.mine ? PALETTE.gold : undefined}
        />
      )}
    </group>
  )
}
