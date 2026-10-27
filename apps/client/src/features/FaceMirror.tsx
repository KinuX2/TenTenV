// フェイスミラー: 自分の顔を正面から映す透明なプレビューを視界に固定する
// 自分にだけ見え、鏡やカメラには映らない
import { useFrame, useThree } from '@react-three/fiber'
import { LAYERS } from '@tentenv/sdk'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DataTexture, DirectionalLight, Group, LinearFilter, MathUtils, PerspectiveCamera, Quaternion, RGBAFormat, SRGBColorSpace, Vector3, WebGLRenderTarget, type PerspectiveCamera as PCam } from 'three'
import type { WorldEngine } from '../world/engine'
import { useTools } from './tools'

const RES = 512

export const FaceMirror: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const on = useTools((t) => t.faceMirror)
  const options = useTools()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const mainCam = useThree((s) => s.camera) as PCam
  const holder = useRef<Group>(null)
  const cam = useMemo(() => {
    const c = new PerspectiveCamera(30, 1, 0.05, 50)
    c.layers.set(LAYERS.FACE_MIRROR)
    return c
  }, [])
  const light = useMemo(() => {
    const l = new DirectionalLight(0xffffff, 2)
    l.layers.set(LAYERS.FACE_MIRROR)
    l.userData.ttvFallback = true
    return l
  }, [])
  useEffect(() => {
    scene.add(light, light.target)
    return () => {
      scene.remove(light, light.target)
      light.dispose()
    }
  }, [scene, light])
  const rt = useMemo(() => {
    const r = new WebGLRenderTarget(RES, RES, { samples: 4 })
    r.texture.colorSpace = SRGBColorSpace
    return r
  }, [])
  useEffect(() => () => rt.dispose(), [rt])
  const edgeMask = useMemo(() => {
    const side = 64
    const data = new Uint8Array(side * side * 4)
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const edge = Math.min(x, y, side - 1 - x, side - 1 - y) / (side * 0.12)
      const t = Math.min(1, Math.max(0, edge))
      const i = (y * side + x) * 4
      data[i] = 255
      data[i + 1] = Math.round(255 * t * t * (3 - 2 * t))
      data[i + 2] = 255
      data[i + 3] = 255
    }
    const texture = new DataTexture(data, side, side, RGBAFormat)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.needsUpdate = true
    return texture
  }, [])
  useEffect(() => () => edgeMask.dispose(), [edgeMask])
  const frame = useRef(0)

  useFrame(() => {
    const g = holder.current
    if (!on || !g) return
    const p = engine.player
    // 撮影カメラをヘッドの前へ置き、上下・傾きも含めて追従させる。
    const fwd = new Vector3(0, 0, -1).applyQuaternion(p.head.q)
    const up = new Vector3(0, 1, 0).applyQuaternion(p.head.q)
    const scale = Math.max(0.3, engine.avatarRef.scale)
    const model = engine.localAvatarModel
    const leftEye = model?.bones.leftEye
    const rightEye = model?.bones.rightEye
    const headBone = model?.bones.head
    // 視点の座標は頭を傾けても動かない。実際に動いた目の位置から顔の中心を求める。
    const head = leftEye && rightEye
      ? leftEye.getWorldPosition(new Vector3()).add(rightEye.getWorldPosition(new Vector3())).multiplyScalar(0.5)
      : headBone && model
        ? headBone.localToWorld(new Vector3(...model.eyeOffset))
        : p.head.p.clone()
    head.addScaledVector(up, (options.faceMirrorCaptureY - 0.04) * scale)
    cam.position.copy(head).addScaledVector(fwd, 0.55 * scale).addScaledVector(up, 0.03 * scale)
    light.position.copy(head).addScaledVector(fwd, 2).addScaledVector(up, 2)
    light.target.position.copy(head)
    light.target.updateMatrixWorld()
    cam.up.copy(up)
    cam.lookAt(head)
    cam.fov = 60 * options.faceMirrorCaptureScale
    cam.near = 0.01 * scale
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    // 毎フレームは重いので、2 フレームに 1 回描く
    if (frame.current++ % 2 === 0) {
      const xr = gl.xr.enabled
      const prev = gl.getRenderTarget()
      const background = scene.background
      const clear = gl.getClearColor(new Color()).clone()
      const alpha = gl.getClearAlpha()
      try {
        gl.xr.enabled = false
        scene.background = null
        gl.setRenderTarget(rt)
        gl.setClearColor(0x000000, 0)
        gl.clear(true, true, true)
        gl.render(scene, cam)
      } finally {
        gl.setRenderTarget(prev)
        gl.setClearColor(clear, alpha)
        scene.background = background
        gl.xr.enabled = xr
      }
    }
    // 頭の正面に固定する。デスクトップでは表示カメラに合わせる。
    const vr = gl.xr.isPresenting
    const dist = vr ? 0.65 : 0.5
    const fov = gl.xr.isPresenting ? 90 : mainCam.fov
    const halfH = Math.tan(((fov * Math.PI) / 180) / 2) * dist
    const halfW = halfH * (vr ? 1 : mainCam.aspect)
    const w = (vr ? options.faceMirrorVrSize : options.faceMirrorSize) * halfH * 2
    const anchor = vr ? options.faceMirrorAnchor : options.faceMirrorDesktopAnchor
    const ax = anchor.startsWith('left') ? -1 : anchor.startsWith('right') ? 1 : 0
    const ay = anchor.endsWith('Top') ? 1 : anchor.endsWith('Bottom') ? -1 : 0
    const inset = vr ? 0 : halfH * 0.04
    const local = new Vector3(ax * (halfW - w / 2 - inset) + (vr ? options.faceMirrorVrX : options.faceMirrorDesktopX) * halfH, ay * (halfH - w / 2 - inset) + (vr ? options.faceMirrorVrY : options.faceMirrorDesktopY) * halfH, -dist)
    if (vr) {
      g.position.copy(local.applyQuaternion(p.head.q)).add(p.head.p)
      g.quaternion.copy(p.head.q)
    } else {
      // 保存済みの位置補正が以前の基準で設定されていても、画面の外へ出さない。
      const maxX = Math.max(0, halfW - w / 2 - inset)
      const maxY = Math.max(0, halfH - w / 2 - inset)
      local.x = MathUtils.clamp(local.x, -maxX, maxX)
      local.y = MathUtils.clamp(local.y, -maxY, maxY)
      mainCam.updateMatrixWorld()
      g.position.copy(local.applyMatrix4(mainCam.matrixWorld))
      g.quaternion.copy(mainCam.getWorldQuaternion(new Quaternion()))
    }
    g.scale.setScalar(w)
  })

  if (!on) return null
  return (
    <group ref={holder}>
      <ambientLight layers={LAYERS.FACE_MIRROR} intensity={1.4} userData={{ ttvFallback: true }} />
      <mesh renderOrder={11000} layers={LAYERS.NO_MIRROR}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={rt.texture} alphaMap={edgeMask} toneMapped={false} depthTest={false} depthWrite={false} transparent opacity={options.faceMirrorOpacity} />
      </mesh>
    </group>
  )
}
