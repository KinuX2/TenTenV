// 自分と他の人のアバター・名前表示・吹き出し・声
import { useFrame, useThree } from '@react-three/fiber'
import { PoseFlag, SleepPose, type AvatarExtensions, type HandGesture, type PoseFrame } from '@tentenv/protocol'
import { FaceCamera, LAYERS, TextPlane } from '@tentenv/sdk'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Group, MathUtils, Object3D, Quaternion, Vector3, type Mesh } from 'three'
import { AvatarView, type AvatarFrame } from '../avatar/AvatarView'
import { gestureExpression } from '../avatar/face'
import { classifyGesture, GESTURE_CURLS, type PoseInput } from '../avatar/poser'
import type { AvatarModel } from '../avatar/types'
import type { Member } from '../net/session'
import { useModeration } from '../state/moderation'
import { contactAllowed, myContactAllows } from './contact'
import { settings, useSettings } from '../state/settings'
import type { WorldEngine } from './engine'
import { haptic, xrInput } from '../player/xrInput'
import { iconTexture } from '../ui/iconTextures'
import { L } from '../i18n'
import { compactExpression, oscFaceExpression } from '../features/oscFace'

// ---------------- 自分 ----------------

export const LocalAvatar: React.FC<{ engine: WorldEngine; onEye: (eye: number, model: AvatarModel | null) => void; extensions: AvatarExtensions | null }> = ({ engine, onEye, extensions }) => {
  const [avatar, setAvatar] = useState(engine.avatarRef)
  useEffect(() => {
    const h = () => setAvatar(engine.avatarRef)
    window.addEventListener('ttv-avatar-changed', h)
    return () => window.removeEventListener('ttv-avatar-changed', h)
  }, [engine])
  const scale = avatar.scale
  const lastSend = useRef(0)
  const look = useRef<[number, number, number] | null>(null)
  const modelRef = useRef<AvatarModel | null>(null)
  // 触れられた（[43]）: 一瞬うれしい顔にして、手を振るわせる
  useEffect(
    () =>
      engine.session.touchEv.on((_, part) => {
        const face = (modelRef.current as (AvatarModel & { face?: { react: (n: string) => void } }) | null)?.face
        face?.react(part === 'head' ? 'happy' : 'surprised')
        haptic('left', 0.2 * settings().hapticsStrength, 15)
        haptic('right', 0.2 * settings().hapticsStrength, 15)
      }),
    [engine],
  )
  // 他の人の手を、自分の揺れものに当てる（自分が接触を許しているときだけ）
  const colliderKey = useRef('')
  useFrame(({ scene }) => {
    const lh = engine.localHands
    if (lh.left.parent !== scene) scene.add(lh.left, lh.right)
    const p = engine.player
    if (p.vr) {
      lh.left.position.copy(xrInput.left.tipP)
      lh.right.position.copy(xrInput.right.tipP)
    } else {
      lh.left.position.set(0, -1000, 0)
      lh.right.position.set(0, -1000, 0)
    }
    const m = modelRef.current
    if (!m) return
    const ids = [...engine.remoteHands.keys()].sort().join(',')
    if (ids === colliderKey.current) return
    colliderKey.current = ids
    const list = [...engine.remoteHands.values()].flatMap((h) => [{ obj: h.left, radius: 0.045 }, { obj: h.right, radius: 0.045 }])
    m.setExtraColliders(list)
  })
  const frame = (dt: number): AvatarFrame => {
    const p = engine.player
    // 手の形: VR は指から、PC・スマホは選んだもの
    const curls = p.fingers ?? [...GESTURE_CURLS[p.manualGesture[0] ?? 'neutral'], ...GESTURE_CURLS[p.manualGesture[1] ?? 'neutral']]
    const gl: HandGesture = p.manualGesture[0] ?? (p.fingers ? classifyGesture(curls.slice(0, 5)) : 'neutral')
    const gr: HandGesture = p.manualGesture[1] ?? (p.fingers ? classifyGesture(curls.slice(5, 10)) : 'neutral')
    p.gesture = [gl, gr]
    let expression = gestureExpression(p.gesture, extensions, p.manualExpression)
    // OSC で表情を受け取っているときは、その表情を使う（選んだ表情があればそちらを優先）
    const osc = p.manualExpression ? null : oscFaceExpression(modelRef.current?.expressions ?? [])
    if (osc) expression = compactExpression({ ...expression, ...osc })
    const now = performance.now()
    if (now - lastSend.current > 100) {
      lastSend.current = now
      engine.session.setExpression(expression, p.gesture)
    }
    const voice = engine.voice.localLevel(dt)
    p.talking = voice.talking
    // 近くの人の顔を見る
    if (Math.random() < 0.05) look.current = nearestHead(engine, p.head.p)
    const pose: PoseInput = {
      root: p.position,
      yaw: p.yaw,
      vr: p.vr,
      head: p.vr ? p.head : null,
      left: p.left,
      right: p.right,
      pitch: p.pitch,
      fingers: curls,
      trackers: p.trackers,
      speed: p.speed,
      moveX: p.moveX,
      moveZ: p.moveZ,
      grounded: p.grounded,
      crouch: p.crouch,
      prone: p.prone,
      sitting: !!p.sitting,
      sleep: p.sleep,
      scale,
    }
    return { pose, expression, voice, look: look.current, motion: engine.avatarMotion(engine.session.selfId), motionTime: engine.session.clock.now() }
  }
  return (
    <AvatarView
      avatar={avatar}
      local
      ignoreLimits
      frame={frame}
      onModel={(m) => {
        modelRef.current = m
        engine.localAvatarModel = m
        onEye(m ? m.eyeHeight * scale : 1.6 * scale, m)
      }}
      afterPose={(m) => {
        // 揺れものに自分の手を当てる（自分の髪も触れる）
        void m
      }}
    />
  )
}

const nearestHead = (engine: WorldEngine, from: Vector3): [number, number, number] | null => {
  let best: [number, number, number] | null = null
  let bd = 3.5
  for (const [, pose] of engine.remotePoses) {
    const d = Math.hypot(pose.head[0] - from.x, pose.head[1] - from.y, pose.head[2] - from.z)
    if (d < bd) {
      bd = d
      best = pose.head
    }
  }
  return best
}

// ---------------- 他の人 ----------------

const useMembers = (engine: WorldEngine) => {
  const s = engine.session
  const sub = (cb: () => void) => {
    const a = s.membersEv.on(cb)
    const b = s.avatarEv.on(cb)
    return () => {
      a()
      b()
    }
  }
  const snap = () => s.verifiedMembers().map((m) => `${m.desc.peerId}:${m.avatar?.kind === 'vrm' ? m.avatar.sha256 : (m.avatar?.color ?? '')}:${(m.avatar?.outfits ?? []).join(',')}`).join('|')
  useSyncExternalStore(sub, snap, snap)
  return s.verifiedMembers()
}

export const RemotePlayers: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const members = useMembers(engine)
  const maxAvatars = useSettings((s) => s.s.maxAvatars)
  const camera = useThree((s) => s.camera)
  // 近い人から maxAvatars 人までをアバターで出す
  const [near, setNear] = useState<Set<string>>(new Set())
  const acc = useRef(0)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.5) return
    acc.current = 0
    const cam = camera.getWorldPosition(new Vector3())
    const cull = settings().avatarCullDistance
    const list = [...engine.remotePoses.entries()]
      .map(([id, p]) => ({ id, d: Math.hypot(p.position[0] - cam.x, p.position[1] - cam.y, p.position[2] - cam.z) }))
      .filter((x) => x.d < cull)
      .sort((a, b) => a.d - b.d)
      .slice(0, maxAvatars)
      .map((x) => x.id)
    const next = new Set(list)
    if (next.size !== near.size || [...next].some((x) => !near.has(x))) setNear(next)
  })
  useEffect(() => {
    engine.session.sweep()
  })
  return (
    <>
      {members.map((m) => (
        <RemotePlayer key={m.desc.peerId} engine={engine} member={m} showAvatar={near.has(m.desc.peerId) || engine.remotePoses.size < 4} />
      ))}
    </>
  )
}

const _qa = new Quaternion()
const _qb = new Quaternion()

/** 受け取った姿勢を少し遅らせて、前後のフレームの間を補う */
const sampleFrames = (m: Member, t: number): PoseFrame | null => {
  const fr = m.frames
  if (!fr.length) return null
  if (fr.length === 1 || t <= fr[0].t) return fr[0].f
  for (let i = fr.length - 1; i > 0; i--) {
    const a = fr[i - 1]
    const b = fr[i]
    if (t >= a.t && t <= b.t) return lerpFrame(a.f, b.f, (t - a.t) / Math.max(1, b.t - a.t))
  }
  // 最新より先: 少しだけ先を読む
  const last = fr[fr.length - 1]
  const prev = fr[fr.length - 2]
  const ahead = Math.min(200, t - last.t)
  const k = ahead / Math.max(1, last.t - prev.t)
  return lerpFrame(prev.f, last.f, 1 + Math.min(k, 1) * 0.5)
}
const lerpV = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k })
const slerpQ = (a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }, k: number) => {
  _qa.set(a.x, a.y, a.z, a.w)
  _qb.set(b.x, b.y, b.z, b.w)
  _qa.slerp(_qb, Math.min(1, Math.max(0, k)))
  return { x: _qa.x, y: _qa.y, z: _qa.z, w: _qa.w }
}
const lerpAngle = (a: number, b: number, k: number) => a + (MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI) * k
const lerpFrame = (a: PoseFrame, b: PoseFrame, k: number): PoseFrame => ({
  ...b,
  root: lerpV(a.root, b.root, k),
  yaw: lerpAngle(a.yaw, b.yaw, k),
  speed: a.speed + (b.speed - a.speed) * Math.min(1, k),
  head: { p: lerpV(a.head.p, b.head.p, k), q: slerpQ(a.head.q, b.head.q, k) },
  left: { p: lerpV(a.left.p, b.left.p, k), q: slerpQ(a.left.q, b.left.q, k) },
  right: { p: lerpV(a.right.p, b.right.p, k), q: slerpQ(a.right.q, b.right.q, k) },
  fingers: a.fingers && b.fingers ? a.fingers.map((x, i) => x + (b.fingers![i] - x) * Math.min(1, k)) : b.fingers,
})

const STATUS_COLOR: Record<string, string> = { online: '#91c93f', askme: '#fbbf24', offline: '#9ca3af' }

const RemotePlayer: React.FC<{ engine: WorldEngine; member: Member; showAvatar: boolean }> = ({ engine, member, showAvatar }) => {
  const peerId = member.desc.peerId
  const userId = member.desc.user.id
  const mod = useModeration()
  const hidden = mod.hiddenAvatars.has(userId) || settings().hideAllAvatars
  const shown = mod.shownAvatars.has(userId)
  const muted = mod.muted.has(userId)
  const label = useRef<Group>(null)
  const audioGroup = useRef<Group>(null)
  const talkRing = useRef<Mesh>(null)
  const [chat, setChat] = useState<{ text: string; at: number } | null>(null)
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)
  const showNames = useSettings((s) => s.s.showNameplates)
  const showBubbles = useSettings((s) => s.s.showChatBubbles)
  const latest = useRef<PoseFrame | null>(null)
  const head = useMemo(() => new Vector3(), [])
  const model = useRef<AvatarModel | null>(null)
  const touchCool = useRef(0)
  const hands = useMemo(() => ({ left: new Object3D(), right: new Object3D() }), [])
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.add(hands.left, hands.right)
    // 相手が VR で、自分が接触を許しているときだけ、自分の揺れものに当てる
    const allow = myContactAllows(userId)
    if (allow) engine.remoteHands.set(peerId, hands)
    return () => {
      scene.remove(hands.left, hands.right)
      engine.remoteHands.delete(peerId)
    }
  }, [engine, peerId, userId, hands, scene])

  useEffect(() => engine.session.chatEv.on((c) => c.from === peerId && setChat({ text: c.text, at: Date.now() })), [engine, peerId])
  useEffect(() => {
    if (!chat) return
    const t = setTimeout(() => setChat(null), 9000)
    return () => clearTimeout(t)
  }, [chat])
  useEffect(() => {
    engine.voice.setSilenced(peerId, muted)
  }, [engine, peerId, muted])
  // 声を頭の位置に付ける
  useEffect(() => {
    let attached = false
    const attach = () => {
      const a = engine.voice.remoteAudio(peerId)
      if (a && audioGroup.current && a.parent !== audioGroup.current) {
        audioGroup.current.add(a)
        attached = true
      }
    }
    attach()
    const t = setInterval(() => !attached && attach(), 500)
    return () => clearInterval(t)
  }, [engine, peerId])

  const frame = (dt: number): AvatarFrame | null => {
    const t = engine.session.clock.now() - 110
    const f = sampleFrames(member, t)
    if (!f) return null
    latest.current = f
    const root = new Vector3(f.root.x, f.root.y, f.root.z)
    const abs = (p: { x: number; y: number; z: number }) => new Vector3(p.x + root.x, p.y + root.y, p.z + root.z)
    const q = (x: { x: number; y: number; z: number; w: number }) => new Quaternion(x.x, x.y, x.z, x.w)
    const vr = (f.flags & PoseFlag.VR) !== 0
    head.copy(abs(f.head.p))
    if (vr) {
      hands.left.position.copy(abs(f.left.p))
      hands.right.position.copy(abs(f.right.p))
    } else {
      hands.left.position.set(0, -1000, 0)
      hands.right.position.set(0, -1000, 0)
    }
    const pose: PoseInput = {
      root,
      yaw: f.yaw,
      vr,
      head: vr ? { p: head.clone(), q: q(f.head.q) } : null,
      left: vr ? { p: abs(f.left.p), q: q(f.left.q) } : null,
      right: vr ? { p: abs(f.right.p), q: q(f.right.q) } : null,
      pitch: pitchOf(q(f.head.q)),
      fingers: f.fingers ?? null,
      trackers: vr && f.trackers ? { hips: { p: abs(f.trackers[0].p), q: q(f.trackers[0].q) }, left: { p: abs(f.trackers[1].p), q: q(f.trackers[1].q) }, right: { p: abs(f.trackers[2].p), q: q(f.trackers[2].q) } } : null,
      speed: f.speed,
      moveX: f.moveX,
      moveZ: f.moveZ,
      grounded: (f.flags & PoseFlag.Grounded) !== 0,
      crouch: (f.flags & PoseFlag.Crouch) !== 0,
      prone: (f.flags & PoseFlag.Prone) !== 0,
      sitting: (f.flags & PoseFlag.Sitting) !== 0,
      sleep: f.sleep as SleepPose,
      scale: member.avatar?.scale ?? 1,
    }
    // 他のコード（ワールド・判定）から使う姿勢
    engine.remotePoses.set(peerId, {
      position: [root.x, root.y, root.z],
      yaw: f.yaw,
      head: [head.x, head.y, head.z],
      leftHand: [pose.left?.p.x ?? head.x, pose.left?.p.y ?? head.y, pose.left?.p.z ?? head.z],
      rightHand: [pose.right?.p.x ?? head.x, pose.right?.p.y ?? head.y, pose.right?.p.z ?? head.z],
      height: (model.current?.height ?? 1.7) * pose.scale,
      eyeHeight: (model.current?.eyeHeight ?? 1.6) * pose.scale,
      grounded: pose.grounded,
      sitting: pose.sitting,
      velocity: [0, 0, 0],
    })
    const voice = engine.voice.remoteLevel(peerId, dt)
    const cam = engine.player.head.p
    const look: [number, number, number] | null = cam.distanceTo(head) < 4 ? [cam.x, cam.y, cam.z] : null
    // 自分の手が相手に触れたか（相手が許可しているときだけ）
    if (engine.player.vr && contactAllowed(member.allowContact, member.desc.user.id)) checkTouch(engine, member, head, () => {
      if (performance.now() < touchCool.current) return
      touchCool.current = performance.now() + 800
    })
    return { pose, expression: member.expr.weights, voice, look, motion: engine.avatarMotion(peerId), motionTime: engine.session.clock.now() }
  }

  useFrame(({ camera }) => {
    const f = latest.current
    if (!f || !label.current) return
    const h = (model.current?.height ?? 1.75) * (member.avatar?.scale ?? 1)
    const sleeping = f.sleep !== SleepPose.None
    label.current.position.set(f.root.x, f.root.y + (sleeping ? 0.6 : h + 0.22), f.root.z)
    if (audioGroup.current) audioGroup.current.position.copy(head)
    const d = camera.position.distanceTo(label.current.position)
    label.current.scale.setScalar(MathUtils.clamp(d / 6, 0.6, 2.2))
    const talking = engine.voice.remoteLevel(peerId, 0).talking
    if (talkRing.current) talkRing.current.visible = talking && !muted
    if (engine.remotePoses.has(peerId) && !engine.session.members.has(peerId)) engine.remotePoses.delete(peerId)
  })
  useEffect(() => () => void engine.remotePoses.delete(peerId), [engine, peerId])

  const name = member.desc.user.displayName
  const status = STATUS_COLOR[member.desc.user.status] ?? STATUS_COLOR.online
  const role = engine.session.role(peerId)
  return (
    <>
      {showAvatar && (
        <AvatarView
          avatar={member.avatar}
          ignoreLimits={shown}
          forceFallback={hidden && !shown}
          frame={frame}
          onModel={(m, info) => {
            model.current = m
            setFallbackReason(info.reason)
            // 自分の手を相手の揺れものに当てる（相手が許しているときだけ）
            if (m && contactAllowed(member.allowContact, member.desc.user.id)) m.setExtraColliders([{ obj: engine.localHands.left, radius: 0.045 }, { obj: engine.localHands.right, radius: 0.045 }])
          }}
        />
      )}
      {!showAvatar && <FarMarker engine={engine} peerId={peerId} frameFn={frame} />}
      <group ref={audioGroup} />
      <group ref={label} visible={showNames}>
        <FaceCamera>
          <group>
            <TextPlane text={name} width={0.9} lineHeight={0.1} bold background="#0b0e16cc" radius={0.05} position={[0, 0, 0]} renderOrder={10} />
            <mesh position={[-0.42, 0, 0.002]} renderOrder={11}>
              <circleGeometry args={[0.022, 16]} />
              <meshBasicMaterial color={status} toneMapped={false} />
            </mesh>
            <mesh ref={talkRing} position={[0, 0, -0.002]} visible={false}>
              <planeGeometry args={[0.96, 0.15]} />
              <meshBasicMaterial color="#4ade80" transparent opacity={0.85} toneMapped={false} />
            </mesh>
            {(role !== 'member' || engine.session.hostId() === peerId || muted || member.typing) && (
              <TextPlane
                text={[role === 'owner' ? L('作成者', 'Owner') : role === 'moderator' ? L('モデレーター', 'Moderator') : '', engine.session.hostId() === peerId ? L('ホスト', 'Host') : '', muted ? L('ミュート中', 'Muted') : '', member.typing ? L('入力中', 'Typing') : ''].filter(Boolean).join(' · ')}
                width={0.6}
                lineHeight={0.06}
                position={[0, 0.09, 0]}
                color="#cbd5e1"
              />
            )}
            {fallbackReason && (
              <mesh position={[0.5, 0, 0.002]} renderOrder={11}>
                <planeGeometry args={[0.07, 0.07]} />
                <meshBasicMaterial map={iconTexture('warning', '#fbbf24')} transparent toneMapped={false} />
              </mesh>
            )}
            {chat && showBubbles && <TextPlane text={chat.text} width={1.2} lineHeight={0.075} background="#ffffffee" color="#111827" radius={0.04} position={[0, 0.24, 0]} maxLines={6} renderOrder={12} />}
          </group>
        </FaceCamera>
      </group>
    </>
  )
}

const pitchOf = (q: Quaternion) => {
  const f = new Vector3(0, 0, -1).applyQuaternion(q)
  return Math.asin(MathUtils.clamp(f.y, -1, 1))
}

/** 遠くの人は小さな印だけ */
const FarMarker: React.FC<{ engine: WorldEngine; peerId: string; frameFn: (dt: number) => AvatarFrame | null }> = ({ frameFn }) => {
  const ref = useRef<Mesh>(null)
  useFrame((_, dt) => {
    const f = frameFn(dt)
    if (!f || !ref.current) return
    ref.current.position.copy(f.pose.root).add(new Vector3(0, 0.9 * f.pose.scale, 0))
  })
  return (
    <mesh ref={ref} layers={LAYERS.AVATAR}>
      <capsuleGeometry args={[0.2, 1, 4, 8]} />
      <meshStandardMaterial color="#64748b" transparent opacity={0.5} />
    </mesh>
  )
}

/** 自分の手が相手の頭・手に触れたら、振動させて相手に知らせる（[43][44]） */
const checkTouch = (engine: WorldEngine, member: Member, head: Vector3, onTouch: () => void) => {
  for (const h of ['left', 'right'] as const) {
    const hand = xrInput[h]
    if (!hand.connected) continue
    const dHead = hand.tipP.distanceTo(head)
    if (dHead < 0.16) {
      haptic(h, 0.25 * settings().hapticsStrength * 2, 20)
      onTouch()
      engine.session.sendTouch(member.desc.peerId, 'head', 1 - dHead / 0.16)
      engine.session.emit('sys.contact', { peerId: member.desc.peerId, part: 'head' }, engine.session.selfId)
    }
  }
}
