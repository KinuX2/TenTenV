// 押す・つかむ（[118][122]）。PC は画面の中心、スマホはタップした所、VR は手のレイと指先
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Box3, BufferGeometry, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Object3D, Quaternion, Raycaster, SphereGeometry, Vector2, Vector3 } from 'three'
import { create } from 'zustand'
import { LAYERS } from '@tentenv/sdk'
import { haptic, xrInput } from '../player/xrInput'
import { settings } from '../state/settings'
import type { Interactable, PickupEntry, WorldEngine } from './engine'
import { useMenu } from '../ui/menuBus'
import { input } from '../player/input'
import { usePortalPlacement } from './portalState'

export interface HoverState {
  label: string | null
  kind: 'click' | 'pickup' | null
  holding: string | null
}
export const useHover = create<HoverState>(() => ({ label: null, kind: null, holding: null }))

type Hand = 'left' | 'right' | 'desktop'
interface Hit {
  kind: 'click' | 'pickup'
  target: Interactable | PickupEntry
  point: Vector3
  distance: number
}

const _box = new Box3()
const _v = new Vector3()

export const InteractionSystem: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const ray = useMemo(() => {
    const r = new Raycaster()
    r.layers.enableAll()
    return r
  }, [])
  const lasers = useMemo(() => {
    const mk = () => {
      const g = new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0, 0, -1)])
      const l = new Line(g, new LineBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.7 }))
      l.layers.set(LAYERS.NO_MIRROR)
      l.frustumCulled = false
      const dot = new Mesh(new SphereGeometry(0.012, 8, 6), new MeshBasicMaterial({ color: '#ffffff' }))
      dot.layers.set(LAYERS.NO_MIRROR)
      const holder = new Object3D()
      holder.add(l, dot)
      return { holder, line: l, dot }
    }
    return { left: mk(), right: mk() }
  }, [])
  const poked = useRef(new Set<number>())
  const hoverPrev = useRef(new Map<Hand, Interactable | null>())
  const throwHist = useRef<Record<Hand, { p: Vector3; t: number }[]>>({ left: [], right: [], desktop: [] })
  const desktopDist = useRef(1.2)
  const desktopHoldStart = useRef(0)

  const cast = (origin: Vector3, dir: Vector3, maxDist: number): Hit | null => {
    ray.set(origin, dir)
    ray.far = maxDist
    let best: Hit | null = null
    for (const it of engine.interactables.values()) {
      const sp = it.spec()
      if (sp.enabled === false || !visibleInScene(it.obj)) continue
      const reach = sp.reach ?? maxDist
      const hits = ray.intersectObject(it.obj, true)
      const h = hits.find((x) => x.distance <= reach)
      if (h && (!best || h.distance < best.distance)) best = { kind: 'click', target: it, point: h.point.clone(), distance: h.distance }
    }
    for (const pk of engine.pickups.values()) {
      if (!visibleInScene(pk.obj)) continue
      const hits = ray.intersectObject(pk.obj, true)
      const h = hits[0]
      if (h && (!best || h.distance < best.distance - 0.01)) best = { kind: 'pickup', target: pk, point: h.point.clone(), distance: h.distance }
    }
    return best
  }

  const click = (it: Interactable, hand: 'left' | 'right' | 'none', point: Vector3) => {
    try {
      it.spec().onClick({ peerId: engine.session.selfId, hand, point: [point.x, point.y, point.z] })
    } catch (e) {
      console.error('[world] onClick でエラー', e)
    }
  }

  const grab = (pk: PickupEntry, hand: Hand, handP: Vector3, handQ: Quaternion) => {
    const s = engine.session
    const cur = s.get(`sys:pick:${pk.id}`) as { holder: string | null } | undefined
    if (cur?.holder && cur.holder !== s.selfId && s.isPresent(cur.holder)) {
      // 他の人が持っている物は取り上げない
      return
    }
    // 反対の手で持っていたら持ち替える
    for (const h of ['left', 'right', 'desktop'] as Hand[]) if (engine.held[h] === pk.id) engine.held[h] = null
    engine.held[hand] = pk.id
    pk.hand = hand
    pk.obj.updateWorldMatrix(true, false)
    const op = pk.obj.getWorldPosition(new Vector3())
    const oq = pk.obj.getWorldQuaternion(new Quaternion())
    const spec = pk.spec()
    const inv = handQ.clone().invert()
    if (spec.orientation === 'grip') pk.grabOffset = { p: new Vector3(0, 0, -0.05), q: new Quaternion() }
    else pk.grabOffset = { p: op.clone().sub(handP).applyQuaternion(inv), q: inv.multiply(oq) }
    // 遠くからつかんだら手元へ寄せる
    if (pk.grabOffset.p.length() > 0.25 && hand !== 'desktop') pk.grabOffset.p.setLength(0.06)
    s.set(`sys:pick:${pk.id}`, { holder: s.selfId, owner: s.selfId })
    if (hand !== 'desktop') haptic(hand, 0.5 * settings().hapticsStrength, 30)
    spec.onGrab?.(engine.selfInfo())
    useHover.setState({ holding: spec.label ?? pk.id })
    throwHist.current[hand] = []
  }

  const release = (hand: Hand) => {
    const id = engine.held[hand]
    if (!id) return
    engine.held[hand] = null
    const pk = engine.pickups.get(id)
    if (!pk) return
    pk.hand = null
    pk.grabOffset = null
    const spec = pk.spec()
    // 投げる速さ: 直近 0.1 秒の手の動き
    const hist = throwHist.current[hand]
    let vel = new Vector3()
    if (hist.length >= 2 && spec.throwable) {
      const a = hist[0]
      const b = hist[hist.length - 1]
      const dt = (b.t - a.t) / 1000
      if (dt > 0.01) vel = b.p.clone().sub(a.p).divideScalar(dt)
      if (vel.length() > 25) vel.setLength(25)
    }
    ;(pk as PickupEntry & { throwVel?: Vector3 }).throwVel = vel
    engine.session.set(`sys:pick:${pk.id}`, { holder: null, owner: engine.session.selfId })
    spec.onDrop?.(engine.selfInfo())
    useHover.setState({ holding: null })
  }

  useFrame(() => {
    if (usePortalPlacement.getState().target) {
      lasers.left.holder.visible = lasers.right.holder.visible = false
      const hover = useHover.getState()
      if (hover.label || hover.kind || hover.holding) useHover.setState({ label: null, kind: null, holding: null })
      return
    }
    const p = engine.player
    const menuOpen = useMenu.getState().open
    let hoverLabel: string | null = null
    let hoverKind: 'click' | 'pickup' | null = null
    const xr = p.vr

    if (xr) {
      for (const h of ['left', 'right'] as const) {
        const hi = xrInput[h]
        const laser = lasers[h]
        if (!hi.connected) {
          laser.holder.visible = false
          continue
        }
        if (laser.holder.parent !== scene) scene.add(laser.holder)
        const heldId = engine.held[h]
        const reach = 12 * (engine.ctx.world ? 1 : 1)
        const hit = heldId ? null : cast(hi.rayP, hi.rayDir, reach)
        // レイの見た目
        laser.holder.visible = !!hit && !heldId && !menuOpen
        laser.holder.position.copy(hi.rayP)
        laser.holder.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), hi.rayDir)
        const len = hit ? hit.distance : 1.2
        laser.line.scale.set(1, 1, len)
        laser.dot.position.set(0, 0, -len)
        laser.dot.visible = !!hit
        ;(laser.line.material as LineBasicMaterial).opacity = hit ? 0.9 : 0.25
        if (hit) {
          hoverLabel = hit.kind === 'click' ? ((hit.target as Interactable).spec().label ?? null) : ((hit.target as PickupEntry).spec().label ?? 'つかむ')
          hoverKind = hit.kind
          if (hit.kind === 'click') {
            const it = hit.target as Interactable
            if (hoverPrev.current.get(h) !== it) {
              hoverPrev.current.get(h)?.spec().onHover?.(false)
              it.spec().onHover?.(true)
              hoverPrev.current.set(h, it)
              haptic(h, 0.08 * settings().hapticsStrength, 8)
            }
          }
        } else if (hoverPrev.current.get(h)) {
          hoverPrev.current.get(h)?.spec().onHover?.(false)
          hoverPrev.current.set(h, null)
        }
        if (hi.triggerDown && !menuOpen) {
          if (heldId) engine.pickups.get(heldId)?.spec().onUse?.(engine.selfInfo())
          else if (hit?.kind === 'click') {
            click(hit.target as Interactable, h, hit.point)
            haptic(h, 0.35 * settings().hapticsStrength, 20)
          }
        }
        // つかむ: 手の近くの物、なければレイの先の物
        if (hi.squeezeDown && !heldId) {
          const near = nearestPickup(engine, hi.gripP, 0.14)
          const target = near ?? (hit?.kind === 'pickup' ? (hit.target as PickupEntry) : null)
          if (target) grab(target, h, hi.gripP, hi.gripQ)
        }
        if ((hi.squeezeUp || (hi.handTracking && hi.triggerUp)) && heldId) release(h)
        // ハンドトラッキング: つまんでつかむ
        if (hi.handTracking && hi.triggerDown && !heldId) {
          const near = nearestPickup(engine, hi.tipP, 0.1)
          if (near) grab(near, h, hi.gripP, hi.gripQ)
        }
        // 指先で押す（近くで触る操作）
        for (const it of engine.interactables.values()) {
          const sp = it.spec()
          if (sp.enabled === false || sp.poke === false || !visibleInScene(it.obj)) continue
          _box.setFromObject(it.obj).expandByScalar(0.008)
          if (_box.isEmpty()) continue
          const inside = _box.containsPoint(hi.tipP)
          const key = it.id * 2 + (h === 'left' ? 0 : 1)
          if (inside && !poked.current.has(key)) {
            poked.current.add(key)
            click(it, h, hi.tipP)
            haptic(h, 0.4 * settings().hapticsStrength, 25)
          } else if (!inside && poked.current.has(key)) {
            _box.expandByScalar(0.02)
            if (!_box.containsPoint(hi.tipP)) poked.current.delete(key)
          }
        }
        // 投げる速さの記録
        const hist = throwHist.current[h]
        hist.push({ p: hi.gripP.clone(), t: performance.now() })
        while (hist.length > 2 && performance.now() - hist[0].t > 100) hist.shift()
      }
    } else {
      lasers.left.holder.visible = lasers.right.holder.visible = false
      const f = input
      void f
      // PC: 画面の中心。スマホ: タップした所（InputFrame はプレイヤーの処理が消費するので、ここでは別の窓口を見る）
      const tap = pendingTap.value
      pendingTap.value = null
      const origin = camera.getWorldPosition(new Vector3())
      const dir = new Vector3()
      if (tap) {
        ray.setFromCamera(new Vector2(tap.x, tap.y), camera)
        dir.copy(ray.ray.direction)
      } else camera.getWorldDirection(dir)
      const heldId = engine.held.desktop
      const hit = heldId ? null : cast(origin, dir, p.thirdPerson ? 6 : 3.2)
      if (hit) {
        hoverLabel = hit.kind === 'click' ? ((hit.target as Interactable).spec().label ?? null) : ((hit.target as PickupEntry).spec().label ?? 'つかむ')
        hoverKind = hit.kind
      }
      const clicked = pendingClick.value || !!tap
      pendingClick.value = false
      if (clicked && !menuOpen) {
        if (heldId) {
          const held = performance.now() - desktopHoldStart.current
          if (held > 250) release('desktop')
        } else if (hit?.kind === 'click') click(hit.target as Interactable, 'none', hit.point)
        else if (hit?.kind === 'pickup') {
          const handP = camera.getWorldPosition(new Vector3())
          grab(hit.target as PickupEntry, 'desktop', handP, camera.quaternion)
          desktopDist.current = Math.max(0.6, Math.min(2.5, hit.distance))
          desktopHoldStart.current = performance.now()
        }
      }
      if (pendingGrab.value) {
        pendingGrab.value = false
        if (heldId) release('desktop')
        else if (hit?.kind === 'pickup') {
          grab(hit.target as PickupEntry, 'desktop', camera.getWorldPosition(new Vector3()), camera.quaternion)
          desktopDist.current = Math.max(0.6, Math.min(2.5, hit.distance))
          desktopHoldStart.current = performance.now()
        }
      }
      if (pendingUse.value) {
        pendingUse.value = false
        if (heldId) engine.pickups.get(heldId)?.spec().onUse?.(engine.selfInfo())
      }
      desktopDist.current = Math.max(0.5, Math.min(4, desktopDist.current - pendingWheel.value * 0.15))
      pendingWheel.value = 0
      // 持っている物は視点の前へ
      if (heldId) {
        const pk = engine.pickups.get(heldId)
        if (pk) {
          const target = camera.getWorldPosition(new Vector3()).add(dir.clone().multiplyScalar(desktopDist.current))
          ;(pk as PickupEntry & { desktopTarget?: Vector3 }).desktopTarget = target
          const hist = throwHist.current.desktop
          hist.push({ p: target.clone(), t: performance.now() })
          while (hist.length > 2 && performance.now() - hist[0].t > 100) hist.shift()
        }
      }
    }
    const st = useHover.getState()
    if (st.label !== hoverLabel || st.kind !== hoverKind) useHover.setState({ label: hoverLabel, kind: hoverKind })
  }, -2)

  return null
}

/** PC・スマホの操作の窓口（UI と入力から書き込む） */
export const pendingClick = { value: false }
export const pendingTap: { value: { x: number; y: number } | null } = { value: null }
export const pendingGrab = { value: false }
export const pendingUse = { value: false }
export const pendingWheel = { value: 0 }

const visibleInScene = (o: Object3D) => {
  let x: Object3D | null = o
  while (x) {
    if (!x.visible) return false
    x = x.parent
  }
  return true
}

const nearestPickup = (engine: WorldEngine, at: Vector3, radius: number) => {
  let best: PickupEntry | null = null
  let bd = radius
  for (const pk of engine.pickups.values()) {
    if (!visibleInScene(pk.obj)) continue
    _box.setFromObject(pk.obj)
    if (_box.isEmpty()) continue
    const d = _box.distanceToPoint(at)
    if (d < bd) {
      bd = d
      best = pk
    }
  }
  void _v
  return best
}
