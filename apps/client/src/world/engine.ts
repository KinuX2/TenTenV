// インスタンスに入っている間の中心。ワールドの実行環境（SDK の WorldRuntime）をここで実装する
import { SleepPose, type AvatarRef, type HandGesture, type InstanceInfo, type WorldInfo, type WorldManifest } from '@tentenv/protocol'
import type { ClickSpec, DeviceKind, FileRequest, PickupSpec, PlayerInfo, PlayerPose, SeatSpec, WorldRuntime, ConfirmRequest, PromptRequest } from '@tentenv/sdk'
import { domainAllowed } from '@tentenv/sdk/manifest'
import { AudioListener, Object3D, Quaternion, Vector3, type Vector3Tuple } from 'three'
import type { Api } from '../api/api'
import type { InstanceSession } from '../net/session'
import { VoiceManager } from '../net/voice'
import { settings } from '../state/settings'
import { Emitter } from '../net/transport'
import { uiBridge } from '../ui/bridge'
import type { BodyPose } from '../features/bodyTracking'
import type { AvatarModel } from '../avatar/types'
import { isAvatarMotionState, makeAvatarMotionState, makeTimedAvatarMotion, sampleAvatarMotion, type AvatarMotionState } from '../avatar/worldMotion'
import { capturePickupPlacement } from './pickupPlacement'
import { ScreenShareManager } from './screenShare'
import { readAvatarBones } from '../avatar/boneReader'
import { L } from '../i18n'

export interface LocalPlayerState {
  position: Vector3
  velocity: Vector3
  yaw: number
  pitch: number
  grounded: boolean
  crouch: boolean
  prone: boolean
  flying: boolean
  jumping: boolean
  sitting: { seatId: string; obj: Object3D } | null
  sleep: SleepPose
  autoSleep: boolean
  head: { p: Vector3; q: Quaternion }
  left: { p: Vector3; q: Quaternion } | null
  right: { p: Vector3; q: Quaternion } | null
  fingers: number[] | null
  /** 体のトラッカー（腰・左足首・右足首、ワールド）。使っていなければ null */
  trackers: BodyPose | null
  handTracking: boolean
  speed: number
  moveX: number
  moveZ: number
  vr: boolean
  device: DeviceKind
  eyeHeight: number
  height: number
  /** 手で選んだジェスチャー（PC・スマホ）。null なら手の形から判定 */
  manualGesture: [HandGesture | null, HandGesture | null]
  gesture: [HandGesture, HandGesture]
  /** 手で選んだ表情（アクションメニュー） */
  manualExpression: string | null
  talking: boolean
  thirdPerson: boolean
}

export interface Interactable {
  id: number
  obj: Object3D
  spec: () => ClickSpec
}

export interface PickupEntry {
  id: string
  obj: Object3D
  spec: () => PickupSpec
  /** 物理演算の体（PickupSystem が作る） */
  body: unknown
  /** 受け取った位置（持ち主以外） */
  net: { t: number; p: Vector3; q: Quaternion; vel: Vector3 }[]
  /** つかんでいる間の、手から見た位置と向き */
  grabOffset: { p: Vector3; q: Quaternion } | null
  hand: 'left' | 'right' | 'desktop' | null
  /** この端末で「使う」を押し続けているか */
  using: boolean
  lastSent: number
  home: { p: Vector3; q: Quaternion }
}

export interface SeatEntry {
  id: string
  obj: Object3D
  spec: () => SeatSpec
}

export interface SpawnEntry {
  id: number
  position: Vector3Tuple
  yaw: number
}

export interface WorldContext {
  api: Api | null
  session: InstanceSession
  world: { id: string; name: string; baseUrl: string; manifest: WorldManifest }
  instance: InstanceInfo | { id: string; persistent: boolean; worldId: string }
  dev: boolean
}

let nextId = 1

export class WorldEngine {
  readonly session: InstanceSession
  readonly listener = new AudioListener()
  readonly voice: VoiceManager
  readonly screenShare: ScreenShareManager
  readonly interactables = new Map<number, Interactable>()
  readonly pickups = new Map<string, PickupEntry>()
  readonly seats = new Map<string, SeatEntry>()
  readonly spawns: SpawnEntry[] = []
  readonly interactEv = new Emitter<[]>()
  readonly player: LocalPlayerState
  readonly ctx: WorldContext
  readonly runtime: WorldRuntime
  private deviceEv = new Emitter<[DeviceKind]>()
  /** 移動の処理（LocalPlayer）が受け取るテレポート */
  pendingTeleport: { position: Vector3; yaw?: number } | null = null
  /** つかめる物を自分が持っているか（同時に 2 つまで） */
  held: Record<'left' | 'right' | 'desktop', string | null> = { left: null, right: null, desktop: null }
  navigate: (target: { worldId?: string; instanceId?: string }) => void = () => {}
  avatarRef: AvatarRef
  localAvatarModel: AvatarModel | null = null
  /** ほかの人の表示しているアバター（遠くて表示していない人は入らない） */
  readonly remoteAvatarModels = new Map<string, AvatarModel>()
  private avatarMotionCache = new WeakMap<object, AvatarMotionState | null>()

  setPickupUsing(pk: PickupEntry, pressed: boolean, newlyPressed = false) {
    if (pk.using === pressed) return
    pk.using = pressed
    const spec = pk.spec()
    const by = this.selfInfo()
    try {
      spec.onUseChange?.(pressed, by)
    } catch (e) {
      console.error('[world] onUseChange でエラー', e)
    }
    if (newlyPressed && pressed && pk.using) {
      try {
        spec.onUse?.(by)
      } catch (e) {
        console.error('[world] onUse でエラー', e)
      }
    }
  }

  constructor(ctx: WorldContext, avatar: AvatarRef) {
    this.ctx = ctx
    this.session = ctx.session
    this.avatarRef = avatar
    this.voice = new VoiceManager(this.listener)
    this.screenShare = new ScreenShareManager(this.session, this.listener.context as AudioContext)
    this.player = {
      position: new Vector3(),
      velocity: new Vector3(),
      yaw: 0,
      pitch: 0,
      grounded: true,
      crouch: false,
      prone: false,
      flying: false,
      jumping: false,
      sitting: null,
      sleep: SleepPose.None,
      autoSleep: false,
      head: { p: new Vector3(0, 1.6, 0), q: new Quaternion() },
      left: null,
      right: null,
      fingers: null,
      trackers: null,
      handTracking: false,
      speed: 0,
      moveX: 0,
      moveZ: 0,
      vr: false,
      device: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      eyeHeight: 1.6,
      height: 1.75,
      manualGesture: [null, null],
      gesture: ['neutral', 'neutral'],
      manualExpression: null,
      talking: false,
      thirdPerson: settings().thirdPerson,
    }
    this.runtime = this.createRuntime()
  }

  setDevice(d: DeviceKind) {
    if (this.player.device === d) return
    this.player.device = d
    this.player.vr = d === 'vr'
    this.deviceEv.emit(d)
  }

  /** 出現位置（最後に登録されたもの、なければマニフェストか原点） */
  spawnPoint(): { position: Vector3; yaw: number } {
    const s = this.spawns[this.spawns.length - 1]
    if (s) return { position: new Vector3(...s.position), yaw: s.yaw }
    const m = this.ctx.world.manifest.spawn
    if (m) return { position: new Vector3(...m.position), yaw: (m.yaw * Math.PI) / 180 }
    return { position: new Vector3(0, 0.1, 0), yaw: 0 }
  }

  playerInfo(peerId: string): PlayerInfo | null {
    const s = this.session
    if (peerId === s.selfId) return this.selfInfo()
    const m = s.members.get(peerId)
    if (!m || !m.verified) return null
    return {
      userId: m.desc.user.id,
      peerId,
      displayName: m.desc.user.displayName,
      iconUrl: m.desc.user.iconUrl,
      isLocal: false,
      isHost: s.hostId() === peerId,
      isGuest: !!m.desc.user.isGuest,
      role: s.role(peerId),
      device: (m.frames.length && m.frames[m.frames.length - 1].f.flags & 1 ? 'vr' : 'desktop') as DeviceKind,
    }
  }
  selfInfo(): PlayerInfo {
    const s = this.session
    const u = s.t.self.user
    return {
      userId: u.id,
      peerId: s.selfId,
      displayName: u.displayName,
      iconUrl: u.iconUrl,
      isLocal: true,
      isHost: s.isHost(),
      isGuest: !!u.isGuest,
      role: s.role(s.selfId),
      device: this.player.device,
    }
  }

  /** 手の位置の目印（揺れものの当たり判定に使う）。自分の手と、他の人の手 */
  readonly localHands = { left: new Object3D(), right: new Object3D() }
  readonly remoteHands = new Map<string, { left: Object3D; right: Object3D }>()

  /** 他の人の姿勢（RemotePlayers が毎フレーム書き込む） */
  readonly remotePoses = new Map<string, PlayerPose>()

  localPose(): PlayerPose {
    const p = this.player
    const v = (x: Vector3): Vector3Tuple => [x.x, x.y, x.z]
    const q = (x: Quaternion): [number, number, number, number] => [x.x, x.y, x.z, x.w]
    return {
      position: v(p.position),
      yaw: p.yaw,
      head: v(p.head.p),
      leftHand: p.left ? v(p.left.p) : v(p.head.p),
      rightHand: p.right ? v(p.right.p) : v(p.head.p),
      headRotation: q(p.head.q),
      leftHandRotation: q(p.left?.q ?? p.head.q),
      rightHandRotation: q(p.right?.q ?? p.head.q),
      handsTracked: p.vr && !!p.left && !!p.right,
      height: p.height,
      eyeHeight: p.eyeHeight,
      grounded: p.grounded,
      sitting: !!p.sitting,
      velocity: v(p.velocity),
    }
  }

  teleport(position: Vector3, yaw?: number) {
    this.pendingTeleport = { position: position.clone(), yaw }
  }

  private createRuntime(): WorldRuntime {
    const s = this.session
    const ctx = this.ctx
    const api = ctx.api
    const worldId = ctx.world.id
    const allowed = ctx.world.manifest.permissions.allowedDomains
    const isAllowed = (url: string) => {
      try {
        const u = new URL(url, location.href)
        if (u.origin === location.origin) return true
        if (api && u.origin === new URL(api.base).origin) return true
        if (url.startsWith(ctx.world.baseUrl)) return true
      } catch {
        return false
      }
      return domainAllowed(url, allowed) || (settings().allowUntrustedMedia && url.startsWith('https://'))
    }
    const kv = (scope: 'shared' | 'player') => ({
      get: async (key: string) => {
        if (!api) return localKv(worldId, scope).get(key)
        try {
          return (await api.storageGet(worldId, scope, key)).value
        } catch (e) {
          if ((e as { status?: number }).status === 404) return undefined
          throw e
        }
      },
      list: async () => (api ? api.storageList(worldId, scope) : localKv(worldId, scope).list()),
      set: async (key: string, value: unknown) => (api ? api.storageSet(worldId, scope, key, value) : localKv(worldId, scope).set(key, value)),
      increment: async (key: string, delta: number) => (api ? (await api.storageInc(worldId, scope, key, delta)).value : localKv(worldId, scope).increment(key, delta)),
      remove: async (key: string) => (api ? api.storageDel(worldId, scope, key) : localKv(worldId, scope).remove(key)),
    })
    const rt: WorldRuntime = {
      baseUrl: ctx.world.baseUrl,
      world: { id: worldId, name: ctx.world.name },
      instance: { id: ctx.instance.id, persistent: !!(ctx.instance as { persistent?: boolean }).persistent },
      dev: ctx.dev,
      device: () => this.player.device,
      onDeviceChange: (cb) => this.deviceEv.on(cb),
      self: () => this.selfInfo(),
      players: () => [this.selfInfo(), ...s.verifiedMembers().map((m) => this.playerInfo(m.desc.peerId)!).filter(Boolean)],
      onPlayers: (cb) => {
        const a = s.membersEv.on(cb)
        const b = s.hostEv.on(cb)
        return () => {
          a()
          b()
        }
      },
      pose: (peerId) => (peerId === s.selfId ? this.localPose() : (this.remotePoses.get(peerId) ?? null)),
      avatarBones: (peerId) => {
        const model = peerId === s.selfId ? this.localAvatarModel : this.remoteAvatarModels.get(peerId)
        return model && model.root.visible ? readAvatarBones(model) : null
      },
      avatar: {
        setPose: (bones, weight = 1) => s.set(`sys:avatarMotion:${s.selfId}`, makeAvatarMotionState('pose', [{ at: 0, bones }], s.clock.now(), weight)),
        play: (motion) => s.set(`sys:avatarMotion:${s.selfId}`, makeTimedAvatarMotion(motion, s.clock.now())),
        stop: () => s.set(`sys:avatarMotion:${s.selfId}`, null),
        isActive: () => sampleAvatarMotion(this.avatarMotion(s.selfId), s.clock.now()) !== null,
      },
      hostId: () => s.hostId(),
      onHost: (cb) => s.hostEv.on(cb),
      state: {
        get: (key) => s.get(key),
        has: (key) => s.has(key),
        set: (key, value) => {
          if (!key.startsWith('w:')) throw new Error('ワールドの同期状態のキーは w: で始まります')
          s.set(key, value)
        },
        subscribe: (key, cb) => s.subscribe(key, cb),
      },
      events: {
        emit: (name, payload, target = 'all') => s.emit(`w.${name}`, payload, target),
        on: (name, cb) => s.on(`w.${name}`, (p, from) => cb(p, this.playerInfo(from) ?? this.selfInfo())),
      },
      clock: () => ({ now: () => s.clock.now(), synced: s.clock.synced, uncertainty: s.clock.uncertainty, jumps: s.clock.jumps }),
      onClock: (cb) => s.clockEv.on(cb),
      interact: (obj, spec) => {
        const id = nextId++
        this.interactables.set(id, { id, obj, spec })
        this.interactEv.emit()
        return () => {
          this.interactables.delete(id)
          this.interactEv.emit()
        }
      },
      pickup: (obj, spec) => {
        const id = spec().id
        const wp = new Vector3()
        const wq = new Quaternion()
        obj.updateWorldMatrix(true, false)
        obj.getWorldPosition(wp)
        obj.getWorldQuaternion(wq)
        const e: PickupEntry = { id, obj, spec, body: null, net: [], grabOffset: null, hand: null, using: false, lastSent: 0, home: { p: wp, q: wq } }
        this.pickups.set(id, e)
        this.interactEv.emit()
        const key = `sys:pick:${id}`
        return {
          holder: () => ((s.get(key) as { holder: string | null } | undefined)?.holder ?? null),
          isUsing: () => e.using,
          drop: () => {
            this.setPickupUsing(e, false)
            for (const h of ['left', 'right', 'desktop'] as const) if (this.held[h] === id) this.held[h] = null
            e.hand = null
            e.grabOffset = null
            const cur = s.get(key) as { holder: string | null; owner: string } | undefined
            if (cur?.holder === s.selfId) s.set(key, spec().physics
              ? { holder: null, owner: s.selfId }
              : { holder: null, owner: s.selfId, pose: capturePickupPlacement(obj) })
          },
          reset: (p, q) => {
            this.setPickupUsing(e, false)
            for (const h of ['left', 'right', 'desktop'] as const) if (this.held[h] === id) this.held[h] = null
            e.hand = null
            e.grabOffset = null
            const current = capturePickupPlacement(obj)
            const rotation = (q ? new Quaternion(...q) : new Quaternion(...current.q)).normalize()
            s.set(key, { holder: null, owner: s.selfId, pose: { p, q: [rotation.x, rotation.y, rotation.z, rotation.w] }, reset: true })
            e.home.p.set(...p)
            e.home.q.copy(rotation)
            e.net.length = 0
            ;(e as PickupEntry & { resetTo?: { p: Vector3; q: Quaternion } }).resetTo = { p: new Vector3(...p), q: rotation }
          },
          dispose: () => {
            this.setPickupUsing(e, false)
            for (const h of ['left', 'right', 'desktop'] as const) if (this.held[h] === id) this.held[h] = null
            this.pickups.delete(id)
            this.interactEv.emit()
          },
        }
      },
      seat: (obj, spec) => {
        const id = spec().id
        this.seats.set(id, { id, obj, spec })
        const key = `sys:seat:${id}`
        return {
          occupant: () => (s.get(key) as string | null | undefined) ?? null,
          sit: () => this.sit(id),
          stand: () => this.player.sitting?.seatId === id && this.stand(),
          dispose: () => {
            if (this.player.sitting?.seatId === id) this.stand()
            this.seats.delete(id)
          },
        }
      },
      setSpawn: (position, yaw) => {
        const e = { id: nextId++, position, yaw }
        this.spawns.push(e)
        return () => {
          const i = this.spawns.indexOf(e)
          if (i >= 0) this.spawns.splice(i, 1)
        }
      },
      teleport: (position, yaw) => this.teleport(new Vector3(...position), yaw),
      respawn: () => {
        const sp = this.spawnPoint()
        this.teleport(sp.position, sp.yaw)
      },
      setVoiceGain: (peerId, gain) => this.voice.setWorldGain(peerId, gain),
      openWorld: (worldId) => this.navigate({ worldId }),
      openInstance: (instanceId) => this.navigate({ instanceId }),
      getWorldInfo: async (id): Promise<WorldInfo> => {
        if (!api) throw new Error('親サーバーにつながっていません')
        const w = await api.world(id)
        return { ...w, thumbnailUrl: api.abs(w.thumbnailUrl), baseUrl: api.abs(w.baseUrl) ?? w.baseUrl }
      },
      getInstanceInfo: async (id): Promise<InstanceInfo> => {
        if (!api) throw new Error('親サーバーにつながっていません')
        return api.instance(id)
      },
      listWorlds: async (q) => {
        if (!api) return []
        const list = await api.worlds({ q: q.query, tag: q.tag, sort: q.sort ?? 'popular' })
        return list.slice(0, Math.max(1, Math.min(50, q.limit ?? 12))).map((w) => ({ ...w, thumbnailUrl: api.abs(w.thumbnailUrl) }))
      },
      files: {
        list: async () => (api ? api.instanceFiles(ctx.instance.id) : []),
        upload: async (file, opts = {}) => {
          if (!api) throw new Error('開発用の実行環境ではアップロードできません')
          return api.uploadInstanceFile(ctx.instance.id, file, { description: opts.description, meta: opts.meta }, opts.onProgress)
        },
        update: async (id, changes) => {
          if (!api) throw new Error('親サーバーにつながっていません')
          return api.updateInstanceFile(ctx.instance.id, id, changes)
        },
        remove: async (id) => {
          if (!api) throw new Error('親サーバーにつながっていません')
          await api.deleteInstanceFile(ctx.instance.id, id)
        },
      },
      store: {
        shared: kv('shared'),
        player: {
          ...kv('player'),
          read: async (userId, key) => {
            if (!api) return localKv(worldId, 'player').get(key)
            try {
              return (await api.storageGet(worldId, 'player', key, userId)).value
            } catch {
              return undefined
            }
          },
        },
      },
      media: {
        isAllowed,
        fetch: async (url, init) => {
          if (!isAllowed(url)) throw new Error(`このドメインへの通信は許可されていません: ${url}`)
          return fetch(url, { ...init, credentials: 'omit' })
        },
      },
      screenShare: this.screenShare,
      pickFile: (req: FileRequest) => uiBridge.pickFile(req),
      confirm: (req: ConfirmRequest) => uiBridge.confirm(req),
      prompt: (req: PromptRequest) => uiBridge.prompt(req),
      notify: (text) => uiBridge.notify(text),
      audioListener: () => this.listener,
    }
    return rt
  }

  // ---------------- 席 ----------------

  sit(seatId: string) {
    const seat = this.seats.get(seatId)
    if (!seat) return
    const key = `sys:seat:${seatId}`
    const cur = this.session.get(key) as string | null | undefined
    if (cur && cur !== this.session.selfId && this.session.isPresent(cur)) {
      uiBridge.notify(L('この席にはほかの人が座っています', 'Someone is already sitting here'))
      return
    }
    if (this.player.sitting) this.stand()
    this.session.set(key, this.session.selfId)
    this.player.sitting = { seatId, obj: seat.obj }
    this.player.sleep = SleepPose.None
    seat.spec().onEnter?.(this.selfInfo())
  }

  stand() {
    const st = this.player.sitting
    if (!st) return
    const seat = this.seats.get(st.seatId)
    this.session.set(`sys:seat:${st.seatId}`, null)
    this.player.sitting = null
    if (seat) {
      const ex = seat.spec().exit ?? {}
      const o = seat.obj
      o.updateWorldMatrix(true, false)
      const p = new Vector3()
      o.getWorldPosition(p)
      const fwd = new Vector3(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new Quaternion()))
      fwd.y = 0
      fwd.normalize()
      const right = new Vector3(-fwd.z, 0, fwd.x)
      p.addScaledVector(fwd, ex.forward ?? 0.6).addScaledVector(right, ex.right ?? 0)
      p.y += (ex.up ?? 0) + 0.05
      this.teleport(p)
      seat.spec().onLeave?.(this.selfInfo())
    }
  }

  dispose() {
    if (this.player.sitting) this.stand()
    this.screenShare.dispose()
    if (this.session.get(`sys:avatarMotion:${this.session.selfId}`)) this.session.set(`sys:avatarMotion:${this.session.selfId}`, null)
    this.voice.dispose()
  }

  avatarMotion(peerId: string) {
    const key = `sys:avatarMotion:${peerId}`
    const raw = this.session.get(key)
    if (!raw || typeof raw !== 'object') return null
    let value = this.avatarMotionCache.get(raw)
    if (value === undefined) {
      value = isAvatarMotionState(raw) ? makeAvatarMotionState(raw.mode, raw.frames, raw.startedAt, raw.weight, raw.loop) : null
      this.avatarMotionCache.set(raw, value)
    }
    if (!value) return null
    if (peerId === this.session.selfId && value.mode === 'motion' && !value.loop &&
      this.session.clock.now() >= value.startedAt + value.frames[value.frames.length - 1].at) {
      this.session.set(key, null)
      return null
    }
    return value
  }
}

/** 開発用の実行環境の永続データ（ブラウザに保存） */
const localKv = (worldId: string, scope: string) => {
  const k = `ttv.devstore.${worldId}.${scope}`
  const load = (): Record<string, unknown> => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '{}')
    } catch {
      return {}
    }
  }
  const save = (o: Record<string, unknown>) => localStorage.setItem(k, JSON.stringify(o))
  return {
    get: async (key: string) => load()[key],
    list: async () => Object.entries(load()).map(([key, value]) => ({ key, value })),
    set: async (key: string, value: unknown) => {
      const o = load()
      o[key] = value
      save(o)
    },
    increment: async (key: string, delta: number) => {
      const o = load()
      const v = (Number(o[key]) || 0) + delta
      o[key] = v
      save(o)
      return v
    },
    remove: async (key: string) => {
      const o = load()
      delete o[key]
      save(o)
    },
  }
}
