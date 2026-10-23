'use client'
import { CameraControls } from '@react-three/drei'
import { GameCanvas } from '@/ui/three/game-canvas'
import { PALETTE } from '@/ui/three/palette'
import { Banner, Particles, PineTree, Rock, Torch } from '@/ui/three/props'

/**
 * Entrée du donjon : une porte creusée dans la falaise, gardée par deux braseros, d'où
 * descend un escalier dans la brume. Décor du lieu où se préparent les expéditions.
 */
export function DungeonGate() {
  return (
    <GameCanvas
      label="L'entrée du donjon, creusée dans la falaise et gardée par des braseros"
      camera={{ position: [6, 4.5, 13], fov: 45 }}
      background="#070b12"
    >
      <CameraControls
        minDistance={8}
        maxDistance={20}
        minPolarAngle={0.8}
        maxPolarAngle={1.45}
        minAzimuthAngle={-0.8}
        maxAzimuthAngle={0.8}
      />
      <fog attach="fog" args={['#070b12', 10, 34]} />
      <ambientLight intensity={0.3} color="#6a7fa6" />
      <hemisphereLight args={['#5b6f96', '#100c08', 0.7]} />
      <directionalLight position={[-6, 14, 6]} intensity={1.2} color="#a9bde0" castShadow />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[40, 40]} />
        <meshStandardMaterial color={PALETTE.grassDark} roughness={1} />
      </mesh>
      {/* Falaise percée d'une arche. */}
      {[
        [-6, 4, -4, 5],
        [6, 4, -4, 5],
        [0, 8.5, -5, 6],
        [-11, 3, -2, 4],
        [11, 3, -2, 4],
      ].map(([x, y, z, s]) => (
        <Rock key={`${x}:${y}`} position={[x, y, z]} scale={s} color={PALETTE.darkStone} />
      ))}
      <mesh position={[0, 2.6, -1.6]}>
        <boxGeometry args={[4.2, 5.2, 1]} />
        <meshBasicMaterial color="#020305" />
      </mesh>
      {[-2.4, 2.4].map((x) => (
        <mesh key={x} position={[x, 2.8, -1]} castShadow>
          <boxGeometry args={[0.7, 5.6, 0.9]} />
          <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 5.8, -1]} castShadow>
        <boxGeometry args={[5.6, 0.8, 0.9]} />
        <meshStandardMaterial color={PALETTE.wallStone} roughness={0.95} />
      </mesh>
      {/* Marches qui s'enfoncent dans l'obscurité. */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.12 - i * 0.18, 0.6 - i * 0.6]} receiveShadow>
          <boxGeometry args={[4, 0.24, 0.6]} />
          <meshStandardMaterial color={PALETTE.wallStone} roughness={1} />
        </mesh>
      ))}
      {/* Braseros. */}
      {[-3.6, 3.6].map((x) => (
        <group key={x} position={[x, 0, 1.4]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.3, 1.2, 8]} />
            <meshStandardMaterial color={PALETTE.metal} metalness={0.7} roughness={0.4} />
          </mesh>
          <Torch position={[0, 0.6, 0]} height={0.7} />
          <Particles
            position={[0, 1.4, 0]}
            count={30}
            area={[0.6, 3, 0.6]}
            color={PALETTE.ember}
            size={0.07}
            speed={0.9}
          />
        </group>
      ))}
      <Banner position={[-4.6, 0, 0.2]} color={PALETTE.ruby} height={3.4} />
      <Banner position={[4.6, 0, 0.2]} color={PALETTE.ruby} height={3.4} />
      {[-14, -9, 9, 15, -18, 18].map((x, i) => (
        <PineTree key={x} position={[x, 0, 4 + (i % 3) * 3]} scale={1.2} />
      ))}
      <Particles count={100} area={[24, 6, 16]} color="#9fb3d9" size={0.04} speed={0.08} />
    </GameCanvas>
  )
}
