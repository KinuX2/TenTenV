import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, DoubleSide, type Camera, Color, LinearFilter, Mesh, type MeshBasicMaterial, PlaneGeometry, PositionalAudio, SRGBColorSpace, TextureLoader, VideoTexture, type Texture, type Vector3Tuple } from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { useAudioListener, useNetClock, useSyncedState, useDialogs, useExternal, useNavigation, useScreenShare } from '../hooks'
import { useRuntime } from '../runtime'
import { Clickable, TriggerZone } from './interaction'
import { TextPlane } from './TextPlane'

/** three.js のレイヤーの使い分け */
export const LAYERS = {
  DEFAULT: 0,
  /** 一人称の視点にだけ映る（自分のアバターの頭を隠したもの） */
  FIRST_PERSON_ONLY: 9,
  /** 鏡やカメラにだけ映る（自分のアバターの頭など） */
  THIRD_PERSON_ONLY: 10,
  /** 鏡に映さない（UI など） */
  NO_MIRROR: 11,
  /** アバター（鏡にワールドを映さない設定でも映る）。1・2 は WebXR が左右の目に使うので避ける */
  AVATAR: 12,
  /** 自分の顔のプレビューだけに映すアバター */
  FACE_MIRROR: 13,
} as const

// ---------- MirrorSurface ----------

export interface MirrorSurfaceProps {
  width?: number
  height?: number
  position?: Vector3Tuple
  rotation?: Vector3Tuple
  /** Exact render texture size. A number sets the vertical pixels and preserves the mirror's aspect ratio. */
  resolution?: number | [number, number]
  /** Reflection color. Accepts CSS colors or a numeric RGB value. */
  color?: string | number
  /** 解像度の倍率（画面の解像度に対して） */
  quality?: number
  /** Alias kept for existing worlds. */
  tint?: string
  /** ワールドの物も映すか（false ならアバターだけ） */
  showWorld?: boolean
}

/** 鏡。アバターは三人称の見た目（自分の頭も）で映る */
export const MirrorSurface: React.FC<MirrorSurfaceProps> = ({ width = 2, height = 2, position, rotation, resolution, color, quality = 1, tint = '#c8ccd0', showWorld = true }) => {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const explicitWidth = Array.isArray(resolution) ? resolution[0] : null
  const explicitHeight = Array.isArray(resolution) ? resolution[1] : typeof resolution === 'number' ? resolution : null
  const mirror = useMemo(() => {
    const clampPixels = (value: number, max = 4096) => Math.max(64, Math.min(max, Math.round(Number.isFinite(value) ? value : 64)))
    const textureWidth = explicitHeight === null ? clampPixels(size.width * dpr * quality, 2048) : clampPixels(explicitWidth ?? explicitHeight * width / Math.max(0.01, height))
    const textureHeight = explicitHeight === null ? clampPixels(size.height * dpr * quality, 2048) : clampPixels(explicitHeight)
    const r = new Reflector(new PlaneGeometry(width, height), {
      clipBias: 0.003,
      textureWidth,
      textureHeight,
      color: new Color(color ?? tint),
    })
    // 鏡のカメラは元のカメラを複製して作られる。そのときにレイヤーを鏡用に変える
    const rr = r as unknown as { getReflectionCamera: (c: Camera) => Camera }
    const orig = rr.getReflectionCamera
    rr.getReflectionCamera = function (this: unknown, c: Camera) {
      const cam = orig.call(this, c)
      cam.layers.disableAll()
      if (showWorld) cam.layers.enable(LAYERS.DEFAULT)
      cam.layers.enable(LAYERS.THIRD_PERSON_ONLY)
      cam.layers.enable(LAYERS.AVATAR)
      return cam
    }
    return r
  }, [width, height, quality, tint, color, showWorld, size.width, size.height, dpr, explicitWidth, explicitHeight])
  useEffect(() => () => {
    mirror.dispose()
    mirror.geometry.dispose()
  }, [mirror])
  return <primitive object={mirror} position={position} rotation={rotation} />
}

// ---------- ScreenShareSurface ----------

export interface ScreenShareSurfaceProps {
  width?: number
  position?: Vector3Tuple
  rotation?: Vector3Tuple
  /** Add an in-world start/stop button. */
  controls?: boolean
  placeholder?: string
}

/** A live screen in the world. Multiple surfaces show the same active share. */
export const ScreenShareSurface: React.FC<ScreenShareSurfaceProps> = ({ width = 3.2, position, rotation, controls = true, placeholder = '画面共有なし' }) => {
  const { owner, video, isSharing, start, stop } = useScreenShare()
  const { notify } = useDialogs()
  const height = width * 9 / 16
  const [aspect, setAspect] = useState(16 / 9)
  useEffect(() => {
    if (!video) return
    const update = () => setAspect(video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9)
    update()
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('resize', update)
    return () => {
      video.removeEventListener('loadedmetadata', update)
      video.removeEventListener('resize', update)
    }
  }, [video])
  const texture = useMemo(() => {
    if (!video) return null
    const t = new VideoTexture(video)
    t.colorSpace = SRGBColorSpace
    t.minFilter = LinearFilter
    t.magFilter = LinearFilter
    t.generateMipmaps = false
    return t
  }, [video])
  useEffect(() => () => texture?.dispose(), [texture])
  const imageWidth = aspect >= 16 / 9 ? width : height * aspect
  const imageHeight = aspect >= 16 / 9 ? width / aspect : height
  const action = () => {
    if (isSharing) stop()
    else void start().catch((error: unknown) => {
      if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return
      notify(error instanceof Error ? error.message : '画面共有を開始できません')
    })
  }
  return <group position={position} rotation={rotation}>
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color="#0b1211" side={DoubleSide} />
    </mesh>
    {texture ? <mesh position={[0, 0, 0.002]}>
      <planeGeometry args={[imageWidth, imageHeight]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={DoubleSide} />
    </mesh> : <TextPlane text={owner ? `${owner.displayName} の画面を待っています` : placeholder} width={width * 0.8} lineHeight={0.16} position={[0, 0, 0.003]} color="#c3d0c5" />}
    {controls && (!owner || isSharing) && <Clickable label={isSharing ? '画面共有を停止' : '画面を共有'} onClick={action} position={[0, -height / 2 - 0.17, 0]}>
      <mesh><boxGeometry args={[Math.min(width * 0.55, 1.5), 0.22, 0.04]} /><meshStandardMaterial color="#3d713b" /></mesh>
      <TextPlane text={isSharing ? '共有を停止' : '画面を共有'} width={Math.min(width * 0.5, 1.4)} lineHeight={0.12} position={[0, 0, 0.025]} />
    </Clickable>}
  </group>
}

// ---------- MediaScreen ----------

export interface MediaState {
  url: string
  playing: boolean
  /** anchor の時点での再生位置（秒） */
  offset: number
  /** 共有時計の時刻（ms） */
  anchor: number
  loop: boolean
  /** 操作をロックした人（peerId）。null なら誰でも操作できる */
  lockedBy: string | null
}

export interface MediaScreenProps {
  id: string
  width?: number
  position?: Vector3Tuple
  rotation?: Vector3Tuple
  /** 最初に流す URL */
  defaultUrl?: string
  /** 操作パネルを出す */
  controls?: boolean
  /** 聞こえる距離（m） */
  range?: number
  volume?: number
}

const drift = (v: HTMLVideoElement, target: number) => Math.abs(v.currentTime - target)

/** 動画プレイヤー。再生・停止・シークは全員で同期し、あとから来た人も同じ所から見られる */
export const MediaScreen: React.FC<MediaScreenProps> = ({ id, width = 3.2, position, rotation, defaultUrl = '', controls = true, range = 18, volume: vol0 = 0.8 }) => {
  const rt = useRuntime()
  const clock = useNetClock({ require: 'media' })
  const listener = useAudioListener()
  const ext = useExternal()
  const { prompt, notify } = useDialogs()
  const [st, setSt] = useSyncedState<MediaState>(`media:${id}`, { url: defaultUrl, playing: !!defaultUrl, offset: 0, anchor: 0, loop: true, lockedBy: null })
  const [volume, setVolume] = useState(vol0)
  const [status, setStatus] = useState('')
  const height = width * (9 / 16)
  // video 要素は setMediaElementSource を 1 回しか呼べないので、音の出口（listener）が変わったら作り直す
  const video = useMemo(() => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.playsInline = true
    v.preload = 'auto'
    return v
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listener])
  const texture = useMemo(() => {
    const t = new VideoTexture(video)
    t.colorSpace = SRGBColorSpace
    return t
  }, [video])
  const audio = useMemo(() => {
    const a = new PositionalAudio(listener)
    a.setMediaElementSource(video)
    a.setRolloffFactor(1.2)
    a.setDistanceModel('linear')
    return a
  }, [listener, video])
  useEffect(() => {
    audio.setVolume(volume)
  }, [audio, volume])
  // 聞こえる距離は作り直さずに変える（作り直すと setMediaElementSource が失敗する）
  useEffect(() => {
    audio.setRefDistance(range / 6)
    audio.setMaxDistance(range)
  }, [audio, range])
  useEffect(
    () => () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      texture.dispose()
      audio.disconnect()
    },
    [video, texture, audio],
  )

  // URL の読み込み（HLS は hls.js を使う）
  const urlOk = !!st.url && ext.isAllowed(st.url)
  useEffect(() => {
    if (!urlOk) {
      // 前の動画を止めて外す（残すと、許可されていない URL の状態のまま前の動画が流れ続ける）
      video.pause()
      video.removeAttribute('src')
      video.load()
      setStatus(st.url ? 'このドメインの動画は許可されていません' : 'URL が設定されていません')
      return
    }
    let hls: { destroy: () => void } | null = null
    let alive = true
    setStatus('読み込み中…')
    const isHls = /\.m3u8(\?|$)/i.test(st.url)
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
      void import('hls.js').then(({ default: Hls }) => {
        if (!alive) return
        const h = new Hls()
        h.loadSource(st.url)
        h.attachMedia(video)
        hls = h
      })
    } else video.src = st.url
    const onErr = () => setStatus('再生できません（CORS に対応した直接の URL が必要です）')
    const onOk = () => setStatus('')
    video.addEventListener('error', onErr)
    video.addEventListener('canplay', onOk)
    return () => {
      alive = false
      hls?.destroy()
      video.removeEventListener('error', onErr)
      video.removeEventListener('canplay', onOk)
    }
  }, [st.url, urlOk, video, ext])

  // 再生位置を共有時計に合わせる
  const lastFix = useRef(0)
  useFrame(() => {
    if (!urlOk) return
    video.loop = st.loop
    const target = st.playing ? st.offset + (clock.now() - st.anchor) / 1000 : st.offset
    const dur = video.duration
    const known = Number.isFinite(dur) && dur > 0
    const t = known ? (st.loop ? target % dur : Math.min(target, dur)) : target
    // ループしない動画が終わったら止めたままにする（終わった動画で play() を呼ぶと最初に戻ってしまう）
    const ended = known && !st.loop && target >= dur
    const playing = st.playing && !ended
    if (playing && video.paused && video.readyState >= 2) void video.play().catch(() => setStatus('画面をクリックすると音が出ます'))
    if (!playing && !video.paused) video.pause()
    const now = performance.now()
    if (video.readyState >= 1 && now - lastFix.current > 1000) {
      lastFix.current = now
      const d = drift(video, t)
      if (ended) {
        if (!video.ended && d > 0.05) video.currentTime = t
      } else if (d > 0.6 || (!playing && d > 0.05)) video.currentTime = t
      else if (playing) video.playbackRate = d > 0.08 ? (video.currentTime < t ? 1.04 : 0.96) : 1
    }
  })

  const self = rt.self().peerId
  const canControl = !st.lockedBy || st.lockedBy === self || rt.players().every((p) => p.peerId !== st.lockedBy) || rt.self().role !== 'member'
  const pos = () => (st.playing ? st.offset + (clock.now() - st.anchor) / 1000 : st.offset)
  const act = (f: () => Partial<MediaState>) => {
    if (!canControl) {
      notify('この動画プレイヤーはロックされています')
      return
    }
    setSt({ ...st, ...f() })
  }
  const setUrl = async () => {
    const url = await prompt({ title: '動画の URL', message: 'mp4・webm・m3u8 などの直接の URL を入力してください', initial: st.url, maxLength: 2000 })
    if (url === null) return
    const u = url.trim()
    if (u && !/^https:\/\//i.test(u)) {
      notify('https:// で始まる URL を入力してください')
      return
    }
    act(() => ({ url: u, playing: !!u, offset: 0, anchor: clock.now() }))
  }
  const btn = (label: string, x: number, onClick: () => void, w = 0.34) => (
    <Clickable key={label} label={label} onClick={onClick} position={[x, 0, 0]}>
      <mesh>
        <boxGeometry args={[w, 0.12, 0.03]} />
        <meshStandardMaterial color="#20232a" />
      </mesh>
      <TextPlane text={label} width={w - 0.02} lineHeight={0.07} position={[0, 0, 0.017]} padding={0.01} />
    </Clickable>
  )
  const cw = Math.min(width, 3.2)
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width, height]} />
        {urlOk ? <meshBasicMaterial map={texture} toneMapped={false} /> : <meshBasicMaterial color="#05060a" />}
      </mesh>
      <primitive object={audio} />
      {status && <TextPlane text={status} width={width * 0.8} lineHeight={0.09} position={[0, 0, 0.01]} background="#000000aa" />}
      {controls && (
        <group position={[0, -height / 2 - 0.12, 0.02]} scale={cw / 3.2}>
          {btn(st.playing ? '一時停止' : '再生', -1.4, () => act(() => (st.playing ? { playing: false, offset: pos(), anchor: clock.now() } : { playing: true, offset: st.offset, anchor: clock.now() })))}
          {btn('-10秒', -1.02, () => act(() => ({ offset: Math.max(0, pos() - 10), anchor: clock.now() })))}
          {btn('+10秒', -0.64, () => act(() => ({ offset: pos() + 10, anchor: clock.now() })))}
          {btn('最初から', -0.26, () => act(() => ({ offset: 0, anchor: clock.now() })))}
          {btn('URL', 0.12, () => void setUrl())}
          {btn(st.loop ? 'ループ ON' : 'ループ OFF', 0.5, () => act(() => ({ loop: !st.loop })))}
          {btn('音 -', 0.88, () => setVolume((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10)), 0.22)}
          {btn('音 +', 1.12, () => setVolume((v) => Math.min(1.5, Math.round((v + 0.1) * 10) / 10)), 0.22)}
          {btn(st.lockedBy ? 'ロック中' : 'ロック', 1.42, () => {
            if (st.lockedBy && st.lockedBy !== self && !canControl) return
            setSt({ ...st, lockedBy: st.lockedBy ? null : self })
          }, 0.3)}
        </group>
      )}
    </group>
  )
}

// ---------- ImagePanel ----------

export interface ImagePanelProps {
  url: string
  width?: number
  position?: Vector3Tuple
  rotation?: Vector3Tuple
}
/** 同じオリジンか（前方一致だと https://<クライアント>.example.net/ も通ってしまうので、URL として比べる） */
const sameOrigin = (url: string) => {
  try {
    return new URL(url, location.href).origin === location.origin
  } catch {
    return false
  }
}

/** 許可されたドメインの画像を出す板 */
export const ImagePanel: React.FC<ImagePanelProps> = ({ url, width = 1, position, rotation }) => {
  const ext = useExternal()
  const [tex, setTex] = useState<Texture | null>(null)
  useEffect(() => {
    if (!url || (!ext.isAllowed(url) && !sameOrigin(url) && !url.startsWith('blob:'))) return
    let t: Texture | null = null
    const loader = new TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(url, (tx) => {
      tx.colorSpace = SRGBColorSpace
      t = tx
      setTex(tx)
    })
    return () => t?.dispose()
  }, [url, ext])
  const img = tex?.image as { width?: number; height?: number } | undefined
  const aspect = img?.width && img?.height ? img.height / img.width : 1
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, width * aspect]} />
      {tex ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshBasicMaterial color="#333" />}
    </mesh>
  )
}

// ---------- PortalGate ----------

export interface PortalGateProps {
  worldId?: string
  instanceId?: string
  position?: Vector3Tuple
  rotation?: Vector3Tuple
  /** くぐる前に確認する */
  confirm?: boolean
  /** 同期ポータルなどで、ワールド情報の取得前から表示する名前 */
  title?: string
  /** 設置者・インスタンス種別・残り時間など */
  detail?: string
  /** 実際に入場するときの通知。寿命の更新などに使う */
  onTravel?: () => void
}

/** 別のワールド・インスタンスへの入口。くぐると移動する */
export const PortalGate: React.FC<PortalGateProps> = ({ worldId, instanceId, position, rotation, confirm = true, title, detail, onTravel }) => {
  const nav = useNavigation()
  const { confirm: ask, notify } = useDialogs()
  const [name, setName] = useState(title ?? '…')
  const [allowed, setAllowed] = useState(!instanceId)
  const [thumb, setThumb] = useState<Texture | null>(null)
  const busy = useRef(false)
  const ring = useRef<Mesh>(null)
  const inner = useRef<Mesh>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const instance = instanceId ? await nav.getInstanceInfo(instanceId) : null
        if (!alive) return
        if (instance) setAllowed(instance.canJoin)
        const w = instance ? instance.worldId : worldId!
        const info = await nav.getWorldInfo(w)
        if (!alive) return
        setName(info.name)
        if (info.thumbnailUrl) new TextureLoader().setCrossOrigin('anonymous').load(info.thumbnailUrl, (t) => alive && (t.colorSpace = SRGBColorSpace, setThumb(t)))
      } catch {
        if (alive) setName('見つかりません')
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [worldId, instanceId, nav])
  useFrame(({ clock }) => {
    if (ring.current) (ring.current.material as MeshBasicMaterial).opacity = 0.68 + Math.sin(clock.elapsedTime * 2.4) * 0.16
    if (inner.current) (inner.current.material as MeshBasicMaterial).opacity = 0.5 + Math.sin(clock.elapsedTime * 3.1 + 1.2) * 0.15
  })
  const go = async () => {
    if (busy.current) return
    busy.current = true
    try {
      if (confirm && !(await ask({ title: 'ポータル', message: `「${name}」へ移動しますか？`, okLabel: '移動する' }))) return
      if (instanceId) {
        const info = await nav.getInstanceInfo(instanceId)
        if (!info.canJoin) {
          notify(info.denyReason ?? 'このインスタンスには入れません')
          return
        }
        onTravel?.()
        nav.openInstance(instanceId)
      } else if (worldId) {
        onTravel?.()
        nav.openWorld(worldId)
      }
    } finally {
      setTimeout(() => (busy.current = false), 1500)
    }
  }
  if (!allowed) return null
  return (
    <group position={position} rotation={rotation}>
      <Clickable label={`${name} へ`} onClick={() => void go()}>
        <mesh position={[0, 1.18, 0]} scale={[0.78, 1.08, 1]}>
          <circleGeometry args={[1, 64]} />
          <meshBasicMaterial color="#083c74" transparent opacity={0.82} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        {thumb && <mesh position={[0, 1.18, 0.004]} scale={[0.71, 1.0, 1]}>
          <circleGeometry args={[1, 64]} />
          <meshBasicMaterial map={thumb} color="#8abfff" transparent opacity={0.62} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>}
        <mesh position={[0, 1.18, 0.008]} scale={[0.73, 1.02, 1]}>
          <circleGeometry args={[1, 64]} />
          <meshBasicMaterial color="#39a6ec" transparent opacity={0.13} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      </Clickable>
      <mesh position={[0, 1.18, 0.01]} scale={[0.8, 1.1, 1]}>
        <torusGeometry args={[1, 0.065, 12, 72]} />
        <meshStandardMaterial color="#71ceff" emissive="#258cff" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 1.18, 0.018]} scale={[0.8, 1.1, 1]}>
        <torusGeometry args={[0.92, 0.009, 8, 72]} />
        <meshBasicMaterial color="#d7f7ff" transparent opacity={0.8} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={inner} position={[0, 1.18, 0.02]} scale={[0.8, 1.1, 1]}>
        <torusGeometry args={[0.79, 0.013, 8, 72]} />
        <meshBasicMaterial color="#5ccaff" transparent opacity={0.65} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <TextPlane text={name} width={2.2} lineHeight={0.14} position={[0, 2.5, 0]} background="#06172dcc" />
      {detail && <TextPlane text={detail} width={2.2} lineHeight={0.075} position={[0, 0.38, 0.05]} background="#06172dee" />}
      <TriggerZone position={[0, 1, 0]} size={[1.4, 2, 0.4]} onEnter={() => void go()} />
    </group>
  )
}
