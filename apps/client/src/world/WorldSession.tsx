// インスタンスに入る（参加・待ち行列・ワールドの読み込み）と、入っている間の画面
import { decodeTicketPayload, type AvatarExtensions, type InstanceInfo, type PeerDescriptor, type ServerSignal, type WorldManifest } from '@tentenv/protocol'
import { useEffect, useRef, useState } from 'react'
import { L } from '../i18n'
import { LocalTransport } from '../net/local'
import { MeshTransport } from '../net/mesh'
import type { SignalClient } from '../net/signaling'
import { InstanceSession } from '../net/session'
import { app, toast, useApp } from '../state/app'
import { useModeration } from '../state/moderation'
import { useNet } from '../state/net'
import { settings, useSettings } from '../state/settings'
import { actions, setActiveEngine, withScale } from '../ui/actions'
import { Hud } from '../ui/hud/Hud'
import { goToWorld, joinInstance } from '../ui/join'
import { menuBus, useMenu } from '../ui/menuBus'
import { usePortalPlacement } from './portalState'
import { pendingTap } from './interaction'
import { WorldEngine } from './engine'
import { loadDevWorld, loadWorld, type LoadedWorld } from './loader'
import { WorldScene } from './WorldScene'
import { startOscFace } from '../features/oscFace'
import { useTools } from '../features/tools'
import { useAvatarExt } from '../state/avatarExt'
import { VoiceRelay } from '../net/voiceRelay'

type Joined = Extract<ServerSignal, { t: 'joined' }>

/**
 * インスタンスへの参加。画面の作り直しなどで同じインスタンスへの参加が重なっても、親サーバーには 1 回だけ参加し、
 * 最後の利用者が離れてから少し待って退出する（古い画面の後片付けで退出してしまわないように）
 */
const joins = {
  current: null as null | { instanceId: string; promise: Promise<Joined>; users: number; queue: Set<(pos: number) => void>; timer?: ReturnType<typeof setTimeout> },
  acquire(sig: SignalClient, instanceId: string, opts: { hostScore: number }, onQueue: (pos: number) => void): Promise<Joined> {
    const c = this.current
    if (c && c.instanceId === instanceId) {
      if (c.timer) clearTimeout(c.timer)
      c.users++
      c.queue.add(onQueue)
      return c.promise
    }
    if (c) sig.send({ t: 'leave' })
    const queue = new Set<(pos: number) => void>([onQueue])
    const promise = new Promise<Joined>((resolve, reject) => {
      const offs = [
        sig.on('joined', (m) => m.instance.id === instanceId && (done(), resolve(m))),
        sig.on('queued', (m) => m.instanceId === instanceId && queue.forEach((f) => f(m.position))),
        // 中継・相手が見つからないなどの、参加とは関係のないエラーは無視する
        sig.on('error', (m) => !/^(relay|peer_not_found|rate|signal)/.test(m.code) && (done(), reject(new Error(m.message)))),
      ]
      const done = () => offs.forEach((f) => f())
    })
    promise.catch(() => this.current?.promise === promise && (this.current = null))
    this.current = { instanceId, promise, users: 1, queue }
    sig.send({ t: 'join', instanceId, hostScore: opts.hostScore, queue: true })
    return promise
  },
  release(sig: SignalClient, instanceId: string) {
    const c = this.current
    if (!c || c.instanceId !== instanceId) return
    c.users--
    if (c.users > 0) return
    c.timer = setTimeout(() => {
      if (this.current === c && c.users === 0) {
        sig.send({ t: 'leave' })
        this.current = null
      }
    }, 400)
  },
}

type Phase =
  | { kind: 'joining' }
  | { kind: 'queued'; position: number }
  | { kind: 'loading'; progress: number; label: string }
  | { kind: 'ready'; target: string; engine: WorldEngine; world: LoadedWorld }
  | { kind: 'error'; message: string }

const waitFor = <T extends ServerSignal['t']>(t: T, timeout: number) => {
  const sig = useNet.getState().signal
  return new Promise<Extract<ServerSignal, { t: T }>>((resolve, reject) => {
    if (!sig) return reject(new Error(L('親サーバーにつながっていません', 'Not connected')))
    const timer = setTimeout(() => (off(), reject(new Error(L('応答がありません', 'Timed out')))), timeout)
    const off = sig.on(t, (m) => {
      clearTimeout(timer)
      off()
      resolve(m)
    })
  })
}

export const WorldSession: React.FC<{ instanceId?: string; devUrl?: string }> = ({ instanceId, devUrl }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'joining' })
  // 親サーバーとつなぎ直したら、インスタンスに入り直す（親サーバー側では参加が切れているため）
  const [rejoin, setRejoin] = useState(0)
  const [worldError, setWorldError] = useState<string | null>(null)
  const [ext, setExt] = useState<AvatarExtensions | null>(null)
  const engineRef = useRef<WorldEngine | null>(null)
  const avatar = useApp((s) => s.avatar)
  const target = `${devUrl ?? instanceId ?? ''}:${rejoin}`

  useEffect(() => {
    setPhase({ kind: 'joining' })
    setWorldError(null)
    let alive = true
    let session: InstanceSession | null = null
    let engine: WorldEngine | null = null
    const offs: (() => void)[] = []
    const fail = (e: unknown) => alive && setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    const start = async () => {
      const a = app()
      const s = settings()
      let manifest: WorldManifest
      let world: LoadedWorld
      if (devUrl) {
        // 開発用: 親サーバーなし。同じブラウザのタブどうしで同期する
        setPhase({ kind: 'loading', progress: 0, label: L('ワールドを読み込んでいます', 'Loading world') })
        world = await loadDevWorld(devUrl, (p) => alive && setPhase({ kind: 'loading', progress: p, label: L('ワールドを読み込んでいます', 'Loading world') }))
        if (!alive) return
        manifest = world.manifest
        const name = `Dev${Math.floor(Math.random() * 900 + 100)}`
        const t = new LocalTransport(devUrl, { id: `dev-${name}`, displayName: name, iconUrl: null, status: 'online', statusText: '' })
        session = new InstanceSession({ transport: t, serverKey: null, serverId: null, instanceId: 'dev', serverClock: null, avatar: withScale(a.avatar), allowContact: 'everyone', hostScore: 1 })
        engine = new WorldEngine({ api: null, session, world: { id: `dev:${manifest.name}`, name: manifest.name, baseUrl: world.baseUrl, manifest }, instance: { id: 'dev', persistent: false, worldId: 'dev' }, dev: true }, withScale(a.avatar))
      } else {
        const sig = useNet.getState().signal
        const api = a.api
        const info = a.info
        if (!sig || !api || !info || !a.me) throw new Error(L('ログインしていません', 'Not signed in'))
        if (!sig.open) await new Promise<void>((res) => {
          const off = sig.onOpenChange((o) => o && (off(), res()))
        })
        if (!alive) return
        const hostScore = s.refuseHost ? 0 : /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 20 : 60
        // 参加（同じインスタンスへの参加が重なったら 1 つにまとめる）
        const joinedPromise = joins.acquire(sig, instanceId!, { hostScore }, (pos) => alive && setPhase({ kind: 'queued', position: pos }))
        offs.push(() => joins.release(sig, instanceId!))
        const joined = await joinedPromise
        if (!alive) return
        offs.push(
          sig.on('welcome', () => {
            joins.current = null
            toast(L('親サーバーにつなぎ直しました。インスタンスに入り直します', 'Reconnected to the server. Rejoining the instance'))
            setRejoin((x) => x + 1)
          }),
        )
        const inst: InstanceInfo = joined.instance
        setPhase({ kind: 'loading', progress: 0, label: L('ワールドの情報を取得しています', 'Fetching world') })
        const wi = await api.world(inst.worldId)
        if (!alive) return
        manifest = wi.manifest
        world = await loadWorld(manifest, api.abs(wi.baseUrl)!, (p) => alive && setPhase({ kind: 'loading', progress: p, label: L('ワールドを読み込んでいます', 'Loading world') }))
        if (!alive) return
        const ticket = decodeTicketPayload(joined.ticket)
        const self: PeerDescriptor = { peerId: joined.peerId, user: { id: a.me.id, displayName: a.me.displayName, iconUrl: a.me.iconUrl, status: a.me.status, statusText: a.me.statusText, isGuest: a.me.isGuest }, joinedAt: ticket?.iat ?? Date.now(), hostScore, ticket: joined.ticket }
        const t = new MeshTransport({ signal: sig, self, peers: joined.peers, iceServers: info.iceServers, relayAllowed: info.relay })
        session = new InstanceSession({ transport: t, serverKey: info.publicKey, serverId: info.serverId, instanceId: inst.id, serverClock: sig.clock, avatar: withScale(a.avatar), allowContact: a.me.settings.allowContact, hostScore })
        offs.push(sig.on('ticket', (m) => session?.updateTicket(m.ticket)))
        engine = new WorldEngine({ api, session, world: { id: wi.id, name: wi.name, baseUrl: api.abs(wi.baseUrl)!, manifest }, instance: inst, dev: false }, withScale(a.avatar))
        // 参加チケットの期限が近づいたら更新する
        const renew = setInterval(() => sig.send({ t: 'renew' }), 60 * 60 * 1000)
        offs.push(() => clearInterval(renew))
        // 退出させる（作成者・モデレーター）
        const onKick = (e: Event) => {
          const d = (e as CustomEvent<{ peerId: string; reason: string }>).detail
          sig.send({ t: 'kick', peerId: d.peerId, reason: d.reason })
        }
        window.addEventListener('ttv-kick', onKick)
        offs.push(() => window.removeEventListener('ttv-kick', onKick))
      }
      if (!alive || !engine || !session) return
      engineRef.current = engine
      setActiveEngine(engine)
      // 開発時だけ: 自動テストから中の状態を見られるようにする
      if (import.meta.env.DEV) Object.assign(window, { __ttvEngine: engine, __ttvPortalPlacement: usePortalPlacement, __ttvPendingTap: pendingTap })
      // ほかのワールド・インスタンスへ移る（ポータル）
      engine.navigate = (target) => {
        if (target.instanceId) joinInstance(target.instanceId)
        else if (target.worldId) void goToWorld(target.worldId)
      }
      // 声
      const e = engine
      offs.push(e.session.t.onRemoteAudio((peerId, stream) => {
        e.voice.addRemote(peerId, stream)
        const m = e.session.members.get(peerId)
        const uid = m?.desc.user.id
        const vol = uid ? useModeration.getState().volumes[uid] : undefined
        if (vol !== undefined) e.voice.setUserGain(peerId, vol)
      }))
      offs.push(e.session.t.onPeers((ev) => ev.kind === 'leave' && e.voice.removeRemote(ev.peerId)))
      // 声: P2P の相手には WebRTC の音声で、中継の相手には Opus にして送る
      const relay = new VoiceRelay(e.session, e.voice)
      offs.push(() => relay.dispose())
      e.voice.bindSender((track) => {
        e.session.t.setAudioTrack(track)
        void relay.setMic(track)
      })
      void e.voice.startMic().then((ok) => {
        if (!ok && e.voice.micError) toast(L(`マイク: ${e.voice.micError}`, `Microphone: ${e.voice.micError}`), 'error')
        useMenu.getState().setMuted(e.voice.muted)
      })
      menuBus.bind({
        gesture: (n) => {
          const list = ['neutral', 'fist', 'open', 'point', 'victory', 'rocknroll', 'gun', 'thumbsup'] as const
          e.player.manualGesture = n === 0 ? [null, null] : [list[n - 1] ?? null, list[n - 1] ?? null]
        },
        mute: () => {
          e.voice.setMuted(!e.voice.muted)
          useMenu.getState().setMuted(e.voice.muted)
        },
        ptt: (down) => e.voice.setPtt(down),
      })
      // アバターの大きさを変えたら、全員に伝える
      offs.push(
        useSettings.subscribe((st, prev) => {
          if (st.s.avatarScale !== prev.s.avatarScale) actions.setAvatar(useApp.getState().avatar)
        }),
      )
      // OSC での表情の受け取り（設定で有効なときだけ）
      offs.push(startOscFace())
      setPhase({ kind: 'ready', target, engine: e, world })
    }
    start().catch(fail)
    return () => {
      alive = false
      offs.forEach((f) => f())
      setActiveEngine(null)
      useTools.getState().set({ mirror: false })
      useMenu.getState().setOpen(false)
      usePortalPlacement.getState().cancel()
      engine?.dispose()
      session?.close()
      engineRef.current = null
    }
  }, [instanceId, devUrl, rejoin, target])

  // アバターを変えたら伝える
  useEffect(() => {
    const e = engineRef.current
    if (e && JSON.stringify({ ...e.avatarRef, scale: 0 }) !== JSON.stringify({ ...avatar, scale: 0 })) {
      e.avatarRef = withScale(avatar)
      e.session.setAvatar(e.avatarRef)
      window.dispatchEvent(new Event('ttv-avatar-changed'))
    }
  }, [avatar])

  // 自分のアバターの拡張定義（ジェスチャーの割り当て・衣装・アクションメニュー）。入った後に着替えても読み直す
  const extAvatarId = avatar.kind === 'vrm' ? avatar.id : null
  useEffect(() => {
    setExt(null)
    useAvatarExt.getState().set(null)
    const api = app().api
    if (devUrl || !api || !extAvatarId) return
    let alive = true
    void api.avatar(extAvatarId).then((x) => {
      if (!alive) return
      setExt(x.extensions)
      useAvatarExt.getState().set(x.extensions, extAvatarId, useApp.getState().avatar.outfits)
    }).catch(() => {})
    return () => {
      alive = false
    }
  }, [extAvatarId, devUrl, target])

  // ホームワールドへ（メニューから）
  useEffect(() => {
    const h = (ev: Event) => void goToWorld((ev as CustomEvent<{ worldId: string }>).detail.worldId)
    window.addEventListener('ttv-go-world', h)
    return () => window.removeEventListener('ttv-go-world', h)
  }, [])

  const leave = () => useApp.getState().setScreen(devUrl ? { kind: 'connect' } : { kind: 'home' })
  const ready = phase.kind === 'ready' && phase.target === target ? phase : null
  useEffect(() => {
    if (ready) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, devUrl])
  useEffect(() => {
    if (phase.kind !== 'error') return
    toast(phase.message, 'error')
    leave()
  }, [phase, devUrl])
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <WorldScene engine={ready?.engine ?? null} world={ready?.world ?? null} extensions={ext} onWorldError={(e) => setWorldError(e.message)} onLoadingCancel={leave} />
      {ready && <Hud engine={ready.engine} onLeave={leave} worldError={worldError} />}
    </div>
  )
}

export { waitFor }
