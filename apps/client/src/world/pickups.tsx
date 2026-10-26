// つかめる物の動きと同期（[118][119][120][145]）
// 持ち主（最後につかんだ人。いなくなったらホスト）だけが物理演算で動かし、位置を 15Hz で配る。
// ほかの人は受け取った位置を少し遅らせて補間する
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { objectHash, type ObjectPose } from '@tentenv/protocol'
import { useEffect, useRef } from 'react'
import { Box3, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { xrInput } from '../player/xrInput'
import type { PickupEntry, WorldEngine } from './engine'

interface Body {
  setBodyType: (t: number, wake: boolean) => void
  bodyType: () => number
  translation: () => { x: number; y: number; z: number }
  rotation: () => { x: number; y: number; z: number; w: number }
  linvel: () => { x: number; y: number; z: number }
  angvel: () => { x: number; y: number; z: number }
  setLinvel: (v: { x: number; y: number; z: number }, wake: boolean) => void
  setAngvel: (v: { x: number; y: number; z: number }, wake: boolean) => void
  setTranslation: (v: { x: number; y: number; z: number }, wake: boolean) => void
  setRotation: (q: { x: number; y: number; z: number; w: number }, wake: boolean) => void
  setNextKinematicTranslation: (v: { x: number; y: number; z: number }) => void
  setNextKinematicRotation: (q: { x: number; y: number; z: number; w: number }) => void
  isSleeping: () => boolean
  userData: unknown
}

const _m = new Matrix4()
const _s = new Vector3()

const setWorld = (o: Object3D, p: Vector3, q: Quaternion) => {
  const parent = o.parent
  const scale = o.scale.clone()
  if (parent) {
    parent.updateWorldMatrix(true, false)
    _m.compose(p, q, _s.set(1, 1, 1)).premultiply(parent.matrixWorld.clone().invert())
    _m.decompose(o.position, o.quaternion, _s)
  } else {
    o.position.copy(p)
    o.quaternion.copy(q)
  }
  o.scale.copy(scale)
  o.updateMatrixWorld(true)
}

export const PickupSystem: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const { world, rapier } = useRapier()
  const bodies = useRef(new Map<string, Body>())
  const sendAcc = useRef(0)
  const quietSent = useRef(new Map<string, number>())

  // 受け取った位置
  useEffect(
    () =>
      engine.session.objectEv.on((from, time, list: ObjectPose[]) => {
        for (const op of list) {
          for (const pk of engine.pickups.values()) {
            if (objectHash(pk.id) !== op.hash) continue
            const owner = ownerOf(engine, pk)
            if (owner !== from) continue
            pk.net.push({ t: time, p: new Vector3(op.p.x, op.p.y, op.p.z), q: new Quaternion(op.q.x, op.q.y, op.q.z, op.q.w), vel: new Vector3(op.vel.x, op.vel.y, op.vel.z) })
            pk.net.sort((a, b) => a.t - b.t)
            while (pk.net.length > 12) pk.net.shift()
          }
        }
      }),
    [engine],
  )

  useEffect(
    () => () => {
      try {
        for (const b of bodies.current.values()) world.removeRigidBody(b as never)
      } catch {
        // 物理のワールドが先に片付けられている
      }
      bodies.current.clear()
    },
    [world],
  )

  const ensureBody = (pk: PickupEntry): Body | null => {
    if (!pk.spec().physics) return null
    let b = bodies.current.get(pk.id)
    if (b) return b
    pk.obj.updateWorldMatrix(true, true)
    const p = pk.obj.getWorldPosition(new Vector3())
    const q = pk.obj.getWorldQuaternion(new Quaternion())
    // 当たり判定: 物の大きさの箱（物のローカル座標）
    const inv = pk.obj.matrixWorld.clone().invert()
    const box = new Box3()
    pk.obj.traverse((c) => {
      const g = (c as { geometry?: { boundingBox: Box3 | null; computeBoundingBox: () => void } }).geometry
      if (!g) return
      if (!g.boundingBox) g.computeBoundingBox()
      const bb = g.boundingBox!.clone().applyMatrix4(c.matrixWorld).applyMatrix4(inv)
      box.union(bb)
    })
    if (box.isEmpty()) box.setFromCenterAndSize(new Vector3(), new Vector3(0.1, 0.1, 0.1))
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const ws = pk.obj.getWorldScale(new Vector3())
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.2),
    ) as unknown as Body
    world.createCollider(
      rapier.ColliderDesc.cuboid(Math.max(0.01, (size.x * ws.x) / 2), Math.max(0.01, (size.y * ws.y) / 2), Math.max(0.01, (size.z * ws.z) / 2))
        .setTranslation(center.x * ws.x, center.y * ws.y, center.z * ws.z)
        .setDensity(300)
        .setFriction(0.7)
        .setRestitution(0.2),
      body as never,
    )
    body.userData = { ttvPickupHeld: false }
    bodies.current.set(pk.id, body)
    return body
  }

  useFrame((_, dt) => {
    const s = engine.session
    const me = s.selfId
    const toSend: ObjectPose[] = []
    sendAcc.current += dt
    const sendNow = sendAcc.current >= 1 / 15
    if (sendNow) sendAcc.current = 0
    // 消えた物の体を片付ける
    for (const [id, b] of bodies.current) {
      if (!engine.pickups.has(id)) {
        world.removeRigidBody(b as never)
        bodies.current.delete(id)
      }
    }
    for (const pk of engine.pickups.values()) {
      const body = ensureBody(pk)
      const owner = ownerOf(engine, pk)
      const mine = owner === me
      const heldHand = (['left', 'right', 'desktop'] as const).find((h) => engine.held[h] === pk.id)
      const ext = pk as PickupEntry & { throwVel?: Vector3; desktopTarget?: Vector3; resetTo?: { p: Vector3; q: Quaternion } }
      if (ext.resetTo && mine) {
        setWorld(pk.obj, ext.resetTo.p, ext.resetTo.q)
        if (body) {
          body.setTranslation(ext.resetTo.p, true)
          body.setRotation(ext.resetTo.q, true)
          body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        }
        ext.resetTo = undefined
      }
      if (heldHand && pk.grabOffset) {
        // 自分が持っている: 手に付けて動かす
        let hp: Vector3, hq: Quaternion
        if (heldHand === 'desktop') {
          hp = ext.desktopTarget ?? pk.obj.getWorldPosition(new Vector3())
          hq = engine.player.head.q.clone().multiply(pk.grabOffset.q)
        } else {
          const hi = xrInput[heldHand]
          hp = hi.gripP.clone().add(pk.grabOffset.p.clone().applyQuaternion(hi.gripQ))
          hq = hi.gripQ.clone().multiply(pk.grabOffset.q)
        }
        setWorld(pk.obj, hp, hq)
        if (body) {
          if (body.bodyType() !== 2) body.setBodyType(2, true) // 2: kinematicPositionBased
          body.setNextKinematicTranslation(hp)
          body.setNextKinematicRotation(hq)
          ;(body.userData as { ttvPickupHeld: boolean }).ttvPickupHeld = true
        }
        if (sendNow) toSend.push(pose(pk.id, hp, hq, new Vector3()))
        continue
      }
      if (body) (body.userData as { ttvPickupHeld: boolean }).ttvPickupHeld = false
      if (mine) {
        if (body) {
          if (body.bodyType() !== 0) {
            body.setBodyType(0, true) // 0: dynamic
            if (ext.throwVel) body.setLinvel(ext.throwVel, true)
            ext.throwVel = undefined
          }
          const t = body.translation()
          const r = body.rotation()
          const p = new Vector3(t.x, t.y, t.z)
          const q = new Quaternion(r.x, r.y, r.z, r.w)
          setWorld(pk.obj, p, q)
          // 落ちすぎたら元の場所へ
          if (t.y < -60) {
            body.setTranslation(pk.home.p, true)
            body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          }
          const lv = body.linvel()
          const moving = !body.isSleeping() && Math.hypot(lv.x, lv.y, lv.z) > 0.01
          const last = quietSent.current.get(pk.id) ?? 0
          if (sendNow && (moving || performance.now() - last > 2000)) {
            toSend.push(pose(pk.id, p, q, new Vector3(lv.x, lv.y, lv.z)))
            if (!moving) quietSent.current.set(pk.id, performance.now())
          }
        }
        continue
      }
      // 他の人が持ち主: 受け取った位置を補間する
      if (body && body.bodyType() !== 2) body.setBodyType(2, true)
      const net = pk.net
      if (!net.length) continue
      const t = s.clock.now() - 100
      let p: Vector3, q: Quaternion
      if (t <= net[0].t || net.length === 1) {
        p = net[0].p
        q = net[0].q
      } else {
        let i = net.findIndex((x) => x.t > t)
        if (i < 0) {
          const last = net[net.length - 1]
          const ahead = Math.min(0.25, (t - last.t) / 1000)
          p = last.p.clone().addScaledVector(last.vel, ahead)
          q = last.q
        } else {
          i = Math.max(1, i)
          const a = net[i - 1]
          const b = net[i]
          const k = (t - a.t) / Math.max(1, b.t - a.t)
          p = a.p.clone().lerp(b.p, k)
          q = a.q.clone().slerp(b.q, k)
        }
      }
      setWorld(pk.obj, p, q)
      if (body) {
        body.setNextKinematicTranslation(p)
        body.setNextKinematicRotation(q)
      }
    }
    // 1 通に 32 個まで。多ければ分けて送る
    for (let i = 0; i < toSend.length; i += 32) s.sendObjects(toSend.slice(i, i + 32))
  }, -1)

  return null
}

const pose = (id: string, p: Vector3, q: Quaternion, vel: Vector3): ObjectPose => ({ hash: objectHash(id), p: { x: p.x, y: p.y, z: p.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w }, vel: { x: vel.x, y: vel.y, z: vel.z } })

/** 持ち主: 記録があってその人がいればその人、いなければホスト */
export const ownerOf = (engine: WorldEngine, pk: PickupEntry) => {
  const s = engine.session
  const st = s.get(`sys:pick:${pk.id}`) as { holder: string | null; owner: string } | undefined
  if (st?.holder && s.isPresent(st.holder)) return st.holder
  if (st?.owner && s.isPresent(st.owner)) return st.owner
  return s.hostId() ?? s.selfId
}
