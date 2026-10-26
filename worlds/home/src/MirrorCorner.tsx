// 鏡のコーナー。画質・オン／オフ・アバターだけ映す、はその人だけの設定（同期しない）
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useState } from 'react'
import { MirrorSurface, TextPlane } from '@tentenv/sdk'
import { mats } from './materials'
import { Box, Button } from './ui'

type Mode = 'high' | 'low' | 'off'

const MW = 4.4
const MH = 2.7

export const MirrorCorner: React.FC = () => {
  const m = mats()
  // 鏡は重いので最初はオフ。設定は自分の画面だけに効く
  const [mode, setMode] = useState<Mode>('off')
  const [avatarOnly, setAvatarOnly] = useState(false)
  return (
    <group position={[-17.4, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[3.9, 1.9, 0.2]} position={[0, 1.9, -0.2]} />
      </RigidBody>
      {/* 壁と枠 */}
      <Box position={[0, 1.9, -0.2]} size={[7.8, 3.8, 0.4]} material={m.plaster} />
      <Box position={[0, 3.85, -0.15]} size={[8.0, 0.18, 0.55]} material={m.roofTeal} />
      <Box position={[-0.9, 1.6, 0.0]} size={[MW + 0.24, MH + 0.24, 0.06]} material={m.woodDark} />
      {mode === 'off' ? (
        <group position={[-0.9, 1.6, 0.035]}>
          <mesh>
            <planeGeometry args={[MW, MH]} />
            <meshStandardMaterial color="#2c3440" roughness={0.15} metalness={0.6} />
          </mesh>
          <TextPlane text={'鏡はオフです\n右のボタンでオンにできます'} width={2.4} lineHeight={0.12} color="#c9d3e3" position={[0, 0, 0.002]} />
        </group>
      ) : (
        <MirrorSurface key={`${mode}-${avatarOnly}`} width={MW} height={MH} position={[-0.9, 1.6, 0.035]} quality={mode === 'high' ? 1 : 0.4} showWorld={!avatarOnly} />
      )}
      {/* 操作パネル */}
      <group position={[2.65, -0.75, 0.02]} scale={1.4}>
        <Box position={[0, 1.55, -0.01]} size={[1.25, 1.7, 0.03]} material={m.panel} shadow={false} />
        <TextPlane text="鏡 Mirror" width={1.1} lineHeight={0.11} bold position={[0, 2.25, 0.01]} padding={0.005} />
        <Button label="高画質" sub="High" width={0.34} active={mode === 'high'} position={[-0.38, 1.98, 0.03]} onClick={() => setMode('high')} hint="鏡: 高画質" />
        <Button label="低画質" sub="Low" width={0.34} active={mode === 'low'} position={[0, 1.98, 0.03]} onClick={() => setMode('low')} hint="鏡: 低画質" />
        <Button label="オフ" sub="Off" width={0.34} active={mode === 'off'} color="#7a8599" position={[0.38, 1.98, 0.03]} onClick={() => setMode('off')} hint="鏡: オフ" />
        <Button
          label={avatarOnly ? 'アバターのみ: ON' : 'アバターのみ: OFF'}
          sub="Avatars only"
          width={1.06}
          active={avatarOnly}
          color="#1fa37a"
          position={[0, 1.7, 0.03]}
          onClick={() => setAvatarOnly((v) => !v)}
        />
        <TextPlane
          text={'この設定はあなたの画面だけに効きます。\n重いときは「低画質」か「オフ」に。'}
          width={1.12}
          lineHeight={0.052}
          color="#c7d0e0"
          align="left"
          position={[0, 1.2, 0.01]}
          padding={0.01}
        />
      </group>
      {/* 足元のじゅうたん */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.9, 0.035, 2.0]} material={m.rug} receiveShadow>
        <planeGeometry args={[5, 3.4]} />
      </mesh>
    </group>
  )
}
