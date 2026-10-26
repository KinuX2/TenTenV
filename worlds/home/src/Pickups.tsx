// 持てる物のテーブル: ボール・コップ・箱は投げられる。たいまつは「使う」で灯り（全員に同期）、鐘は「使う」で全員に聞こえる
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import { MeshStandardMaterial } from 'three'
import { Pickup, TextPlane, useEmit, useNetEvent, useSyncedState, type PickupHandle } from '@tentenv/sdk'
import { makeBellBuffer, usePositionalSound } from './audio'
import { geos, mats } from './materials'
import { Box, Button, type V3 } from './ui'

const T: V3 = [11, 0, 11]
/** テーブルの正面（+Z）を広場へ向ける */
const YAW = Math.atan2(-1, -1)
const TOP = 0.82

/** テーブルの座標（左右・高さ・前後）→ ワールド座標 */
const at = (lx: number, ly: number, lz: number): V3 => {
  const c = Math.cos(YAW)
  const s = Math.sin(YAW)
  return [T[0] + lx * c + lz * s, ly, T[2] - lx * s + lz * c]
}

interface Item {
  id: string
  label: string
  pos: V3
  kind: 'ball' | 'cup' | 'box'
  color: string
}

const ITEMS: Item[] = [
  { id: 'ball-1', label: 'ボール', pos: at(-1.05, TOP + 0.12, 0.1), kind: 'ball', color: '#ff6b6b' },
  { id: 'ball-2', label: 'ボール', pos: at(-0.75, TOP + 0.12, -0.15), kind: 'ball', color: '#ffd93d' },
  { id: 'ball-3', label: 'ボール', pos: at(-0.45, TOP + 0.12, 0.12), kind: 'ball', color: '#6bcB77' },
  { id: 'cup-1', label: 'コップ', pos: at(-0.1, TOP + 0.07, 0.1), kind: 'cup', color: '#f2f2f2' },
  { id: 'cup-2', label: 'コップ', pos: at(0.15, TOP + 0.07, -0.12), kind: 'cup', color: '#7fb2ff' },
  { id: 'box-1', label: '箱', pos: at(0.45, TOP + 0.11, 0.08), kind: 'box', color: '#ff7eb6' },
  { id: 'box-2', label: '箱', pos: at(0.72, TOP + 0.11, -0.16), kind: 'box', color: '#b495f0' },
]
const TORCH_POS = at(1.0, TOP + 0.04, 0.12)
const BELL_POS = at(1.2, TOP + 0.09, -0.15)

const Thing: React.FC<{ kind: Item['kind']; color: string }> = ({ kind, color }) => {
  const mat = useMemo(() => new MeshStandardMaterial({ color, roughness: kind === 'cup' ? 0.3 : 0.55 }), [color, kind])
  if (kind === 'ball') return <mesh geometry={geos().sphere} material={mat} scale={0.22} castShadow />
  if (kind === 'box') return <mesh geometry={geos().box} material={mat} scale={0.2} castShadow />
  return (
    <group>
      <mesh material={mat} castShadow>
        <cylinderGeometry args={[0.05, 0.04, 0.12, 16, 1, true]} />
      </mesh>
      <mesh material={mat} position={[0, -0.058, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.04, 16]} />
      </mesh>
      <mesh material={mat} position={[0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.03, 0.008, 6, 12, Math.PI]} />
      </mesh>
    </group>
  )
}

/** たいまつ。持って「使う」と火が点く・消える（全員に同期） */
const Torch = ({ handle }: { handle: React.RefObject<PickupHandle | null> }) => {
  const m = mats()
  const [lit, setLit] = useSyncedState('torch:lit', false)
  return (
    <Pickup ref={handle} id="torch" label={lit ? 'たいまつ（使う: 消す）' : 'たいまつ（使う: 点ける）'} position={TORCH_POS} rotation={[0, YAW, Math.PI / 2]} orientation="grip" onUse={() => setLit(!lit)}>
      <mesh material={m.woodDark} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 0.42, 10]} />
      </mesh>
      <mesh material={m.metal} position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.05, 0.035, 0.07, 12]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} visible={lit}>
        <coneGeometry args={[0.045, 0.14, 10]} />
        <meshStandardMaterial color="#ffd27a" emissive="#ff8a1f" emissiveIntensity={3} />
      </mesh>
      <pointLight position={[0, 0.38, 0]} intensity={lit ? 5 : 0} distance={7} decay={2} color="#ffb060" />
    </Pickup>
  )
}

/** 鐘。持って「使う」と全員の耳に（鐘のある場所から）聞こえる */
const Bell = ({ handle }: { handle: React.RefObject<PickupHandle | null> }) => {
  const m = mats()
  const emit = useEmit()
  const sound = usePositionalSound({ make: (c) => makeBellBuffer(c), volume: 0.6, refDistance: 3, maxDistance: 40 })
  const swing = useRef(0)
  useNetEvent('bell', () => {
    swing.current = performance.now()
    sound.play()
  })
  return (
    <Pickup ref={handle} id="bell" label="鐘（使う: 鳴らす）" position={BELL_POS} orientation="grip" onUse={() => emit('bell', null, 'all')}>
      <mesh material={m.woodDark} position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.12, 8]} />
      </mesh>
      <mesh material={m.brass} position={[0, -0.01, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.08, 0.12, 20, 1, true]} />
      </mesh>
      <mesh material={m.brass} position={[0, -0.07, 0]} geometry={geos().sphere} scale={0.03} />
      <primitive object={sound.audio} />
    </Pickup>
  )
}

export const PickupTable: React.FC = () => {
  const m = mats()
  const handles = useRef<Record<string, PickupHandle | null>>({})
  const torch = useRef<PickupHandle | null>(null)
  const bell = useRef<PickupHandle | null>(null)
  const resetAll = () => {
    for (const it of ITEMS) {
      const h = handles.current[it.id]
      if (h && !h.holder()) h.reset(it.pos)
    }
    if (torch.current && !torch.current.holder()) torch.current.reset(TORCH_POS)
    if (bell.current && !bell.current.holder()) bell.current.reset(BELL_POS)
  }
  return (
    <>
      <group position={T} rotation={[0, YAW, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[1.5, TOP / 2, 0.45]} position={[0, TOP / 2, 0]} />
        </RigidBody>
        <Box position={[0, TOP - 0.04, 0]} size={[3.0, 0.08, 0.9]} material={m.wood} />
        {[-1.35, 1.35].map((x) => (
          <Box key={x} position={[x, (TOP - 0.08) / 2, 0]} size={[0.1, TOP - 0.08, 0.8]} material={m.woodDark} />
        ))}
        <TextPlane
          text={'持てる物  Pickups\nクリック / グリップでつかむ・投げる。たいまつと鐘は持ったまま「使う」（PC: F・右クリック / VR: トリガー）'}
          width={2.9}
          lineHeight={0.07}
          color="#ffffff"
          background="#232838e6"
          position={[0, TOP - 0.2, 0.455]}
          padding={0.02}
        />
        <Button label="元に戻す" sub="Reset" width={0.5} position={[0, 1.55, -0.3]} onClick={resetAll} hint="テーブルの物を元の場所に戻す" />
        <Box position={[0, 1.2, -0.38]} size={[0.06, 0.8, 0.06]} material={m.woodDark} />
      </group>
      {ITEMS.map((it) => (
        <Pickup key={it.id} id={it.id} label={it.label} position={it.pos} ref={(h) => void (handles.current[it.id] = h)}>
          <Thing kind={it.kind} color={it.color} />
        </Pickup>
      ))}
      <Torch handle={torch} />
      <Bell handle={bell} />
    </>
  )
}
