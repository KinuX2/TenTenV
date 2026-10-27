// ワールドの中のメニューを置く（画面: カメラの前いっぱい、VR: 目の前の空間）。中身は MenuPanel ひとつ
// VR では、メニューを出している間だけ @react-three/xr のレイ（コントローラー）と指先（ハンド）で押せるようにする
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { Container, Fullscreen } from '@react-three/uikit'
import { PointerRayModel, usePointerXRInputSourceEvents, useRayPointer, useTouchPointer, useXRInputSourceStateContext, XRSpace } from '@react-three/xr'
import type { Pointer } from '@pmndrs/pointer-events'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Euler, Group, Quaternion, Vector3, type Mesh, type MeshBasicMaterial } from 'three'
import { create } from 'zustand'
import type { WorldEngine } from '../../world/engine'
import { useDialogs } from '../bridge'
import { useMenu } from '../menuBus'
import { loadMenuFont } from './menuFont'
import { MenuPanel, PANEL_H, PANEL_W } from './MenuPanel'

/** VR でメニューの板を出しているか（レイを出す・押せるようにするのに使う） */
const useVrMenuShown = create<{ shown: boolean }>(() => ({ shown: false }))


export const WorldMenu: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const [fontOk, setFontOk] = useState(false)
  useEffect(() => {
    void loadMenuFont().then(
      () => setFontOk(true),
      (e) => console.warn('[menu] フォントを読めません', e),
    )
  }, [])
  const vr = useSyncExternalStore(
    (cb) => engine.runtime.onDeviceChange(cb),
    () => engine.player.vr,
    () => false,
  )
  if (!fontOk) return null
  return vr ? <VrPlacement engine={engine} /> : <ScreenPlacement engine={engine} />
}

const close = () => {
  useMenu.getState().setOpen(false)
  useMenu.getState().setGestures(false)
}

/** 画面: 横長の板を中央に置き、画面占有率を調整する。 */
const ScreenPlacement: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const open = useMenu((m) => m.open)
  const size = useThree((s) => s.size)
  if (!open) return null
  // 1080p で 0.86 倍。小さい画面でも同じ比率で一回り大きくし、画面内に収める。
  const scale = Math.min(0.86, size.height / 940, (size.width - 24) / PANEL_W, (size.height - 64) / PANEL_H)
  return (
    <Fullscreen distanceToCamera={0.1} depthTest={false} renderOrder={1000} alignItems="center" justifyContent="center" backgroundColor="#00000088">
      <Container transformScaleX={scale} transformScaleY={scale} flexShrink={0}>
        <MenuPanel engine={engine} vr={false} close={close} showDialogs={false} />
      </Container>
    </Fullscreen>
  )
}

/** VR: 開いたときに目の前 0.7m・目の高さより少し下に置く */
const VrPlacement: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const gl = useThree((s) => s.gl)
  const open = useMenu((m) => m.open)
  const gestures = useMenu((m) => m.gesturesOpen)
  const dialogs = useDialogs((d) => d.dialogs.length)
  const show = open || gestures || dialogs > 0
  const g = useRef<Group>(null)
  const placed = useRef(false)
  useEffect(() => {
    if (gestures) useMenu.getState().setPage('expressions')
  }, [gestures])
  useEffect(() => {
    if (!show) placed.current = false
    useVrMenuShown.setState({ shown: show })
    return () => useVrMenuShown.setState({ shown: false })
  }, [show])
  useFrame(() => {
    const grp = g.current
    if (!grp || !show || placed.current) return
    const p = engine.player
    const yaw = new Euler().setFromQuaternion(p.head.q, 'YXZ').y
    const fwd = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    grp.position.copy(p.head.p).addScaledVector(fwd, 0.7).add(new Vector3(0, -0.06, 0))
    grp.quaternion.copy(new Quaternion().setFromEuler(new Euler(-0.12, yaw, 0, 'YXZ')))
    grp.scale.setScalar(gl.xr.getCamera().parent?.scale.x ?? 1)
    placed.current = true
  })
  return (
    <group ref={g} visible={show}>
      {/* VR の板は従来の位置・向き・幅を保つ。 */}
      {show && (
        <Container pixelSize={0.85 / PANEL_W} anchorX="center" anchorY="center">
          <MenuPanel engine={engine} vr close={close} exitVR={() => void gl.xr.getSession()?.end()} showDialogs />
        </Container>
      )}
    </group>
  )
}

// ---------------------------------------------------------------- VR のレイ・指先

/** コントローラー: メニューを出している間だけ、レイで押せる（トリガー = select） */
export const MenuController: React.FC = () => {
  const state = useXRInputSourceStateContext('controller')
  const ref = useRef<Group>(null)
  const pointer = useRayPointer(ref, state, { minDistance: 0 })
  usePointerXRInputSourceEvents(pointer, state.inputSource, 'select', state.events)
  const shown = useVrMenuShown((s) => s.shown)
  useEffect(() => pointer.setEnabled(shown, { timeStamp: performance.now() } as never), [pointer, shown])
  return (
    <XRSpace ref={ref} space="target-ray-space">
      {shown && (
        <>
          <PointerRayModel pointer={pointer} color="#8ec5ff" opacity={0.85} renderOrder={10000} />
          <MenuCursor pointer={pointer} />
        </>
      )}
    </XRSpace>
  )
}

/** ハンドトラッキング: メニューを出している間だけ、指先で触れて押せる */
export const MenuHand: React.FC = () => {
  const state = useXRInputSourceStateContext('hand')
  const ref = useRef<Group>(null)
  const pointer = useTouchPointer(ref, state)
  const shown = useVrMenuShown((s) => s.shown)
  useEffect(() => pointer.setEnabled(shown, { timeStamp: performance.now() } as never), [pointer, shown])
  return (
    <XRSpace ref={ref} space={state.inputSource.hand.get('index-finger-tip')!}>
      {shown && <MenuCursor pointer={pointer} />}
    </XRSpace>
  )
}

// ---------------------------------------------------------------- ポインターの先（カーソル）

const Z = new Vector3(0, 0, 1)
const _q = new Quaternion()
const _off = new Vector3()

/**
 * レイ・指先が当たっている所に出す、くっきりした輪と点（既定のぼやけた白い丸の代わり）
 * 板より手前に描き、押している間は大きく・黄色にする
 */
const MenuCursor: React.FC<{ pointer: Pointer }> = ({ pointer }) => {
  const scene = useThree((s) => s.scene)
  const g = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const dot = useRef<Mesh>(null)
  useFrame(() => {
    const grp = g.current
    if (!grp) return
    const hit = pointer.getIntersection()
    if (!hit || !pointer.getEnabled() || (hit.object as { isVoidObject?: boolean }).isVoidObject) {
      grp.visible = false
      return
    }
    grp.visible = true
    grp.position.copy(hit.pointOnFace)
    const n = hit.normal ?? hit.face?.normal
    if (n) {
      hit.object.getWorldQuaternion(grp.quaternion)
      grp.quaternion.multiply(_q.setFromUnitVectors(Z, n))
      grp.position.add(_off.set(0, 0, 0.003).applyQuaternion(grp.quaternion))
    }
    const down = pointer.getButtonsDown().size > 0
    grp.scale.setScalar(down ? 1.35 : 1)
    ;(ring.current!.material as MeshBasicMaterial).color.set(down ? '#ffd040' : '#ffffff')
    ;(dot.current!.material as MeshBasicMaterial).color.set(down ? '#ffd040' : '#3b82ff')
  })
  return createPortal(
    <group ref={g} visible={false}>
      {/* 暗い縁（明るい所でも見えるように） */}
      <mesh renderOrder={10001}>
        <ringGeometry args={[0.0075, 0.0135, 40]} />
        <meshBasicMaterial color="#0b0e16" transparent opacity={0.8} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={ring} renderOrder={10002}>
        <ringGeometry args={[0.0085, 0.0118, 40]} />
        <meshBasicMaterial color="#ffffff" transparent depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={dot} renderOrder={10002}>
        <circleGeometry args={[0.0035, 24]} />
        <meshBasicMaterial color="#3b82ff" transparent depthTest={false} toneMapped={false} />
      </mesh>
    </group>,
    scene,
  )
}
