import { CC0_TRACKS } from './cc0Tracks'
import type { Key } from './key'

// このワールド用のオリジナル曲（ハッピーハードコア風）をブラウザの中で作る。
// 曲のファイルを配らないので権利の問題がなく、全員が同じ手順で同じ音を作る（乱数は曲ごとの種で決まる）。
// DJ しやすいよう、頭と終わりに 16 小節ずつキックだけの部分（イントロ・アウトロ）を置く。
// 速くするため、楽器の音は 1 回だけ作って曲の中へコピーする

export const SAMPLE_RATE = 44100

export interface TrackDef {
  title: string
  artist: string
  bpm: number
  // 曲のキー（MIDI のノート番号。60 = C4）
  key: number
  // コード進行（キーからの半音と、長調 / 短調）
  prog: { root: number; minor: boolean }[]
  seed: number
  // 短調の曲か（キーの表示用）
  minor?: boolean
  // 決まったメロディ（4 小節 = 16 分音符 64 個の中の位置と MIDI のノート）。ないときは曲ごとに作る
  melody?: { step: number; note: number }[]
  // ブレイクのメロディをチェレスタ風の鐘の音で鳴らす
  bell?: boolean
}

export interface Rendered {
  left: Float32Array
  right: Float32Array
  duration: number
}

const I = { root: 0, minor: false }
const V = { root: 7, minor: false }
const vi = { root: 9, minor: true }
const IV = { root: 5, minor: false }
const ii = { root: 2, minor: true }
const iii = { root: 4, minor: true }

export const TRACK_DEFS: TrackDef[] = [
  { title: 'Sakura Rush', artist: 'DJ Lounge Original', bpm: 170, key: 61, prog: [I, V, vi, IV], seed: 11 },
  { title: 'Neon Candy', artist: 'DJ Lounge Original', bpm: 172, key: 57, prog: [vi, IV, I, V], seed: 23 },
  { title: 'Starlight Bounce', artist: 'DJ Lounge Original', bpm: 174, key: 59, prog: [IV, V, iii, vi], seed: 37 },
  { title: 'Rainbow Hyper', artist: 'DJ Lounge Original', bpm: 175, key: 62, prog: [I, iii, IV, V], seed: 41 },
  { title: 'Kawaii Overdrive', artist: 'DJ Lounge Original', bpm: 172, key: 64, prog: [IV, I, V, vi], seed: 53 },
  { title: 'Moonlight Gabba', artist: 'DJ Lounge Original', bpm: 176, key: 56, prog: [vi, ii, V, I], seed: 67 },
]

// 曲の一覧（内蔵の曲のあとに、DJ が追加した曲が並ぶ）。firstBeat は 1 拍目の位置（秒）
export interface TrackMeta {
  title: string
  artist: string
  bpm: number
  firstBeat: number
  // キー（わからないときは null）
  key: Key | null
  // 追加した曲のファイル（共有ファイルの URL）
  url?: string
  // ワールドに入れた曲のファイル（ワールドの中の相対パス）
  file?: string
  def?: TrackDef
  // 曲の長さ（秒）。音のデータを読み込んだら入る
  duration?: number
}
export interface LibraryEntry {
  url: string
  title: string
  bpm: number
  firstBeat: number
  key: Key | null
}
// 内蔵の曲: CC0 の曲（BPM 順）→ このワールド用に作った曲
const BUILTIN: TrackMeta[] = [
  ...CC0_TRACKS.map((t) => ({ title: t.title, artist: 'Tricks & Traps（CC0）', bpm: t.bpm, firstBeat: t.firstBeat, key: { ...t.key }, file: t.file })),
  ...TRACK_DEFS.map((d) => ({ title: d.title, artist: d.artist, bpm: d.bpm, firstBeat: 0, key: { tonic: d.key % 12, minor: !!d.minor }, def: d })),
]
export const BUILTIN_COUNT = BUILTIN.length
export const TRACKS: TrackMeta[] = [...BUILTIN]
// 共有されている追加曲の一覧を反映する
export const setLibrary = (lib: LibraryEntry[]) => {
  TRACKS.length = BUILTIN.length
  for (const e of lib) TRACKS.push({ title: e.title, artist: '追加した曲', bpm: e.bpm, firstBeat: e.firstBeat, key: e.key, url: e.url })
}

// 曲の構成（小節数）
const SECTIONS: { kind: 'intro' | 'build' | 'drop' | 'break' | 'build2' | 'outro'; bars: number }[] = [
  { kind: 'intro', bars: 16 },
  { kind: 'build', bars: 8 },
  { kind: 'drop', bars: 24 },
  { kind: 'break', bars: 8 },
  { kind: 'build2', bars: 4 },
  { kind: 'drop', bars: 16 },
  { kind: 'outro', bars: 16 },
]
export const TRACK_BARS = SECTIONS.reduce((a, s) => a + s.bars, 0)

// ---------- 小さな音作りの道具 ----------
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const rng = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}
// 帯域の決まったノコギリ波（polyBLEP で折り返しのノイズを減らす）
const blep = (t: number, dt: number) => {
  if (t < dt) {
    t /= dt
    return t + t - t * t - 1
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt
    return t * t + t + t + 1
  }
  return 0
}
const lowpass = (x: Float32Array, cutoff: number, sr = SAMPLE_RATE) => {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr)
  let y = 0
  for (let i = 0; i < x.length; i++) x[i] = y += a * (x[i] - y)
  return x
}
const highpass = (x: Float32Array, cutoff: number, sr = SAMPLE_RATE) => {
  const a = Math.exp((-2 * Math.PI * cutoff) / sr)
  let px = 0
  let y = 0
  for (let i = 0; i < x.length; i++) {
    y = a * (y + x[i] - px)
    px = x[i]
    x[i] = y
  }
  return x
}

// ---------- 楽器 ----------
const kick = () => {
  const n = Math.floor(0.42 * SAMPLE_RATE)
  const out = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const f = 46 + 120 * Math.exp(-t * 32)
    ph += (2 * Math.PI * f) / SAMPLE_RATE
    const amp = Math.exp(-t * 6.5) * Math.min(1, t * 900)
    // ハードコアらしく歪ませる
    out[i] = Math.tanh(Math.sin(ph) * amp * 3.2) * 0.9
  }
  return out
}
const noise = (n: number, r: () => number) => {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1
  return out
}
const hat = (open: boolean, r: () => number) => {
  const n = Math.floor((open ? 0.22 : 0.05) * SAMPLE_RATE)
  const out = highpass(noise(n, r), 7000)
  for (let i = 0; i < n; i++) out[i] *= Math.exp((-i / SAMPLE_RATE) * (open ? 14 : 70)) * 0.5
  return out
}
const clap = (r: () => number) => {
  const n = Math.floor(0.3 * SAMPLE_RATE)
  const out = highpass(lowpass(noise(n, r), 3500), 900)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    // 3 回に分かれた手拍子らしい立ち上がり
    const burst = t < 0.03 ? 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 100) : 1
    out[i] *= burst * Math.exp(-t * 18) * 1.6
  }
  return out
}
const crash = (r: () => number) => {
  const n = Math.floor(1.8 * SAMPLE_RATE)
  const out = highpass(noise(n, r), 5000)
  for (let i = 0; i < n; i++) out[i] *= Math.exp((-i / SAMPLE_RATE) * 2.4) * 0.35
  return out
}
// 何本か少しずらしたノコギリ波（スーパーソウ）
const supersaw = (notes: number[], seconds: number, cutoff: number, decay: number, voices = 5) => {
  const n = Math.floor(seconds * SAMPLE_RATE)
  const out = new Float32Array(n)
  for (const m of notes) {
    for (let v = 0; v < voices; v++) {
      const detune = (v - (voices - 1) / 2) * 0.12
      const f = mtof(m + detune)
      const dt = f / SAMPLE_RATE
      let ph = (v * 0.37) % 1
      for (let i = 0; i < n; i++) {
        out[i] += (2 * ph - 1 - blep(ph, dt)) / (voices * notes.length)
        ph += dt
        if (ph >= 1) ph -= 1
      }
    }
  }
  lowpass(out, cutoff)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    out[i] *= Math.min(1, t * 400) * Math.exp(-t * decay) * Math.min(1, (seconds - t) * 80)
  }
  return out
}
const piano = (notes: number[], seconds: number) => {
  const n = Math.floor(seconds * SAMPLE_RATE)
  const out = new Float32Array(n)
  for (const m of notes) {
    const f = mtof(m)
    for (let h = 1; h <= 5; h++) {
      const amp = 0.5 / h / notes.length
      const w = (2 * Math.PI * f * h) / SAMPLE_RATE
      for (let i = 0; i < n; i++) out[i] += Math.sin(w * i) * amp * Math.exp((-i / SAMPLE_RATE) * (1.6 + h * 0.9))
    }
  }
  for (let i = 0; i < n; i++) out[i] *= Math.min(1, i / 60) * Math.min(1, ((n - i) / SAMPLE_RATE) * 60)
  return out
}
// チェレスタ風の鐘の音（基音と 4 倍音。4 倍音はすぐ消える）
const bell = (m: number, seconds: number) => {
  const n = Math.floor(seconds * SAMPLE_RATE)
  const out = new Float32Array(n)
  const f = mtof(m)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    out[i] = (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3.2) + 0.35 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 14) + 0.12 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 9)) * Math.min(1, i / 40) * 0.5
  }
  return out
}
const bassNote = (m: number, seconds: number) => {
  const n = Math.floor(seconds * SAMPLE_RATE)
  const out = new Float32Array(n)
  const f = mtof(m)
  const dt = f / SAMPLE_RATE
  let ph = 0
  for (let i = 0; i < n; i++) {
    // 矩形波とノコギリ波を混ぜた太いベース
    const saw = 2 * ph - 1 - blep(ph, dt)
    const sq = ph < 0.5 ? 1 : -1
    out[i] = (saw * 0.6 + sq * 0.4) * 0.5
    ph += dt
    if (ph >= 1) ph -= 1
  }
  lowpass(out, 900)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    out[i] *= Math.min(1, t * 300) * Math.exp(-t * 5) * Math.min(1, (seconds - t) * 100)
  }
  return out
}

// ---------- 曲を作る ----------
export const renderTrack = (def: TrackDef): Rendered => {
  const r = rng(def.seed)
  const spb = 60 / def.bpm
  const bar = spb * 4
  const duration = TRACK_BARS * bar + 2
  const len = Math.ceil(duration * SAMPLE_RATE)
  const L = new Float32Array(len)
  const R = new Float32Array(len)
  const add = (s: Float32Array, at: number, gain: number, pan = 0) => {
    const o = Math.round(at * SAMPLE_RATE)
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2
    const end = Math.min(s.length, len - o)
    for (let i = 0; i < end; i++) {
      L[o + i] += s[i] * gl
      R[o + i] += s[i] * gr
    }
  }
  const K = kick()
  const HC = hat(false, r)
  const HO = hat(true, r)
  const CL = clap(r)
  const CR = crash(r)
  const chordNotes = (c: { root: number; minor: boolean }, base: number) => [base + c.root, base + c.root + (c.minor ? 3 : 4), base + c.root + 7, base + c.root + 12]
  const stabs = def.prog.map((c) => supersaw(chordNotes(c, def.key), spb * 0.55, 5200, 4))
  const pads = def.prog.map((c) => supersaw(chordNotes(c, def.key - 12).slice(0, 3), bar, 2200, 0.6, 3))
  const pianos = def.prog.map((c) => piano(chordNotes(c, def.key), spb * 2))
  const basses = def.prog.map((c) => bassNote(def.key - 24 + c.root, spb * 0.45))
  // メロディ: 4 小節（16 分音符 64 個）のリズムを曲ごとに決め、コードの音から選ぶ
  const rhythm: number[] = []
  for (let s = 0; s < 64; s++) if (s % 4 === 0 ? r() < 0.85 : s % 2 === 0 ? r() < 0.5 : r() < 0.18) rhythm.push(s)
  const melody = def.melody ?? rhythm.map((s) => {
    const c = def.prog[Math.floor(s / 16) % def.prog.length]
    const tones = chordNotes(c, def.key + 12)
    return { step: s, note: tones[Math.floor(r() * tones.length)] + (r() < 0.2 ? 12 : 0) }
  })
  const leadCache = new Map<number, Float32Array>()
  const lead = (m: number) => {
    let s = leadCache.get(m)
    if (!s) leadCache.set(m, (s = supersaw([m], spb * 0.45, 7000, 5, 7)))
    return s
  }
  const bellCache = new Map<number, Float32Array>()
  const bellNote = (m: number) => {
    let s = bellCache.get(m)
    if (!s) bellCache.set(m, (s = bell(m, spb * 1.5)))
    return s
  }
  // 決まったメロディの曲は、ドロップで 1 オクターブ上のスーパーソウ＋鐘の音で鳴らす
  const leadUp = def.melody ? 12 : 0
  const pianoCache = new Map<number, Float32Array>()
  const pianoNote = (m: number) => {
    let s = pianoCache.get(m)
    if (!s) pianoCache.set(m, (s = piano([m], spb * 1.2)))
    return s
  }

  let barIndex = 0
  for (const sec of SECTIONS) {
    for (let b = 0; b < sec.bars; b++) {
      const t0 = barIndex * bar
      const chord = (barIndex % 4) % def.prog.length
      const k = sec.kind
      const drums = k === 'intro' || k === 'build' || k === 'drop' || k === 'outro'
      if (b === 0 && k !== 'break') add(CR, t0, 0.8, 0)
      // キック（ビルドの最後 2 小節はスネアロール）
      const roll = (k === 'build' && b >= sec.bars - 2) || k === 'build2'
      if (drums && !roll) for (let q = 0; q < 4; q++) add(K, t0 + q * spb, 0.78)
      if (roll) {
        const steps = k === 'build2' ? (b < 2 ? 8 : 16) : b === sec.bars - 2 ? 8 : 16
        for (let s = 0; s < steps; s++) add(CL, t0 + (s * bar) / steps, 0.25 + (0.5 * (b * steps + s)) / (sec.bars * 16), 0)
      }
      // ハイハット
      if (drums && !(k === 'intro' && b < 4)) {
        for (let s = 0; s < 16; s++) {
          if (s % 4 === 2) add(HO, t0 + (s * spb) / 4, 0.55, 0.15)
          else add(HC, t0 + (s * spb) / 4, s % 2 === 0 ? 0.5 : 0.3, -0.2)
        }
      }
      // 手拍子（2・4 拍）
      if ((k === 'drop' || (k === 'outro' && b < 8)) && !roll) {
        add(CL, t0 + spb, 0.55)
        add(CL, t0 + spb * 3, 0.55)
      }
      // 裏拍のベース
      const bassOn = (k === 'intro' && b >= 8) || k === 'build' || k === 'drop' || (k === 'outro' && b < 8)
      if (bassOn && !roll) for (let q = 0; q < 4; q++) add(basses[chord], t0 + q * spb + spb / 2, 0.75)
      // コードのスタブ（ドロップは 16 分のシンコペーション、ビルドは 4 分）
      if (k === 'drop') for (const s of [0, 3, 6, 8, 11, 14]) add(stabs[chord], t0 + (s * spb) / 4, 0.55, s % 2 ? 0.3 : -0.3)
      if (k === 'build' || k === 'build2') for (let q = 0; q < 4; q++) add(stabs[chord], t0 + q * spb, 0.18 + (0.2 * b) / sec.bars)
      // パッドとピアノ（ブレイク）
      if (k === 'break' || k === 'build2') {
        add(pads[chord], t0, 0.3)
        add(pianos[chord], t0, 0.45, -0.1)
        add(pianos[chord], t0 + spb * 2, 0.4, 0.1)
      }
      // メロディ（ドロップはスーパーソウ、ブレイクはピアノ）
      if (k === 'drop' || k === 'break') {
        const phrase = barIndex % 4
        for (const n of melody) {
          if (Math.floor(n.step / 16) !== phrase) continue
          const at = t0 + ((n.step % 16) * spb) / 4
          if (k === 'drop') {
            add(lead(n.note + leadUp), at, 0.42, 0.1)
            // 3/16 拍あとの左右のこだま
            add(lead(n.note + leadUp), at + (spb * 3) / 4, 0.1, -0.6)
            if (def.bell) add(bellNote(n.note + 12), at, 0.25, -0.2)
          } else if (def.bell) add(bellNote(n.note + 12), at, 0.55, 0.15)
          else add(pianoNote(n.note + 12), at, 0.35, 0.2)
        }
      }
      barIndex++
    }
  }
  // 盛り上がり前のホワイトノイズ（ビルドの 8 小節で音量と高さが上がる）
  barIndex = 0
  for (const sec of SECTIONS) {
    if (sec.kind === 'build' || sec.kind === 'build2') {
      const n = Math.floor(sec.bars * bar * SAMPLE_RATE)
      const sweep = noise(n, r)
      let y = 0
      for (let i = 0; i < n; i++) {
        const p = i / n
        const a = 0.02 + 0.5 * p * p
        y += a * (sweep[i] - y)
        sweep[i] = (sweep[i] - y) * p * p * 0.35
      }
      add(sweep, barIndex * bar, 1)
    }
    barIndex += sec.bars
  }
  // まとめて音量をそろえる（やわらかく頭打ち）
  let peak = 0
  for (let i = 0; i < len; i++) {
    L[i] = Math.tanh(L[i] * 0.9)
    R[i] = Math.tanh(R[i] * 0.9)
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  }
  const g = 0.9 / (peak || 1)
  for (let i = 0; i < len; i++) {
    L[i] *= g
    R[i] *= g
  }
  return { left: L, right: R, duration }
}

// ---------- サンプラーの音（パッドの SAMPLER モード） ----------
export const SAMPLE_NAMES = ['AIR HORN', 'SIREN', 'LASER', 'CRASH', 'HEY!', 'RISER', 'DROP', 'SCRATCH']
export const renderSample = (index: number): Float32Array => {
  const r = rng(1000 + index)
  const sec = (s: number) => Math.floor(s * SAMPLE_RATE)
  switch (index) {
    case 0: {
      // エアホーン: ノコギリ波を 3 回鳴らす
      const out = new Float32Array(sec(1.2))
      const blasts = [0, 0.22, 0.44]
      blasts.forEach((b, j) => {
        const s = supersaw([66, 70, 73], j === 2 ? 0.7 : 0.18, 4000, 0.4, 3)
        out.set(s.map((v, i) => v + (out[sec(b) + i] ?? 0)).slice(0, out.length - sec(b)), sec(b))
      })
      return out
    }
    case 1: {
      const n = sec(1.6)
      const out = new Float32Array(n)
      let ph = 0
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE
        ph += (2 * Math.PI * (700 + 350 * Math.sin(t * 2 * Math.PI * 3))) / SAMPLE_RATE
        out[i] = Math.sin(ph) * 0.4 * Math.min(1, (1.6 - t) * 5)
      }
      return out
    }
    case 2: {
      const n = sec(0.35)
      const out = new Float32Array(n)
      let ph = 0
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE
        ph += (2 * Math.PI * (3000 * Math.exp(-t * 12) + 200)) / SAMPLE_RATE
        out[i] = (Math.sin(ph) > 0 ? 0.35 : -0.35) * Math.exp(-t * 6)
      }
      return out
    }
    case 3:
      return crash(r).map((v) => v * 2.2)
    case 4: {
      // 「ヘイ！」っぽい短い声のような音（2 つの母音の帯域を強めたノイズとノコギリ波）
      const n = sec(0.32)
      const base = supersaw([57], 0.32, 2500, 6, 3)
      const air = lowpass(highpass(noise(n, r), 600), 3000)
      return base.map((v, i) => (v * 1.6 + air[i] * 0.3) * Math.min(1, i / 300) * Math.exp((-i / SAMPLE_RATE) * 7))
    }
    case 5: {
      const n = sec(2)
      const out = noise(n, r)
      let y = 0
      for (let i = 0; i < n; i++) {
        const p = i / n
        y += (0.02 + 0.6 * p * p) * (out[i] - y)
        out[i] = (out[i] - y) * p * 0.5
      }
      return out
    }
    case 6: {
      const n = sec(1)
      const out = new Float32Array(n)
      let ph = 0
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE
        ph += (2 * Math.PI * (40 + 400 * Math.exp(-t * 5))) / SAMPLE_RATE
        out[i] = Math.tanh(Math.sin(ph) * 3) * 0.6 * Math.exp(-t * 2.5)
      }
      return out
    }
    default: {
      // スクラッチ: ノイズの高さを前後に揺らす
      const n = sec(0.5)
      const src = noise(n, r)
      const out = new Float32Array(n)
      let y = 0
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE
        const a = 0.05 + 0.25 * Math.abs(Math.sin(t * 2 * Math.PI * 6))
        y += a * (src[i] - y)
        out[i] = y * 1.2 * Math.min(1, (0.5 - t) * 20)
      }
      return out
    }
  }
}
