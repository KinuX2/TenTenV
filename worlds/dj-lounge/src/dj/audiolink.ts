import { Color, DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three'
import type { DjEngine } from './engine'
import { beatsAt, deckPos, effectiveBpm, liveDeck, masterDeck, type MixState } from './state'
import { TRACKS } from './tracks'

// 照明・映像のために共有する音の情報。
// マスターの音を 4 つの帯域（低音・中低音・中高音・高音）に分けて、強さと過去の変化（履歴）を持つ。
// 拍の位置は音から推定せず、DJ のマスターデッキの BPM と 1 拍目から求める（全員で同じ拍になる）。
// 照明・LED は毎フレームここを読む。値は各自の手元で計算する（同期はしない）
export const HISTORY = 128
// テクスチャの行: 0〜3 = 帯域ごとの履歴（x = 0 が最新）、4 = スペクトル、5 = 波形
const ROWS = 8

// テーマカラー: ライムグリーンとオフホワイト（黒の上に映える 2 色）。16 拍ごとに主と副を入れ替える
export const THEME = { lime: '#c4f01e', white: '#efeae6' }
const PALETTES: [string, string][] = [
  [THEME.lime, THEME.white],
  [THEME.white, THEME.lime],
]

// 帯域の範囲（Hz）
const BANDS: [number, number][] = [
  [30, 140],
  [140, 500],
  [500, 2500],
  [2500, 10000],
]

class AudioLinkState {
  // 0〜1。音量の大小に合わせて自動で振れ幅を調整した値
  bands = [0, 0, 0, 0]
  // 拍の中の位置（0〜1）と、曲の頭からの拍の数
  beat = 0
  beatCount = 0
  bpm = 0
  playing = false
  // 低音の拍で 1 になり、すぐ減る
  hit = 0
  // 帯域の強さで進む時計（音が大きいほど速く進む）
  chrono = [0, 0, 0, 0]
  // 全体の盛り上がり（ゆっくり変わる）
  energy = 0
  // 音の大きさ（実効値）と、ふだんの大きさとの比（1 前後。ブレイクでは小さくなる）
  level = 0
  loud = 0
  private ref = 0.2
  colA = new Color(PALETTES[0][0])
  colB = new Color(PALETTES[0][1])
  palette = 0
  title = ''
  // フラッシュを弱める（各自の設定。ワールドを出ると元に戻る）
  calm = false
  readonly texture: DataTexture
  private data: Uint8Array
  private peak = [0.2, 0.2, 0.2, 0.2]
  private freq = new Uint8Array(0)
  private wave = new Uint8Array(0)
  private lastBeat = -1
  private target = [new Color(PALETTES[0][0]), new Color(PALETTES[0][1])]
  constructor() {
    this.data = new Uint8Array(HISTORY * ROWS * 4)
    this.texture = new DataTexture(this.data, HISTORY, ROWS, RGBAFormat, UnsignedByteType)
    this.texture.magFilter = LinearFilter
    this.texture.minFilter = LinearFilter
    this.texture.needsUpdate = true
  }
  // ワールドの中では保存できないので、入っている間だけ有効
  setCalm(v: boolean) {
    this.calm = v
  }
  private put(row: number, x: number, v: number) {
    const i = (row * HISTORY + x) * 4
    const b = Math.max(0, Math.min(255, v * 255))
    this.data[i] = this.data[i + 1] = this.data[i + 2] = b
    this.data[i + 3] = 255
  }
  update(engine: DjEngine, m: MixState, now: number, dt: number) {
    const an = engine.masterAnalyser
    if (this.freq.length !== an.frequencyBinCount) {
      this.freq = new Uint8Array(an.frequencyBinCount)
      this.wave = new Uint8Array(an.fftSize)
    }
    an.getByteFrequencyData(this.freq)
    an.getByteTimeDomainData(this.wave)
    const hz = an.context.sampleRate / an.fftSize
    // 帯域の強さ
    BANDS.forEach(([lo, hi], k) => {
      const a = Math.max(1, Math.round(lo / hz))
      const b = Math.max(a + 1, Math.round(hi / hz))
      let s = 0
      for (let i = a; i < b; i++) s += this.freq[i]
      const v = s / ((b - a) * 255)
      // 自動の振れ幅: いちばん大きかった値をゆっくり下げながら覚えておく
      this.peak[k] = Math.max(v, this.peak[k] * Math.pow(0.85, dt), 0.12)
      const n = Math.min(1, Math.pow(v / this.peak[k], 1.6))
      // 上がるときは速く、下がるときはゆっくり
      this.bands[k] += (n - this.bands[k]) * (n > this.bands[k] ? 0.7 : Math.min(1, dt * 9))
      this.chrono[k] += dt * (0.2 + this.bands[k] * 2)
    })
    this.energy += ((this.bands[0] + this.bands[1] + this.bands[2] + this.bands[3]) / 4 - this.energy) * Math.min(1, dt * 0.8)
    // 音の大きさ。ふだんの大きさ（ref）は大きい音ですぐ上がり、ゆっくり下がる
    let sq = 0
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128
      sq += v * v
    }
    const rms = Math.sqrt(sq / Math.max(1, this.wave.length))
    this.level += (rms - this.level) * Math.min(1, dt * 4)
    // 一瞬の大きな音（エフェクトなど）で基準が跳ね上がらないよう、上がるのもゆっくり
    if (this.level > this.ref) this.ref += (this.level - this.ref) * Math.min(1, dt * 0.25)
    else this.ref = Math.max(0.05, this.ref * Math.pow(0.99, dt))
    this.loud = this.level / this.ref
    // 履歴を 1 つずらして、最新の値を x = 0 に入れる
    for (let k = 0; k < 4; k++) {
      const row = k * HISTORY * 4
      this.data.copyWithin(row + 4, row, row + (HISTORY - 1) * 4)
      this.put(k, 0, this.bands[k])
    }
    // スペクトル（低い音ほど細かく見えるよう、対数の間隔で 128 本）
    const nb = this.freq.length
    for (let x = 0; x < HISTORY; x++) {
      const f = 40 * Math.pow(12000 / 40, x / (HISTORY - 1))
      const i = Math.min(nb - 1, Math.round(f / hz))
      this.put(4, x, Math.pow(this.freq[i] / 255, 1.3))
    }
    // 波形
    for (let x = 0; x < HISTORY; x++) this.put(5, x, this.wave[Math.floor((x / HISTORY) * this.wave.length)] / 255)
    this.texture.needsUpdate = true
    // 拍（マスターデッキから）
    const i = masterDeck(m)
    const d = liveDeck(m.decks[i], now)
    this.playing = d.playing && d.track !== null
    if (this.playing) {
      const beats = beatsAt(d, deckPos(d, now))
      this.beat = ((beats % 1) + 1) % 1
      this.beatCount = Math.floor(beats)
      this.bpm = effectiveBpm(d)
      this.title = d.track !== null ? (TRACKS[d.track]?.title ?? '') : ''
    } else {
      // 止まっているときはゆっくりの拍で動かす（照明が止まらないように）
      // 映像の計算の精度が落ちないよう、小さい数に収める
      const beats = ((now / 1000) % 3600) / 0.8
      this.beat = beats % 1
      this.beatCount = Math.floor(beats)
      this.bpm = 0
    }
    if (this.beatCount !== this.lastBeat) {
      this.lastBeat = this.beatCount
      if (this.playing && this.bands[0] > 0.35) this.hit = 1
      const p = Math.floor(this.beatCount / 16)
      const pi = ((p % PALETTES.length) + PALETTES.length) % PALETTES.length
      if (pi !== this.palette) {
        this.palette = pi
        this.target[0].set(PALETTES[pi][0])
        this.target[1].set(PALETTES[pi][1])
      }
    }
    this.hit = Math.max(0, this.hit - dt * 5)
    this.colA.lerp(this.target[0], Math.min(1, dt * 3))
    this.colB.lerp(this.target[1], Math.min(1, dt * 3))
  }
  // 16 拍のまとまりの番号と、その中の位置（0〜15）
  get phrase() {
    return Math.floor(this.beatCount / 16)
  }
  get inPhrase() {
    return ((this.beatCount % 16) + 16) % 16
  }
  // ブレイク（曲は流れているが、キックが抜けて静かな所）
  get brk() {
    return this.playing && this.loud < 0.58
  }
  // 曲が盛り上がっているか（全体の強さと低音が大きい）
  get drop() {
    return this.playing && this.loud > 0.8 && this.energy > 0.35
  }
}

export const AL = new AudioLinkState()
