// ラウンジ: 六角形のあずまや。テーブルを囲むソファに座れる。吊りランプのスイッチは全員で同期
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { Chair, TextPlane, useSyncedState } from '@tentenv/sdk'
import { geos, mats } from './materials'
import { Box, Button, Cyl, type V3 } from './ui'

export const LOUNGE: V3 = [-11.5, 0, 11.5]
const COL_R = 3.6

/** 2 人掛けのソファ。原点が座面の中央の床、-Z が前 */
const Sofa: React.FC<{ id: string; position: V3; rotationY: number }> = ({ id, position, rotationY }) => {
  const m = mats()
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.75, 0.22, 0.38]} position={[0, 0.22, 0.05]} />
      </RigidBody>
      <Box position={[0, 0.22, 0.05]} size={[1.5, 0.44, 0.78]} material={m.fabric} />
      <Box position={[0, 0.5, -0.02]} size={[1.3, 0.12, 0.62]} material={m.cushion} />
      <Box position={[0, 0.78, 0.38]} size={[1.5, 0.66, 0.18]} material={m.fabric} />
      <Box position={[-0.7, 0.58, 0.05]} size={[0.16, 0.3, 0.78]} material={m.fabric} />
      <Box position={[0.7, 0.58, 0.05]} size={[0.16, 0.3, 0.78]} material={m.fabric} />
      <Chair id={`${id}-0`} position={[-0.32, 0.56, -0.02]} exit={{ forward: 0.7 }} />
      <Chair id={`${id}-1`} position={[0.32, 0.56, -0.02]} exit={{ forward: 0.7 }} />
    </group>
  )
}

const PottedPlant: React.FC<{ position: V3 }> = ({ position }) => {
  const m = mats()
  return (
    <group position={position}>
      <mesh material={m.pot} position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.2, 0.5, 12]} />
      </mesh>
      <mesh material={m.leaf} geometry={geos().ico} position={[0, 0.85, 0]} scale={[0.75, 0.9, 0.75]} castShadow />
      <mesh material={m.leafDark} geometry={geos().ico} position={[0.12, 1.2, 0.05]} scale={0.45} castShadow />
    </group>
  )
}

export const Lounge: React.FC = () => {
  const m = mats()
  const [on, setOn] = useSyncedState('lounge:light', true)
  const cols = Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2 + Math.PI / 6)
  // ソファはテーブルを 3 方向から囲む（プラザ側は通り道として空ける）
  const sofas = [0.75 * Math.PI, (1 / 12) * Math.PI, (17 / 12) * Math.PI].map((a) => {
    const x = Math.cos(a) * 1.75
    const z = Math.sin(a) * 1.75
    return { x, z, yaw: Math.atan2(x, z) }
  })
  return (
    <group position={LOUNGE}>
      <RigidBody type="fixed" colliders={false}>
        {cols.map((a, i) => (
          <CylinderCollider key={i} args={[1.6, 0.16]} position={[Math.cos(a) * COL_R, 1.6, Math.sin(a) * COL_R]} />
        ))}
        <CylinderCollider args={[0.37, 0.75]} position={[0, 0.37, 0]} />
        <CylinderCollider args={[0.06, 4.1]} position={[0, 0.06, 0]} />
      </RigidBody>
      {/* 床・柱・屋根 */}
      <mesh material={m.wood} position={[0, 0.06, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[4.1, 4.2, 0.12, 6]} />
      </mesh>
      {cols.map((a, i) => (
        <Cyl key={i} position={[Math.cos(a) * COL_R, 1.65, Math.sin(a) * COL_R]} size={[0.26, 3.1, 0.26]} material={m.marble} />
      ))}
      <mesh material={m.woodDark} position={[0, 3.25, 0]} castShadow>
        <cylinderGeometry args={[4.0, 4.0, 0.2, 6]} />
      </mesh>
      <mesh material={m.roof} position={[0, 4.15, 0]} castShadow>
        <cylinderGeometry args={[0.15, 4.6, 1.6, 6]} />
      </mesh>
      <mesh material={m.brass} position={[0, 5.05, 0]} geometry={geos().sphere} scale={0.3} />
      {/* テーブル */}
      <Cyl position={[0, 0.4, 0]} size={[0.16, 0.6, 0.16]} material={m.woodDark} />
      <mesh material={m.wood} position={[0, 0.73, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.75, 0.75, 0.06, 32]} />
      </mesh>
      <mesh material={m.flower[1]} position={[0, 0.84, 0]} geometry={geos().sphere} scale={[0.18, 0.16, 0.18]} />
      {sofas.map((s, i) => (
        <Sofa key={i} id={`lounge-sofa-${i}`} position={[s.x, 0.12, s.z]} rotationY={s.yaw} />
      ))}
      {/* 吊りランプ */}
      <Cyl position={[0, 3.0, 0]} size={[0.02, 0.5, 0.02]} material={m.metal} shadow={false} />
      <mesh position={[0, 2.68, 0]} material={m.metal}>
        <cylinderGeometry args={[0.12, 0.42, 0.25, 20, 1, true]} />
      </mesh>
      <mesh position={[0, 2.6, 0]} geometry={geos().sphere} scale={0.18}>
        <meshStandardMaterial color="#fff4d6" emissive="#ffc46b" emissiveIntensity={on ? 3 : 0} />
      </mesh>
      <pointLight position={[0, 2.4, 0]} intensity={on ? 9 : 0} distance={8} decay={2} color="#ffd59a" />
      {/* スイッチ（プラザ側の柱） */}
      <group position={[Math.cos(cols[5]) * COL_R, 1.25, Math.sin(cols[5]) * COL_R]} rotation={[0, Math.atan2(Math.cos(cols[5]), Math.sin(cols[5])), 0]}>
        <group position={[0, 0, 0.15]} scale={1.35}>
          <Box position={[0, 0, -0.012]} size={[0.44, 0.42, 0.02]} material={m.panel} shadow={false} />
          <TextPlane text="ランプ Lamp" width={0.4} lineHeight={0.055} position={[0, 0.14, 0.002]} padding={0.002} />
          <Button label={on ? 'ON' : 'OFF'} hint={on ? 'ランプを消す（全員）' : 'ランプを点ける（全員）'} width={0.32} active={on} color="#e0a530" position={[0, -0.04, 0.02]} onClick={() => setOn(!on)} />
        </group>
      </group>
      <TextPlane text="ラウンジ  LOUNGE" width={2.6} lineHeight={0.2} bold color="#ffffff" position={[Math.cos(cols[5]) * 3.98, 3.25, Math.sin(cols[5]) * 3.98]} rotation={[0, Math.atan2(Math.cos(cols[5]), Math.sin(cols[5])), 0]} padding={0.005} />
      <PottedPlant position={[Math.cos(cols[0]) * 4.6, 0, Math.sin(cols[0]) * 4.6]} />
      <PottedPlant position={[Math.cos(cols[2]) * 4.6, 0, Math.sin(cols[2]) * 4.6]} />
      <PottedPlant position={[Math.cos(cols[3]) * 4.6, 0, Math.sin(cols[3]) * 4.6]} />
    </group>
  )
}
