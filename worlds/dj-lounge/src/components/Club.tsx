import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import { Color, type HemisphereLight } from 'three'
import { AL } from '../dj/audiolink'

// クラブの部屋: 紫に照らされた無地の床と壁。照明と LED は Stage にまとめてある
export const ROOM = { w: 14, d: 16, h: 5 }
export const BOOTH = { z: -5, tableH: 0.95, tableW: 2.4, tableD: 0.8 }

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; color: string; collide?: boolean; rough?: number }> = ({ p, s, color, collide = true, rough = 0.85 }) => (
  <>
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
    {collide && (
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[s[0] / 2, s[1] / 2, s[2] / 2]} position={p} />
      </RigidBody>
    )}
  </>
)

// 部屋全体を照らす明かり（テーマのライムに少し寄せる）。配色に少しだけ寄せ、低音で少し明るくなる
const Ambience: React.FC = () => {
  const hemi = useRef<HemisphereLight>(null)
  const base = useMemo(() => new Color('#dfe6d2'), [])
  useFrame(() => {
    const h = hemi.current
    if (!h) return
    h.color.copy(base).lerp(AL.colA, 0.3)
    h.intensity = 2.9 + AL.bands[0] * 0.6
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#dfe6d2', '#3a4030', 3.2]} />
      <ambientLight color="#d8dccf" intensity={0.8} />
    </>
  )
}

export const Club: React.FC = () => {
  const { w, d, h } = ROOM
  const t = 0.2
  return (
    <group>
      {/* 床・天井・壁 */}
      <Box p={[0, -0.05, 0]} s={[w, 0.1, d]} color="#2a2a2a" rough={0.8} />
      <Box p={[0, h + 0.05, 0]} s={[w, 0.1, d]} color="#181818" />
      <Box p={[-w / 2 - t / 2, h / 2, 0]} s={[t, h, d]} color="#4a4a4a" />
      <Box p={[w / 2 + t / 2, h / 2, 0]} s={[t, h, d]} color="#4a4a4a" />
      <Box p={[0, h / 2, -d / 2 - t / 2]} s={[w, h, t]} color="#262626" />
      <Box p={[0, h / 2, d / 2 + t / 2]} s={[w, h, t]} color="#4a4a4a" />
      {/* DJ ブースの台（前面の LED パネルは Stage）。近づいて操作しやすいよう当たり判定はつけない */}
      <Box p={[0, BOOTH.tableH / 2, BOOTH.z]} s={[BOOTH.tableW, BOOTH.tableH, BOOTH.tableD]} color="#1a1a1a" collide={false} />
      <Ambience />
    </group>
  )
}
