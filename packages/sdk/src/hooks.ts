import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AudioListener } from 'three'
import { useRuntime, type ClockState, type DeviceKind, type PlayerInfo, type PlayerPose } from './runtime'
import type { AvatarBones } from './motion'

/** ワールドの情報とアセットの URL */
export const useWorldEnv = () => {
  const rt = useRuntime()
  return useMemo(
    () => ({
      baseUrl: rt.baseUrl,
      /** public/ に置いたファイルの URL。先頭の / は付けない（"model.glb"） */
      assetUrl: (path: string) => {
        // 相対パスはワールドの基準 URL に解決し、絶対 URL はそのまま扱う。
        // 文字列連結だと path が URL の場合に親サーバー URL が二重になる。
        const base = rt.baseUrl.endsWith('/') ? rt.baseUrl : `${rt.baseUrl}/`
        return new URL(path.replace(/^\.?\/+/, ''), base).href
      },
      worldId: rt.world.id,
      worldName: rt.world.name,
      instanceId: rt.instance.id,
      persistent: rt.instance.persistent,
      dev: rt.dev,
    }),
    [rt],
  )
}

export const useDevice = (): DeviceKind => {
  const rt = useRuntime()
  return useSyncExternalStore(rt.onDeviceChange, rt.device, rt.device)
}

type SetState<T> = (next: T | ((prev: T) => T)) => void

/**
 * 全員で同じ値を持つ状態。値は JSON にできるもの（16KB まで）。
 * 誰かが変えると全員に届き、あとから来た人にも最新の値が届く
 */
export const useSyncedState = <T>(key: string, initial: T): [T, SetState<T>] => {
  const rt = useRuntime()
  const k = `w:${key}`
  const initialRef = useRef(initial)
  const read = useCallback(() => (rt.state.has(k) ? (rt.state.get(k) as T) : initialRef.current), [rt, k])
  const subscribe = useCallback((cb: () => void) => rt.state.subscribe(k, cb), [rt, k])
  const value = useSyncExternalStore(subscribe, read, read)
  const set = useCallback<SetState<T>>(
    (next) => {
      const prev = read()
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      rt.state.set(k, v)
    },
    [rt, k, read],
  )
  return [value, set]
}

/** イベントを受け取る。handler は毎回最新のものが呼ばれる */
export const useNetEvent = <P = unknown>(name: string, handler: (payload: P, from: PlayerInfo) => void) => {
  const rt = useRuntime()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => rt.events.on(name, (p, from) => ref.current(p as P, from)), [rt, name])
}

/** イベントを送る関数。target: 'all'（自分も含む）・'others'・'host'・peerId */
export const useEmit = () => {
  const rt = useRuntime()
  return useCallback((name: string, payload?: unknown, target: 'all' | 'others' | 'host' | string = 'all') => rt.events.emit(name, payload ?? null, target), [rt])
}

export interface NetClockOptions {
  /** 'media' は ±300ms、'motion' は ±100ms を満たすまで trustworthy にならない */
  require?: 'media' | 'motion'
}
/** インスタンス全体で共通の時計。now() は useFrame の中で毎フレーム呼んでよい */
export const useNetClock = (opts: NetClockOptions = {}) => {
  const rt = useRuntime()
  const snap = useSyncExternalStore(rt.onClock, () => clockKey(rt.clock()), () => clockKey(rt.clock()))
  return useMemo(() => {
    const c = rt.clock()
    const limit = opts.require === 'motion' ? 100 : opts.require === 'media' ? 300 : Infinity
    return { now: () => rt.clock().now(), synced: c.synced, uncertainty: c.uncertainty, trustworthy: c.synced && c.uncertainty <= limit, jumps: c.jumps }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, snap, opts.require])
}
const clockKey = (c: ClockState) => `${c.synced ? 1 : 0}:${Math.round(c.uncertainty / 25)}:${c.jumps}`

/** インスタンスにいる人の一覧（入退室・名前・役割・端末などの変化で更新） */
export const usePlayers = () => {
  const rt = useRuntime()
  // 自分の端末（VR に入ったなど）の変化は onDeviceChange で届く
  const subscribe = useCallback((cb: () => void) => {
    const a = rt.onPlayers(cb)
    const b = rt.onDeviceChange(cb)
    return () => {
      a()
      b()
    }
  }, [rt])
  const version = useSyncExternalStore(subscribe, () => playersKey(rt.players()), () => playersKey(rt.players()))
  return useMemo(() => {
    const all = rt.players()
    const local = all.find((p) => p.isLocal) ?? rt.self()
    return {
      local,
      others: all.filter((p) => !p.isLocal),
      all,
      host: all.find((p) => p.isHost) ?? null,
      /** 最新の姿勢（頭・手の位置と向きを含む）。useFrame の中で呼ぶ */
      getPose: (peerId: string): PlayerPose | null => rt.pose(peerId),
      /** 表示しているアバターの骨の位置・向き。useFrame の中で呼ぶ */
      getAvatarBones: (peerId: string): AvatarBones | null => rt.avatarBones(peerId),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, version])
}
// PlayerInfo のどれかが変わったら作り直す（キーに入れないと all / others が古いままになる）
const playersKey = (list: PlayerInfo[]) =>
  JSON.stringify(list.map((p) => [p.peerId, p.userId, p.isHost, p.isLocal, p.isGuest, p.role, p.device, p.iconUrl, p.displayName]))

/** 自分がホスト（同期の取りまとめ役）か。ホストだけが動かすギミックに使う */
export const useIsHost = () => {
  const rt = useRuntime()
  const get = () => rt.hostId() === rt.self().peerId
  return useSyncExternalStore(rt.onHost, get, get)
}

/**
 * 共有オブジェクトの持ち主。持ち主だけが動かし、ほかの人はその結果を受け取る。
 * 持ち主がいなくなるとホストに戻る
 */
export const useOwnership = (id: string) => {
  const rt = useRuntime()
  const [owner, setOwner] = useSyncedState<string | null>(`own:${id}`, null)
  const players = usePlayers()
  const present = owner !== null && players.all.some((p) => p.peerId === owner)
  const effective = present ? owner : (players.host?.peerId ?? null)
  const self = rt.self().peerId
  return {
    owner: effective,
    isMine: effective === self,
    take: () => setOwner(self),
    release: () => owner === self && setOwner(null),
  }
}

export const useTeleport = () => {
  const rt = useRuntime()
  return useMemo(() => ({ teleport: rt.teleport, respawn: rt.respawn }), [rt])
}

/** Animate the local player's avatar from a world component. */
export const useAvatarMotion = () => useRuntime().avatar

export const useNavigation = () => {
  const rt = useRuntime()
  return useMemo(() => ({ openWorld: rt.openWorld, openInstance: rt.openInstance, getWorldInfo: rt.getWorldInfo, getInstanceInfo: rt.getInstanceInfo, listWorlds: rt.listWorlds }), [rt])
}

/** インスタンスで共有するファイル（アップロードした曲・画像など） */
export const useInstanceFiles = () => useRuntime().files

/** ワールドの永続データ（親サーバーに保存） */
export const useWorldStore = () => useRuntime().store

/** ファイルを選んでもらう（PC・スマホ・VR で共通の画面） */
export const useFilePicker = () => {
  const rt = useRuntime()
  return rt.pickFile
}

export const useDialogs = () => {
  const rt = useRuntime()
  return useMemo(() => ({ confirm: rt.confirm, prompt: rt.prompt, notify: rt.notify }), [rt])
}

/** 許可されたドメインへの通信と、URL が許可されているかの確認 */
export const useExternal = () => useRuntime().media

/** Screen capture state and controls for this instance. Call start directly from a click. */
export const useScreenShare = () => {
  const rt = useRuntime()
  const share = rt.screenShare
  const revision = useSyncExternalStore(share.onChange, share.revision, share.revision)
  return useMemo(() => {
    const ownerId = share.ownerId()
    return {
      owner: ownerId ? rt.players().find((p) => p.peerId === ownerId) ?? null : null,
      video: share.video(),
      isSharing: share.isSharing(),
      start: share.start,
      stop: share.stop,
    }
  }, [rt, share, revision])
}

/** カメラについている AudioListener（ワールドの立体音響はこれにつなぐ） */
export const useAudioListener = (): AudioListener => useRuntime().audioListener()

export const useVoiceGain = () => useRuntime().setVoiceGain

/** 値が変わったときに一度だけ呼ばれる（同期状態の変化に反応する演出など） */
export const useOnChange = <T>(value: T, cb: (value: T, prev: T | undefined) => void) => {
  const prev = useRef<T | undefined>(undefined)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      prev.current = value
      return
    }
    if (Object.is(prev.current, value)) return
    cb(value, prev.current)
    prev.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
}

/** 一定時間ごとに増える同期カウンター（全員で同じ値） */
export const useSyncedTicker = (periodMs: number) => {
  const clock = useNetClock()
  const [tick, setTick] = useState(() => Math.floor(clock.now() / periodMs))
  useEffect(() => {
    const id = setInterval(() => setTick(Math.floor(clock.now() / periodMs)), Math.max(16, periodMs / 4))
    return () => clearInterval(id)
  }, [clock, periodMs])
  return tick
}

export interface SyncedItem<T> {
  id: string
  /** 作った人（peerId） */
  by: string
  data: T
}

/**
 * 全員で同じ一覧を持つ物（[147] オブジェクトの生成・削除）。例: 置いたブロック・投げ込んだボール
 * 一覧は 1 つの同期状態に入るので、数十個程度までにする（16KB まで）
 */
export const useSyncedObjects = <T>(key: string, max = 64) => {
  const rt = useRuntime()
  const [items, setItems] = useSyncedState<SyncedItem<T>[]>(`objs:${key}`, [])
  return useMemo(
    () => ({
      items,
      spawn: (data: T) => {
        const id = `${rt.self().peerId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        setItems((prev) => [...prev, { id, by: rt.self().peerId, data }].slice(-max))
        return id
      },
      update: (id: string, data: T) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, data } : x))),
      remove: (id: string) => setItems((prev) => prev.filter((x) => x.id !== id)),
      clear: () => setItems([]),
    }),
    [items, setItems, rt, max],
  )
}
