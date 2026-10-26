import { FileLoader } from 'three'
import { liveDeck, beatsAt, deckPos, effectiveBpm, FX_BEATS, masterDeck, pitchRatio, type DeckState, type MixState } from './state'
import { detectBeat } from './bpm'
import { detectKey } from './key'
import { renderSample, renderTrack, SAMPLE_RATE, TRACKS } from './tracks'

// DJ の音を作る（Web Audio）。共有の状態を毎フレーム受け取り、各自のブラウザで同じ音にする。
// デッキ → 高さ（MASTER TEMPO / KEY）→ TRIM → EQ（LOW/MID/HI）→ CFX（FILTER / DUB ECHO / NOISE / SPACE / CRUSH）
//   → チャンネルフェーダー → クロスフェーダー → BEAT FX（差し込み）→ マスター → 出力
// BEAT FX の ECHO / PING PONG / REVERB は効果音だけを足す（センド・リターン）。TRANS / FLANGER / PHASER / FILTER は音そのものを変える（差し込み）

export interface TrackData {
  buffer: AudioBuffer
  // REVERSE 用の逆向きの音（はじめて使うときに作る）
  reversed?: AudioBuffer
  duration: number
  // 波形の表示用（1 秒 100 個）: 全体・低音・中音・高音の大きさ
  peaks: Float32Array
  lows: Float32Array
  mids: Float32Array
  highs: Float32Array
}
export const PEAKS_PER_SEC = 100

// 波形の表示用の大きさを 1 秒 100 個で求める（低音 〜200Hz、高音 2.5kHz〜、中音はその間）
const peaksOf = (buffer: AudioBuffer) => {
  const sr = buffer.sampleRate
  const l = buffer.getChannelData(0)
  const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l
  const step = sr / PEAKS_PER_SEC
  const n = Math.ceil(l.length / step)
  const peaks = new Float32Array(n)
  const lows = new Float32Array(n)
  const mids = new Float32Array(n)
  const highs = new Float32Array(n)
  let lo = 0
  let hiLp = 0
  const a = 1 - Math.exp((-2 * Math.PI * 200) / sr)
  const b = 1 - Math.exp((-2 * Math.PI * 2500) / sr)
  for (let k = 0; k < n; k++) {
    let pk = 0
    let lw = 0
    let md = 0
    let hg = 0
    for (let s = Math.floor(k * step); s < Math.min(l.length, (k + 1) * step); s++) {
      const v = (l[s] + r[s]) / 2
      lo += a * (v - lo)
      hiLp += b * (v - hiLp)
      const high = v - hiLp
      pk = Math.max(pk, Math.abs(v))
      lw = Math.max(lw, Math.abs(lo))
      md = Math.max(md, Math.abs(hiLp - lo))
      hg = Math.max(hg, Math.abs(high))
    }
    peaks[k] = pk
    lows[k] = lw
    mids[k] = md
    highs[k] = hg
  }
  // 帯域ごとに、曲の中でいちばん大きい所（上位 1%）が 1 になるようにそろえる（帯域で大きさがかなり違うため）
  for (const arr of [lows, mids, highs]) {
    const sorted = Float32Array.from(arr).sort()
    const top = sorted[Math.floor(sorted.length * 0.99)] || 1
    for (let k = 0; k < arr.length; k++) arr[k] = Math.min(1, arr[k] / top)
  }
  return { peaks, lows, mids, highs }
}

const reverseOf = (ctx: BaseAudioContext, b: AudioBuffer) => {
  const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c)
    const dst = out.getChannelData(c)
    for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i]
  }
  return out
}

// EQ のつまみ（0..1、0.5 で平ら）→ dB。左いっぱいで音が消える
const eqDb = (v: number) => (v < 0.5 ? (v < 0.02 ? -60 : -26 * (1 - v / 0.5)) : 6 * ((v - 0.5) / 0.5))

// 高さを変える処理（pitch-shifter.js）を通したときの遅れ（秒）。窓の長さ 60ms の半分ほど
const SHIFT_LATENCY = 0.031
// VINYL BRAKE で止まるまでの時間（秒）
const BRAKE_SECONDS = 0.7

// ---------- BEAT FX（差し込み）: TRANS / FLANGER / PHASER / FILTER ----------
class InsertFx {
  readonly input: GainNode
  readonly output: GainNode
  private dry: GainNode
  private wet: GainNode
  private lfo: OscillatorNode
  private paths: GainNode[]
  private flangerDelay: DelayNode
  private flangerDepth: GainNode
  private phaserDepth: GainNode
  private filterDepth: GainNode
  constructor(private ctx: AudioContext) {
    const c = ctx
    this.input = c.createGain()
    this.output = c.createGain()
    this.dry = c.createGain()
    this.wet = c.createGain()
    this.wet.gain.value = 0
    this.input.connect(this.dry).connect(this.output)
    this.wet.connect(this.output)
    this.lfo = c.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 0.5
    this.lfo.start()
    // FLANGER: 1〜6ms の遅れを揺らす
    const fIn = c.createGain()
    this.flangerDelay = c.createDelay(0.05)
    this.flangerDelay.delayTime.value = 0.0035
    this.flangerDepth = c.createGain()
    this.flangerDepth.gain.value = 0.0025
    this.lfo.connect(this.flangerDepth).connect(this.flangerDelay.delayTime)
    const fFb = c.createGain()
    fFb.gain.value = 0.6
    fIn.connect(this.flangerDelay).connect(fFb).connect(this.flangerDelay)
    fIn.connect(this.wet)
    this.flangerDelay.connect(this.wet)
    // PHASER: 4 段のオールパスの周波数を揺らす
    const pIn = c.createGain()
    this.phaserDepth = c.createGain()
    this.phaserDepth.gain.value = 700
    this.lfo.connect(this.phaserDepth)
    let node: AudioNode = pIn
    for (let k = 0; k < 4; k++) {
      const ap = c.createBiquadFilter()
      ap.type = 'allpass'
      ap.frequency.value = 900
      ap.Q.value = 0.8
      this.phaserDepth.connect(ap.frequency)
      node.connect(ap)
      node = ap
    }
    pIn.connect(this.wet)
    node.connect(this.wet)
    // FILTER: ローパスの周波数を揺らす
    const lIn = c.createGain()
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2200
    lp.Q.value = 5
    this.filterDepth = c.createGain()
    this.filterDepth.gain.value = 1900
    this.lfo.connect(this.filterDepth).connect(lp.frequency)
    lIn.connect(lp).connect(this.wet)
    this.paths = [fIn, pIn, lIn]
    this.paths.forEach((p) => {
      p.gain.value = 0
      this.input.connect(p)
    })
  }
  // type: FX_TYPES の番号（3 TRANS, 4 FLANGER, 5 PHASER, 6 FILTER）。gateOpen は TRANS のとき
  set(active: boolean, type: number, level: number, period: number, gateOpen: boolean) {
    const t = this.ctx.currentTime
    const on = active && type >= 3
    const k = type - 4
    this.paths.forEach((p, i) => p.gain.setTargetAtTime(on && i === k ? 0.5 : 0, t, 0.02))
    this.lfo.frequency.setTargetAtTime(1 / Math.max(0.05, period), t, 0.05)
    if (!on) {
      this.dry.gain.setTargetAtTime(1, t, 0.01)
      this.wet.gain.setTargetAtTime(0, t, 0.02)
    } else if (type === 3) {
      // TRANS: 拍に合わせて音を切る（level で切る深さ）
      this.dry.gain.setTargetAtTime(gateOpen ? 1 : 1 - level, t, 0.004)
      this.wet.gain.setTargetAtTime(0, t, 0.02)
    } else {
      this.dry.gain.setTargetAtTime(type === 6 ? 1 - level : 1 - level * 0.4, t, 0.02)
      this.wet.gain.setTargetAtTime(type === 6 ? level * 2 : level * 1.2, t, 0.02)
    }
  }
}

// ---------- 1 台分のデッキ ----------
class DeckAudio {
  input: GainNode
  shifter: AudioWorkletNode | null = null
  crusher: AudioWorkletNode | null = null
  shifted = false
  trim: GainNode
  low: BiquadFilterNode
  mid: BiquadFilterNode
  hi: BiquadFilterNode
  lp: BiquadFilterNode
  hp: BiquadFilterNode
  // CFX の DUB ECHO / NOISE / SPACE
  private dubSend: GainNode
  private dubDelay: DelayNode
  private noiseGain: GainNode
  private noiseFilter: BiquadFilterNode
  private spaceSend: GainNode
  private crushIn: GainNode
  private postCfx: GainNode
  fader: GainNode
  xf: GainNode
  insert: InsertFx
  analyser: AnalyserNode
  send: GainNode
  source: AudioBufferSourceNode | null = null
  epoch = ''
  startCtx = 0
  startPos = 0
  rate = 1
  dir = 1
  loop: { in: number; out: number } | null = null
  braked = 0
  private last: Record<string, number> = {}
  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    fxIn: AudioNode,
    spaceIn: AudioNode,
    noise: AudioBuffer
  ) {
    const c = ctx
    this.input = c.createGain()
    this.trim = c.createGain()
    this.input.connect(this.trim)
    this.low = Object.assign(c.createBiquadFilter(), { type: 'lowshelf' }) as BiquadFilterNode
    this.low.frequency.value = 220
    this.mid = Object.assign(c.createBiquadFilter(), { type: 'peaking' }) as BiquadFilterNode
    this.mid.frequency.value = 1000
    this.mid.Q.value = 0.7
    this.hi = Object.assign(c.createBiquadFilter(), { type: 'highshelf' }) as BiquadFilterNode
    this.hi.frequency.value = 3500
    this.lp = Object.assign(c.createBiquadFilter(), { type: 'lowpass' }) as BiquadFilterNode
    this.lp.frequency.value = 22000
    this.lp.Q.value = 1.2
    this.hp = Object.assign(c.createBiquadFilter(), { type: 'highpass' }) as BiquadFilterNode
    this.hp.frequency.value = 10
    this.hp.Q.value = 1.2
    this.crushIn = c.createGain()
    this.postCfx = c.createGain()
    this.fader = c.createGain()
    this.xf = c.createGain()
    this.insert = new InsertFx(c)
    this.analyser = c.createAnalyser()
    this.analyser.fftSize = 512
    this.send = c.createGain()
    this.send.gain.value = 0
    this.trim.connect(this.low).connect(this.mid).connect(this.hi).connect(this.lp).connect(this.hp).connect(this.crushIn)
    this.crushIn.connect(this.postCfx)
    this.postCfx.connect(this.analyser)
    this.postCfx.connect(this.fader).connect(this.xf).connect(this.insert.input)
    this.insert.output.connect(out)
    this.xf.connect(this.send).connect(fxIn)
    // DUB ECHO（3/4 拍のこだま。低音を削りながら繰り返す）
    this.dubSend = c.createGain()
    this.dubSend.gain.value = 0
    this.dubDelay = c.createDelay(4)
    const dubFb = c.createGain()
    dubFb.gain.value = 0.62
    const dubHp = Object.assign(c.createBiquadFilter(), { type: 'highpass' }) as BiquadFilterNode
    dubHp.frequency.value = 350
    this.hp.connect(this.dubSend).connect(this.dubDelay).connect(dubHp).connect(dubFb).connect(this.dubDelay)
    dubHp.connect(this.postCfx)
    // NOISE（ホワイトノイズをフィルターに通して足す）
    const ns = c.createBufferSource()
    ns.buffer = noise
    ns.loop = true
    this.noiseFilter = Object.assign(c.createBiquadFilter(), { type: 'bandpass' }) as BiquadFilterNode
    this.noiseFilter.Q.value = 0.8
    this.noiseGain = c.createGain()
    this.noiseGain.gain.value = 0
    ns.connect(this.noiseFilter).connect(this.noiseGain).connect(this.postCfx)
    ns.start()
    // SPACE（残響に送る。フェーダーの後）
    this.spaceSend = c.createGain()
    this.spaceSend.gain.value = 0
    this.xf.connect(this.spaceSend).connect(spaceIn)
  }
  // 高さを変える処理・CRUSH をつなぐ（読み込めたら）
  attachWorklets(shifter: AudioWorkletNode, crusher: AudioWorkletNode) {
    this.input.disconnect()
    this.input.connect(shifter).connect(this.trim)
    this.shifter = shifter
    this.crushIn.disconnect()
    this.crushIn.connect(crusher).connect(this.postCfx)
    this.crusher = crusher
  }
  // 値が変わったときだけ、なめらかに変える
  private param(key: string, p: AudioParam, v: number, time = 0.03) {
    if (this.last[key] !== undefined && Math.abs(this.last[key] - v) < 1e-4) return
    this.last[key] = v
    p.setTargetAtTime(v, this.ctx.currentTime, time)
  }
  mix(d: DeckState, xf: number, send: number, cfxType: number, beatSec: number) {
    this.param('trim', this.trim.gain, d.trim <= 0.5 ? d.trim / 0.5 : 1 + (d.trim - 0.5) * 2)
    this.param('low', this.low.gain, eqDb(d.low))
    this.param('mid', this.mid.gain, eqDb(d.mid))
    this.param('hi', this.hi.gain, eqDb(d.hi))
    // CFX: つまみが真ん中で効果なし。左右に回すほど強く効く
    const f = d.cfx
    const amt = Math.min(1, Math.abs(f - 0.5) * 2.1)
    const isType = (k: number) => cfxType === k
    // FILTER: 左でローパス（こもる）、右でハイパス（低音を削る）
    this.param('lp', this.lp.frequency, isType(0) && f < 0.48 ? 180 * Math.pow(22000 / 180, f / 0.48) : 22000, 0.02)
    this.param('hp', this.hp.frequency, isType(0) && f > 0.52 ? 10 * Math.pow(5000 / 10, (f - 0.52) / 0.48) : 10, 0.02)
    // DUB ECHO
    this.param('dub', this.dubSend.gain, isType(1) ? amt * 0.9 : 0)
    this.param('dubTime', this.dubDelay.delayTime, Math.min(3.9, beatSec * 0.75), 0.05)
    // NOISE: 左で低めのノイズ、右で高めのノイズ
    this.param('noise', this.noiseGain.gain, isType(2) ? amt * 0.35 : 0)
    this.param('noiseF', this.noiseFilter.frequency, f < 0.5 ? 300 + (0.5 - f) * 1200 : 2000 + (f - 0.5) * 16000)
    // SPACE
    this.param('space', this.spaceSend.gain, isType(3) ? amt * 1.2 : 0)
    // CRUSH
    if (this.crusher) this.param('crush', this.crusher.parameters.get('amount')!, isType(4) ? amt : 0, 0.02)
    this.param('fader', this.fader.gain, d.fader * d.fader)
    this.param('xf', this.xf.gain, xf)
    this.param('send', this.send.gain, send, 0.01)
    // MASTER TEMPO / KEY SHIFT
    const ratio = pitchRatio(d)
    this.shifted = !!this.shifter && Math.abs(ratio - 1) > 1e-4
    if (this.shifter) this.param('ratio', this.shifter.parameters.get('ratio')!, ratio, 0.01)
  }
  // 高さを変えているときは音が少し遅れるので、その分だけ先を再生する（曲の秒。REVERSE 中は逆向き）
  private lead() {
    return this.shifted ? SHIFT_LATENCY * this.rate * this.dir : 0
  }
  private estPos() {
    let p = this.startPos + (this.ctx.currentTime - this.startCtx) * this.rate * this.dir
    const l = this.loop
    if (l && p > l.out) p = l.in + ((p - l.in) % (l.out - l.in))
    return p
  }
  stop() {
    if (!this.source) return
    try {
      this.source.stop()
    } catch {
      // すでに止まっている
    }
    this.source.disconnect()
    this.source = null
    this.epoch = ''
  }
  // ---- スクラッチ: 円盤を押さえた手の位置を追いかけて鳴らす（逆向きは逆再生の音を使う） ----
  private sc: { src: AudioBufferSourceNode | null; dir: number; pos: number; last: number; out: GainNode } | null = null
  private scratchTo(target: number, data: TrackData) {
    const c = this.ctx
    const t = c.currentTime
    if (!this.sc) {
      this.stop()
      const out = c.createGain()
      out.gain.value = 0
      out.connect(this.input)
      this.sc = { src: null, dir: 0, pos: target, last: t, out }
    }
    const sc = this.sc
    const dt = Math.min(0.1, Math.max(0.001, t - sc.last))
    sc.last = t
    // 手の位置へ約 40ms で追いつく速さ（-6〜6 倍速）。手が止まると音も止まる
    const v = Math.max(-6, Math.min(6, (target - sc.pos) / 0.04))
    sc.pos = Math.max(0, Math.min(data.duration - 0.01, sc.pos + v * dt))
    const dir = Math.abs(v) < 0.04 ? 0 : v > 0 ? 1 : -1
    if (dir !== sc.dir) {
      const old = sc.src
      if (old) {
        try {
          old.stop(t + 0.012)
        } catch {
          // すでに止まっている
        }
        setTimeout(() => old.disconnect(), 60)
      }
      sc.src = null
      if (dir !== 0) {
        const s = c.createBufferSource()
        if (dir < 0) data.reversed ??= reverseOf(c, data.buffer)
        s.buffer = dir < 0 ? data.reversed! : data.buffer
        s.playbackRate.value = Math.abs(v)
        s.connect(sc.out)
        s.start(0, dir < 0 ? data.duration - sc.pos : sc.pos)
        sc.src = s
      }
      sc.dir = dir
    } else if (sc.src) sc.src.playbackRate.setTargetAtTime(Math.max(0.01, Math.abs(v)), t, 0.008)
    sc.out.gain.setTargetAtTime(dir === 0 ? 0 : Math.min(1, Math.abs(v) * 2 + 0.3), t, 0.006)
  }
  private endScratch() {
    const sc = this.sc
    if (!sc) return
    this.sc = null
    sc.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01)
    const src = sc.src
    setTimeout(() => {
      try {
        src?.stop()
      } catch {
        // すでに止まっている
      }
      src?.disconnect()
      sc.out.disconnect()
    }, 80)
    // 通常の再生を始め直す
    this.epoch = ''
  }
  play(deck: DeckState, data: TrackData | undefined, now: number) {
    const d = liveDeck(deck, now)
    if (d.scratch && data && d.track !== null) return this.scratchTo(d.anchorPos, data)
    if (this.sc) this.endScratch()
    // VINYL BRAKE: 止めた瞬間からゆっくり遅くして止める（このブラウザで 1 回だけ）
    if (!d.playing && d.brake && this.source && this.braked !== d.brake && now - d.brake < 1500) {
      this.braked = d.brake
      const t = this.ctx.currentTime
      this.source.playbackRate.cancelScheduledValues(t)
      this.source.playbackRate.setValueAtTime(this.source.playbackRate.value, t)
      this.source.playbackRate.linearRampToValueAtTime(0.01, t + BRAKE_SECONDS)
      const s = this.source
      setTimeout(() => {
        if (this.source === s) this.stop()
      }, BRAKE_SECONDS * 1000)
      return
    }
    if (!d.playing && this.braked === d.brake && d.brake && now - d.brake < BRAKE_SECONDS * 1000 + 100) return
    if (!d.playing || !data || d.track === null) return this.stop()
    const pos = deckPos(d, now, data.duration)
    const dir = d.reverse ? -1 : 1
    if ((dir > 0 && pos >= data.duration - 0.01) || (dir < 0 && pos <= 0.01)) return this.stop()
    const l = !d.reverse && d.loop && d.loop.on && d.loop.out !== null ? { in: d.loop.in, out: d.loop.out } : null
    const epoch = `${d.track}|${d.anchorTime}|${d.anchorPos.toFixed(4)}|${l ? `${l.in}-${l.out}` : ''}|${this.shifted}|${dir}`
    if (this.source && epoch === this.epoch) {
      // テンポだけ変わったときは止めずに速さを変える
      if (Math.abs(d.rate - this.rate) > 1e-5) {
        this.startPos = this.estPos()
        this.startCtx = this.ctx.currentTime
        this.rate = d.rate
        this.source.playbackRate.setTargetAtTime(d.rate, this.ctx.currentTime, 0.015)
      }
      // ずれが大きくなったら合わせ直す
      if (Math.abs(this.estPos() - this.lead() - pos) < 0.06) return
    }
    this.stop()
    const s = this.ctx.createBufferSource()
    if (dir < 0) data.reversed ??= reverseOf(this.ctx, data.buffer)
    s.buffer = dir < 0 ? data.reversed! : data.buffer
    s.playbackRate.value = d.rate
    if (l) {
      s.loop = true
      s.loopStart = l.in
      s.loopEnd = l.out
    }
    s.connect(this.input)
    this.rate = d.rate
    this.dir = dir
    const start = Math.max(0.001, Math.min(data.duration - 0.01, pos + this.lead()))
    // 逆向きの音では、曲の位置 p は (長さ - p) にあたる
    s.start(0, dir < 0 ? data.duration - start : start)
    this.source = s
    this.epoch = epoch
    this.startCtx = this.ctx.currentTime
    this.startPos = start
    this.loop = l
  }
  level() {
    const a = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(a)
    let s = 0
    for (const v of a) s += v * v
    return Math.sqrt(s / a.length)
  }
}

export class DjEngine {
  readonly out: GainNode
  readonly decks: [DeckAudio, DeckAudio]
  private master: GainNode
  private masterBus: GainNode
  private masterInsert: InsertFx
  private masterSend: GainNode
  private fxIn: GainNode
  private fxOut: GainNode
  private echo: { delay: DelayNode; fb: GainNode }
  private ping: { l: DelayNode; r: DelayNode; fb: GainNode }
  private reverb: ConvolverNode
  private fxPaths: GainNode[]
  readonly masterAnalyser: AnalyserNode
  private tracks = new Map<string, TrackData>()
  private pending = new Set<string>()
  private failed = new Set<string>()
  private samples: AudioBuffer[] = []
  private lastSampler = -1
  // 高さを変える処理が使えるか（AudioWorklet を読み込めたか）
  keyLockReady = false
  constructor(
    readonly ctx: AudioContext,
    private baseUrl: string
  ) {
    const c = ctx
    this.out = c.createGain()
    this.out.gain.value = 0.8
    const limiter = c.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.15
    this.master = c.createGain()
    this.masterBus = c.createGain()
    this.masterInsert = new InsertFx(c)
    this.masterAnalyser = c.createAnalyser()
    this.masterAnalyser.fftSize = 1024
    this.masterBus.connect(this.masterInsert.input)
    this.masterInsert.output.connect(this.master).connect(limiter).connect(this.out)
    this.master.connect(this.masterAnalyser)
    // BEAT FX（センド・リターン）
    this.fxIn = c.createGain()
    this.fxOut = c.createGain()
    this.fxOut.gain.value = 0
    this.fxOut.connect(this.master)
    this.masterSend = c.createGain()
    this.masterSend.gain.value = 0
    this.masterBus.connect(this.masterSend).connect(this.fxIn)
    // ECHO
    const echoIn = c.createGain()
    const delay = c.createDelay(4)
    const fb = c.createGain()
    const tone = Object.assign(c.createBiquadFilter(), { type: 'lowpass' }) as BiquadFilterNode
    tone.frequency.value = 5000
    echoIn.connect(delay).connect(tone).connect(fb).connect(delay)
    tone.connect(this.fxOut)
    this.echo = { delay, fb }
    // PING PONG（左右に交互に返るこだま）
    const pingIn = c.createGain()
    const l = c.createDelay(4)
    const r = c.createDelay(4)
    const pfb = c.createGain()
    const merger = c.createChannelMerger(2)
    pingIn.connect(l).connect(r).connect(pfb).connect(l)
    l.connect(merger, 0, 0)
    r.connect(merger, 0, 1)
    merger.connect(this.fxOut)
    this.ping = { l, r, fb: pfb }
    // REVERB（作った残響のインパルス応答）。CFX の SPACE も同じ残響を使う
    const revIn = c.createGain()
    this.reverb = c.createConvolver()
    const len = Math.floor(c.sampleRate * 2.8)
    const ir = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    this.reverb.buffer = ir
    revIn.connect(this.reverb).connect(this.fxOut)
    const space = c.createConvolver()
    space.buffer = ir
    const spaceIn = c.createGain()
    spaceIn.connect(space).connect(this.masterBus)
    this.fxPaths = [echoIn, pingIn, revIn]
    this.fxPaths.forEach((p) => (p.gain.value = 0))
    this.fxPaths.forEach((p) => this.fxIn.connect(p))
    // CFX の NOISE 用のホワイトノイズ（2 秒）
    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const nd = noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
    this.decks = [new DeckAudio(c, this.masterBus, this.fxIn, spaceIn, noise), new DeckAudio(c, this.masterBus, this.fxIn, spaceIn, noise)]
    // MASTER TEMPO / KEY SHIFT・CRUSH 用の処理を読み込む（使えない環境では、テンポで高さも変わるまま・CRUSH なし）
    c.audioWorklet
      ?.addModule(`${baseUrl}pitch-shifter.js`)
      .then(() => {
        for (const d of this.decks)
          d.attachWorklets(
            new AudioWorkletNode(c, 'pitch-shifter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }),
            new AudioWorkletNode(c, 'crusher', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })
          )
        this.keyLockReady = true
      })
      .catch(() => {})
  }

  // 曲のデータ（内蔵の曲はその場で作るかファイルを読み込み、追加した曲は共有ファイルを読み込む）。重いのでフレームの合間に 1 曲ずつ
  track(i: number | null): TrackData | undefined {
    if (i === null) return undefined
    const meta = TRACKS[i]
    if (!meta) return undefined
    const url = meta.url ?? (meta.file ? `${this.baseUrl}${meta.file}` : undefined)
    const key = url ?? `builtin:${i}`
    const t = this.tracks.get(key)
    if (t || this.pending.has(key) || this.failed.has(key)) return t
    this.pending.add(key)
    const finish = (buffer: AudioBuffer) => {
      this.tracks.set(key, { buffer, duration: buffer.duration, ...peaksOf(buffer) })
      // 曲の長さを一覧にも入れる（最後まで再生したデッキを止まったものとして扱うため）
      meta.duration = buffer.duration
      this.pending.delete(key)
    }
    if (url) {
      // ワールドのファイルとインスタンスの共有ファイルは three.js の FileLoader で読む
      new FileLoader()
        .setResponseType('arraybuffer')
        .loadAsync(url)
        .then((ab) => this.ctx.decodeAudioData(ab as ArrayBuffer))
        .then(finish)
        .catch(() => {
          this.pending.delete(key)
          this.failed.add(key)
        })
    } else
      setTimeout(() => {
        const r = renderTrack(meta.def!)
        const buffer = this.ctx.createBuffer(2, r.left.length, SAMPLE_RATE)
        buffer.copyToChannel(r.left as Float32Array<ArrayBuffer>, 0)
        buffer.copyToChannel(r.right as Float32Array<ArrayBuffer>, 1)
        finish(buffer)
      }, 0)
    return undefined
  }
  // 読み込みに失敗した曲か
  isFailed(i: number | null) {
    const meta = i === null ? undefined : TRACKS[i]
    const url = meta?.url ?? (meta?.file ? `${this.baseUrl}${meta.file}` : undefined)
    return !!url && this.failed.has(url)
  }
  // 手元のファイルを調べる（BPM と 1 拍目、キー）
  async analyze(file: File) {
    const buffer = await this.ctx.decodeAudioData(await file.arrayBuffer())
    return { ...detectBeat(buffer), key: detectKey(buffer), duration: buffer.duration }
  }

  // 共有の状態に合わせて音を更新する（毎フレーム）
  apply(m: MixState, now: number) {
    // クロスフェーダー: 左（0）でデッキ 1 だけ、右（1）でデッキ 2 だけ。真ん中で両方とも等しい大きさ
    const x = m.xfader
    const xf = [Math.cos((x * Math.PI) / 2) * Math.SQRT2, Math.sin((x * Math.PI) / 2) * Math.SQRT2].map((v) => Math.min(1, v))
    const fx = m.fx
    const sendFx = fx.on && fx.type < 3
    const fxDeck = sendFx && fx.ch < 2 ? fx.ch : -1
    m.decks.forEach((d, i) => {
      const a = this.decks[i]
      a.mix(d, xf[i], fxDeck === i ? 1 : 0, m.cfxType ?? 0, 60 / (effectiveBpm(d) || 120))
      a.play(d, this.track(d.track), now)
    })
    this.master.gain.setTargetAtTime(m.master * m.master * 1.2, this.ctx.currentTime, 0.03)
    this.masterSend.gain.setTargetAtTime(sendFx && fx.ch === 2 ? 1 : 0, this.ctx.currentTime, 0.01)
    // BEAT FX: 選んだチャンネルの BPM に合わせた拍の長さ
    const src = fx.ch === 2 ? m.decks[masterDeck(m)] : m.decks[fx.ch]
    const bpm = effectiveBpm(src) || 170
    const beats = FX_BEATS[fx.beat] ?? 1
    const beat = (60 / bpm) * beats
    const t = this.ctx.currentTime
    this.echo.delay.delayTime.setTargetAtTime(Math.min(3.9, beat), t, 0.05)
    this.echo.fb.gain.setTargetAtTime(0.25 + fx.level * 0.5, t, 0.05)
    this.ping.l.delayTime.setTargetAtTime(Math.min(3.9, beat), t, 0.05)
    this.ping.r.delayTime.setTargetAtTime(Math.min(3.9, beat), t, 0.05)
    this.ping.fb.gain.setTargetAtTime(0.2 + fx.level * 0.5, t, 0.05)
    this.fxPaths.forEach((p, k) => p.gain.setTargetAtTime(sendFx && k === fx.type ? 1 : 0, t, 0.02))
    this.fxOut.gain.setTargetAtTime(sendFx ? 0.3 + fx.level * 0.9 : 0, t, 0.02)
    // 差し込みの BEAT FX: TRANS は拍の位置で開け閉めする（拍の前半で鳴らし、後半で切る）
    const srcPos = src.track === null ? 0 : deckPos(src, now)
    const gateOpen = ((beatsAt(src, srcPos) / beats) % 1 + 1) % 1 < 0.5
    const insertOn = fx.on && fx.type >= 3
    this.decks.forEach((d, i) => d.insert.set(insertOn && fx.ch === i, fx.type, fx.level, beat, gateOpen))
    this.masterInsert.set(insertOn && fx.ch === 2, fx.type, fx.level, beat, gateOpen)
    // サンプラー（押されてから 1.5 秒以内の分だけ鳴らす。入室したときに古い音が鳴らないように）
    if (m.sampler.n !== this.lastSampler) {
      if (this.lastSampler !== -1 && now - m.sampler.t < 1500) this.playSample(m.sampler.k)
      this.lastSampler = m.sampler.n
    }
  }
  private playSample(k: number) {
    if (!this.samples[k]) {
      const data = renderSample(k)
      const b = this.ctx.createBuffer(1, data.length, SAMPLE_RATE)
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
      this.samples[k] = b
    }
    const s = this.ctx.createBufferSource()
    s.buffer = this.samples[k]
    const g = this.ctx.createGain()
    g.gain.value = 0.7
    s.connect(g).connect(this.masterBus)
    s.start()
  }
  // マスターの低音の強さ（照明を拍に合わせて光らせる）
  bass() {
    const a = new Uint8Array(this.masterAnalyser.frequencyBinCount)
    this.masterAnalyser.getByteFrequencyData(a)
    let s = 0
    for (let i = 1; i < 6; i++) s += a[i]
    return s / (5 * 255)
  }
  dispose() {
    this.decks.forEach((d) => d.stop())
    this.out.disconnect()
  }
}
