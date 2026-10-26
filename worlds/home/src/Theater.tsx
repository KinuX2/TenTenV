// シアター: みんなで同じ動画を見る（再生・停止・シークは同期）。ベンチに座れる
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Chair, MediaScreen, TextPlane } from '@tentenv/sdk'
import { mats } from './materials'
import { Board, Box, type V3 } from './ui'

const WALL_Z = -19.6
const SCREEN_W = 7

/** 3 人掛けのベンチ。-Z（スクリーン）を向く */
export const Bench: React.FC<{ id: string; position: V3; rotationY?: number; seats?: number; material?: 'wood' | 'fabric' }> = ({ id, position, rotationY = 0, seats = 3, material = 'wood' }) => {
  const m = mats()
  const w = seats * 0.62
  const top = material === 'wood' ? m.wood : m.fabricWarm
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, 0.22, 0.25]} position={[0, 0.22, 0]} />
      </RigidBody>
      <Box position={[0, 0.42, 0]} size={[w, 0.08, 0.5]} material={top} />
      <Box position={[0, 0.72, 0.24]} size={[w, 0.45, 0.06]} material={top} />
      <Box position={[-w / 2 + 0.08, 0.2, 0]} size={[0.08, 0.4, 0.44]} material={m.woodDark} />
      <Box position={[w / 2 - 0.08, 0.2, 0]} size={[0.08, 0.4, 0.44]} material={m.woodDark} />
      {Array.from({ length: seats }, (_, i) => (
        <Chair key={i} id={`${id}-${i}`} position={[(i - (seats - 1) / 2) * 0.62, 0.47, 0.02]} exit={{ forward: 0.6 }} />
      ))}
    </group>
  )
}

export const Theater: React.FC = () => {
  const m = mats()
  const sh = SCREEN_W * (9 / 16)
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[7, 3.2, 0.3]} position={[0, 3.2, WALL_Z - 0.3]} />
      </RigidBody>
      {/* 壁・屋根のひさし・床 */}
      <Box position={[0, 3.2, WALL_Z - 0.3]} size={[14, 6.4, 0.6]} material={m.plaster} />
      <Box position={[0, 6.5, WALL_Z + 0.2]} size={[14.6, 0.3, 1.6]} material={m.roofTeal} />
      <Box position={[-7.15, 3.2, WALL_Z - 0.1]} size={[0.5, 6.4, 1.0]} material={m.roofTeal} />
      <Box position={[7.15, 3.2, WALL_Z - 0.1]} size={[0.5, 6.4, 1.0]} material={m.roofTeal} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.032, WALL_Z + 4.6]} material={m.woodFloor} receiveShadow>
        <planeGeometry args={[13.4, 9]} />
      </mesh>
      {/* スクリーンの枠と画面 */}
      <Box position={[0, 3.25, WALL_Z + 0.04]} size={[SCREEN_W + 0.3, sh + 0.3, 0.08]} material={m.screenFrame} />
      <MediaScreen id="theater" width={SCREEN_W} position={[0, 3.25, WALL_Z + 0.1]} range={24} />
      <TextPlane text="シアター  THEATER" width={6} lineHeight={0.42} bold color="#2b3445" position={[0, 5.75, WALL_Z + 0.01]} padding={0.01} />
      {/* スピーカー（飾り） */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 5.2, 0, WALL_Z + 0.45]}>
          <Box position={[0, 0.9, 0]} size={[0.8, 1.8, 0.6]} material={m.screenFrame} />
          <mesh position={[0, 1.25, 0.31]} material={m.metal}>
            <circleGeometry args={[0.26, 24]} />
          </mesh>
          <mesh position={[0, 0.6, 0.31]} material={m.metal}>
            <circleGeometry args={[0.18, 20]} />
          </mesh>
        </group>
      ))}
      <Board
        title="動画の見かた"
        sub="How to play a video"
        width={2.5}
        legs={false}
        base={2.0}
        lineHeight={0.082}
        accent="#e0566b"
        position={[-5.35, 0, WALL_Z + 0.02]}
        body={
          '画面の下の「URL」を押して、動画のアドレスを入れてください。\n' +
          '・使えるのは mp4 / webm / m3u8 の直接の URL だけです\n' +
          '・配信元が CORS に対応している必要があります\n' +
          '・YouTube などのページの URL は再生できません\n' +
          '再生・停止・シークはここにいる全員で同期されます。音量はあなただけの設定です。'
        }
      />
      {/* ベンチ 2 列 × 2 */}
      <Bench id="theater-a" position={[-2.1, 0, -12.6]} />
      <Bench id="theater-b" position={[2.1, 0, -12.6]} />
      <Bench id="theater-c" position={[-2.1, 0, -10.9]} />
      <Bench id="theater-d" position={[2.1, 0, -10.9]} />
    </group>
  )
}
