// 自分のプレイヤー: 移動・ジャンプ・しゃがみ・伏せ（[15]）、旋回（[16]）、視点の高さ（[17]）、VR の追従（[18]）、
// 座る・寝る（[121][205]）、テレポート・リスポーン（[94]）
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { XROrigin } from '@react-three/xr'
import { PoseFlag, SleepPose, type TrackedPoint } from '@tentenv/protocol'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, MathUtils, Quaternion, Vector3, type Group, type PerspectiveCamera, type WebGLRenderer } from 'three'
import { useSettings, settings } from '../state/settings'
import type { WorldEngine } from '../world/engine'
import { handCurls, xrSpaceToWorld, xrViewerLocal } from '../world/xr'
import { readBodyTrackers, skeletalCurls } from '../features/bodyTracking'
import { input, type InputFrame } from './input'
import { xrInput, type HandInput } from './xrInput'
import { menuBus } from '../ui/menuBus'
import { pendingClick, pendingGrab, pendingTap, pendingUse, pendingWheel } from '../world/interaction'

const RADIUS = 0.25
const STAND_HALF = 0.55
const UP = new Vector3(0, 1, 0)
const _q = new Quaternion()
const _e = new Euler(0, 0, 0, 'YXZ')

export interface LocalPlayerProps {
  engine: WorldEngine
  /** アバターの目の高さ（拡大後、m） */
  avatarEye: () => number
}

export const LocalPlayer: React.FC<LocalPlayerProps> = ({ engine, avatarEye }) => {
  const { world, rapier } = useRapier()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const origin = useRef<Group>(null)
  const fov = useSettings((s) => s.s.fov)
  const manifest = engine.ctx.world.manifest
  const gravity = manifest.physics?.gravity ?? 9.81
  const jumpV = manifest.physics?.jump ?? 4.4
  const infiniteJump = manifest.physics?.allowInfiniteJump ?? false

  const phys = useMemo(() => {
    const sp = engine.spawnPoint()
    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(sp.position.x, sp.position.y, sp.position.z))
    const collider = world.createCollider(rapier.ColliderDesc.capsule(STAND_HALF, RADIUS).setTranslation(0, STAND_HALF + RADIUS, 0).setFriction(0), body)
    const cc = world.createCharacterController(0.02)
    cc.enableAutostep(0.4, 0.15, true)
    cc.enableSnapToGround(0.35)
    cc.setMaxSlopeClimbAngle(MathUtils.degToRad(50))
    cc.setMinSlopeSlideAngle(MathUtils.degToRad(55))
    cc.setApplyImpulsesToDynamicBodies(true)
    cc.setCharacterMass(70)
    engine.player.position.copy(sp.position)
    engine.player.yaw = sp.yaw
    return { body, collider, cc }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, rapier])
  useEffect(
    () => () => {
      // 物理のワールドが先に片付けられていることがある
      try {
        world.removeCharacterController(phys.cc)
        world.removeRigidBody(phys.body)
      } catch {
        // もう使えないワールド
      }
    },
    [world, phys],
  )

  const st = useRef({
    vy: 0,
    originYaw: 0,
    bodyYaw: 0,
    sendAcc: 0,
    seatedOffset: 0,
    sitOffset: null as Vector3 | null,
    sleepTimer: 0,
    wakeTimer: 0,
    prevButtons: { left: [] as boolean[], right: [] as boolean[] },
    snapReady: true,
    xrWas: false,
    airJumps: 0,
    fallen: 0,
  })

  useEffect(() => {
    camera.fov = fov
    camera.near = manifest.camera?.near ?? 0.03
    camera.far = Math.min(manifest.camera?.far ?? 1000, settings().drawDistance)
    camera.updateProjectionMatrix()
  }, [camera, fov, manifest])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const p = engine.player
    const s = settings()
    const xr = gl.xr.isPresenting
    const o = origin.current
    if (!o) return
    const S = st.current
    if (xr !== S.xrWas) {
      S.xrWas = xr
      engine.setDevice(xr ? 'vr' : /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop')
      if (xr) S.originYaw = p.yaw
    }
    const f: InputFrame = input.poll(dt)
    menuInputs(f)
    const eye = avatarEye()
    const scale = xr ? eye / Math.max(0.5, s.playerHeight * 0.935) : 1

    // ---------------- テレポート ----------------
    if (engine.pendingTeleport) {
      const tp = engine.pendingTeleport
      engine.pendingTeleport = null
      if (p.sitting) engine.stand()
      p.position.copy(tp.position)
      phys.body.setTranslation(tp.position, true)
      phys.body.setNextKinematicTranslation(tp.position)
      S.vy = 0
      if (tp.yaw !== undefined) {
        p.yaw = tp.yaw
        S.bodyYaw = tp.yaw
        if (xr) {
          const v = xrViewerLocal(gl)
          const headYaw = v ? new Euler().setFromQuaternion(v.q, 'YXZ').y : 0
          S.originYaw = tp.yaw - headYaw
        }
      }
    }

    // ---------------- VR の入力 ----------------
    let vrMove = { x: 0, y: 0 }
    if (xr) {
      readXrInput(gl, o)
      const L = xrInput.left
      const R = xrInput.right
      const moveHand = s.dominantHand === 'right' ? L : R
      const turnHand = s.dominantHand === 'right' ? R : L
      vrMove = { x: moveHand.stick.x, y: -moveHand.stick.y }
      // 旋回（[16]）
      const tx = turnHand.stick.x
      if (s.turnMode === 'snap') {
        if (Math.abs(tx) > 0.7 && S.snapReady) {
          S.originYaw -= Math.sign(tx) * MathUtils.degToRad(s.snapAngle)
          S.snapReady = false
        }
        if (Math.abs(tx) < 0.3) S.snapReady = true
      } else if (Math.abs(tx) > 0.15) S.originYaw -= tx * MathUtils.degToRad(s.smoothTurnSpeed) * dt
      if (turnHand.primaryDown) f.jump = true
      if (turnHand.stickDown) f.crouchToggle = true
      if (moveHand.secondaryDown) menuBus.toggle()
      if (moveHand.primaryDown) f.muteToggle = true
      if (turnHand.secondaryDown) menuBus.toggleGestures()
      // 手の形（[21]）
      p.handTracking = L.handTracking || R.handTracking
    }

    // ---------------- 視点（PC・スマホ） ----------------
    if (!xr) {
      p.yaw += f.lookYaw
      p.pitch = MathUtils.clamp(p.pitch + f.lookPitch, -1.45, 1.45)
    }
    if (f.thirdPersonToggle) p.thirdPerson = !p.thirdPerson

    // ---------------- 姿勢の切り替え ----------------
    if (f.crouchToggle && !p.sitting) {
      if (p.sleep !== SleepPose.None) p.sleep = SleepPose.None
      else {
        p.crouch = !p.crouch
        p.prone = false
      }
    }
    if (f.proneToggle && !p.sitting) {
      p.prone = !p.prone
      p.crouch = false
    }

    // ---------------- 移動 ----------------
    let mx = f.moveX + vrMove.x
    let my = f.moveY + vrMove.y
    const ml = Math.hypot(mx, my)
    if (ml > 1) {
      mx /= ml
      my /= ml
    }
    if (p.sitting) {
      // 座っているとき: 移動かジャンプで立つ。乗り物なら入力を渡す
      const seat = engine.seats.get(p.sitting.seatId)
      const sp = seat?.spec()
      if (sp?.onInput) sp.onInput({ forward: my, right: mx, up: f.jump ? 1 : 0 })
      else if (f.jump || ml > 0.5) engine.stand()
      mx = my = 0
    }
    if (p.sleep !== SleepPose.None && ml > 0.3) p.sleep = SleepPose.None
    // 移動の向き: VR は頭か手、PC は視点
    let dirYaw = p.yaw
    if (xr) {
      const v = xrViewerLocal(gl)
      const headYaw = v ? new Euler().setFromQuaternion(v.q, 'YXZ').y : 0
      dirYaw = S.originYaw + headYaw
      if (s.moveDirection === 'hand') {
        const hand = s.dominantHand === 'right' ? xrInput.left : xrInput.right
        if (hand.connected) dirYaw = Math.atan2(-hand.rayDir.x, -hand.rayDir.z)
      }
    }
    const crouchMul = p.prone ? 0.35 : p.crouch ? 0.55 : 1
    const speed = s.moveSpeed * (f.run ? s.runMultiplier : 1) * crouchMul * (xr ? scale : 1)
    const fwd = new Vector3(-Math.sin(dirYaw), 0, -Math.cos(dirYaw))
    const right = new Vector3(-fwd.z, 0, fwd.x)
    const wish = fwd.multiplyScalar(my * speed).add(right.multiplyScalar(mx * speed))
    // ゆるやかに加速・減速
    const k = 1 - Math.exp(-dt * (p.grounded ? 14 : 3))
    p.velocity.x += (wish.x - p.velocity.x) * k
    p.velocity.z += (wish.z - p.velocity.z) * k
    if (p.sitting) p.velocity.set(0, 0, 0)

    // ジャンプ・重力
    if (f.jump && !p.sitting) {
      if (p.grounded || infiniteJump) {
        S.vy = jumpV * Math.sqrt(Math.max(0.3, xr ? scale : 1))
        p.jumping = true
        p.crouch = false
        p.prone = false
        if (p.sleep !== SleepPose.None) p.sleep = SleepPose.None
      }
    }
    if (!p.sitting) S.vy -= gravity * dt
    if (p.grounded && S.vy < 0) {
      S.vy = -0.5
      p.jumping = false
    }
    S.vy = Math.max(S.vy, -50)

    // VR: 実際に歩いた分も体を動かす（頭の真下に体を置く）
    let roomDelta = new Vector3()
    let headLocal: { p: Vector3; q: Quaternion } | null = null
    if (xr) {
      headLocal = xrViewerLocal(gl)
      if (headLocal) {
        // 身長合わせ用に、実際の目の高さを残しておく
        ;(window as unknown as { __ttvRealEye?: number }).__ttvRealEye = headLocal.p.y
        const hw = headLocal.p.clone().multiplyScalar(scale).applyAxisAngle(UP, S.originYaw).add(o.position)
        roomDelta = new Vector3(hw.x - p.position.x, 0, hw.z - p.position.z)
        if (roomDelta.length() > 1.5) roomDelta.setLength(1.5)
      }
    }

    const desired = new Vector3(p.velocity.x * dt + roomDelta.x, S.vy * dt, p.velocity.z * dt + roomDelta.z)
    if (p.sitting) {
      const seatP = new Vector3()
      p.sitting.obj.updateWorldMatrix(true, false)
      p.sitting.obj.getWorldPosition(seatP)
      p.position.copy(seatP)
      phys.body.setNextKinematicTranslation(seatP)
      p.grounded = true
      const sq = p.sitting.obj.getWorldQuaternion(new Quaternion())
      const seatYaw = new Euler().setFromQuaternion(sq, 'YXZ').y
      S.bodyYaw = seatYaw
    } else {
      phys.cc.computeColliderMovement(phys.collider, desired, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => !(c.parent()?.userData as { ttvPickupHeld?: boolean } | undefined)?.ttvPickupHeld)
      const mv = phys.cc.computedMovement()
      const next = p.position.clone().add(new Vector3(mv.x, mv.y, mv.z))
      p.grounded = phys.cc.computedGrounded()
      if (!p.grounded && mv.y > desired.y + 0.001 && S.vy > 0) S.vy = 0 // 天井
      phys.body.setNextKinematicTranslation(next)
      // VR で壁に当たったら、部屋ごと押し戻す
      if (xr) {
        const blocked = new Vector3(desired.x - mv.x, 0, desired.z - mv.z)
        o.position.sub(blocked.multiplyScalar(1))
      }
      p.position.copy(next)
    }
    p.speed = Math.hypot(p.velocity.x, p.velocity.z) / (xr ? scale : 1)
    const localV = p.velocity.clone().applyAxisAngle(UP, -S.bodyYaw)
    p.moveX = MathUtils.clamp(localV.x / Math.max(0.1, s.moveSpeed), -1, 1)
    p.moveZ = MathUtils.clamp(-localV.z / Math.max(0.1, s.moveSpeed), -1, 1)

    // 落ちたら出現位置へ
    if (p.position.y < -80) engine.runtime.respawn()
    if (f.respawn) engine.runtime.respawn()

    // ---------------- カメラ・XR の基準 ----------------
    if (xr) {
      o.scale.setScalar(scale)
      o.rotation.set(0, S.originYaw, 0)
      const seatedLift = s.seatedMode ? Math.max(0, s.playerHeight * 0.935 - 1.25) * scale : 0
      if (p.sitting) {
        // 座る: 頭が座席の上の目の高さに来るよう、基準を下げる（座ったときに一度だけ決める）
        if (!S.sitOffset && headLocal) {
          const seatHeadY = p.position.y + (eye - avatarHipsAboveSeat(eye))
          const headW = headLocal.p.clone().multiplyScalar(scale).applyAxisAngle(UP, S.originYaw)
          S.sitOffset = new Vector3(p.position.x - headW.x, seatHeadY - headW.y, p.position.z - headW.z)
        }
        if (S.sitOffset) o.position.copy(S.sitOffset)
      } else {
        S.sitOffset = null
        if (headLocal) {
          const hw = headLocal.p.clone().multiplyScalar(scale).applyAxisAngle(UP, S.originYaw)
          o.position.set(p.position.x - hw.x, p.position.y + seatedLift, p.position.z - hw.z)
        }
      }
      o.updateMatrixWorld(true)
      // 頭（ワールド）
      if (headLocal) {
        p.head.p.copy(headLocal.p).applyMatrix4(o.matrixWorld)
        p.head.q.copy(_q.setFromEuler(new Euler(0, S.originYaw, 0))).multiply(headLocal.q)
        const hy = new Euler().setFromQuaternion(p.head.q, 'YXZ').y
        // 体の向き: 頭が大きく横を向いたか、移動しているときに頭へそろえる
        const diff = MathUtils.euclideanModulo(hy - S.bodyYaw + Math.PI, Math.PI * 2) - Math.PI
        if (!p.sitting && (Math.abs(diff) > 0.9 || p.speed > 0.3)) S.bodyYaw += diff * (1 - Math.exp(-dt * (p.speed > 0.3 ? 8 : 4)))
        p.yaw = S.bodyYaw
        p.pitch = new Euler().setFromQuaternion(p.head.q, 'YXZ').x
        // 寝転んだら自動で寝るポーズ（[205]）
        if (s.autoSleep && !p.sitting) autoSleep(p, headLocal, dt, S)
      }
      p.left = xrInput.left.connected ? { p: xrInput.left.gripP.clone(), q: xrInput.left.gripQ.clone() } : null
      p.right = xrInput.right.connected ? { p: xrInput.right.gripP.clone(), q: xrInput.right.gripQ.clone() } : null
      p.eyeHeight = p.head.p.y - p.position.y
      // 体のトラッカー（Windows 版の SteamVR など）。腰のトラッカーがあれば体の向きもそれに合わせる
      p.trackers = p.sitting || p.sleep !== SleepPose.None ? null : readBodyTrackers(gl, o, S.bodyYaw, p.position.y, Math.max(0.04, p.eyeHeight * 0.055))
      if (p.trackers) {
        S.bodyYaw = new Euler().setFromQuaternion(p.trackers.hips.q, 'YXZ').y - Math.PI
        p.yaw = S.bodyYaw
      }
    } else {
      // PC・スマホ: 目の高さに視点を置く
      p.trackers = null
      if (!p.sitting) S.bodyYaw = p.yaw
      else p.yaw = MathUtils.clamp(p.yaw, S.bodyYaw - 2.2, S.bodyYaw + 2.2)
      const crouchEye = p.prone ? 0.28 : p.crouch ? 0.62 : 1
      let eyeY = eye * crouchEye + s.desktopEyeOffset
      if (p.sitting) eyeY = eye - avatarHipsAboveSeat(eye) + 0.02
      if (p.sleep !== SleepPose.None) eyeY = 0.3
      const eyeP = p.position.clone().add(new Vector3(0, eyeY, 0))
      if (p.sleep !== SleepPose.None) eyeP.add(new Vector3(-Math.sin(S.bodyYaw), 0, -Math.cos(S.bodyYaw)).multiplyScalar(-0.5))
      _e.set(p.pitch, p.yaw, 0, 'YXZ')
      p.head.q.setFromEuler(_e)
      p.head.p.copy(eyeP)
      {
        if (p.thirdPerson) {
          const back = new Vector3(0, 0, 1).applyQuaternion(p.head.q).multiplyScalar(2.4 * Math.max(0.6, eye / 1.5))
          camera.position.copy(eyeP).add(back).add(new Vector3(0, 0.25, 0))
          camera.quaternion.copy(p.head.q)
        } else {
          camera.position.copy(eyeP)
          camera.quaternion.copy(p.head.q)
        }
        camera.layers.disable(10)
        camera.layers.enable(9)
        if (p.thirdPerson) {
          camera.layers.enable(10)
          camera.layers.disable(9)
        }
      }
      o.position.copy(p.position)
      o.rotation.set(0, p.yaw, 0)
      o.scale.setScalar(1)
      p.left = null
      p.right = engine.held.desktop ? { p: camera.position.clone().add(new Vector3(0.25, -0.25, -0.5).applyQuaternion(camera.quaternion)), q: camera.quaternion.clone() } : null
      p.eyeHeight = eyeY
    }
    p.height = eye / 0.93

    // ---------------- 指 ----------------
    p.fingers = xr ? fingerCurls(gl) : null

    // ---------------- 姿勢を送る（20Hz） ----------------
    S.sendAcc += dt
    if (S.sendAcc >= 0.05) {
      S.sendAcc = 0
      const rel = (v: Vector3) => ({ x: v.x - p.position.x, y: v.y - p.position.y, z: v.z - p.position.z })
      const q = (x: Quaternion) => ({ x: x.x, y: x.y, z: x.z, w: x.w })
      let flags = 0
      if (xr) flags |= PoseFlag.VR
      if (p.grounded) flags |= PoseFlag.Grounded
      if (p.crouch) flags |= PoseFlag.Crouch
      if (p.prone) flags |= PoseFlag.Prone
      if (p.sitting) flags |= PoseFlag.Sitting
      if (p.handTracking) flags |= PoseFlag.HandTracking
      if (p.talking) flags |= PoseFlag.Talking
      if (engine.voice.muted) flags |= PoseFlag.Muted
      if (p.jumping) flags |= PoseFlag.Jumping
      const left = p.left ?? { p: p.head.p, q: p.head.q }
      const rightH = p.right ?? { p: p.head.p, q: p.head.q }
      engine.session.sendPose({
        flags,
        sleep: p.sleep,
        root: { x: p.position.x, y: p.position.y, z: p.position.z },
        yaw: p.yaw,
        speed: p.speed,
        moveX: p.moveX,
        moveZ: p.moveZ,
        head: { p: rel(p.head.p), q: q(p.head.q) },
        left: { p: rel(left.p), q: q(left.q) },
        right: { p: rel(rightH.p), q: q(rightH.q) },
        fingers: p.fingers ?? undefined,
        trackers: p.trackers ? [p.trackers.hips, p.trackers.left, p.trackers.right].map((t) => ({ p: rel(t.p), q: q(t.q) })) as [TrackedPoint, TrackedPoint, TrackedPoint] : undefined,
      })
    }
  }, -3)

  return <XROrigin ref={origin} />
}

/** アバターの、座ったときの座面から目までの高さの目安 */
const avatarHipsAboveSeat = (eye: number) => eye * 0.47

/** メニューやチャットを開く入力 */
const menuInputs = (f: InputFrame) => {
  if (f.menu) menuBus.toggle()
  if (f.chat) menuBus.openChat()
  if (f.muteToggle) menuBus.toggleMute()
  menuBus.setPtt(f.ptt)
  if (f.gesture !== null) menuBus.gesture(f.gesture)
  // 押す・つかむは操作の処理（InteractionSystem）へ渡す
  if (f.tap) pendingTap.value = f.tap
  else if (f.interact) pendingClick.value = true
  if (f.grabToggle) pendingGrab.value = true
  if (f.use) pendingUse.value = true
  if (f.holdDistance) pendingWheel.value += f.holdDistance
}

/** 寝転んだかを頭の向きと高さで判定する（誤判定しないよう 2 秒続いたら） */
const autoSleep = (p: WorldEngine['player'], head: { p: Vector3; q: Quaternion }, dt: number, S: { sleepTimer: number; wakeTimer: number }) => {
  const up = new Vector3(0, 1, 0).applyQuaternion(head.q)
  const fwd = new Vector3(0, 0, -1).applyQuaternion(head.q)
  const lying = head.p.y < 0.55 && Math.abs(up.y) < 0.55
  if (p.sleep === SleepPose.None || p.autoSleep) {
    if (lying) {
      S.sleepTimer += dt
      S.wakeTimer = 0
      if (S.sleepTimer > 2) {
        const pose = fwd.y > 0.6 ? SleepPose.Supine : fwd.y < -0.6 ? SleepPose.Prone : up.dot(new Vector3(1, 0, 0).applyQuaternion(new Quaternion().setFromAxisAngle(UP, new Euler().setFromQuaternion(head.q, 'YXZ').y))) > 0 ? SleepPose.Left : SleepPose.Right
        p.sleep = pose
        p.autoSleep = true
      }
    } else {
      S.sleepTimer = 0
      if (p.autoSleep) {
        S.wakeTimer += dt
        if (S.wakeTimer > 1 && up.y > 0.7) {
          p.sleep = SleepPose.None
          p.autoSleep = false
        }
      }
    }
  }
}

// ---------------- VR の入力を読む ----------------

const prev: Record<'left' | 'right', boolean[]> = { left: [], right: [] }
const readXrInput = (gl: WebGLRenderer, origin: Group) => {
  const session = gl.xr.getSession()
  const frame = gl.xr.getFrame()
  const ref = gl.xr.getReferenceSpace()
  xrInput.active = !!session
  for (const h of ['left', 'right'] as const) {
    const st = xrInput[h]
    st.connected = false
    st.triggerDown = st.triggerUp = st.squeezeDown = st.squeezeUp = st.primaryDown = st.secondaryDown = st.stickDown = false
    st.stick.x = st.stick.y = 0
  }
  if (!session || !frame || !ref) return
  origin.updateMatrixWorld(true)
  for (const src of session.inputSources) {
    const h = src.handedness
    if (h !== 'left' && h !== 'right') continue
    const st: HandInput = xrInput[h]
    st.source = src
    st.connected = true
    st.handTracking = !!src.hand
    if (src.gripSpace) xrSpaceToWorld(gl, src.gripSpace, origin, st.gripP, st.gripQ)
    const rq = new Quaternion()
    if (xrSpaceToWorld(gl, src.targetRaySpace, origin, st.rayP, rq)) st.rayDir.set(0, 0, -1).applyQuaternion(rq)
    if (src.hand) {
      // ハンドトラッキング: 手首を握りの代わりにし、つまむ動作をトリガーにする
      const wrist = src.hand.get('wrist')
      const tip = src.hand.get('index-finger-tip')
      const thumb = src.hand.get('thumb-tip')
      const q = new Quaternion()
      if (wrist && !src.gripSpace) xrSpaceToWorld(gl, wrist, origin, st.gripP, st.gripQ)
      const tp = new Vector3()
      const th = new Vector3()
      if (tip && xrSpaceToWorld(gl, tip, origin, tp, q)) st.tipP.copy(tp)
      if (tip && thumb && xrSpaceToWorld(gl, thumb, origin, th, q)) {
        const pinch = MathUtils.clamp(1 - (tp.distanceTo(th) / origin.scale.x - 0.045) / 0.05, 0, 1)
        const was = st.trigger > 0.8
        st.trigger = pinch
        st.triggerDown = !was && pinch > 0.8
        st.triggerUp = was && pinch < 0.5
      }
      continue
    }
    const gp = src.gamepad
    if (!gp) continue
    const b = gp.buttons.map((x) => x.pressed)
    const pv = prev[h]
    const edge = (i: number) => !!b[i] && !pv[i]
    const release = (i: number) => !b[i] && !!pv[i]
    st.trigger = gp.buttons[0]?.value ?? 0
    st.squeeze = gp.buttons[1]?.value ?? 0
    st.triggerDown = edge(0)
    st.triggerUp = release(0)
    st.squeezeDown = edge(1)
    st.squeezeUp = release(1)
    st.stickDown = edge(3)
    st.primaryDown = edge(4)
    st.secondaryDown = edge(5)
    const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] ?? 0, gp.axes[1] ?? 0]
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v)
    st.stick.x = dz(ax[0])
    st.stick.y = dz(ax[1])
    // 人差し指の先（触る操作）: 握りから前へ
    st.tipP.copy(st.gripP).add(new Vector3(0, -0.015, -0.085).multiplyScalar(origin.scale.x).applyQuaternion(st.gripQ))
    prev[h] = b
  }
}

/** 指の曲がり: ハンドトラッキングなら関節から、コントローラーならボタンの触れ方から */
const fingerCurls = (gl: WebGLRenderer): number[] | null => {
  const session = gl.xr.getSession()
  const frame = gl.xr.getFrame()
  const ref = gl.xr.getReferenceSpace()
  if (!session || !frame || !ref) return null
  const out = [0.2, 0.2, 0.3, 0.35, 0.4, 0.2, 0.2, 0.3, 0.35, 0.4]
  // コントローラーを持ったまま取れる指の関節（SteamVR の Index など）
  const skel = skeletalCurls(gl)
  for (const src of session.inputSources) {
    const base = src.handedness === 'left' ? 0 : src.handedness === 'right' ? 5 : -1
    if (base < 0) continue
    if (src.hand) {
      const c = handCurls(frame, ref, src.hand)
      if (c) for (let i = 0; i < 5; i++) out[base + i] = c[i]
      continue
    }
    const sk = skel?.[base === 0 ? 0 : 1]
    if (sk) {
      for (let i = 0; i < 5; i++) out[base + i] = sk[i]
      continue
    }
    const gp = src.gamepad
    if (!gp) continue
    const btn = gp.buttons
    const trig = btn[0]?.value ?? 0
    const grip = btn[1]?.value ?? 0
    const thumbTouch = !!(btn[3]?.touched || btn[4]?.touched || btn[5]?.touched || btn[2]?.touched)
    out[base] = thumbTouch ? 0.85 : 0.15
    out[base + 1] = btn[0]?.touched ? 0.35 + trig * 0.65 : 0.05
    out[base + 2] = 0.1 + grip * 0.9
    out[base + 3] = 0.1 + grip * 0.9
    out[base + 4] = 0.1 + grip * 0.9
  }
  return out
}
