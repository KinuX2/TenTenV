// ポータルホール: 親サーバーの人気のワールドを並べる。くぐるか押すと移動する
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { useCallback, useEffect, useState } from 'react'
import { PortalGate, TextPlane, useNavigation, useWorldEnv, type WorldSummary } from '@tentenv/sdk'
import { mats } from './materials'
import { Box, Button, Cyl } from './ui'

const CENTER: [number, number] = [14.6, 0]
const RADIUS = 6
const MAX = 8

type Load = { kind: 'loading' } | { kind: 'ok'; worlds: WorldSummary[] } | { kind: 'error'; message: string }

export const PortalHall: React.FC = () => {
  const m = mats()
  const nav = useNavigation()
  const env = useWorldEnv()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [rev, setRev] = useState(0)
  const refresh = useCallback(() => setRev((r) => r + 1), [])
  useEffect(() => {
    let alive = true
    setLoad({ kind: 'loading' })
    nav
      .listWorlds({ sort: 'popular', limit: MAX + 1 })
      .then((list) => {
        if (!alive) return
        setLoad({ kind: 'ok', worlds: list.filter((w) => w.id !== env.worldId).slice(0, MAX) })
      })
      .catch((e: unknown) => {
        if (alive) setLoad({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      alive = false
    }
  }, [nav, env.worldId, rev])

  const worlds = load.kind === 'ok' ? load.worlds : []
  // 弧の上に等間隔で並べる（中心から外を向いて立ち、正面は中心のほう）
  const span = Math.min(150, Math.max(0, worlds.length - 1) * 21) * (Math.PI / 180)
  const status =
    load.kind === 'loading'
      ? '読み込み中…'
      : load.kind === 'error'
        ? `ワールドの一覧を読み込めませんでした\n${load.message.slice(0, 80)}`
        : worlds.length === 0
          ? 'ほかのワールドはまだありません\n（開発用の実行環境では一覧は空になります）'
          : `人気のワールド ${worlds.length} 件 — ゲートをくぐると移動します`
  return (
    <group>
      {/* 床の輪 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTER[0], 0.034, CENTER[1]]} receiveShadow>
        <ringGeometry args={[RADIUS - 0.25, RADIUS + 0.25, 64]} />
        <meshStandardMaterial color="#6d7fd6" emissive="#3b4fb0" emissiveIntensity={0.5} roughness={0.6} />
      </mesh>
      {/* 中央の案内台と更新ボタン */}
      <group position={[CENTER[0] - RADIUS + 0.6, 0, -2.6]} rotation={[0, -1.0, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <CylinderCollider args={[0.5, 0.45]} position={[0, 0.5, 0]} />
        </RigidBody>
        <Cyl position={[0, 0.5, 0]} size={[0.8, 1.0, 0.8]} material={m.marble} />
        <group position={[0, 1.15, 0]}>
          <Box position={[0, 0, -0.03]} size={[1.3, 0.5, 0.04]} material={m.panel} shadow={false} />
          <TextPlane text="ポータル Portals" width={1.2} lineHeight={0.08} bold position={[0, 0.17, 0.002]} padding={0.002} />
          <TextPlane text={status} width={1.22} lineHeight={0.045} color="#c7d0e0" position={[0, 0.06, 0.002]} padding={0.002} maxLines={3} />
          <Button label="一覧を更新" sub="Refresh" width={0.5} position={[0, -0.13, 0.02]} active={load.kind === 'loading'} onClick={refresh} />
        </group>
      </group>
      {/* 上の看板（東の奥） */}
      <TextPlane text="ポータルホール  PORTAL HALL" width={4.4} lineHeight={0.3} bold color="#ffffff" background="#2b3a7acc" radius={0.08} position={[CENTER[0] + RADIUS + 1.6, 4.4, 0]} rotation={[0, -Math.PI / 2, 0]} />
      {worlds.map((w, i) => {
        const a = worlds.length === 1 ? 0 : -span / 2 + (span * i) / (worlds.length - 1)
        const x = CENTER[0] + Math.cos(a) * RADIUS
        const z = CENTER[1] + Math.sin(a) * RADIUS
        // ゲートの正面（+Z）を中心へ向ける
        const yaw = Math.atan2(CENTER[0] - x, CENTER[1] - z)
        return (
          <group key={w.id} position={[x, 0, z]} rotation={[0, yaw, 0]}>
            <PortalGate worldId={w.id} />
            <Cyl position={[0, 0.06, 0]} size={[2.2, 0.12, 2.2]} material={m.marble} shadow={false} />
            <TextPlane
              text={`${w.occupants > 0 ? `${w.occupants} 人がプレイ中` : 'だれもいません'}  ·  お気に入り ${w.favoriteCount}`}
              width={2}
              lineHeight={0.075}
              color="#e6ebf5"
              background="#000000aa"
              position={[0, 0.25, 0.3]}
              rotation={[-0.5, 0, 0]}
            />
          </group>
        )
      })}
    </group>
  )
}
