// フェイスミラー: 自分の顔を正面から映す小さな鏡を、視界の右下に出す（表情・口の動きの確認用）
// 自分にだけ見え、鏡やカメラには映らない
import { useFrame, useThree } from '@react-three/fiber'
import { LAYERS } from '@tentenv/sdk'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, Group, PerspectiveCamera, Quaternion, SRGBColorSpace, Vector3, WebGLRenderTarget, type PerspectiveCamera as PCam } from 'three'
import type { WorldEngine } from '../world/engine'
import { useTools } from './tools'

const RES = 512

export const FaceMirror: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const on = useTools((t) => t.faceMirror)
  const size = useTools((t) => t.faceMirrorSize)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const mainCam = useThree((s) => s.camera) as PCam
  const holder = useRef<Group>(null)
  const cam = useMemo(() => {
    const c = new PerspectiveCamera(30, 1, 0.05, 50)
    c.layers.disableAll()
    c.layers.enable(LAYERS.DEFAULT)
    c.layers.enable(LAYERS.AVATAR)
    c.layers.enable(LAYERS.THIRD_PERSON_ONLY)
    return c
  }, [])
  const rt = useMemo(() => {
    const r = new WebGLRenderTarget(RES, RES, { samples: 4 })
    r.texture.colorSpace = SRGBColorSpace
    return r
  }, [])
  useEffect(() => () => rt.dispose(), [rt])
  const frame = useRef(0)

  useFrame(() => {
    const g = holder.current
    if (!on || !g) return
    const p = engine.player
    // 顔の正面から、顔を見る（体の向きの水平成分を使い、上下は少しだけ）
    const yaw = p.vr ? new Euler().setFromQuaternion(p.head.q, 'YXZ').y : p.yaw
    const fwd = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const scale = Math.max(0.3, p.eyeHeight / 1.6)
    const head = p.head.p.clone().add(new Vector3(0, 0.02 * scale, 0))
    cam.position.copy(head).addScaledVector(fwd, 0.55 * scale).add(new Vector3(0, 0.03 * scale, 0))
    cam.lookAt(head)
    cam.near = 0.05 * scale
    cam.updateMatrixWorld()
    // 毎フレームは重いので、2 フレームに 1 回描く
    if (frame.current++ % 2 === 0) {
      const xr = gl.xr.enabled
      const prev = gl.getRenderTarget()
      gl.xr.enabled = false
      g.visible = false
      gl.setRenderTarget(rt)
      gl.render(scene, cam)
      gl.setRenderTarget(prev)
      gl.xr.enabled = xr
      g.visible = true
    }
    // 視界の右下に置く（VR では XR のカメラ、PC・スマホでは画面のカメラ）
    const view = gl.xr.isPresenting ? gl.xr.getCamera() : mainCam
    view.updateMatrixWorld()
    const dist = 0.5
    const fov = gl.xr.isPresenting ? 90 : mainCam.fov
    const halfH = Math.tan(((fov * Math.PI) / 180) / 2) * dist
    const aspect = gl.xr.isPresenting ? 1 : mainCam.aspect
    const w = size * halfH * 2 * 0.28
    const local = new Vector3(halfH * aspect - w / 2 - halfH * 0.06, -halfH + w / 2 + halfH * 0.08, -dist)
    if (gl.xr.isPresenting) local.set(0.11, -0.1, -dist)
    g.position.copy(local.applyMatrix4(view.matrixWorld))
    g.quaternion.copy(view.getWorldQuaternion(new Quaternion()))
    g.scale.setScalar(w)
  })

  if (!on) return null
  return (
    <group ref={holder}>
      <mesh renderOrder={1000} layers={LAYERS.NO_MIRROR}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={rt.texture} toneMapped={false} depthTest={false} depthWrite={false} transparent />
      </mesh>
      <mesh renderOrder={999} layers={LAYERS.NO_MIRROR} position={[0, 0, -0.001]}>
        <planeGeometry args={[1.05, 1.05]} />
        <meshBasicMaterial color="#0b0e16" toneMapped={false} depthTest={false} depthWrite={false} transparent opacity={0.85} />
      </mesh>
    </group>
  )
}
