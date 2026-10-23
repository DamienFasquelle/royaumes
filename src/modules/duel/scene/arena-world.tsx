'use client'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { DoubleSide } from 'three'
import { FloatingNumber, HealAura, ImpactFlash, NameTag } from '@/ui/three/effects'
import { Figure, type FigureAction, type FigureMove } from '@/ui/three/figure'
import { GameCanvas } from '@/ui/three/game-canvas'
import { Anchor, type SceneLabel } from '@/ui/three/labels'
import { framingFactor, useMotionScale } from '@/ui/three/motion'
import { PALETTE } from '@/ui/three/palette'
import { Banner, Particles, Torch } from '@/ui/three/props'
import type { DuelView, Move } from '../contracts'

/**
 * Arène des duels. Elle met en scène la vue renvoyée par le serveur : les deux duellistes,
 * leurs points de vie, et chaque manche résolue, rejouée passe contre passe puis effet par
 * effet. La passe de l'adversaire n'est jamais connue de la scène avant sa révélation : la
 * vue filtrée ne la contient pas.
 */

/** Position des deux duellistes : le joueur à gauche, son adversaire à droite. */
const ME: [number, number, number] = [-2.1, 0, 0]
const RIVAL: [number, number, number] = [2.1, 0, 0]

/** Mouvement joué par chaque passe d'armes. */
const MOVE_ANIMATION: Record<Move, FigureMove> = {
  attack: 'attack',
  defend: 'defend',
  counter: 'counter',
  heal: 'heal',
}

interface Fx {
  id: string
  target: 'me' | 'rival'
  kind: 'damage' | 'heal' | 'info'
  amount: number
}

export function ArenaWorld({ view }: { view: DuelView }) {
  const [moves, setMoves] = useState<Record<'me' | 'rival', FigureAction | null>>({
    me: null,
    rival: null,
  })
  const [fx, setFx] = useState<Fx[]>([])
  const [reveal, setReveal] = useState(0)

  // Rejeu de la dernière manche, une fois par manche ; celles déjà jouées à l'ouverture de
  // la scène ne sont pas rejouées.
  const count = view.rounds.length
  const played = useRef(count)
  const rounds = useRef(view.rounds)
  rounds.current = view.rounds
  useEffect(() => {
    if (count === played.current) return
    played.current = count
    const round = rounds.current.at(-1)
    if (!round) return
    const side = (id: string): 'me' | 'rival' => (id === view.me.id ? 'me' : 'rival')
    const timers: ReturnType<typeof setTimeout>[] = []
    setReveal(round.round)

    // 1. Les deux passes sont jouées ensemble : c'est la révélation.
    setMoves({
      me: { move: MOVE_ANIMATION[round.moves[view.me.id]], key: `${round.round}-me` },
      rival: { move: MOVE_ANIMATION[round.moves[view.rival.id]], key: `${round.round}-rival` },
    })
    // 2. Puis leurs effets, dans l'ordre enregistré par le serveur.
    round.effects.forEach((effect, i) => {
      const id = `${round.round}-${i}`
      timers.push(
        setTimeout(
          () => {
            const target = side(effect.target)
            const damaging =
              effect.kind === 'hit' || effect.kind === 'riposte' || effect.kind === 'stagger'
            if (damaging) {
              setMoves((current) => ({ ...current, [target]: { move: 'hit', key: `${id}-hit` } }))
            }
            const kind = damaging ? 'damage' : effect.kind === 'heal' ? 'heal' : 'info'
            setFx((list) => [...list, { id, target, kind, amount: effect.amount }])
            timers.push(setTimeout(() => setFx((list) => list.filter((f) => f.id !== id)), 1500))
          },
          520 + i * 420,
        ),
      )
    })
    return () => timers.forEach(clearTimeout)
  }, [count, view.me.id, view.rival.id])

  const fighting = view.status === 'fighting'
  const labels: SceneLabel[] = useMemo(() => {
    const note = (ready: boolean) => (fighting ? (ready ? 'en garde' : 'réfléchit...') : undefined)
    const list: SceneLabel[] = [
      {
        id: 'fig-me',
        content: (
          <NameTag
            name={view.me.name}
            hp={view.me.hp}
            maxHp={view.me.maxHp}
            accent="self"
            note={note(view.me.ready)}
          />
        ),
      },
      {
        id: 'fig-rival',
        content: (
          <NameTag
            name={view.rival.name || 'En attente de réponse'}
            hp={view.rival.hp}
            maxHp={view.rival.maxHp}
            accent="enemy"
            note={note(view.rival.ready)}
          />
        ),
      },
    ]
    for (const f of fx) {
      list.push({
        id: `fx-${f.id}`,
        anchor: `fig-${f.target}`,
        content:
          f.kind === 'info' ? (
            <span className="float-number" data-kind="info">
              Soin interrompu
            </span>
          ) : (
            <FloatingNumber amount={f.amount} kind={f.kind} />
          ),
      })
    }
    return list
  }, [view, fighting, fx])

  const finished = view.status === 'finished' && view.result
  const winner = finished ? view.result?.winnerId : null
  const draw = finished && view.result?.outcome === 'draw'

  return (
    <GameCanvas
      label="L'arène des duels en 3D : deux combattants face à face sur le sable"
      camera={{ position: [0, 4.2, 10], fov: 42 }}
      background="#0b1220"
      labels={labels}
    >
      <ArenaScene reveal={reveal} />
      <Figure
        kind="knight"
        position={ME}
        facing={Math.PI / 2}
        tint={PALETTE.gold}
        action={moves.me}
        down={!!finished && !draw && winner !== null && winner !== view.me.id}
        victory={!!finished && winner === view.me.id}
      >
        <Anchor id="fig-me" />
      </Figure>
      <Figure
        kind={view.training ? 'master' : 'knight'}
        position={RIVAL}
        facing={-Math.PI / 2}
        tint={view.training ? undefined : PALETTE.ruby}
        action={moves.rival}
        down={!!finished && !draw && winner !== null && winner !== view.rival.id}
        victory={!!finished && winner === view.rival.id}
      >
        <Anchor id="fig-rival" />
      </Figure>
      {fx.map((f) => {
        const [x, , z] = f.target === 'me' ? ME : RIVAL
        if (f.kind === 'damage')
          return <ImpactFlash key={f.id} position={[x, 1.3, z]} color={PALETTE.legendary} />
        if (f.kind === 'heal') return <HealAura key={f.id} position={[x, 0, z]} />
        return null
      })}
      {finished && !draw && (
        <Particles
          position={winner === view.me.id ? ME : RIVAL}
          count={80}
          area={[3, 5, 3]}
          color={PALETTE.legendary}
          size={0.09}
          speed={1.4}
        />
      )}
    </GameCanvas>
  )
}

/** Décor de l'arène, et caméra qui se rapproche à chaque révélation. */
function ArenaScene({ reveal }: { reveal: number }) {
  const controls = useRef<CameraControls>(null)
  const { size } = useThree()
  // Sur un écran étroit, la caméra recule pour garder les deux combattants dans le cadre.
  const k = framingFactor(size.width, size.height)

  useEffect(() => {
    controls.current?.setLookAt(0, 4.2 * k, 10 * k, 0, 1, 0, false)
  }, [k])

  useEffect(() => {
    const c = controls.current
    if (!c || reveal === 0) return
    // Révélation : la caméra se rapproche des combattants, puis reprend sa place.
    c.setLookAt(0, 2.8 * k, 7 * k, 0, 1.2, 0, true)
    const timer = setTimeout(() => c.setLookAt(0, 4.2 * k, 10 * k, 0, 1, 0, true), 2200)
    return () => clearTimeout(timer)
  }, [reveal, k])

  return (
    <>
      <CameraControls
        ref={controls}
        minDistance={6}
        maxDistance={30}
        minPolarAngle={0.7}
        maxPolarAngle={1.45}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
        smoothTime={0.45}
      />
      <fog attach="fog" args={['#0b1220', 16, 40]} />
      <ambientLight intensity={0.45} color="#7d8fb3" />
      <hemisphereLight args={['#7a90bc', '#2a1d10', 1.0]} />
      <spotLight
        position={[0, 12, 4]}
        angle={0.6}
        penumbra={0.5}
        intensity={110}
        distance={30}
        color="#ffe7c2"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-8, 10, -6]} intensity={0.6} color="#9fb3d9" />
      <Sand />
      <Stands />
      <Particles count={70} area={[16, 4, 10]} color={PALETTE.sand} size={0.04} speed={0.12} />
    </>
  )
}

/** Sol de sable battu, et cercle de combat tracé au centre. */
function Sand() {
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  const motion = useMotionScale()
  useFrame(({ clock }) => {
    if (ring.current) ring.current.opacity = 0.35 + Math.sin(clock.elapsedTime * 1.5) * 0.1 * motion
  })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9.5, 64]} />
        <meshStandardMaterial color={PALETTE.sand} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[3.6, 3.75, 64]} />
        <meshBasicMaterial ref={ring} color={PALETTE.gold} transparent depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[40, 32]} />
        <meshStandardMaterial color={PALETTE.darkStone} roughness={1} />
      </mesh>
    </group>
  )
}

/**
 * Vrai pour un angle de l'anneau situé du côté de la caméra : on n'y place ni bannière ni
 * torche, qui masqueraient les combattants.
 */
const facesCamera = (a: number) => Math.sin(a) > 0.55

/** Muret, gradins en trois rangs, bannières, torches et braseros autour du sable. */
function Stands() {
  const banners = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 10
        return { a, color: i % 2 ? PALETTE.ruby : PALETTE.sapphire }
      }).filter(({ a }) => !facesCamera(a)),
    [],
  )
  return (
    <group>
      {/* Muret qui ceint le sable. */}
      <mesh position={[0, 0.6, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[10, 10, 1.2, 64, 1, true]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} side={DoubleSide} />
      </mesh>
      {/* Gradins : trois rangs de pierre, de plus en plus hauts. */}
      {[0, 1, 2].map((tier) => (
        <mesh key={tier} position={[0, 1.4 + tier * 0.9, 0]} receiveShadow>
          <cylinderGeometry args={[11 + tier * 1.4, 11 + tier * 1.4, 0.9, 64, 1, true]} />
          <meshStandardMaterial
            color={tier % 2 ? PALETTE.darkStone : PALETTE.wallStone}
            roughness={1}
            side={DoubleSide}
          />
        </mesh>
      ))}
      {[0, 1, 2].map((tier) => (
        <mesh
          key={`seat-${tier}`}
          position={[0, 1.85 + tier * 0.9, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <ringGeometry args={[10 + tier * 1.4, 11.4 + tier * 1.4, 64]} />
          <meshStandardMaterial color={PALETTE.cobble} roughness={1} />
        </mesh>
      ))}
      {banners.map(({ a, color }) => (
        <Banner
          key={a}
          position={[Math.cos(a) * 9.6, 1.2, Math.sin(a) * 9.6]}
          rotation={[0, -a - Math.PI / 2, 0]}
          color={color}
          height={3.2}
        />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6
        if (facesCamera(a)) return null
        return (
          <Torch
            key={i}
            position={[Math.cos(a) * 9.3, 1.2, Math.sin(a) * 9.3]}
            height={1.1}
            light={i % 2 === 0}
          />
        )
      })}
      {/* Loge d'honneur, au fond de l'arène. */}
      <group position={[0, 3.6, -13.5]}>
        <mesh castShadow>
          <boxGeometry args={[6, 2.4, 1.6]} />
          <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.6, 0]} rotation={[0, 0, 0]}>
          <boxGeometry args={[6.6, 0.25, 2]} />
          <meshStandardMaterial color={PALETTE.ruby} roughness={0.8} />
        </mesh>
        <Banner position={[-2.4, 1.2, 0.9]} color={PALETTE.gold} height={2.4} />
        <Banner position={[2.4, 1.2, 0.9]} color={PALETTE.gold} height={2.4} />
      </group>
    </group>
  )
}

/**
 * Arène vide, où attend le maître d'armes : décor du lieu où se lancent les défis.
 * Le maître d'armes est un personnage non joueur, présenté comme tel.
 */
export function ArenaHall() {
  return (
    <GameCanvas
      label="L'arène des duels, où le maître d'armes attend les combattants"
      camera={{ position: [0, 4.2, 10], fov: 42 }}
      background="#0b1220"
      labels={[
        { id: 'master', content: <NameTag name="Maître d'armes" note="personnage non joueur" /> },
      ]}
    >
      <ArenaScene reveal={0} />
      <Figure kind="master" position={[0, 0, -1]}>
        <Anchor id="master" />
      </Figure>
    </GameCanvas>
  )
}
