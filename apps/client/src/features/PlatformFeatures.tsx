// どのワールドでも使える機能をまとめて置く
import { useFrame, useThree } from '@react-three/fiber'
import { LAYERS, MirrorSurface, TextPlane } from '@tentenv/sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DoubleSide, Group, Mesh, Quaternion, RingGeometry, ShaderMaterial, Vector3 } from 'three'
import { xrInput } from '../player/xrInput'
import { qualityProfile, settings, useSettings } from '../state/settings'
import type { WorldEngine } from '../world/engine'
import { Reactions } from './Reactions'
import { useTools } from './tools'
import { FaceMirror } from './FaceMirror'

export const PlatformFeatures: React.FC<{ engine: WorldEngine }> = ({ engine }) => (
  <>
    <Reactions engine={engine} />
    <FaceMirror engine={engine} />
    <PersonalMirror engine={engine} />
    <ComfortVignette engine={engine} />
  </>
)

/**
 * パーソナルミラー: 呼び出した場所の目の前に出る自分用の鏡（ほかの人には見えない）
 * 下の取っ手を押すと持ち、もう一度押すと置く。持っている間は、PC・スマホは視点に、VR は押した手に付いて動く
 */
const PersonalMirror: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const on = useTools((t) => t.mirror)
  const world = useTools((t) => t.mirrorWorld)
  const q = useSettings((s) => s.s.quality)
  const camera = useThree((s) => s.camera)
  const group = useRef<Group>(null)
  const handle = useRef<Group>(null)
  const was = useRef(false)
  const [held, setHeld] = useState<null | { hand: 'left' | 'right' | 'none'; p: Vector3; q: Quaternion }>(null)
  const heldRef = useRef(held)
  heldRef.current = held
  const h = Math.max(1.6, engine.player.height * 1.2)
  const w = h * 0.75

  /** 持っている手（または視点）の位置と向き */
  const anchor = (hand: 'left' | 'right' | 'none') => {
    if (hand !== 'none' && engine.player.vr) {
      const x = xrInput[hand]
      return { p: x.gripP.clone(), q: x.gripQ.clone() }
    }
    return { p: camera.getWorldPosition(new Vector3()), q: camera.getWorldQuaternion(new Quaternion()) }
  }

  useFrame(() => {
    const g = group.current
    if (!g) return
    if (on && !was.current) {
      // 呼び出したら目の前へ
      const p = engine.player
      const fwd = new Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw))
      const at = p.position.clone().addScaledVector(fwd, 1.4)
      g.position.set(at.x, p.position.y + p.height * 0.55, at.z)
      g.rotation.set(0, p.yaw, 0)
      setHeld(null)
    }
    was.current = on
    // VR: 取っ手の近くでグリップを握ると持つ
    if (on && !heldRef.current && engine.player.vr && handle.current) {
      const hp = handle.current.getWorldPosition(new Vector3())
      for (const hand of ['left', 'right'] as const) {
        const x = xrInput[hand]
        if (x.connected && x.squeezeDown && x.gripP.distanceTo(hp) < 0.25) {
          const a = anchor(hand)
          const inv = a.q.clone().invert()
          setHeld({ hand, p: g.position.clone().sub(a.p).applyQuaternion(inv), q: inv.multiply(g.quaternion.clone()) })
          break
        }
      }
    }
    const hd = heldRef.current
    if (on && hd) {
      // 持っている: つかんだときの相対位置を保つ
      const a = anchor(hd.hand)
      g.position.copy(hd.p).applyQuaternion(a.q).add(a.p)
      g.quaternion.copy(a.q).multiply(hd.q)
      // VR はグリップを離したら置く
      if (hd.hand !== 'none' && xrInput[hd.hand].squeezeUp) setHeld(null)
    }
  })

  // 取っ手を押す: 持つ・置く
  useEffect(() => {
    const hdl = handle.current
    if (!on || !hdl) return
    return engine.runtime.interact(hdl, () => ({
      label: heldRef.current ? '鏡を置く' : '鏡を持つ',
      reach: 4,
      onClick: (e) => {
        const g = group.current
        if (!g) return
        if (heldRef.current) {
          setHeld(null)
          return
        }
        const a = anchor(e.hand)
        const inv = a.q.clone().invert()
        setHeld({ hand: e.hand, p: g.position.clone().sub(a.p).applyQuaternion(inv), q: inv.multiply(g.quaternion.clone()) })
      },
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, engine])

  if (!on) return null
  return (
    <group ref={group}>
      <MirrorSurface width={w} height={h} quality={qualityProfile(q).mirrorScale} showWorld={world} />
      {/* 枠と取っ手 */}
      <mesh position={[0, 0, -0.012]} layers={LAYERS.NO_MIRROR}>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.02]} />
        <meshStandardMaterial color="#1b1e27" roughness={0.5} />
      </mesh>
      <group ref={handle} position={[0, -h / 2 - 0.09, 0]}>
        <mesh layers={LAYERS.NO_MIRROR}>
          <boxGeometry args={[0.34, 0.1, 0.05]} />
          <meshStandardMaterial color={held ? '#3b6df0' : '#2a2f40'} emissive={held ? '#1d3a99' : '#000000'} />
        </mesh>
        <TextPlane text={held ? '押して置く' : '押して持つ'} width={0.32} lineHeight={0.045} position={[0, 0, 0.027]} />
      </group>
    </group>
  )
}

/** 移動・旋回の間、視界の端を暗くする（[200] VR 酔い対策） */
const ComfortVignette: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const camera = useThree((s) => s.camera)
  const ref = useRef<Mesh>(null)
  const holder = useRef<Group>(null)
  const amount = useRef(0)
  const lastYaw = useRef(0)
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { strength: { value: 0 } },
        vertexShader: 'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform float strength; varying float vR; void main(){ float a = smoothstep(0.35, 0.75, vR) * strength; gl_FragColor = vec4(0.0,0.0,0.0,a); }',
      }),
    [],
  )
  const geo = useMemo(() => new RingGeometry(0.35, 1.2, 48, 1), [])
  useFrame((_, dt) => {
    const p = engine.player
    const v = settings().vignette
    const turning = Math.abs(p.yaw - lastYaw.current) / Math.max(dt, 0.001)
    lastYaw.current = p.yaw
    const moving = p.vr && (p.speed > 0.3 || turning > 0.6) ? 1 : 0
    amount.current += (moving * v - amount.current) * (1 - Math.exp(-dt * 8))
    mat.uniforms.strength.value = amount.current
    if (holder.current) {
      holder.current.visible = amount.current > 0.02
      holder.current.position.copy(camera.getWorldPosition(new Vector3()))
      holder.current.quaternion.copy(camera.getWorldQuaternion(holder.current.quaternion))
    }
  })
  return (
    <group ref={holder}>
      <mesh ref={ref} geometry={geo} material={mat} position={[0, 0, -0.3]} renderOrder={999} layers={LAYERS.NO_MIRROR} />
    </group>
  )
}
