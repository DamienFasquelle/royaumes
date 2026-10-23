'use client'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useMotionScale } from './motion'
import { PALETTE } from './palette'

/**
 * Décors procéduraux partagés par les lieux du jeu. Chaque élément est construit à partir
 * de géométries simples, de matériaux de la charte et d'un éclairage : aucune ressource
 * externe n'est téléchargée.
 */

type Vec3 = [number, number, number]

interface Placed {
  position?: Vec3
  rotation?: Vec3
  scale?: number
}

/** Torche : une hampe, une coupe, une flamme vacillante et sa lumière. */
export function Torch({
  position = [0, 0, 0],
  height = 1.6,
  light = true,
}: Placed & {
  height?: number
  light?: boolean
}) {
  const flame = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.PointLight>(null)
  const scale = useMotionScale()
  // Décalage propre à chaque torche, pour qu'elles ne vacillent pas toutes ensemble.
  const phase = useMemo(() => Math.random() * 10, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + phase
    const flicker = 1 + scale * (Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08)
    if (flame.current) flame.current.scale.set(1, flicker, 1)
    if (glow.current) glow.current.intensity = 6 * flicker
  })

  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, height, 6]} />
        <meshStandardMaterial color={PALETTE.darkWood} roughness={0.9} />
      </mesh>
      <mesh position={[0, height + 0.05, 0]}>
        <cylinderGeometry args={[0.14, 0.08, 0.14, 8]} />
        <meshStandardMaterial color={PALETTE.metal} metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh ref={flame} position={[0, height + 0.25, 0]}>
        <coneGeometry args={[0.11, 0.38, 8]} />
        <meshBasicMaterial color={PALETTE.flame} />
      </mesh>
      {light && (
        <pointLight
          ref={glow}
          position={[0, height + 0.4, 0]}
          color={PALETTE.ember}
          intensity={6}
          distance={7}
          decay={1.6}
        />
      )}
    </group>
  )
}

/** Bannière : une hampe et une étoffe qui ondule au vent, frappée d'un losange doré. */
export function Banner({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = PALETTE.ruby,
  height = 3,
}: Placed & { color?: string; height?: number }) {
  const cloth = useRef<THREE.Mesh>(null)
  const scale = useMotionScale()
  const geometry = useMemo(() => new THREE.PlaneGeometry(0.9, 1.5, 8, 10), [])
  const base = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry])
  const phase = useMemo(() => Math.random() * 10, [])

  useFrame(({ clock }) => {
    const positions = geometry.attributes.position
    const t = clock.elapsedTime * 2.2 + phase
    for (let i = 0; i < positions.count; i++) {
      const x = base[i * 3]
      const y = base[i * 3 + 1]
      // L'étoffe est fixée à la hampe (bord gauche) : l'ondulation croît vers le bord libre.
      const free = x + 0.45
      positions.setZ(i, scale * free * 0.18 * Math.sin(t + free * 4 + y * 1.5))
    }
    positions.needsUpdate = true
  })

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, height, 6]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      <mesh position={[0, height - 0.05, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color={PALETTE.gold} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh ref={cloth} geometry={geometry} position={[0.48, height - 0.85, 0]} castShadow>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      <mesh position={[0.48, height - 0.75, 0.02]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.28, 0.28]} />
        <meshStandardMaterial
          color={PALETTE.gold}
          metalness={0.6}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

/** Sapin : un tronc et trois étages de feuillage. */
export function PineTree({ position = [0, 0, 0], scale = 1 }: Placed) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 1, 6]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.2 + i * 0.65, 0]} castShadow>
          <coneGeometry args={[1 - i * 0.25, 1.3, 7]} />
          <meshStandardMaterial color={PALETTE.pine} flatShading roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

/** Feuillu : un tronc et une ramure facettée. */
export function OakTree({ position = [0, 0, 0], scale = 1 }: Placed) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.22, 1.4, 6]} />
        <meshStandardMaterial color={PALETTE.wood} />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshStandardMaterial color={PALETTE.leaf} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0.5, 1.6, 0.3]} castShadow>
        <icosahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial color={PALETTE.leaf} flatShading roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Rocher facetté. */
export function Rock({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = PALETTE.wallStone,
}: Placed & {
  color?: string
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.6, 0]} />
      <meshStandardMaterial color={color} flatShading roughness={1} />
    </mesh>
  )
}

/** Tonneau cerclé de fer. */
export function Barrel({ position = [0, 0, 0], scale = 1 }: Placed) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.7, 12]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.85} />
      </mesh>
      {[0.12, 0.58].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <torusGeometry args={[0.285, 0.02, 4, 16]} />
          <meshStandardMaterial color={PALETTE.darkStone} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/** Caisse de bois. */
export function Crate({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }: Placed) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
      <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
    </mesh>
  )
}

/** Merlons d'un rempart : petits blocs alignés au sommet d'un mur. */
function Merlons({ length, y, depth }: { length: number; y: number; depth: number }) {
  const count = Math.max(2, Math.floor(length / 0.7))
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = -length / 2 + (length / count) * (i + 0.5)
        return (
          <mesh key={x} position={[x, y, 0]} castShadow>
            <boxGeometry args={[0.38, 0.4, depth]} />
            <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
          </mesh>
        )
      })}
    </>
  )
}

/** Pan de rempart crénelé. */
export function Wall({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  length = 4,
  height = 2,
}: Placed & {
  length?: number
  height?: number
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, height, 0.6]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
      </mesh>
      <Merlons length={length} y={height + 0.2} depth={0.6} />
    </group>
  )
}

/** Tour ronde crénelée, coiffée d'un toit conique. */
export function Tower({
  position = [0, 0, 0],
  height = 4,
  radius = 1,
  roof = PALETTE.roofSlate,
}: Placed & {
  height?: number
  radius?: number
  roof?: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 1.08, height, 12]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
      </mesh>
      <mesh position={[0, height + 0.15, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.15, radius * 1.15, 0.3, 12]} />
        <meshStandardMaterial color={PALETTE.darkStone} />
      </mesh>
      <mesh position={[0, height + 1.1, 0]} castShadow>
        <coneGeometry args={[radius * 1.25, 1.8, 12]} />
        <meshStandardMaterial color={roof} roughness={0.7} />
      </mesh>
      {/* Meurtrière éclairée de l'intérieur. */}
      <mesh position={[0, height * 0.6, radius + 0.01]}>
        <planeGeometry args={[0.12, 0.45]} />
        <meshBasicMaterial color={PALETTE.flame} />
      </mesh>
    </group>
  )
}

/** Maison à colombages : murs enduits, poutres, toit à deux pans, fenêtre éclairée. */
export function House({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  roof = PALETTE.roof,
  stories = 1,
}: Placed & { roof?: string; stories?: number }) {
  const h = 1.3 * stories
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, h, 1.6]} />
        <meshStandardMaterial color={PALETTE.plaster} roughness={0.95} />
      </mesh>
      {/* Colombages. */}
      {[-0.95, 0, 0.95].map((x) => (
        <mesh key={x} position={[x, h / 2, 0.81]}>
          <boxGeometry args={[0.1, h, 0.02]} />
          <meshStandardMaterial color={PALETTE.darkWood} />
        </mesh>
      ))}
      <mesh position={[0, h * 0.55, 0.81]}>
        <boxGeometry args={[2, 0.09, 0.02]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      {/* Toit : deux pans inclinés. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.55, h + 0.42, 0]}
          rotation={[0, 0, -side * 0.65]}
          castShadow
        >
          <boxGeometry args={[1.35, 0.1, 1.9]} />
          <meshStandardMaterial color={roof} roughness={0.8} />
        </mesh>
      ))}
      {/* Porte et fenêtre éclairée. */}
      <mesh position={[-0.45, 0.42, 0.82]}>
        <planeGeometry args={[0.4, 0.8]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      <mesh position={[0.45, h * 0.7, 0.82]}>
        <planeGeometry args={[0.35, 0.3]} />
        <meshBasicMaterial color={PALETTE.flame} />
      </mesh>
      {/* Cheminée. */}
      <mesh position={[0.6, h + 0.75, -0.3]} castShadow>
        <boxGeometry args={[0.25, 0.7, 0.25]} />
        <meshStandardMaterial color={PALETTE.darkStone} />
      </mesh>
    </group>
  )
}

/**
 * Colonne de fumée : quelques volutes qui s'élèvent, grossissent et s'estompent.
 * Les sphères sont réutilisées en boucle : aucun objet n'est créé pendant le rendu.
 */
export function Smoke({
  position = [0, 0, 0],
  count = 6,
  color = '#9aa0a6',
}: Placed & {
  count?: number
  color?: string
}) {
  const group = useRef<THREE.Group>(null)
  const scale = useMotionScale()
  const materials = useMemo(
    () =>
      Array.from(
        { length: count },
        () => new THREE.MeshStandardMaterial({ color, transparent: true, depthWrite: false }),
      ),
    [count, color],
  )

  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.children.forEach((puff, i) => {
      const life = (clock.elapsedTime * 0.25 * Math.max(scale, 0.3) + i / count) % 1
      puff.position.set(Math.sin(life * 4 + i) * 0.25, life * 3, Math.cos(life * 3 + i) * 0.2)
      puff.scale.setScalar(0.2 + life * 0.7)
      materials[i].opacity = 0.45 * (1 - life)
    })
  })

  return (
    <group ref={group} position={position}>
      {materials.map((material, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: les volutes sont identiques et fixes.
        <mesh key={i} material={material}>
          <sphereGeometry args={[0.5, 8, 8]} />
        </mesh>
      ))}
    </group>
  )
}

/** Nuée de particules : braises qui s'élèvent, ou poussière en suspension. */
export function Particles({
  position = [0, 0, 0],
  count = 80,
  area = [8, 4, 8],
  color = PALETTE.ember,
  size = 0.06,
  speed = 0.3,
}: Placed & { count?: number; area?: Vec3; color?: string; size?: number; speed?: number }) {
  const points = useRef<THREE.Points>(null)
  const scale = useMotionScale()
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * area[0]
      positions[i * 3 + 1] = Math.random() * area[1]
      positions[i * 3 + 2] = (Math.random() - 0.5) * area[2]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [count, area])

  useFrame((_, delta) => {
    const positions = geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i) + delta * speed * scale
      if (y > area[1]) y = 0
      positions.setY(i, y)
    }
    positions.needsUpdate = true
  })

  return (
    <points ref={points} position={position} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={size}
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
