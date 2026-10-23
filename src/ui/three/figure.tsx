'use client'
import { useFrame } from '@react-three/fiber'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useMotionScale } from './motion'
import { PALETTE } from './palette'

/**
 * Personnages du jeu : un même squelette procédural (jambes, torse, tête, bras articulés,
 * arme, bouclier, cape), décliné selon la nature du personnage.
 * Les animations sont déclenchées par la scène à partir des événements réels du combat :
 * le personnage ne décide de rien, il joue l'action qu'on lui transmet.
 */

export type FigureKind =
  | 'knight'
  | 'companion'
  | 'master'
  | 'goblin'
  | 'skeleton'
  | 'troll'
  | 'villager'
  | 'patron'

/** Mouvements ponctuels qu'un personnage sait jouer. */
export type FigureMove = 'attack' | 'defend' | 'counter' | 'heal' | 'hit'

/** Mouvement à jouer ; un changement de `key` relance l'animation, même pour un mouvement identique. */
export interface FigureAction {
  move: FigureMove
  key: string
}

interface Look {
  scale: number
  skin: string
  armor: string
  cloth: string
  weapon: 'sword' | 'dagger' | 'club' | 'none' | 'mug'
  shield: boolean
  helmet: boolean
  cape: boolean
  bulk: number
  limb: number
  ears?: boolean
  glowEyes?: boolean
}

const LOOKS: Record<FigureKind, Look> = {
  knight: {
    scale: 1,
    skin: '#d8b49a',
    armor: '#8d99a6',
    cloth: PALETTE.ruby,
    weapon: 'sword',
    shield: true,
    helmet: true,
    cape: true,
    bulk: 1,
    limb: 1,
  },
  companion: {
    scale: 0.95,
    skin: '#c99c7c',
    armor: PALETTE.copper,
    cloth: PALETTE.sapphire,
    weapon: 'sword',
    shield: true,
    helmet: true,
    cape: true,
    bulk: 1,
    limb: 1,
  },
  master: {
    scale: 1.08,
    skin: '#c7a184',
    armor: '#3b2f2a',
    cloth: PALETTE.amethyst,
    weapon: 'sword',
    shield: false,
    helmet: false,
    cape: true,
    bulk: 1.05,
    limb: 1,
  },
  goblin: {
    scale: 0.72,
    skin: PALETTE.goblinSkin,
    armor: PALETTE.leather,
    cloth: PALETTE.leather,
    weapon: 'dagger',
    shield: false,
    helmet: false,
    cape: false,
    bulk: 0.9,
    limb: 0.9,
    ears: true,
    glowEyes: true,
  },
  skeleton: {
    scale: 1,
    skin: PALETTE.bone,
    armor: PALETTE.bone,
    cloth: '#4a4136',
    weapon: 'sword',
    shield: false,
    helmet: false,
    cape: false,
    bulk: 0.7,
    limb: 0.55,
    glowEyes: true,
  },
  troll: {
    scale: 1.55,
    skin: PALETTE.trollSkin,
    armor: PALETTE.trollSkin,
    cloth: PALETTE.leather,
    weapon: 'club',
    shield: false,
    helmet: false,
    cape: false,
    bulk: 1.45,
    limb: 1.3,
  },
  villager: {
    scale: 0.92,
    skin: '#d2ad8f',
    armor: '#7a6a52',
    cloth: '#5a6b3b',
    weapon: 'none',
    shield: false,
    helmet: false,
    cape: false,
    bulk: 1,
    limb: 1,
  },
  patron: {
    scale: 0.92,
    skin: '#d2ad8f',
    armor: '#6b4a3a',
    cloth: '#7a5a2a',
    weapon: 'mug',
    shield: false,
    helmet: false,
    cape: false,
    bulk: 1,
    limb: 1,
  },
}

export interface FigureProps {
  kind: FigureKind
  position?: [number, number, number]
  /** Orientation autour de l'axe vertical, en radians ; 0 regarde vers +z. */
  facing?: number
  /** Couleur de l'étoffe (cape, tabard), pour distinguer les joueurs. */
  tint?: string
  action?: FigureAction | null
  /** Personnage à terre : il reste allongé. */
  down?: boolean
  /** Personnage victorieux : il lève son arme. */
  victory?: boolean
  /** Mise en évidence (survol, sélection, cible). */
  highlight?: boolean
  onSelect?: () => void
  /** Éléments attachés au personnage (étiquette, barre de vie), au-dessus de sa tête. */
  children?: ReactNode
}

/** Durée d'un mouvement ponctuel, en secondes. */
const MOVE_SECONDS = 0.9

export function Figure({
  kind,
  position = [0, 0, 0],
  facing = 0,
  tint,
  action,
  down = false,
  victory = false,
  highlight = false,
  onSelect,
  children,
}: FigureProps) {
  const look = LOOKS[kind]
  const motion = useMotionScale()
  const body = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const started = useRef<{ move: FigureMove; at: number } | null>(null)
  const pendingKey = useRef<string | null>(null)
  const phase = useMemo(() => Math.random() * 6, [])

  // Matériaux propres au personnage : leur lueur sert au clignotement d'un coup reçu.
  const mats = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.8 }),
      armor: new THREE.MeshStandardMaterial({
        color: look.armor,
        // Sans carte d'environnement, un métal trop réfléchissant paraît noir : l'armure
        // reste à demi mate, pour être lisible dans la pénombre.
        metalness: kind === 'knight' || kind === 'companion' ? 0.35 : 0.1,
        roughness: 0.45,
      }),
      cloth: new THREE.MeshStandardMaterial({
        color: tint ?? look.cloth,
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: PALETTE.metal,
        metalness: 0.5,
        roughness: 0.35,
      }),
      wood: new THREE.MeshStandardMaterial({ color: PALETTE.darkWood, roughness: 0.9 }),
      gold: new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.8, roughness: 0.3 }),
      eye: new THREE.MeshBasicMaterial({ color: PALETTE.ruby }),
    }),
    [look, kind, tint],
  )
  useEffect(
    () => () => {
      for (const material of Object.values(mats)) material.dispose()
    },
    [mats],
  )

  // Un nouveau mouvement est démarré à la prochaine image, à l'heure de l'horloge du rendu.
  useEffect(() => {
    if (action) pendingKey.current = `${action.key}`
  }, [action])

  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    if (action && pendingKey.current === action.key) {
      started.current = { move: action.move, at: now }
      pendingKey.current = null
    }
    const b = body.current
    const ra = rightArm.current
    const la = leftArm.current
    if (!b || !ra || !la) return

    // État de repos : respiration et léger balancement.
    const idle = Math.sin(now * 2 + phase)
    let z = 0
    let y = idle * 0.02 * motion
    let lean = 0
    let right = -0.25 + idle * 0.04 * motion
    let left = -0.15 - idle * 0.04 * motion
    let flash = 0

    const current = started.current
    if (current) {
      const p = (now - current.at) / MOVE_SECONDS
      if (p >= 1) started.current = null
      else {
        const arc = Math.sin(p * Math.PI)
        switch (current.move) {
          case 'attack':
            z = arc * 0.9
            lean = arc * 0.25
            right = p < 0.4 ? -0.25 - (p / 0.4) * 2.3 : -2.55 + ((p - 0.4) / 0.6) * 3.1
            break
          case 'defend':
            y -= arc * 0.1
            left = -1.4 * Math.min(1, p * 4)
            right = -0.6
            break
          case 'counter':
            if (p < 0.35) left = -1.4
            else {
              const q = (p - 0.35) / 0.65
              z = Math.sin(q * Math.PI) * 0.7
              right = -2.4 + q * 3
            }
            break
          case 'heal':
            right = -2.7 * arc
            left = -2.7 * arc
            y += arc * 0.1
            break
          case 'hit':
            z = -arc * 0.4
            lean = -arc * 0.3
            flash = 1 - p
            break
        }
      }
    }

    if (victory && !down) {
      right = -2.9 + Math.sin(now * 3) * 0.1 * motion
      y += Math.abs(Math.sin(now * 3)) * 0.06 * motion
    }

    // À terre : le personnage bascule en arrière et reste allongé.
    const fall = down ? 1 : 0
    b.rotation.x = THREE.MathUtils.lerp(b.rotation.x, fall ? -Math.PI / 2 : lean, 0.15)
    b.position.z = THREE.MathUtils.lerp(b.position.z, fall ? -0.6 : z, 0.35)
    b.position.y = THREE.MathUtils.lerp(b.position.y, fall ? 0.25 : y, 0.35)
    ra.rotation.x = THREE.MathUtils.lerp(ra.rotation.x, right, 0.35)
    la.rotation.x = THREE.MathUtils.lerp(la.rotation.x, left, 0.35)

    const glow = highlight ? 0.35 : 0
    for (const m of [mats.armor, mats.skin, mats.cloth]) {
      m.emissive.set(flash > 0 ? PALETTE.ruby : PALETTE.gold)
      m.emissiveIntensity = flash > 0 ? flash * 0.9 : glow
    }
  })

  const s = look.scale
  const w = 0.55 * look.bulk
  const limb = 0.16 * look.limb

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: groupe Three.js, et non élément HTML ; chaque action reste disponible dans les panneaux de jeu.
    <group
      position={position}
      rotation={[0, facing, 0]}
      scale={s}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation()
              onSelect()
            }
          : undefined
      }
      onPointerOver={onSelect ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={onSelect ? () => (document.body.style.cursor = '') : undefined}
    >
      <group ref={body}>
        {/* Jambes. */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.13 * look.bulk, 0.42, 0]}
            material={mats.armor}
            castShadow
          >
            <boxGeometry args={[limb * 1.1, 0.84, limb * 1.1]} />
          </mesh>
        ))}
        {/* Torse et ceinture. */}
        <mesh
          position={[0, 1.12, 0]}
          material={kind === 'skeleton' ? mats.skin : mats.armor}
          castShadow
        >
          <boxGeometry args={[w, 0.66, 0.34 * look.bulk]} />
        </mesh>
        {kind !== 'skeleton' && (
          <mesh position={[0, 1.02, 0.18 * look.bulk]} material={mats.cloth}>
            <boxGeometry args={[w * 0.7, 0.5, 0.02]} />
          </mesh>
        )}
        <mesh position={[0, 0.82, 0]} material={mats.wood}>
          <boxGeometry args={[w * 1.02, 0.08, 0.36 * look.bulk]} />
        </mesh>
        {/* Tête. */}
        <mesh position={[0, 1.62, 0]} material={mats.skin} castShadow>
          <sphereGeometry args={[0.2, 14, 12]} />
        </mesh>
        {look.helmet && (
          <>
            <mesh position={[0, 1.68, 0]} material={mats.metal} castShadow>
              <sphereGeometry args={[0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
            </mesh>
            <mesh position={[0, 1.93, -0.02]} material={mats.gold}>
              <boxGeometry args={[0.05, 0.16, 0.22]} />
            </mesh>
          </>
        )}
        {kind === 'master' && (
          <mesh position={[0, 1.5, 0.12]} material={mats.wood}>
            <coneGeometry args={[0.12, 0.25, 6]} />
          </mesh>
        )}
        {look.ears &&
          [-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.24, 1.66, 0]}
              rotation={[0, 0, -side * 1.2]}
              material={mats.skin}
            >
              <coneGeometry args={[0.07, 0.28, 5]} />
            </mesh>
          ))}
        {look.glowEyes &&
          [-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.07, 1.65, 0.18]} material={mats.eye}>
              <sphereGeometry args={[0.03, 6, 6]} />
            </mesh>
          ))}
        {kind === 'troll' && (
          <mesh position={[0, 1.55, 0.16]} material={mats.skin}>
            <boxGeometry args={[0.18, 0.1, 0.12]} />
          </mesh>
        )}
        {/* Cape. */}
        {look.cape && (
          <mesh
            position={[0, 1.05, -0.2 * look.bulk]}
            rotation={[0.08, 0, 0]}
            material={mats.cloth}
            castShadow
          >
            <planeGeometry args={[w * 1.05, 1.05]} />
          </mesh>
        )}
        {/* Bras droit, porteur de l'arme. */}
        <group ref={rightArm} position={[w / 2 + 0.08, 1.38, 0]}>
          <mesh
            position={[0, -0.3, 0]}
            material={kind === 'skeleton' ? mats.skin : mats.armor}
            castShadow
          >
            <boxGeometry args={[limb, 0.62, limb]} />
          </mesh>
          <Weapon kind={look.weapon} mats={mats} />
        </group>
        {/* Bras gauche, porteur du bouclier. */}
        <group ref={leftArm} position={[-(w / 2 + 0.08), 1.38, 0]}>
          <mesh
            position={[0, -0.3, 0]}
            material={kind === 'skeleton' ? mats.skin : mats.armor}
            castShadow
          >
            <boxGeometry args={[limb, 0.62, limb]} />
          </mesh>
          {look.shield && (
            <group position={[-0.04, -0.42, 0.14]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.wood} castShadow>
                <cylinderGeometry args={[0.3, 0.3, 0.06, 16]} />
              </mesh>
              <mesh position={[0, 0, 0.035]} material={mats.cloth}>
                <circleGeometry args={[0.24, 16]} />
              </mesh>
              <mesh position={[0, 0, 0.04]} material={mats.gold}>
                <circleGeometry args={[0.06, 12]} />
              </mesh>
            </group>
          )}
        </group>
      </group>
      {/* Cercle de sélection au sol. */}
      {highlight && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.55, 0.68, 32]} />
          <meshBasicMaterial color={PALETTE.legendary} transparent opacity={0.8} />
        </mesh>
      )}
      <group position={[0, 2.25, 0]} scale={1 / s}>
        {children}
      </group>
    </group>
  )
}

/** Arme tenue dans la main droite, orientée vers l'avant lorsque le bras est levé. */
function Weapon({
  kind,
  mats,
}: {
  kind: Look['weapon']
  mats: Record<'metal' | 'wood' | 'gold', THREE.Material>
}) {
  switch (kind) {
    case 'sword':
      return (
        <group position={[0, -0.62, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh position={[0, 0.48, 0]} material={mats.metal} castShadow>
            <boxGeometry args={[0.06, 0.85, 0.02]} />
          </mesh>
          <mesh position={[0, 0.04, 0]} material={mats.gold}>
            <boxGeometry args={[0.24, 0.05, 0.05]} />
          </mesh>
          <mesh position={[0, -0.08, 0]} material={mats.wood}>
            <cylinderGeometry args={[0.025, 0.025, 0.18, 6]} />
          </mesh>
        </group>
      )
    case 'dagger':
      return (
        <mesh position={[0, -0.62, 0.22]} rotation={[Math.PI / 2, 0, 0]} material={mats.metal}>
          <boxGeometry args={[0.05, 0.4, 0.02]} />
        </mesh>
      )
    case 'club':
      return (
        <mesh
          position={[0, -0.62, 0.4]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.wood}
          castShadow
        >
          <cylinderGeometry args={[0.14, 0.06, 0.9, 7]} />
        </mesh>
      )
    case 'mug':
      return (
        <mesh position={[0, -0.62, 0.05]} material={mats.wood}>
          <cylinderGeometry args={[0.08, 0.07, 0.16, 8]} />
        </mesh>
      )
    case 'none':
      return null
  }
}
