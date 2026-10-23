'use client'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { FloatingNumber, HealAura, ImpactFlash, NameTag } from '@/ui/three/effects'
import { Figure, type FigureAction, type FigureKind } from '@/ui/three/figure'
import { GameCanvas } from '@/ui/three/game-canvas'
import { Anchor, type SceneLabel } from '@/ui/three/labels'
import { framingFactor, useMotionScale } from '@/ui/three/motion'
import { PALETTE } from '@/ui/three/palette'
import { Particles, Rock, Torch } from '@/ui/three/props'
import { type GameView, MONSTERS, type Monster } from '../contracts'

/**
 * Scène 3D d'une expédition. Elle représente fidèlement la vue renvoyée par le serveur :
 * les héros et les monstres de la salle, leurs points de vie, et le déroulement de la dernière
 * manche, rejoué effet par effet dans l'ordre où le serveur l'a résolu. Elle ne calcule rien.
 */

export interface DungeonWorldProps {
  view: GameView
  userId: string
  /** Monstre visé par le joueur, pour sa prochaine attaque. */
  target: string | null
  onTarget: (monsterId: string) => void
}

type Vec3 = [number, number, number]

/** Délai entre deux effets d'une manche rejouée, en millisecondes. */
const EFFECT_MS = 800

/** Effet de combat en cours d'affichage. */
interface Fx {
  id: string
  target: string
  kind: 'damage' | 'heal'
  amount: number
}

/** Positions des héros (à gauche) et des monstres (à droite), face à face. */
function layout(view: GameView) {
  const positions = new Map<string, Vec3>()
  const heroes = view.heroes
  heroes.forEach((hero, i) => {
    positions.set(hero.id, [-3.4 - (i % 2) * 1.2, 0, (i - (heroes.length - 1) / 2) * 1.8])
  })
  const monsters = view.monsters
  monsters.forEach((monster, i) => {
    const spread = monster.kind === 'troll' ? 0 : (i - (monsters.length - 1) / 2) * 2.1
    positions.set(monster.id, [3.4 + (i % 2) * 1.1, 0, spread])
  })
  return positions
}

/** Nom affiché d'un monstre, numéroté si la salle en contient plusieurs du même type. */
export function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

export function DungeonWorld(props: DungeonWorldProps) {
  const { view, userId, target } = props
  const [fx, setFx] = useState<Fx[]>([])
  const [moves, setMoves] = useState<Record<string, FigureAction>>({})

  // Rejeu de la dernière manche, une seule fois par manche. Une manche déjà résolue à
  // l'ouverture de la scène n'est pas rejouée.
  const round = view.lastRound?.round ?? 0
  const played = useRef(round)
  const lastRound = useRef(view.lastRound)
  lastRound.current = view.lastRound
  useEffect(() => {
    const resolved = lastRound.current
    if (!resolved || round === played.current) return
    played.current = round
    const timers: ReturnType<typeof setTimeout>[] = []
    const move = (id: string, figureMove: FigureAction['move'], key: string) =>
      setMoves((current) => ({ ...current, [id]: { move: figureMove, key } }))

    for (const [heroId, action] of Object.entries(resolved.actions)) {
      if (action.type === 'defend') move(heroId, 'defend', `${resolved.round}-defend-${heroId}`)
    }
    resolved.effects.forEach((effect, i) => {
      const key = `${resolved.round}-${i}`
      timers.push(
        setTimeout(() => {
          move(effect.source, effect.kind === 'damage' ? 'attack' : 'heal', `${key}-source`)
          timers.push(
            setTimeout(() => {
              if (effect.kind === 'damage') move(effect.target, 'hit', `${key}-target`)
              setFx((list) => [
                ...list,
                { id: key, target: effect.target, kind: effect.kind, amount: effect.amount },
              ])
              timers.push(setTimeout(() => setFx((list) => list.filter((f) => f.id !== key)), 1500))
            }, 380),
          )
        }, i * EFFECT_MS),
      )
    })
    return () => timers.forEach(clearTimeout)
  }, [round])

  const labels: SceneLabel[] = useMemo(() => {
    const list: SceneLabel[] = view.heroes.map((hero) => ({
      id: `fig-${hero.id}`,
      content: (
        <NameTag
          name={hero.name}
          hp={hero.hp}
          maxHp={hero.maxHp}
          accent={hero.id === userId ? 'self' : 'ally'}
          note={
            view.phase === 'combat' && hero.hp > 0
              ? hero.ready
                ? 'prêt'
                : 'réfléchit...'
              : view.turnHeroId === hero.id
                ? 'à son tour'
                : undefined
          }
        />
      ),
    }))
    if (view.phase === 'combat') {
      for (const monster of view.monsters) {
        list.push({
          id: `fig-${monster.id}`,
          content: (
            <NameTag
              name={monsterName(monster, view.monsters)}
              hp={monster.hp}
              maxHp={monster.maxHp}
              accent="enemy"
              note={monster.id === target && monster.hp > 0 ? 'cible' : undefined}
            />
          ),
        })
      }
    }
    for (const f of fx) {
      list.push({
        id: `fx-${f.id}`,
        anchor: `fig-${f.target}`,
        content: <FloatingNumber amount={f.amount} kind={f.kind} />,
      })
    }
    if (view.currentRoom?.kind === 'treasure' && view.phase === 'exploring') {
      list.push({
        id: 'treasure',
        content: <NameTag name="Trésor" note={`${view.currentRoom.gold} or`} />,
      })
    }
    return list
  }, [view, userId, target, fx])

  return (
    <GameCanvas
      label="Salle du donjon en 3D : les héros de l'expédition face aux monstres"
      camera={{ position: [0, 6.5, 12.5], fov: 45 }}
      background="#06090e"
      labels={labels}
    >
      <DungeonScene {...props} moves={moves} fx={fx} />
    </GameCanvas>
  )
}

function DungeonScene({
  view,
  userId,
  target,
  onTarget,
  moves,
  fx,
}: DungeonWorldProps & { moves: Record<string, FigureAction>; fx: Fx[] }) {
  const controls = useRef<CameraControls>(null)
  const positions = useMemo(() => layout(view), [view])
  const combat = view.phase === 'combat'
  const { size } = useThree()
  // Sur un écran étroit, la caméra recule pour garder héros et monstres dans le cadre.
  const k = framingFactor(size.width, size.height)

  // Cadrage : plus serré en combat, plus large pendant l'exploration.
  useEffect(() => {
    const c = controls.current
    if (!c) return
    // Le centre du cadre est décalé vers la gauche : les panneaux de jeu occupent les bords.
    if (combat) c.setLookAt(-1.6, 5.2 * k, 10.5 * k, -1.2, 1, 0, true)
    else c.setLookAt(-1.4, 6.5 * k, 12.5 * k, -1, 1, -1, true)
  }, [combat, k])

  return (
    <>
      <CameraControls
        ref={controls}
        minDistance={7}
        maxDistance={32}
        minPolarAngle={0.6}
        maxPolarAngle={1.4}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
        smoothTime={0.5}
      />
      <fog attach="fog" args={['#06090e', 12, 30]} />
      <ambientLight intensity={0.45} color="#6b80a8" />
      <hemisphereLight args={['#6a7fa6', '#1a120c', 1.0]} />
      {/* Éclairage du combat : une douche de lumière froide sur l'arène de la salle. */}
      <spotLight
        position={[0, 11, 5]}
        angle={0.75}
        penumbra={0.6}
        intensity={90}
        distance={30}
        color="#c9d6ee"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight
        position={[-4, 12, 8]}
        intensity={1.1}
        color="#9fb3d9"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Room room={view.room} />
      <RuneCircle active={combat} />

      {view.currentRoom?.kind === 'treasure' && view.phase === 'exploring' && <TreasureChest />}
      {(view.phase === 'won' || view.phase === 'lost') && (
        <Particles
          count={120}
          area={[14, 6, 10]}
          color={view.phase === 'won' ? PALETTE.legendary : PALETTE.ruby}
          size={0.08}
          speed={0.8}
        />
      )}

      {view.heroes.map((hero) => {
        const position = positions.get(hero.id) ?? [0, 0, 0]
        const kind: FigureKind = hero.companion ? 'companion' : 'knight'
        return (
          <Figure
            key={hero.id}
            kind={kind}
            position={position}
            facing={Math.PI / 2}
            tint={hero.id === userId ? PALETTE.gold : undefined}
            action={moves[hero.id] ?? null}
            down={hero.hp <= 0 || view.phase === 'lost'}
            victory={view.phase === 'won' && hero.hp > 0}
            highlight={view.turnHeroId === hero.id}
          >
            <Anchor id={`fig-${hero.id}`} />
          </Figure>
        )
      })}

      {combat &&
        view.monsters.map((monster) => (
          <Figure
            key={monster.id}
            kind={monster.kind}
            position={positions.get(monster.id) ?? [0, 0, 0]}
            facing={-Math.PI / 2}
            action={moves[monster.id] ?? null}
            down={monster.hp <= 0}
            highlight={monster.id === target && monster.hp > 0}
            onSelect={monster.hp > 0 ? () => onTarget(monster.id) : undefined}
          >
            <Anchor id={`fig-${monster.id}`} />
          </Figure>
        ))}

      {fx.map((f) => {
        const [x, y, z] = positions.get(f.target) ?? [0, 0, 0]
        return f.kind === 'damage' ? (
          <ImpactFlash key={f.id} position={[x, y + 1.2, z]} color={PALETTE.legendary} />
        ) : (
          <HealAura key={f.id} position={[x, y, z]} />
        )
      })}

      <Particles count={90} area={[20, 6, 14]} color="#9fb3d9" size={0.03} speed={0.05} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Décor
// ---------------------------------------------------------------------------

/** Salle de pierre : dalles, murs, piliers, chaînes, torches, porte du fond. */
function Room({ room }: { room: number }) {
  const door = useRef<THREE.Group>(null)
  const opened = useRef<number | null>(null)
  const last = useRef(room)
  useFrame(({ clock }) => {
    // Une nouvelle salle : la porte du fond s'ouvre, puis se referme derrière les héros.
    if (last.current !== room) {
      last.current = room
      opened.current = clock.elapsedTime
    }
    if (!door.current) return
    const t = opened.current === null ? 99 : clock.elapsedTime - opened.current
    door.current.rotation.y = t < 2.5 ? Math.sin(Math.min(1, t / 1.2) * Math.PI) * -1.2 : 0
  })

  const slabs = useMemo(() => {
    const list: { x: number; z: number; shade: string }[] = []
    for (let x = -10; x <= 10; x += 2) {
      for (let z = -6; z <= 8; z += 2) {
        list.push({ x, z, shade: (x + z) % 4 === 0 ? PALETTE.dungeonStone : '#343a43' })
      }
    }
    return list
  }, [])

  return (
    <group>
      {slabs.map((slab) => (
        <mesh key={`${slab.x}:${slab.z}`} position={[slab.x, -0.05, slab.z]} receiveShadow>
          <boxGeometry args={[1.94, 0.1, 1.94]} />
          <meshStandardMaterial color={slab.shade} roughness={1} />
        </mesh>
      ))}
      {/* Mur du fond et murs latéraux. */}
      <mesh position={[0, 3.5, -7]} receiveShadow>
        <boxGeometry args={[24, 7, 0.6]} />
        <meshStandardMaterial color={PALETTE.dungeonStone} roughness={1} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 11.5, 3.5, 0]} receiveShadow>
          <boxGeometry args={[0.6, 7, 16]} />
          <meshStandardMaterial color={PALETTE.dungeonStone} roughness={1} />
        </mesh>
      ))}
      {/* Porte du fond, sous une arche. */}
      <mesh position={[0, 2.2, -6.65]}>
        <boxGeometry args={[3.4, 4.4, 0.3]} />
        <meshStandardMaterial color="#1c2026" />
      </mesh>
      <group ref={door} position={[-1.3, 0, -6.45]}>
        <mesh position={[1.3, 1.9, 0]} castShadow>
          <boxGeometry args={[2.6, 3.8, 0.18]} />
          <meshStandardMaterial color={PALETTE.darkWood} roughness={0.9} />
        </mesh>
        {[0.8, 2.6].map((y) => (
          <mesh key={y} position={[1.3, y, 0.1]}>
            <boxGeometry args={[2.6, 0.12, 0.04]} />
            <meshStandardMaterial color={PALETTE.metal} metalness={0.7} />
          </mesh>
        ))}
      </group>
      {/* Piliers, et chaînes pendues entre eux. */}
      {[-8, -4.5, 4.5, 8].map((x) => (
        <group key={x} position={[x, 0, -5.4]}>
          <mesh position={[0, 3.2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.55, 0.65, 6.4, 10]} />
            <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.85, 0.85, 0.4, 10]} />
            <meshStandardMaterial color={PALETTE.darkStone} />
          </mesh>
          <mesh position={[0, 4.6, 0.5]}>
            <torusGeometry args={[0.3, 0.04, 6, 12]} />
            <meshStandardMaterial color={PALETTE.metal} metalness={0.8} />
          </mesh>
          <mesh position={[0, 5.2, 0.5]}>
            <cylinderGeometry args={[0.02, 0.02, 1.4, 4]} />
            <meshStandardMaterial color={PALETTE.metal} metalness={0.8} />
          </mesh>
        </group>
      ))}
      <Torch position={[-6.2, 1.2, -6.4]} height={1.2} />
      <Torch position={[6.2, 1.2, -6.4]} height={1.2} />
      <Torch position={[-11, 1.4, 3]} height={1.2} />
      <Torch position={[11, 1.4, 3]} height={1.2} />
      {/* Éboulis. */}
      <Rock position={[-9, 0.3, 5]} scale={0.8} color={PALETTE.darkStone} />
      <Rock position={[9.5, 0.2, -3]} scale={0.6} color={PALETTE.darkStone} />
      <Rock position={[8.7, 0.15, 6]} scale={0.4} color={PALETTE.darkStone} />
    </group>
  )
}

/** Cercle runique au centre de la salle : il s'illumine pendant les combats. */
function RuneCircle({ active }: { active: boolean }) {
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const motion = useMotionScale()
  useFrame(({ clock }) => {
    if (!material.current) return
    const base = active ? 0.55 : 0.18
    material.current.opacity = base + Math.sin(clock.elapsedTime * 2) * 0.15 * motion
  })
  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[2.6, 2.8, 64]} />
        <meshBasicMaterial ref={material} color={PALETTE.amethyst} transparent depthWrite={false} />
      </mesh>
      <mesh>
        <ringGeometry args={[1.7, 1.78, 6]} />
        <meshBasicMaterial color={PALETTE.amethyst} transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {active && (
        <pointLight position={[0, 0, 1]} color={PALETTE.amethyst} intensity={3} distance={8} />
      )}
    </group>
  )
}

/** Coffre du trésor de la salle, entrouvert sur son or. */
function TreasureChest() {
  return (
    <group position={[0, 0, -1]}>
      <Anchor id="treasure" position={[0, 1.6, 0]} />
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.2, 0.7, 0.8]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.82, -0.3]} rotation={[-0.7, 0, 0]} castShadow>
        <boxGeometry args={[1.2, 0.12, 0.8]} />
        <meshStandardMaterial color={PALETTE.darkWood} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[1.05, 0.08, 0.65]} />
        <meshStandardMaterial
          color={PALETTE.gold}
          emissive={PALETTE.amber}
          emissiveIntensity={0.6}
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>
      <pointLight position={[0, 1.4, 0]} color={PALETTE.legendary} intensity={4} distance={5} />
      <Particles
        position={[0, 0.7, 0]}
        count={30}
        area={[1.2, 2, 0.8]}
        color={PALETTE.legendary}
        size={0.06}
        speed={0.6}
      />
    </group>
  )
}
