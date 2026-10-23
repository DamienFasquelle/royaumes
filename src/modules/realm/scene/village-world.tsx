'use client'
import { CameraControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { ImpactFlash, NameTag } from '@/ui/three/effects'
import { Figure } from '@/ui/three/figure'
import { GameCanvas } from '@/ui/three/game-canvas'
import { Anchor } from '@/ui/three/labels'
import { useMotionScale } from '@/ui/three/motion'
import { PALETTE } from '@/ui/three/palette'
import {
  Banner,
  Barrel,
  Crate,
  House,
  OakTree,
  Particles,
  PineTree,
  Rock,
  Smoke,
  Torch,
  Tower,
  Wall,
} from '@/ui/three/props'
import { BUILDINGS, type Building, MAX_LEVEL, type Resource } from '../contracts'

/**
 * Scène 3D du Village. Elle ne reçoit que des données réelles : le niveau de chaque bâtiment,
 * et la production de chaque ressource. Les bâtiments grandissent, s'équipent et se chargent
 * de marchandises à mesure de leur niveau ; le décor (maisons, villageois) en découle aussi,
 * sans jamais prétendre représenter un autre joueur ou une donnée qui n'existe pas.
 */

export interface VillageWorldProps {
  /** Niveaux des bâtiments ; null tant que le village n'est pas fondé. */
  levels: Record<Building, number> | null
  /** Production par minute de chaque ressource. */
  rates: Record<Resource, number> | null
  selected: Building | null
  onSelect: (building: Building | null) => void
  /** Célébration d'une amélioration confirmée par le serveur : un nouvel identifiant relance l'effet. */
  celebrate: { building: Building; key: number } | null
}

/** Emplacement de chaque bâtiment de production dans le village. */
const PLOTS: Record<Building, { position: [number, number, number]; facing: number }> = {
  sawmill: { position: [-10, 0, 1], facing: Math.PI / 2.4 },
  quarry: { position: [10, 0, 4], facing: -Math.PI / 2.3 },
  mine: { position: [7, 0, -10], facing: -Math.PI / 6 },
}

/** Ressource produite par chaque bâtiment. */
const PRODUCES: Record<Building, Resource> = { sawmill: 'wood', quarry: 'stone', mine: 'gold' }

/** Couleur des étincelles qui s'élèvent d'un bâtiment en production. */
const SPARKS: Record<Resource, string> = {
  wood: PALETTE.amber,
  stone: PALETTE.parchment,
  gold: PALETTE.legendary,
}

/** Nom affiché de chaque bâtiment, dans la scène. */
const NAMES: Record<Building, string> = { sawmill: 'Scierie', quarry: 'Carrière', mine: 'Mine' }

/** Vue d'ensemble : la caméra embrasse tout le village. */
const OVERVIEW: [number, number, number, number, number, number] = [14, 27, 30, 0, 0, -3]

export function VillageWorld(props: VillageWorldProps) {
  const { levels, selected } = props
  const labels = BUILDINGS.map((building) => {
    const level = levels?.[building] ?? 0
    return {
      id: `building-${building}`,
      content: (
        <NameTag
          name={NAMES[building]}
          accent={selected === building ? 'self' : undefined}
          note={levels ? (level === 0 ? 'À construire' : `Niveau ${level}`) : undefined}
        />
      ),
    }
  })
  return (
    <GameCanvas
      label="Votre village en 3D : la place, les bâtiments de production, les remparts et la forêt"
      camera={{ position: [OVERVIEW[0], OVERVIEW[1], OVERVIEW[2]], fov: 42 }}
      background={PALETTE.night}
      labels={labels}
    >
      <VillageScene {...props} />
    </GameCanvas>
  )
}

function VillageScene({ levels, rates, selected, onSelect, celebrate }: VillageWorldProps) {
  const controls = useRef<CameraControls>(null)

  // La caméra se pose sur le bâtiment sélectionné, ou revient à la vue d'ensemble.
  useEffect(() => {
    const c = controls.current
    if (!c) return
    if (selected) {
      const [x, , z] = PLOTS[selected].position
      // Vue plongeante depuis la place : aucune maison ne s'interpose.
      c.setLookAt(x * 0.3, 13, z * 0.3 + 7, x, 1.5, z, true)
    } else {
      c.setLookAt(...OVERVIEW, true)
    }
  }, [selected])

  // Clavier : les flèches tournent la caméra, + et - rapprochent ou éloignent, Échap revient.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select')) return
      const c = controls.current
      if (!c) return
      if (event.key === 'ArrowLeft') c.rotate(-0.2, 0, true)
      else if (event.key === 'ArrowRight') c.rotate(0.2, 0, true)
      else if (event.key === 'ArrowUp') c.rotate(0, -0.1, true)
      else if (event.key === 'ArrowDown') c.rotate(0, 0.1, true)
      else if (event.key === '+' || event.key === '=') c.dolly(3, true)
      else if (event.key === '-') c.dolly(-3, true)
      else if (event.key === 'Escape') onSelect(null)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect])

  const totalLevels = levels ? BUILDINGS.reduce((sum, b) => sum + levels[b], 0) : 0
  // Le bourg s'étoffe avec le développement du village : une maison de plus tous les deux niveaux.
  const houseCount = Math.min(12, 3 + Math.floor(totalLevels / 2))

  return (
    <>
      <CameraControls
        ref={controls}
        minDistance={8}
        maxDistance={52}
        minPolarAngle={0.35}
        maxPolarAngle={1.32}
        smoothTime={0.6}
        draggingSmoothTime={0.2}
      />
      <fog attach="fog" args={[PALETTE.night, 48, 110]} />
      <ambientLight intensity={0.35} color="#8fa6c8" />
      <hemisphereLight args={['#8aa4c8', '#2a3a22', 1.15]} />
      {/* Lune froide, qui porte les ombres, et lueur dorée du couchant. */}
      <directionalLight
        position={[-18, 26, 12]}
        intensity={2.3}
        color="#c9d6ee"
        castShadow
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[20, 8, -20]} intensity={0.9} color={PALETTE.amber} />

      <Ground />
      <Plaza />
      <Keep />
      <Ramparts />
      <Forest />
      <Mountains />
      <Houses count={houseCount} />
      <Villagers count={Math.min(6, 2 + Math.floor(totalLevels / 3))} />

      {BUILDINGS.map((building) => (
        <ProductionSite
          key={building}
          building={building}
          level={levels?.[building] ?? 0}
          rate={rates?.[PRODUCES[building]] ?? 0}
          founded={levels !== null}
          selected={selected === building}
          onSelect={() => onSelect(selected === building ? null : building)}
          celebrate={celebrate?.building === building ? celebrate.key : null}
        />
      ))}

      <Particles
        count={60}
        area={[50, 10, 50]}
        color={PALETTE.legendary}
        size={0.05}
        speed={0.15}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Terrain et décor
// ---------------------------------------------------------------------------

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial color={PALETTE.grassDark} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[19, 48]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      {/* Chemins de terre, de la place vers chaque bâtiment et vers la porte. */}
      {[
        ...Object.values(PLOTS).map((plot) => plot.position),
        [0, 0, 18] as [number, number, number],
      ].map(([x, , z]) => {
        const length = Math.hypot(x, z)
        return (
          <mesh
            key={`${x}-${z}`}
            position={[x / 2, 0.02, z / 2]}
            rotation={[-Math.PI / 2, 0, -Math.atan2(z, x)]}
            receiveShadow
          >
            <planeGeometry args={[length, 1.4]} />
            <meshStandardMaterial color={PALETTE.dirt} roughness={1} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Place centrale : pavés, puits couvert, torches et bannières du royaume. */
function Plaza() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <circleGeometry args={[4.2, 40]} />
        <meshStandardMaterial color={PALETTE.cobble} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 1, 0.9, 16]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.88, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.05, 16]} />
        <meshStandardMaterial color={PALETTE.water} metalness={0.3} roughness={0.2} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 1.5, 0]} castShadow>
          <boxGeometry args={[0.12, 1.4, 0.12]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
      ))}
      <mesh position={[0, 2.35, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <coneGeometry args={[1.5, 0.9, 4]} />
        <meshStandardMaterial color={PALETTE.roof} roughness={0.8} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return (
          <Torch key={i} position={[Math.cos(a) * 3.9, 0, Math.sin(a) * 3.9]} light={i % 2 === 0} />
        )
      })}
      <Banner position={[-2.2, 0, -3.4]} color={PALETTE.ruby} />
      <Banner position={[2.2, 0, -3.4]} color={PALETTE.sapphire} />
      <Barrel position={[2.8, 0, 1.6]} />
      <Crate position={[-2.9, 0.3, 1.4]} rotation={[0, 0.4, 0]} />
    </group>
  )
}

/** Donjon seigneurial, au fond du village : le cœur du royaume. */
function Keep() {
  return (
    <group position={[-2, 0, -15]}>
      <mesh position={[0, 0.8, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[7, 8, 1.6, 10]} />
        <meshStandardMaterial color={PALETTE.darkStone} roughness={1} />
      </mesh>
      <mesh position={[0, 5, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 7, 4.5]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
      </mesh>
      {[-1.6, 0, 1.6].map((x) => (
        <mesh key={x} position={[x, 8.75, 2.1]} castShadow>
          <boxGeometry args={[0.7, 0.5, 0.5]} />
          <meshStandardMaterial color={PALETTE.wallStone} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <Tower
          key={side}
          position={[side * 3.2, 1.6, 1.6]}
          height={8.5}
          radius={1.1}
          roof={PALETTE.roof}
        />
      ))}
      <mesh position={[0, 3, 2.27]}>
        <planeGeometry args={[1.4, 2.2]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.2, 6, 2.27]}>
          <planeGeometry args={[0.4, 0.7]} />
          <meshBasicMaterial color={PALETTE.flame} />
        </mesh>
      ))}
      <Banner position={[0, 8.5, 0]} color={PALETTE.gold} height={4} />
      <Torch position={[-1.1, 1.6, 2.6]} />
      <Torch position={[1.1, 1.6, 2.6]} light={false} />
    </group>
  )
}

/** Remparts en anneau, percés d'une porte face à la caméra. */
function Ramparts() {
  const radius = 19
  const segments = 14
  return (
    <group>
      {Array.from({ length: segments }, (_, i) => {
        // La porte s'ouvre entre deux tours, du côté de la caméra (angle π/2).
        const a = (i / segments) * Math.PI * 2
        const gate = Math.abs(Math.sin((a - Math.PI / 2) / 2)) < 0.12
        const next = ((i + 1) / segments) * Math.PI * 2
        const mid = (a + next) / 2
        const chord = 2 * radius * Math.sin(Math.PI / segments)
        return (
          <group key={a}>
            {!gate && (
              <Wall
                position={[Math.cos(mid) * radius, 0, Math.sin(mid) * radius]}
                rotation={[0, -mid + Math.PI / 2, 0]}
                length={chord}
                height={2.4}
              />
            )}
            <Tower
              position={[Math.cos(a) * radius, 0, Math.sin(a) * radius]}
              height={3.6}
              radius={0.9}
            />
          </group>
        )
      })}
    </group>
  )
}

/** Forêt autour du village, plus dense du côté de la scierie. */
function Forest() {
  const trees = useMemo(() => {
    const list: { x: number; z: number; s: number; pine: boolean }[] = []
    // Générateur déterministe : la forêt est la même à chaque visite.
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2
      const r = 22 + rand() * 24
      list.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        s: 0.9 + rand() * 0.9,
        pine: rand() > 0.35,
      })
    }
    for (let i = 0; i < 12; i++) {
      list.push({
        x: -14 - rand() * 4,
        z: -4 + rand() * 10,
        s: 0.8 + rand() * 0.5,
        pine: rand() > 0.5,
      })
    }
    return list
  }, [])
  return (
    <group>
      {trees.map((t) =>
        t.pine ? (
          <PineTree key={`${t.x}-${t.z}`} position={[t.x, 0, t.z]} scale={t.s} />
        ) : (
          <OakTree key={`${t.x}-${t.z}`} position={[t.x, 0, t.z]} scale={t.s} />
        ),
      )}
    </group>
  )
}

/** Montagnes enneigées à l'horizon, derrière la mine. */
function Mountains() {
  const peaks: [number, number, number, number][] = [
    [18, -38, 16, 14],
    [2, -46, 22, 18],
    [-20, -40, 18, 15],
    [34, -26, 12, 11],
    [-36, -28, 13, 12],
  ]
  return (
    <group>
      {peaks.map(([x, z, h, r]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <coneGeometry args={[r, h, 7]} />
            <meshStandardMaterial color={PALETTE.darkStone} flatShading roughness={1} />
          </mesh>
          <mesh position={[0, h * 0.86, 0]}>
            <coneGeometry args={[r * 0.29, h * 0.28, 7]} />
            <meshStandardMaterial color="#d9e2ec" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Maisons du bourg, disposées autour de la place. */
function Houses({ count }: { count: number }) {
  const spots = useMemo(() => {
    const list: { x: number; z: number; r: number; roof: string; stories: number }[] = []
    const roofs = [PALETTE.roof, PALETTE.roofSlate, '#6b3a22']
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.3
      // On laisse libres les chemins vers les bâtiments de production et vers la porte.
      const r = 8 + (i % 3) * 1.6
      list.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        r: -a + Math.PI / 2,
        roof: roofs[i % roofs.length],
        stories: i % 4 === 0 ? 2 : 1,
      })
    }
    return list.filter((spot) => {
      const nearPath = [...Object.values(PLOTS).map((p) => p.position), [0, 0, 18]].some(
        ([x, , z]) => {
          const len = Math.hypot(x, z)
          const t = (spot.x * x + spot.z * z) / (len * len)
          const px = x * t
          const pz = z * t
          return t > 0 && t < 1 && Math.hypot(spot.x - px, spot.z - pz) < 2.4
        },
      )
      const nearPlot = Object.values(PLOTS).some(
        ({ position: [x, , z] }) => Math.hypot(spot.x - x, spot.z - z) < 6.5,
      )
      return !nearPath && !nearPlot
    })
  }, [])
  return (
    <group>
      {spots.slice(0, count).map((spot) => (
        <group key={`${spot.x}-${spot.z}`}>
          <House
            position={[spot.x, 0, spot.z]}
            rotation={[0, spot.r, 0]}
            roof={spot.roof}
            stories={spot.stories}
          />
          {spot.stories === 2 && <Smoke position={[spot.x, 3.4, spot.z]} count={5} />}
        </group>
      ))}
    </group>
  )
}

/** Villageois qui flânent autour de la place : un décor vivant, et non des joueurs. */
function Villagers({ count }: { count: number }) {
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: les villageois sont anonymes et fixes.
        <Wanderer key={i} index={i} />
      ))}
    </group>
  )
}

function Wanderer({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null)
  const motion = useMotionScale()
  const radius = 5 + (index % 3) * 1.1
  const speed = (0.12 + (index % 4) * 0.03) * (index % 2 === 0 ? 1 : -1)
  useFrame(({ clock }) => {
    if (!group.current) return
    const a = clock.elapsedTime * speed * Math.max(motion, 0.2) + index * 1.7
    group.current.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius)
    group.current.rotation.y = -a + (speed > 0 ? 0 : Math.PI)
  })
  return (
    <group ref={group}>
      <Figure kind="villager" tint={index % 2 ? '#7a5a2a' : '#4f6a3a'} />
    </group>
  )
}

/** Positions d'une pile d'objets, identifiées par leurs coordonnées. */
function pile(count: number, at: (i: number) => [number, number, number]) {
  return Array.from({ length: count }, (_, i) => {
    const position = at(i)
    return { key: position.join(':'), position, i }
  })
}

// ---------------------------------------------------------------------------
// Bâtiments de production
// ---------------------------------------------------------------------------

function ProductionSite({
  building,
  level,
  rate,
  founded,
  selected,
  onSelect,
  celebrate,
}: {
  building: Building
  level: number
  rate: number
  founded: boolean
  selected: boolean
  onSelect: () => void
  celebrate: number | null
}) {
  const [hovered, setHovered] = useState(false)
  const plot = PLOTS[building]
  // La taille du bâtiment croît avec son niveau, sans démesure.
  const scale = level === 0 ? 1 : 0.8 + (level / MAX_LEVEL) * 0.55
  const highlight = selected || hovered

  return (
    <group position={plot.position}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: groupe Three.js, et non élément HTML ; le bâtiment est aussi accessible au clavier depuis le panneau du royaume. */}
      <group
        rotation={[0, plot.facing, 0]}
        onClick={(e) => {
          e.stopPropagation()
          if (founded) onSelect()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (!founded) return
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = ''
        }}
      >
        {/* Socle et anneau de sélection. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
          <circleGeometry args={[4.2, 32]} />
          <meshStandardMaterial color={PALETTE.dirt} roughness={1} />
        </mesh>
        {highlight && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <ringGeometry args={[4.1, 4.45, 48]} />
            <meshBasicMaterial
              color={selected ? PALETTE.legendary : PALETTE.gold}
              transparent
              opacity={0.85}
            />
          </mesh>
        )}
        <group scale={scale}>
          {level === 0 ? (
            <ConstructionSite />
          ) : building === 'sawmill' ? (
            <Sawmill level={level} />
          ) : building === 'quarry' ? (
            <Quarry level={level} />
          ) : (
            <Mine level={level} />
          )}
        </group>
      </group>

      {level > 0 && rate > 0 && (
        <Particles
          position={[0, 1, 0]}
          count={14}
          area={[3, 4, 3]}
          color={SPARKS[PRODUCES[building]]}
          size={0.09}
          speed={0.5}
        />
      )}
      {celebrate !== null && <Celebration key={celebrate} />}

      <Anchor id={`building-${building}`} position={[0, 5.4, 0]} />
    </group>
  )
}

/** Effet d'une amélioration confirmée : un éclat doré, puis une gerbe d'étincelles. */
function Celebration() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1600)
    return () => clearTimeout(timer)
  }, [])
  if (!visible) return null
  return (
    <>
      <ImpactFlash position={[0, 2.5, 0]} color={PALETTE.legendary} />
      <Particles count={50} area={[4, 6, 4]} color={PALETTE.legendary} size={0.12} speed={2.5} />
    </>
  )
}

/** Chantier d'un bâtiment non construit : piquets, cordes, planches et pierres d'angle. */
function ConstructionSite() {
  return (
    <group>
      {[
        [-1.6, -1.6],
        [1.6, -1.6],
        [1.6, 1.6],
        [-1.6, 1.6],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.5, z]} castShadow>
          <boxGeometry args={[0.12, 1, 0.12]} />
          <meshStandardMaterial color={PALETTE.wood} />
        </mesh>
      ))}
      {[-1.6, 1.6].map((z) => (
        <mesh key={z} position={[0, 0.85, z]}>
          <boxGeometry args={[3.2, 0.03, 0.03]} />
          <meshStandardMaterial color={PALETTE.parchment} />
        </mesh>
      ))}
      <mesh position={[0.4, 0.15, 0.2]} rotation={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[2, 0.12, 0.4]} />
        <meshStandardMaterial color={PALETTE.wood} />
      </mesh>
      <Rock position={[-0.8, 0.2, -0.5]} scale={0.5} />
      <Rock position={[0.9, 0.2, -0.8]} scale={0.4} />
      <Crate position={[-0.6, 0.3, 0.9]} />
    </group>
  )
}

/** Scierie : bâtisse de bois, roue à aubes qui tourne, troncs empilés selon le niveau. */
function Sawmill({ level }: { level: number }) {
  const wheel = useRef<THREE.Mesh>(null)
  const motion = useMotionScale()
  useFrame((_, delta) => {
    if (wheel.current) wheel.current.rotation.z -= delta * 0.8 * Math.max(motion, 0.2)
  })
  return (
    <group>
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 2.4, 2.6]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.9, 2.85, 0]}
          rotation={[0, 0, -side * 0.62]}
          castShadow
        >
          <boxGeometry args={[2.2, 0.12, 2.9]} />
          <meshStandardMaterial color={PALETTE.darkWood} roughness={0.9} />
        </mesh>
      ))}
      <mesh ref={wheel} position={[1.85, 1.3, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[1.05, 0.12, 6, 12]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      <mesh position={[1.85, 1.3, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15, 0.15, 0.4, 8]} />
        <meshStandardMaterial color={PALETTE.metal} metalness={0.7} />
      </mesh>
      <mesh position={[0, 1.3, 1.31]}>
        <planeGeometry args={[0.9, 1.6]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      {pile(Math.min(level, 8), (i) => [
        -2.3 - (i % 2) * 0.35,
        0.22 + Math.floor(i / 2) * 0.36,
        -0.8 + (i % 4) * 0.12,
      ]).map(({ key, position, i }) => (
        <mesh key={key} position={position} rotation={[Math.PI / 2, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 2, 8]} />
          <meshStandardMaterial color={i % 3 === 0 ? PALETTE.darkWood : PALETTE.wood} />
        </mesh>
      ))}
      {level >= 5 && <Banner position={[-1.4, 2.4, -1.1]} color={PALETTE.emerald} height={2} />}
      {level >= MAX_LEVEL && (
        <Banner position={[1.4, 2.4, -1.1]} color={PALETTE.gold} height={2.4} />
      )}
      <Smoke position={[-0.8, 3.4, -0.6]} count={4} />
    </group>
  )
}

/** Carrière : falaise taillée, grue de bois, blocs de pierre empilés selon le niveau. */
function Quarry({ level }: { level: number }) {
  const crane = useRef<THREE.Group>(null)
  const motion = useMotionScale()
  useFrame(({ clock }) => {
    if (crane.current)
      crane.current.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.6 * Math.max(motion, 0.2)
  })
  return (
    <group>
      {[
        [-1.2, 1.2, -1.4, 1.9],
        [0.6, 1.6, -1.8, 2.3],
        [1.9, 1, -1, 1.5],
        [-0.2, 2.6, -2.2, 1.6],
      ].map(([x, y, z, s]) => (
        <Rock key={`${x}-${z}`} position={[x, y, z]} scale={s} color={PALETTE.wallStone} />
      ))}
      <group ref={crane} position={[1.6, 0, 1.2]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <boxGeometry args={[0.2, 3.2, 0.2]} />
          <meshStandardMaterial color={PALETTE.wood} />
        </mesh>
        <mesh position={[-0.9, 3.1, 0]} rotation={[0, 0, 0.15]} castShadow>
          <boxGeometry args={[2.2, 0.16, 0.16]} />
          <meshStandardMaterial color={PALETTE.wood} />
        </mesh>
        <mesh position={[-1.8, 2.3, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.4, 4]} />
          <meshStandardMaterial color={PALETTE.parchment} />
        </mesh>
        <mesh position={[-1.8, 1.5, 0]} castShadow>
          <boxGeometry args={[0.45, 0.35, 0.45]} />
          <meshStandardMaterial color={PALETTE.wallStone} />
        </mesh>
      </group>
      {pile(Math.min(level, 9), (i) => [
        -1.6 + (i % 3) * 0.62,
        0.25 + Math.floor(i / 3) * 0.5,
        1.5,
      ]).map(({ key, position, i }) => (
        <mesh key={key} position={position} castShadow receiveShadow>
          <boxGeometry args={[0.55, 0.45, 0.55]} />
          <meshStandardMaterial color={i % 2 ? PALETTE.wallStone : '#8c9096'} roughness={0.95} />
        </mesh>
      ))}
      {level >= 5 && <Torch position={[-2.2, 0, 0.4]} />}
      {level >= MAX_LEVEL && <Banner position={[2.5, 0, -0.2]} color={PALETTE.gold} height={2.6} />}
    </group>
  )
}

/** Mine : galerie étayée dans la roche, rails, wagonnet et éclats d'or selon le niveau. */
function Mine({ level }: { level: number }) {
  return (
    <group>
      <mesh position={[0, 1.8, -1.2]} castShadow receiveShadow>
        <dodecahedronGeometry args={[2.6, 0]} />
        <meshStandardMaterial color={PALETTE.darkStone} flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 1, 1.15]}>
        <planeGeometry args={[1.4, 2]} />
        <meshBasicMaterial color="#05080d" />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 1.1, 1.2]} castShadow>
          <boxGeometry args={[0.22, 2.2, 0.22]} />
          <meshStandardMaterial color={PALETTE.wood} />
        </mesh>
      ))}
      <mesh position={[0, 2.25, 1.2]} castShadow>
        <boxGeometry args={[2, 0.24, 0.26]} />
        <meshStandardMaterial color={PALETTE.wood} />
      </mesh>
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, 0.04, 2.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.07, 3]} />
          <meshStandardMaterial color={PALETTE.metal} metalness={0.8} />
        </mesh>
      ))}
      <group position={[0, 0, 3]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.9, 0.55, 1.1]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
        {pile(Math.min(level, 6), (i) => [
          -0.25 + (i % 3) * 0.25,
          0.8,
          -0.3 + Math.floor(i / 3) * 0.4,
        ]).map(({ key, position }) => (
          <mesh key={key} position={position}>
            <dodecahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial
              color={PALETTE.gold}
              emissive={PALETTE.amber}
              emissiveIntensity={0.4}
              metalness={0.9}
              roughness={0.25}
            />
          </mesh>
        ))}
      </group>
      <Torch position={[-1.2, 0, 1.6]} />
      {level >= 5 && <Torch position={[1.2, 0, 1.6]} light={false} />}
      {level >= MAX_LEVEL && <Banner position={[1.8, 0, 0.4]} color={PALETTE.gold} height={2.6} />}
    </group>
  )
}
