// OSC で表情を受け取る（[22][23] フェイス・アイトラッキング）
// 受け口:
//   Windows 版 … アプリが UDP を直接受ける（window.__tentenvOSC）
//   ブラウザ   … scripts/osc-bridge.mjs が UDP を受けて ws://127.0.0.1:39570 へ流す
// 受け取る形式:
//   VMC プロトコル   /VMC/Ext/Blend/Val <名前> <値> と /VMC/Ext/Blend/Apply
//   アバターパラメーター   /avatar/parameters/<名前> <値>（表情名と v2/… 形式に対応）
// アバターに同じ名前の表情があればそのまま使い（パーフェクトシンク）、なければ VRM の標準の表情に置き換える
import { settings, useSettings } from '../state/settings'

export const OSC_BRIDGE_URL = 'ws://127.0.0.1:39570'

interface OscBridge {
  listen: (port: number) => Promise<{ ok: boolean; error?: string }>
  close: () => void
  onPacket: (cb: (data: Uint8Array) => void) => void
}
const nativeBridge = (): OscBridge | null => (window as unknown as { __tentenvOSC?: OscBridge }).__tentenvOSC ?? null

/** 受け取った値（名前は小文字・英数字だけにしたもの） */
const raw = new Map<string, number>()
const pending = new Map<string, number>()
export const oscState = {
  /** 最後に受け取った時刻（performance.now()） */
  last: 0,
  status: 'off' as 'off' | 'waiting' | 'receiving' | 'error',
  error: '',
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// ---------------------------------------------------------------- OSC の読み取り

type OscArg = number | string | boolean
const readString = (v: DataView, o: number): [string, number] => {
  let end = o
  while (end < v.byteLength && v.getUint8(end) !== 0) end++
  const s = new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset + o, end - o))
  return [s, (end + 4) & ~3]
}

const readMessage = (v: DataView, out: (addr: string, args: OscArg[]) => void) => {
  let [addr, o] = readString(v, 0)
  if (!addr.startsWith('/')) return
  if (o >= v.byteLength) return out(addr, [])
  let tags: string
  ;[tags, o] = readString(v, o)
  const args: OscArg[] = []
  for (const t of tags.slice(1)) {
    if (t === 'f') (args.push(v.getFloat32(o)), (o += 4))
    else if (t === 'i') (args.push(v.getInt32(o)), (o += 4))
    else if (t === 'd') (args.push(v.getFloat64(o)), (o += 8))
    else if (t === 'h') (args.push(Number(v.getBigInt64(o))), (o += 8))
    else if (t === 's') {
      let s: string
      ;[s, o] = readString(v, o)
      args.push(s)
    } else if (t === 'T') args.push(true)
    else if (t === 'F') args.push(false)
    else if (t === 'N' || t === 'I') continue
    else return // 対応していない型（blob など）はこのメッセージごと捨てる
  }
  out(addr, args)
}

/** OSC のパケット（バンドルを含む）を読む */
export const parseOsc = (data: Uint8Array, out: (addr: string, args: OscArg[]) => void, depth = 0) => {
  if (data.byteLength < 4 || depth > 4) return
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength)
  try {
    if (data[0] === 0x23 && new TextDecoder().decode(data.subarray(0, 7)) === '#bundle') {
      let o = 16
      while (o + 4 <= data.byteLength) {
        const n = v.getInt32(o)
        o += 4
        if (n <= 0 || o + n > data.byteLength) return
        parseOsc(data.subarray(o, o + n), out, depth + 1)
        o += n
      }
    } else readMessage(v, out)
  } catch {
    // 壊れたパケットは捨てる
  }
}

const num = (a: OscArg | undefined) => (typeof a === 'number' ? a : typeof a === 'boolean' ? (a ? 1 : 0) : null)

/** 1 つの OSC メッセージを表情の値として取り込む */
export const handleOsc = (addr: string, args: OscArg[]) => {
  if (addr === '/VMC/Ext/Blend/Val') {
    const v = num(args[1])
    if (typeof args[0] === 'string' && v !== null) pending.set(norm(args[0]), v)
    return
  }
  if (addr === '/VMC/Ext/Blend/Apply') {
    for (const [k, v] of pending) raw.set(k, v)
    pending.clear()
    oscState.last = performance.now()
    return
  }
  if (addr.startsWith('/avatar/parameters/')) {
    const v = num(args[0])
    if (v === null) return
    // 表情パラメーターの接頭辞（FT/v2/…・v2/…）は外す
    const name = addr.slice('/avatar/parameters/'.length).replace(/^(ft\/)?(v2\/)?/i, '')
    raw.set(norm(name), v)
    oscState.last = performance.now()
  }
}

// ---------------------------------------------------------------- 表情への置き換え

// VMC・VRM 0.x の表情の名前 → VRM 1.0（three-vrm）の名前
const PRESETS: Record<string, string> = {
  a: 'aa', aa: 'aa', i: 'ih', ih: 'ih', u: 'ou', ou: 'ou', e: 'ee', ee: 'ee', o: 'oh', oh: 'oh',
  blink: 'blink', blinkl: 'blinkLeft', blinkleft: 'blinkLeft', blinkr: 'blinkRight', blinkright: 'blinkRight',
  joy: 'happy', happy: 'happy', angry: 'angry', sorrow: 'sad', sad: 'sad', fun: 'relaxed', relaxed: 'relaxed', surprised: 'surprised',
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))

/**
 * いまの表情（アバターの表情の名前 → 0〜1）。OSC を 1 秒以上受け取っていなければ null
 * @param available アバターが持っている表情の名前
 */
export const oscFaceExpression = (available: string[]): Record<string, number> | null => {
  if (oscState.status === 'off' || performance.now() - oscState.last > 1000 || raw.size === 0) return null
  const out: Record<string, number> = {}
  const has = (k: string) => raw.has(k)
  const g = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw.get(k)
      if (v !== undefined) return v
    }
    return 0
  }
  // 1. アバターに同じ名前の表情があればそのまま（パーフェクトシンク）
  const byNorm = new Map(available.map((n) => [norm(n), n]))
  for (const [k, v] of raw) {
    const name = byNorm.get(k)
    if (name && !PRESETS[k]) out[name] = clamp(v)
  }
  // 2. VMC で VRM の表情の名前が来ていればそれを使う
  let presets = false
  for (const [k, v] of raw) {
    const p = PRESETS[k]
    if (p) {
      out[p] = Math.max(out[p] ?? 0, clamp(v))
      presets = true
    }
  }
  if (presets) return out
  // 3. フェイストラッキングの表情名から、VRM の標準の表情を作る
  const lid = (side: 'left' | 'right') => {
    if (has(`eyeblink${side}`)) return g(`eyeblink${side}`)
    // EyeLid は開き具合（0 閉じ・0.75 前後がふつう・1 見開き）
    if (has(`eyelid${side}`) || has('eyelid')) return clamp(1 - g(`eyelid${side}`, 'eyelid') / 0.75)
    if (has(`eyeclosed${side}`)) return g(`eyeclosed${side}`)
    return null
  }
  const bl = lid('left')
  const br = lid('right')
  const jaw = g('jawopen')
  const smile = (Math.max(g('mouthsmileleft', 'mouthcornerpullleft'), g('smilefrownleft')) + Math.max(g('mouthsmileright', 'mouthcornerpullright'), g('smilefrownright'))) / 2
  const frown = (Math.max(g('mouthfrownleft', 'mouthcornerdepressorleft'), -g('smilefrownleft')) + Math.max(g('mouthfrownright', 'mouthcornerdepressorright'), -g('smilefrownright'))) / 2
  const browDown = (Math.max(g('browdownleft', 'browlowererleft'), -g('browexpressionleft')) + Math.max(g('browdownright', 'browlowererright'), -g('browexpressionright'))) / 2
  const browUp = Math.max(g('browinnerup'), (g('browinnerupleft') + g('browinnerupright')) / 2, (g('browexpressionleft') + g('browexpressionright')) / 2)
  const funnel = Math.max(g('mouthfunnel'), g('lipfunnel'), (g('lipfunnelupperleft') + g('lipfunnelupperright') + g('lipfunnellowerleft') + g('lipfunnellowerright')) / 4)
  const pucker = Math.max(g('mouthpucker'), g('lippucker'), (g('lippuckerupperleft') + g('lippuckerupperright') + g('lippuckerlowerleft') + g('lippuckerlowerright')) / 4)
  if (bl !== null) out.blinkLeft = clamp(bl * 1.3)
  if (br !== null) out.blinkRight = clamp(br * 1.3)
  out.aa = clamp(jaw * 1.4)
  out.oh = clamp(funnel * 1.2)
  out.ou = clamp(pucker * 1.2)
  out.ee = clamp(smile * jaw * 2)
  out.happy = clamp(Math.max(0, smile - 0.25) * 1.8)
  out.angry = clamp(Math.max(0, browDown - 0.35) * 2)
  out.sad = clamp(Math.max(0, frown - 0.2) * 2)
  out.surprised = clamp(Math.max(0, browUp - 0.4) * 2 * (jaw > 0.3 ? 1 : 0.5))
  return out
}

/** 送る前に値を丸め、64 個までにする（受け手の上限） */
export const compactExpression = (e: Record<string, number>) => {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(e).slice(0, 64)) out[k] = Math.round(v * 100) / 100
  return out
}

// ---------------------------------------------------------------- 受け口

const feed = (data: Uint8Array) => {
  if (oscState.status === 'waiting') oscState.status = 'receiving'
  parseOsc(data, handleOsc)
}

/** 設定に合わせて OSC の受け取りを始める・止める。戻り値で止める */
export const startOscFace = () => {
  let stop: (() => void) | null = null
  // 止めた後・ポートを変えた後に、前の listen の結果で状態を書き換えないための番号
  let generation = 0
  const apply = () => {
    stop?.()
    stop = null
    const gen = ++generation
    raw.clear()
    pending.clear()
    const s = settings()
    if (!s.oscFace) {
      oscState.status = 'off'
      return
    }
    oscState.status = 'waiting'
    oscState.error = ''
    const nb = nativeBridge()
    if (nb) {
      // Windows 版: アプリが UDP を受ける
      nb.onPacket(feed)
      const failed = (error: string) => {
        if (gen !== generation) return
        oscState.status = 'error'
        oscState.error = error
      }
      nb.listen(s.oscPort).then((r) => {
        if (!r.ok) failed(r.error ?? '')
      }).catch((e: unknown) => failed(e instanceof Error ? e.message : String(e)))
      stop = () => nb.close()
      return
    }
    // ブラウザ: 手元のブリッジへつなぐ（切れたらつなぎ直す）
    let ws: WebSocket | null = null
    let timer = 0
    let alive = true
    const connect = () => {
      if (!alive) return
      ws = new WebSocket(OSC_BRIDGE_URL)
      ws.binaryType = 'arraybuffer'
      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) feed(new Uint8Array(e.data))
      }
      ws.onclose = () => {
        if (alive) timer = window.setTimeout(connect, 3000)
      }
    }
    connect()
    stop = () => {
      alive = false
      clearTimeout(timer)
      ws?.close()
    }
  }
  apply()
  let prev = `${settings().oscFace}:${settings().oscPort}`
  const unsub = useSettings.subscribe((st) => {
    const k = `${st.s.oscFace}:${st.s.oscPort}`
    if (k !== prev) {
      prev = k
      apply()
    }
  })
  return () => {
    unsub()
    generation++
    stop?.()
    oscState.status = 'off'
    raw.clear()
  }
}
