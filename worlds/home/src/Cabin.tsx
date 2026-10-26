// 小屋: ドアは押すと開け閉め（全員で同期）。中に芳名帳とランプ
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { MathUtils, type Group } from 'three'
import { Chair, Clickable, TextPlane, useSyncedState } from '@tentenv/sdk'
import { Guestbook } from './Guestbook'
import { mats } from './materials'
import { Box, Button, type V3 } from './ui'

export const CABIN: V3 = [-12.8, 0, -12.8]
/** 入口（+Z）を広場へ向ける */
const YAW = Math.atan2(1, 1)
const W = 4.8
const D = 4.6
const H = 3
const DOOR_W = 1.2
const DOOR_H = 2.2

export const Cabin: React.FC = () => {
  const m = mats()
  const hinge = useRef<Group>(null)
  // 閉じているときだけドアの当たり判定を置く
  const [open, setOpen] = useSyncedState('cabin:door', false)
  // ドアは開いている・閉じている角度へゆっくり回す（あとから来た人も同じ向きになる）
  useFrame((_, dt) => {
    const g = hinge.current
    if (g) g.rotation.y = MathUtils.damp(g.rotation.y, open ? MathUtils.degToRad(100) : 0, 5, dt)
  })
  const [light, setLight] = useSyncedState('cabin:light', true)
  const side = (W - DOOR_W) / 2
  return (
    <group position={CABIN} rotation={[0, YAW, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, H / 2, 0.1]} position={[0, H / 2, -D / 2]} />
        <CuboidCollider args={[0.1, H / 2, D / 2]} position={[-W / 2, H / 2, 0]} />
        <CuboidCollider args={[0.1, H / 2, D / 2]} position={[W / 2, H / 2, 0]} />
        <CuboidCollider args={[side / 2, H / 2, 0.1]} position={[-(DOOR_W / 2 + side / 2), H / 2, D / 2]} />
        <CuboidCollider args={[side / 2, H / 2, 0.1]} position={[DOOR_W / 2 + side / 2, H / 2, D / 2]} />
        {!open && <CuboidCollider args={[DOOR_W / 2, DOOR_H / 2, 0.08]} position={[0, DOOR_H / 2, D / 2]} />}
      </RigidBody>
      {/* 壁 */}
      <Box position={[0, H / 2, -D / 2]} size={[W + 0.2, H, 0.2]} material={m.plaster} />
      <Box position={[-W / 2, H / 2, 0]} size={[0.2, H, D]} material={m.plaster} />
      <Box position={[W / 2, H / 2, 0]} size={[0.2, H, D]} material={m.plaster} />
      <Box position={[-(DOOR_W / 2 + side / 2), H / 2, D / 2]} size={[side, H, 0.2]} material={m.plaster} />
      <Box position={[DOOR_W / 2 + side / 2, H / 2, D / 2]} size={[side, H, 0.2]} material={m.plaster} />
      <Box position={[0, (H + DOOR_H) / 2, D / 2]} size={[DOOR_W, H - DOOR_H, 0.2]} material={m.plaster} />
      {/* 柱（四隅）と屋根 */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} position={[(sx * (W + 0.1)) / 2, H / 2, (sz * (D + 0.1)) / 2]} size={[0.26, H, 0.26]} material={m.woodDark} />))}
      <mesh material={m.roof} position={[0, H + 0.7, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.1, 4.0, 1.4, 4]} />
      </mesh>
      {/* 窓（左右） */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (W / 2 + 0.11), 1.6, 0]} rotation={[0, s * (Math.PI / 2), 0]}>
          <Box position={[0, 0, 0]} size={[1.1, 0.9, 0.04]} material={m.woodDark} />
          <mesh position={[0, 0, 0.025]}>
            <planeGeometry args={[0.95, 0.75]} />
            <meshStandardMaterial color="#9fc8e8" emissive="#ffd59a" emissiveIntensity={light ? 0.35 : 0} roughness={0.1} metalness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} material={m.woodFloor} receiveShadow>
        <planeGeometry args={[W - 0.2, D - 0.2]} />
      </mesh>
      {/* ドア（蝶番の位置が原点）。押すと開け閉め */}
      <group ref={hinge} position={[-DOOR_W / 2, 0, D / 2]}>
        <Clickable label={open ? 'ドアを閉める' : 'ドアを開ける'} onClick={() => setOpen(!open)}>
        <Box position={[DOOR_W / 2, DOOR_H / 2, 0]} size={[DOOR_W - 0.04, DOOR_H - 0.02, 0.07]} material={m.door} />
        <Box position={[DOOR_W / 2, DOOR_H * 0.7, 0.04]} size={[DOOR_W - 0.34, DOOR_H * 0.32, 0.02]} material={m.woodDark} shadow={false} />
        <Box position={[DOOR_W / 2, DOOR_H * 0.28, 0.04]} size={[DOOR_W - 0.34, DOOR_H * 0.32, 0.02]} material={m.woodDark} shadow={false} />
        <mesh material={m.brass} position={[DOOR_W - 0.15, 1.05, 0.06]} scale={0.05}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        <mesh material={m.brass} position={[DOOR_W - 0.15, 1.05, -0.06]} scale={0.05}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        </Clickable>
      </group>
      {/* 入口の看板 */}
      <TextPlane text="芳名帳の小屋  GUESTBOOK" width={2.4} lineHeight={0.16} bold color="#ffffff" background="#5a3b26ee" radius={0.05} position={[0, H - 0.3, D / 2 + 0.12]} />
      <TextPlane text="ドアを押すと開け閉め" width={1.25} lineHeight={0.055} color="#ffffff" background="#000000aa" position={[1.68, 1.35, D / 2 + 0.11]} />
      {/* 中: 芳名帳・ランプ・ひじ掛け椅子 */}
      <Guestbook position={[0, 0.9, -D / 2 + 0.11]} />
      <pointLight position={[0, 2.5, 0]} intensity={light ? 6 : 0} distance={6} decay={2} color="#ffd59a" />
      <mesh position={[0, 2.75, 0]} scale={[0.25, 0.12, 0.25]}>
        <sphereGeometry args={[1, 16, 10]} />
        <meshStandardMaterial color="#fff4d6" emissive="#ffc46b" emissiveIntensity={light ? 2.5 : 0} />
      </mesh>
      <group position={[DOOR_W / 2 + 0.45, 1.25, D / 2 - 0.11]} rotation={[0, Math.PI, 0]}>
        <Box position={[0, 0, -0.012]} size={[0.44, 0.42, 0.02]} material={m.panel} shadow={false} />
        <TextPlane text="ランプ Lamp" width={0.4} lineHeight={0.055} position={[0, 0.14, 0.002]} padding={0.002} />
        <Button label={light ? 'ON' : 'OFF'} hint={light ? '小屋のランプを消す（全員）' : '小屋のランプを点ける（全員）'} width={0.32} active={light} color="#e0a530" position={[0, -0.04, 0.02]} onClick={() => setLight(!light)} />
      </group>
      <group position={[-1.6, 0, -0.6]} rotation={[0, -Math.PI / 2 - 0.4, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[0.4, 0.22, 0.4]} position={[0, 0.22, 0]} />
        </RigidBody>
        <Box position={[0, 0.22, 0]} size={[0.8, 0.44, 0.8]} material={m.fabricWarm} />
        <Box position={[0, 0.75, 0.33]} size={[0.8, 0.65, 0.14]} material={m.fabricWarm} />
        <Box position={[-0.36, 0.55, 0]} size={[0.12, 0.25, 0.8]} material={m.fabricWarm} />
        <Box position={[0.36, 0.55, 0]} size={[0.12, 0.25, 0.8]} material={m.fabricWarm} />
        <Chair id="cabin-armchair" position={[0, 0.48, -0.02]} exit={{ forward: 0.7 }} />
      </group>
    </group>
  )
}
