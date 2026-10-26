// 頭上に一時的に表示するリアクション
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Mesh } from 'three'
import { REACTION_ART } from '../ui/icons'
import { reactionTexture } from '../ui/iconTextures'
import type { WorldEngine } from '../world/engine'

const emojiTexture = (id: string) => reactionTexture(id)

interface Burst {
  id: number
  e: string
  from: string
  at: number
}
let burstId = 0

/** 自分の頭の上にリアクションの図柄を出す（全員へ） */
export const sendEmoji = (engine: WorldEngine, id: string) => engine.session.emit('sys.emoji', { e: id.slice(0, 24) }, 'all')

export const Reactions: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const [bursts, setBursts] = useState<Burst[]>([])
  useEffect(
    () =>
      engine.session.on('sys.emoji', (p, from) => {
        const e = (p as { e?: unknown })?.e
        if (typeof e !== 'string' || !REACTION_ART[e]) return
        setBursts((b) => [...b.slice(-12), { id: ++burstId, e, from, at: performance.now() }])
      }),
    [engine],
  )
  useEffect(() => {
    if (!bursts.length) return
    const t = setTimeout(() => setBursts((b) => b.filter((x) => performance.now() - x.at < 3000)), 500)
    return () => clearTimeout(t)
  }, [bursts])
  return (
    <>
      {bursts.map((b) => (
        <EmojiBurst key={b.id} engine={engine} burst={b} />
      ))}
    </>
  )
}

const EmojiBurst: React.FC<{ engine: WorldEngine; burst: Burst }> = ({ engine, burst }) => {
  const ref = useRef<Mesh>(null)
  const dx = useMemo(() => (Math.random() - 0.5) * 0.3, [])
  useFrame(({ camera }) => {
    const m = ref.current
    if (!m) return
    const pose = burst.from === engine.session.selfId ? engine.localPose() : engine.remotePoses.get(burst.from)
    if (!pose) return
    const t = (performance.now() - burst.at) / 3000
    m.position.set(pose.head[0] + dx, pose.head[1] + 0.35 + t * 0.6, pose.head[2])
    m.quaternion.copy(camera.quaternion)
    const mat = m.material as { opacity: number }
    mat.opacity = Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4)
    m.scale.setScalar(0.25 + Math.min(0.1, t * 0.4))
  })
  return (
    <mesh ref={ref}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={emojiTexture(burst.e)} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
