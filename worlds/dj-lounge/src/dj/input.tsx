import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type AudioListener, Matrix4, type Mesh, type Object3D, Plane, Quaternion, Ray, Raycaster, Vector2, Vector3, type WebGLRenderer } from 'three'
import { useAudioListener as useSdkAudioListener } from '@tentenv/sdk'

// ---------- 音を聞くためのリスナー（カメラに 1 つ。クライアントが用意したものを使う） ----------
export const useAudioListener = () => {
  const gl = useThree((s) => s.gl)
  const listener = useSdkAudioListener()
  useEffect(() => {
    // ブラウザの自動再生の制限で止まっていたら動かす。クライアントの画面ではクリックが別の所で止められたり、
    // VR のコントローラーの操作が画面のイベントにならなかったりするので、いろいろな所から試す
    const resume = () => resumeAudio(listener)
    const opts = { capture: true }
    const events = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown', 'click']
    events.forEach((e) => window.addEventListener(e, resume, opts))
    // VR のコントローラーのボタン
    let session: XRSession | null = null
    const onSession = () => {
      session?.removeEventListener('select', resume)
      session?.removeEventListener('squeeze', resume)
      session = gl.xr.getSession()
      session?.addEventListener('select', resume)
      session?.addEventListener('squeeze', resume)
      resume()
    }
    gl.xr.addEventListener('sessionstart', onSession)
    // すでに VR に入っているとき
    if (gl.xr.isPresenting) onSession()
    return () => {
      events.forEach((e) => window.removeEventListener(e, resume, opts))
      gl.xr.removeEventListener('sessionstart', onSession)
      session?.removeEventListener('select', resume)
      session?.removeEventListener('squeeze', resume)
    }
  }, [gl, listener])
  // 一度でもページを操作していれば、あとからでも動かせる（Chrome などの決まり）。1 秒ごとに試す
  const last = useRef(0)
  useFrame(() => {
    const now = performance.now()
    if (now - last.current < 1000) return
    last.current = now
    if (listener.context.state !== 'running') resumeAudio(listener)
  })
  return listener
}

// 止まっている音を動かす（操作のたびに呼んでよい）
export const resumeAudio = (listener: AudioListener) => {
  const ctx = listener.context
  if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') void ctx.resume().catch(() => {})
}

// ---------- VR の手のレイ ----------
type Hand = 'left' | 'right'
const _m1 = new Matrix4()
const _m2 = new Matrix4()
// space: 'ray' はレイの出どころ（コントローラーの先・親指のあたり）、'grip' は握っている所（手のひらの中心）
const xrRayMatrix = (gl: WebGLRenderer, hand: Hand, out: Matrix4, space: 'ray' | 'grip' = 'ray') => {
  const xr = gl.xr
  if (!xr.isPresenting) return false
  const session = xr.getSession()
  const frame = xr.getFrame()
  const ref = xr.getReferenceSpace()
  if (!session || !frame || !ref) return false
  const viewer = frame.getViewerPose(ref)
  if (!viewer) return false
  let source: XRInputSource | null = null
  for (const s of session.inputSources) if (s.handedness === hand) source = s
  if (!source) return false
  return xrSpaceMatrix(gl, space === 'grip' ? (source.gripSpace ?? source.targetRaySpace) : source.targetRaySpace, out)
}
// XR の空間（コントローラー・手の関節など）の、ワールドでの位置と向き
const xrSpaceMatrix = (gl: WebGLRenderer, space: XRSpace, out: Matrix4) => {
  const xr = gl.xr
  const frame = xr.getFrame()
  const ref = xr.getReferenceSpace()
  if (!frame || !ref) return false
  const viewer = frame.getViewerPose(ref)
  if (!viewer) return false
  const pose = 'getJointPose' in frame && (space as XRJointSpace).jointName ? frame.getJointPose?.(space as XRJointSpace, ref) : frame.getPose(space, ref)
  if (!pose) return false
  _m1.fromArray(Array.from(viewer.transform.matrix)).invert()
  _m2.fromArray(Array.from(pose.transform.matrix))
  out.copy(xr.getCamera().matrixWorld).multiply(_m1).multiply(_m2)
  return true
}

// ---------- つまみ・フェーダーを動かす（押す→つかむ、照準/レイを動かす、もう一度押す→離す） ----------
// 動かしている間は、照準（VR はつかんだ手のレイ）と操作面の交点（操作面のローカル座標）を渡し続ける
export interface DragSpec {
  surface: Object3D
  // 操作面の高さ（ローカル y）
  y: number
  onMove: (p: Vector3, start: Vector3) => void
  onEnd?: () => void
}
// ---------- VR で手（コントローラーの先）を近づけて触る操作 ----------
// 近づくと薄い水色に光り、トリガーを押すとボタンは押される・つまみやフェーダーはつかむ。
// つかんでいる間はトリガーを押したまま動かす（フェーダーは手の動き、つまみは手首のひねり）。離すと外れる
export type TouchHot = 0 | 1 | 2 // 0 なし・1 近い・2 つかんでいる
export interface TouchGrab {
  // 手の位置を表す面（コントローラーの本体）。move にはこの面のローカル座標が渡る
  surface: Object3D
  start: () => void
  // local: 今の手の位置、start: つかんだときの手の位置、twist: つかんでからの手首のひねり（ラジアン、右回りが +）
  move: (local: Vector3, start: Vector3, twist: number) => void
  end: () => void
}
export interface TouchTarget {
  // 触る位置（この物体の中心）と、届く距離（m）
  obj: Object3D
  radius: number
  press?: () => void
  grab?: TouchGrab
  // 開発時の確認用の名前
  label?: string
}
interface TouchEntry {
  target: () => TouchTarget | null
  setHot: (h: TouchHot) => void
  hot: TouchHot
}
interface DragApi {
  begin: (d: DragSpec) => void
  register: (e: TouchEntry) => () => void
  // 動かしている最中か、離した直後（離すときの押下で別のボタンが反応しないように）
  busy: () => boolean
  // VR で最後にトリガーを引いた手
  hand: () => Hand
}
const DragCtx = createContext<DragApi>({ begin: () => {}, register: () => () => {}, busy: () => false, hand: () => 'right' })
export const useDrag = () => useContext(DragCtx)

export const DragProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const active = useRef<(DragSpec & { start: Vector3 | null; at: number }) | null>(null)
  const endedAt = useRef(0)
  const hand = useRef<Hand>('right')
  const end = () => {
    const a = active.current
    if (!a) return
    active.current = null
    endedAt.current = performance.now()
    a.onEnd?.()
  }
  useEffect(() => {
    const onDown = () => {
      if (active.current && performance.now() - active.current.at > 200) end()
    }
    window.addEventListener('pointerdown', onDown)
    const onSelect = (e: XRInputSourceEvent) => {
      const h = e.inputSource.handedness
      if (h !== 'left' && h !== 'right') return
      if (active.current && performance.now() - active.current.at > 300) end()
      else hand.current = h
    }
    let session: XRSession | null = null
    const attach = () => {
      const s = gl.xr.getSession()
      if (!s || s === session) return
      session = s
      s.addEventListener('selectstart', onSelect)
    }
    const detach = () => {
      session?.removeEventListener('selectstart', onSelect)
      session = null
    }
    gl.xr.addEventListener('sessionstart', attach)
    gl.xr.addEventListener('sessionend', detach)
    attach()
    return () => {
      window.removeEventListener('pointerdown', onDown)
      gl.xr.removeEventListener('sessionstart', attach)
      gl.xr.removeEventListener('sessionend', detach)
      detach()
    }
  }, [gl])
  const raycaster = useMemo(() => new Raycaster(), [])
  const center = useMemo(() => new Vector2(), [])
  const rayM = useMemo(() => new Matrix4(), [])
  const inv = useMemo(() => new Matrix4(), [])
  const ray = useMemo(() => new Ray(), [])
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const a = active.current
    if (!a) return
    if (gl.xr.isPresenting && xrRayMatrix(gl, hand.current, rayM)) {
      raycaster.ray.origin.setFromMatrixPosition(rayM)
      raycaster.ray.direction.set(0, 0, -1).transformDirection(rayM)
    } else raycaster.setFromCamera(center, camera)
    a.surface.updateWorldMatrix(true, false)
    inv.copy(a.surface.matrixWorld).invert()
    ray.copy(raycaster.ray).applyMatrix4(inv)
    plane.constant = -a.y
    if (!ray.intersectPlane(plane, hit)) return
    if (!a.start) a.start = hit.clone()
    a.onMove(hit, a.start)
  })
  // ---- 手を近づけて触る（VR のときだけ） ----
  const entries = useRef(new Set<TouchEntry>())
  type HandState = { hover: TouchEntry | null; grab: TouchEntry | null; grabT: TouchTarget | null; pressed: boolean; start: Vector3; q0: Quaternion; axis: Vector3 }
  const newHand = (): HandState => ({ hover: null, grab: null, grabT: null, pressed: false, start: new Vector3(), q0: new Quaternion(), axis: new Vector3() })
  const hands = useRef<Record<Hand, HandState>>({ left: newHand(), right: newHand() })
  const touchAt = useRef(0)
  const tm = useMemo(() => new Matrix4(), [])
  const tp = useMemo(() => new Vector3(), [])
  const tq = useMemo(() => new Quaternion(), [])
  const ts = useMemo(() => new Vector3(), [])
  const tw = useMemo(() => new Vector3(), [])
  const tl = useMemo(() => new Vector3(), [])
  const dq = useMemo(() => new Quaternion(), [])
  // ---- 触る位置は人差し指の先 ----
  // 1. ハンドトラッキングなら、人差し指の先の関節
  // 2. コントローラーなら、自分のアバターの手（見えている手）の人差し指の先の骨。握っている所にいちばん近いもの
  // 3. 見つからなければ、握っている所（手のひらの中心）から指さす向きへ 8.5cm・少し下
  const scene = useThree((s) => s.scene)
  const tips = useRef<Object3D[]>([])
  const scanAt = useRef(0)
  const tv = useMemo(() => new Vector3(), [])
  const tv2 = useMemo(() => new Vector3(), [])
  const FINGER = useMemo(() => new Vector3(0, -0.015, -0.085), [])
  const avatarTip = (grip: Vector3) => {
    const now = performance.now()
    if (now - scanAt.current > 1000) {
      scanAt.current = now
      const list: Object3D[] = []
      // VRM の指の骨の名前（J_Bip_L_Index3・leftIndexDistal など）
      scene.traverse((o) => {
        if (/index/i.test(o.name) && /(distal|index_?3|tip)/i.test(o.name) && !/proximal|intermediate|metacarpal/i.test(o.name)) list.push(o)
      })
      tips.current = list
    }
    let best: Object3D | null = null
    let bd = 0.2
    for (const o of tips.current) {
      o.getWorldPosition(tv)
      const d = tv.distanceTo(grip)
      if (d < bd) {
        bd = d
        best = o
      }
    }
    if (!best) return false
    best.getWorldPosition(tv)
    // 骨の付け根は第一関節なので、骨の向きへ少し伸ばして指先にする
    if (best.parent) {
      best.parent.getWorldPosition(tv2)
      tv2.subVectors(tv, tv2)
      const len = tv2.length()
      if (len > 0.004 && len < 0.06) tv.addScaledVector(tv2.normalize(), Math.min(0.02, len))
    }
    return true
  }
  // tp に指先の位置、tq に手の向き（つまみをひねる向き）を入れる
  const fingerPose = (h: Hand, src: XRInputSource) => {
    const tip = src.hand?.get('index-finger-tip')
    if (tip) {
      if (!xrSpaceMatrix(gl, tip, tm)) return false
      tm.decompose(tp, tq, ts)
      return true
    }
    if (!xrRayMatrix(gl, h, tm, 'grip')) return false
    tm.decompose(tp, tq, ts)
    if (avatarTip(tp)) tp.copy(tv)
    else tp.add(tv.copy(FINGER).applyQuaternion(tq))
    return true
  }
  // ハンドトラッキングのつまむ動き（親指と人差し指の先が近い）
  const pinching = (src: XRInputSource) => {
    const a = src.hand?.get('thumb-tip')
    const b = src.hand?.get('index-finger-tip')
    if (!a || !b || !xrSpaceMatrix(gl, a, tm)) return false
    tv.setFromMatrixPosition(tm)
    if (!xrSpaceMatrix(gl, b, tm)) return false
    return tv.distanceTo(tv2.setFromMatrixPosition(tm)) < 0.02
  }
  const buzz = (h: Hand, v: number, ms: number) => {
    const s = gl.xr.getSession()
    if (!s) return
    for (const src of s.inputSources)
      if (src.handedness === h) {
        const act = (src.gamepad as (Gamepad & { hapticActuators?: { pulse: (v: number, ms: number) => Promise<boolean> }[] }) | undefined)?.hapticActuators?.[0]
        void act?.pulse(v, ms).catch(() => {})
      }
  }
  const releaseAll = () => {
    for (const h of ['left', 'right'] as Hand[]) {
      const st = hands.current[h]
      st.grabT?.grab?.end()
      st.grab = st.grabT = st.hover = null
    }
    entries.current.forEach((e) => {
      if (e.hot) {
        e.hot = 0
        e.setHot(0)
      }
    })
  }
  const dots = useRef<Record<Hand, Mesh | null>>({ left: null, right: null })
  useFrame(() => {
    if (!gl.xr.isPresenting) {
      if (dots.current.left) dots.current.left.visible = false
      if (dots.current.right) dots.current.right.visible = false
      if (touchAt.current) {
        touchAt.current = 0
        releaseAll()
      }
      return
    }
    const s = gl.xr.getSession()
    const hotNow = new Map<TouchEntry, TouchHot>()
    for (const h of ['left', 'right'] as Hand[]) {
      const st = hands.current[h]
      let src: XRInputSource | null = null
      for (const x of s?.inputSources ?? []) if (x.handedness === h) src = x
      // コントローラーはトリガー、ハンドトラッキングはつまむ動き（ボタンは指で押し込むだけでもよい）
      let pressed = !!src && (src.hand ? pinching(src) : !!src.gamepad?.buttons[0]?.pressed)
      if (!src || !fingerPose(h, src)) {
        if (dots.current[h]) dots.current[h]!.visible = false
        st.grabT?.grab?.end()
        st.grab = st.grabT = st.hover = null
        st.pressed = false
        continue
      }
      // 開発時のみ: 手の位置を確認できるようにする
      // 指先の目印（小さな水色の点）
      const dot = dots.current[h]
      if (dot) {
        dot.visible = true
        dot.position.copy(tp)
      }
      // つかんでいる間: 離したら外す、押している間は動かす
      if (st.grab && st.grabT?.grab) {
        const g = st.grabT.grab
        if (!pressed) {
          g.end()
          st.grab = st.grabT = null
          endedAt.current = performance.now()
        } else {
          g.surface.updateWorldMatrix(true, false)
          tl.copy(tp)
          g.surface.worldToLocal(tl)
          // 手首のひねり: つかんだときからの回転のうち、コントローラーの前の向きを軸にした分（スウィング・ツイスト分解）
          dq.copy(st.q0).invert().premultiply(tq)
          const proj = st.axis.x * dq.x + st.axis.y * dq.y + st.axis.z * dq.z
          let twist = 2 * Math.atan2(proj, dq.w)
          if (twist > Math.PI) twist -= Math.PI * 2
          if (twist < -Math.PI) twist += Math.PI * 2
          // 前の向きを軸に右回り（手前から見て時計回り）が +
          g.move(tl, st.start, twist)
          hotNow.set(st.grab, 2)
          touchAt.current = performance.now()
        }
        st.pressed = pressed
        continue
      }
      // いちばん近い操作部品
      let best: TouchEntry | null = null
      let bestD = Infinity
      for (const e of entries.current) {
        const t = e.target()
        if (!t) continue
        t.obj.getWorldPosition(tw)
        const d = tw.distanceTo(tp)
        if (d < t.radius && d < bestD) {
          best = e
          bestD = d
        }
      }
      // ハンドトラッキング: ボタンに指先が触れたら押したことにする
      if (src.hand && best && bestD < 0.014 && (best as TouchEntry).target()?.press) pressed = true
      if (best !== st.hover) {
        st.hover = best
        if (best) buzz(h, 0.15, 12)
      }
      if (best) {
        hotNow.set(best, Math.max(hotNow.get(best) ?? 0, 1) as TouchHot)
        touchAt.current = performance.now()
        if (pressed && !st.pressed) {
          const t = best.target()
          if (t?.press) {
            t.press()
            buzz(h, 0.6, 30)
          } else if (t?.grab) {
            st.grab = best
            st.grabT = t
            t.grab.surface.updateWorldMatrix(true, false)
            st.start.copy(tp)
            t.grab.surface.worldToLocal(st.start)
            st.q0.copy(tq)
            st.axis.set(0, 0, -1).applyQuaternion(tq)
            t.grab.start()
            buzz(h, 0.5, 25)
            hotNow.set(best, 2)
          }
        }
      }
      st.pressed = pressed
    }
    // 光り方を更新（変わったときだけ）
    for (const e of entries.current) {
      const h = hotNow.get(e) ?? 0
      if (h !== e.hot) {
        e.hot = h
        e.setHot(h)
      }
    }
  })
  const api = useMemo<DragApi>(
    () => ({
      begin: (d) => {
        end()
        active.current = { ...d, start: null, at: performance.now() }
      },
      register: (e) => {
        entries.current.add(e)
        return () => {
          entries.current.delete(e)
          for (const h of ['left', 'right'] as Hand[]) {
            const st = hands.current[h]
            if (st.hover === e) st.hover = null
            if (st.grab === e) {
              st.grabT?.grab?.end()
              st.grab = st.grabT = null
            }
          }
        }
      },
      // 手で触っている間（と少しあと）は、レイでの操作を受け付けない（同じ押下で 2 回動かないように）
      busy: () => !!active.current || performance.now() - endedAt.current < 250 || performance.now() - touchAt.current < 350,
      hand: () => hand.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  return (
    <DragCtx.Provider value={api}>
      {children}
      {/* VR: 触る位置（人差し指の先）の目印。ワールドの外側（シーンの直下）に置いて、ワールドの位置に左右されないようにする */}
      {createPortal(
        <>
          {(['left', 'right'] as Hand[]).map((h) => (
            <mesh key={h} ref={(m) => void (dots.current[h] = m)} visible={false} renderOrder={999}>
              <sphereGeometry args={[0.005, 12, 8]} />
              <meshBasicMaterial color="#7fdcff" depthTest={false} transparent opacity={0.9} toneMapped={false} />
            </mesh>
          ))}
        </>,
        scene
      )}
    </DragCtx.Provider>
  )
}

// 操作部品を「手で触れる」ようにする。返り値は光り方（0 なし・1 近い・2 つかんでいる）
export const useTouchTarget = (get: () => TouchTarget | null): TouchHot => {
  const api = useDrag()
  const [hot, setHot] = useState<TouchHot>(0)
  const getRef = useRef(get)
  getRef.current = get
  useEffect(() => {
    const entry: TouchEntry = { target: () => getRef.current(), setHot, hot: 0 }
    return api.register(entry)
  }, [api])
  return hot
}
