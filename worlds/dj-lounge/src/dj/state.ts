import { camelot, keySyncShift, shiftKey, type Key } from './key'
import { TRACKS } from './tracks'

// みんなで共有する DJ の状態（useInstanceState で同期）。音は各自のブラウザが同じ状態から作る。
// 再生位置は「anchorTime（サーバー時刻 ms）の時点で anchorPos 秒、そこから rate 倍で進む（REVERSE 中は戻る）」で表す
export type PadMode = 'hotcue' | 'beatloop' | 'beatjump' | 'sampler' | 'roll' | 'keyboard' | 'keyshift'

export interface DeckState {
  track: number | null
  playing: boolean
  anchorPos: number
  anchorTime: number
  // テンポスライダー（-1..1。奥が -、手前が + で速くなる。DDJ と同じ向き）と、それで決まる再生速度
  tempo: number
  rate: number
  // テンポスライダーの幅（TEMPO_RANGES の番号）
  range: number
  cue: number
  hot: (number | null)[]
  loop: { in: number; out: number | null; on: boolean } | null
  // ROLL 中のループの長さ（拍）。ROLL を止めると、止めなかったときの位置に戻る
  roll: number | null
  padMode: PadMode
  // BEAT SYNC 中か（もう一方のデッキに BPM と拍を合わせ続ける）
  synced: boolean
  // MASTER TEMPO（キーロック）: テンポを変えても高さを変えない
  keyLock: boolean
  // KEY SHIFT / KEY SYNC / KEYBOARD で変えた高さ（半音）
  keyShift: number
  reverse: boolean
  // スクラッチ中（ジョグの円盤を押さえている）。位置は anchorPos（止まっている扱い）。scratchPlay は離したら再生に戻るか
  scratch: boolean
  scratchPlay: boolean
  // SLIP: ループ・REVERSE などの間も裏で曲を進めておき、終わったらそこへ戻る
  slip: boolean
  slipShadow: { pos: number; time: number } | null
  // VINYL BRAKE を始めたサーバー時刻（ms）。0 はなし
  brake: number
  // ビートグリッドのずらし（秒）
  grid: number
  trim: number
  hi: number
  mid: number
  low: number
  cfx: number
  fader: number
}

export interface MixState {
  decks: [DeckState, DeckState]
  xfader: number
  master: number
  // ブラウザで選んでいる行（並べ替えた一覧の中の番号）と並べ方
  browse: number
  sort: 0 | 1 | 2
  quantize: boolean
  cfxType: number
  fx: { type: number; beat: number; ch: 0 | 1 | 2; on: boolean; level: number }
  // サンプラー: 押されるたびに n が増える（全員がその音を鳴らす）
  sampler: { n: number; k: number; t: number }
  // AUTOMIX を動かしている人（その人のブラウザが操作する）
  automix: string | null
}

export const TEMPO_RANGES = [0.06, 0.1, 0.16, 0.5] as const
// BEAT SYNC で合わせられる速さの範囲（元の速さの 0.5〜1.5 倍）。離れていれば半分・倍のテンポで合わせる
export const SYNC_RATE_MIN = 0.5
export const SYNC_RATE_MAX = 1.5
export const FX_TYPES = ['ECHO', 'PING PONG', 'REVERB', 'TRANS', 'FLANGER', 'PHASER', 'FILTER'] as const
export const FX_BEATS = [0.25, 0.5, 0.75, 1, 2, 4, 8] as const
export const CFX_TYPES = ['FILTER', 'DUB ECHO', 'NOISE', 'SPACE', 'CRUSH'] as const
export const SORTS = ['ALL', 'BPM', 'KEY'] as const
export const BEAT_LOOPS = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const
export const ROLLS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8] as const
export const BEAT_JUMPS = [-1, 1, -2, 2, -4, 4, -8, 8] as const
// KEYBOARD: ホットキュー A をこの高さ（半音）で鳴らす。KEY SHIFT: この高さにする
export const KEYBOARD_SEMIS = [0, 2, 4, 5, 7, 9, 11, 12] as const
export const KEYSHIFT_SEMIS = [1, 2, 3, 4, -1, -2, -3, -4] as const

const deck = (track: number): DeckState => ({
  track,
  playing: false,
  anchorPos: 0,
  anchorTime: 0,
  tempo: 0,
  rate: 1,
  range: 1,
  cue: TRACKS[track]?.firstBeat ?? 0,
  hot: Array(8).fill(null),
  loop: null,
  roll: null,
  padMode: 'hotcue',
  synced: false,
  keyLock: false,
  keyShift: 0,
  reverse: false,
  scratch: false,
  scratchPlay: false,
  slip: false,
  slipShadow: null,
  brake: 0,
  grid: 0,
  trim: 0.5,
  hi: 0.5,
  mid: 0.5,
  low: 0.5,
  cfx: 0.5,
  fader: 0.8,
})

export const initialMix = (): MixState => ({
  decks: [deck(0), deck(1)],
  xfader: 0.5,
  master: 0.7,
  browse: 2,
  sort: 0,
  quantize: true,
  cfxType: 0,
  fx: { type: 0, beat: 3, ch: 2, on: false, level: 0.5 },
  sampler: { n: 0, k: 0, t: 0 },
  automix: null,
})

export const bpmOf = (d: DeckState) => (d.track === null ? 0 : (TRACKS[d.track]?.bpm ?? 0))
// 1 拍目の位置（秒）。曲の値に、ビートグリッドのずらしを足す
export const firstBeatOf = (d: DeckState) => (d.track === null ? 0 : (TRACKS[d.track]?.firstBeat ?? 0)) + (d.grid ?? 0)
export const effectiveBpm = (d: DeckState) => bpmOf(d) * d.rate
export const tempoRange = (d: DeckState) => TEMPO_RANGES[d.range ?? 1] ?? 0.1

// その時刻の再生位置（秒）。ループ中はループの中で折り返す（REVERSE 中は戻り、ループはしない）
export const deckPos = (deck: DeckState, now: number, duration = Infinity) => {
  const d = liveDeck(deck, now)
  const dir = d.reverse ? -1 : 1
  let p = d.playing ? d.anchorPos + dir * ((now - d.anchorTime) / 1000) * d.rate : d.anchorPos
  const l = d.loop
  if (!d.reverse && l && l.on && l.out !== null && l.out > l.in && p > l.out) p = l.in + ((p - l.in) % (l.out - l.in))
  return Math.max(0, Math.min(p, duration))
}
// スクラッチの状態は、押さえている間ずっと（毎フレーム）位置と時刻が更新される。
// 1.5 秒以上更新がないものは、離し忘れ（通信の順番の入れ替わりなど）とみなして、離したものとして扱う
export const SCRATCH_STALE_MS = 1500
// 最後まで再生したデッキ（共有の状態は残り続けるので、前に来た人が流した曲が終わったままのことがある）は、
// 曲の終わりで止まったものとして扱う
export const liveDeck = (deck: DeckState, now: number): DeckState => {
  let d = deck.scratch && now - deck.anchorTime > SCRATCH_STALE_MS ? { ...deck, scratch: false, playing: deck.scratchPlay, anchorTime: deck.anchorTime + SCRATCH_STALE_MS } : deck
  const dur = d.track === null ? undefined : TRACKS[d.track]?.duration
  if (dur && d.playing && !d.scratch) {
    const looping = !d.reverse && d.loop && d.loop.on && d.loop.out !== null && d.loop.out > d.loop.in
    const p = d.anchorPos + (d.reverse ? -1 : 1) * ((now - d.anchorTime) / 1000) * d.rate
    if (!looping && (p >= dur || p <= 0)) d = { ...d, playing: false, anchorPos: p >= dur ? dur : 0, anchorTime: now }
  }
  return d
}
// SLIP 中に裏で進んでいる位置
export const shadowPos = (d: DeckState, now: number) => {
  const s = d.slipShadow
  if (!s) return null
  return d.playing ? s.pos + ((now - s.time) / 1000) * d.rate : s.pos
}

// いま聞こえているキー（キーロックしていなければ、テンポで変わった分も入れる）。高さの倍率も返す
export const pitchRatio = (d: DeckState) => Math.pow(2, d.keyShift / 12) * (d.keyLock ? 1 / d.rate : 1)
export const effectiveKey = (d: DeckState): Key | null => {
  const k = d.track === null ? null : (TRACKS[d.track]?.key ?? null)
  if (!k) return null
  const tempoSemis = d.keyLock ? 0 : 12 * Math.log2(d.rate)
  return shiftKey(k, d.keyShift + tempoSemis)
}

export const beatLen = (d: DeckState) => 60 / (bpmOf(d) || 120)
// 曲の中の拍の位置（1 拍目 = 0）
export const beatsAt = (d: DeckState, p: number) => (p - firstBeatOf(d)) / beatLen(d)
const frac = (x: number) => ((x % 1) + 1) % 1
// 拍の頭にそろえる
const snap = (d: DeckState, p: number) => firstBeatOf(d) + Math.round(beatsAt(d, p)) * beatLen(d)
const snapDown = (d: DeckState, p: number) => firstBeatOf(d) + Math.floor(beatsAt(d, p) + 1e-6) * beatLen(d)

// 位置を動かす（再生中なら、いまの時刻からその位置で進む）
const moveTo = (d: DeckState, p: number, now: number): DeckState => ({ ...d, anchorPos: Math.max(0, p), anchorTime: now })

// ---------- SLIP ----------
// SLIP の始まり: いまの位置を裏の位置として覚える（ROLL は SLIP が切れていても必ず戻る）
const slipStart = (d: DeckState, now: number, force = false): DeckState => (d.slipShadow || !(d.slip || force) ? d : { ...d, slipShadow: { pos: deckPos(d, now), time: now } })
// SLIP の終わり: 裏で進んでいた位置へ戻る
const slipEnd = (d: DeckState, now: number): DeckState => {
  const p = shadowPos(d, now)
  if (p === null) return d
  return { ...d, slipShadow: null, anchorPos: p, anchorTime: now }
}

// ---------- BEAT SYNC の計算 ----------
// デッキ i を、もう一方（MASTER）の BPM と拍の位置に合わせる。
// 速さの比が 0.5〜1.5 倍に入らないとき（例: 95 と 205）や、半分・倍のほうがずっと近いときは、半分・倍のテンポで合わせる
const resync = (m: MixState, i: 0 | 1, now: number, phase = true): MixState => {
  const d = m.decks[i]
  const o = m.decks[i === 0 ? 1 : 0]
  if (d.track === null || o.track === null || !bpmOf(d) || !bpmOf(o)) return m
  const target = effectiveBpm(o)
  let mult = 1
  let best = Infinity
  for (const k of [0.5, 1, 2]) {
    const r = (target * k) / bpmOf(d)
    // 同じテンポで合わせられるときはそれを優先する（半分・倍は範囲外のときだけ）
    const dist = Math.abs(Math.log(r)) + (k === 1 ? 0 : 0.25)
    if (r >= SYNC_RATE_MIN && r <= SYNC_RATE_MAX && dist < best) {
      best = dist
      mult = k
    }
  }
  if (best === Infinity) return withDeck(m, i, { ...d, synced: false })
  const rate = (target * mult) / bpmOf(d)
  const tempo = Math.max(-1, Math.min(1, (rate - 1) / tempoRange(d)))
  const p = deckPos(d, now)
  let anchorPos = p
  // 拍の位置: MASTER の拍数 × 倍率 の小数部分に、自分の拍の小数部分をそろえる
  if (phase && o.playing) {
    let diff = frac(beatsAt(o, deckPos(o, now)) * mult) - frac(beatsAt(d, p))
    if (diff > 0.5) diff -= 1
    if (diff < -0.5) diff += 1
    anchorPos = p + diff * beatLen(d)
  }
  // テンポのスライダーの範囲を超えて合わせたときは、高さが大きく変わらないよう MASTER TEMPO を入れる
  const keyLock = d.keyLock || Math.abs(rate - 1) > 0.1 + 1e-6
  return withDeck(m, i, { ...d, rate, tempo, anchorPos, anchorTime: now, keyLock })
}

// ---------- ブラウザ（曲の一覧の並べ方） ----------
// いま大きく聞こえているほうのデッキ（MASTER）
export const masterDeck = (m: MixState): 0 | 1 => {
  if (m.decks[1].synced && !m.decks[0].synced) return 0
  if (m.decks[0].synced && !m.decks[1].synced) return 1
  const g = (i: 0 | 1) => m.decks[i].fader * (i === 0 ? 1 - m.xfader : m.xfader) * (m.decks[i].playing ? 1 : 0)
  return g(0) >= g(1) ? 0 : 1
}
// 混ぜやすいキーか（Camelot で同じ数字、または同じ文字で ±1）
const compatible = (a: Key, b: Key) => {
  const ca = camelot(a)
  const cb = camelot(b)
  const na = parseInt(ca, 10)
  const nb = parseInt(cb, 10)
  if (na === nb) return true
  const d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12)
  return d === 1 && ca.slice(-1) === cb.slice(-1)
}
// BPM の近さ（半分・倍も見る）
const bpmDistance = (a: number, b: number) => Math.min(...[0.5, 1, 2].map((k) => Math.abs(Math.log((a * k) / b))))
export const browseList = (m: MixState): number[] => {
  const all = TRACKS.map((_, k) => k)
  const md = m.decks[masterDeck(m)]
  const bpm = effectiveBpm(md)
  if (m.sort === 0 || md.track === null || !bpm) return all
  const byBpm = (a: number, b: number) => bpmDistance(TRACKS[a].bpm, bpm) - bpmDistance(TRACKS[b].bpm, bpm)
  if (m.sort === 1) return all.sort(byBpm)
  const key = effectiveKey(md)
  if (!key) return all.sort(byBpm)
  const ok = all.filter((k) => TRACKS[k].key && compatible(TRACKS[k].key!, key)).sort(byBpm)
  const rest = all.filter((k) => !ok.includes(k)).sort(byBpm)
  return [...ok, ...rest]
}
export const isCompatible = (m: MixState, k: number) => {
  const key = effectiveKey(m.decks[masterDeck(m)])
  return !!key && !!TRACKS[k]?.key && compatible(TRACKS[k].key!, key)
}

// ---------- 操作（新しい状態を返す） ----------
type Op = (m: MixState, i: 0 | 1, now: number) => MixState
const withDeck = (m: MixState, i: 0 | 1, d: DeckState): MixState => {
  const decks = [...m.decks] as [DeckState, DeckState]
  decks[i] = d
  return { ...m, decks }
}

export const ops = {
  play: ((m, i, now) => {
    const d = liveDeck(m.decks[i], now)
    if (d.track === null) return m
    let p = deckPos(d, now)
    // 曲の終わりで止まっているときは、CUE（CUE も終わりなら曲の頭）から再生する
    const dur = TRACKS[d.track]?.duration
    if (!d.playing && dur && p >= dur - 0.3) p = d.cue < dur - 0.3 ? d.cue : (TRACKS[d.track]?.firstBeat ?? 0)
    const next = withDeck(m, i, { ...d, scratch: false, playing: !d.playing, anchorPos: p, anchorTime: now, brake: 0 })
    // 同期中のデッキを再生し始めたら、拍の位置を MASTER にそろえる
    return !d.playing && d.synced ? resync(next, i, now) : next
  }) as Op,
  // SHIFT + PLAY: ゆっくり止まる（ターンテーブルの電源を切ったように）
  brake: ((m, i, now) => {
    const d = m.decks[i]
    if (!d.playing || d.scratch) return ops.play(m, i, now)
    return withDeck(m, i, { ...d, playing: false, anchorPos: deckPos(d, now), anchorTime: now, brake: now })
  }) as Op,
  // CUE: 再生中ならキューの位置に戻って止める。止まっているときは、いまの位置をキューにする（QUANTIZE 中は拍にそろえる）
  cue: ((m, i, now) => {
    const d = m.decks[i]
    if (d.playing || d.scratch) return withDeck(m, i, { ...d, scratch: false, playing: false, anchorPos: d.cue, anchorTime: now, slipShadow: null })
    const p = deckPos(d, now)
    return withDeck(m, i, { ...d, cue: m.quantize ? snap(d, p) : p })
  }) as Op,
  // SHIFT + CUE: 曲の頭へ
  toStart: ((m, i, now) => withDeck(m, i, { ...moveTo(m.decks[i], 0, now) })) as Op,
  // ジョグ: 再生中は少しだけ前後にずらす（拍合わせ）、止まっているときは 1/4 拍ずつ動かす
  jog: (dir: number): Op => (m, i, now) => {
    const d = m.decks[i]
    const p = deckPos(d, now)
    return withDeck(m, i, moveTo(d, p + dir * (d.playing ? 0.012 : beatLen(d) / 4), now))
  },
  // スクラッチ: 円盤を押さえると止まり（位置は手で動かす）、離すと元が再生中なら再生に戻る
  scratchStart: ((m, i, now) => {
    const d = m.decks[i]
    if (d.scratch || d.track === null) return m
    return withDeck(m, i, { ...d, scratch: true, scratchPlay: d.playing, playing: false, anchorPos: deckPos(d, now), anchorTime: now, brake: 0, reverse: false })
  }) as Op,
  scratchMove: (pos: number): Op => (m, i, now) => {
    const d = m.decks[i]
    if (!d.scratch) return m
    return withDeck(m, i, { ...d, anchorPos: Math.max(0, pos), anchorTime: now })
  },
  scratchEnd: ((m, i, now) => {
    const d = m.decks[i]
    if (!d.scratch) return m
    return withDeck(m, i, { ...d, scratch: false, playing: d.scratchPlay, anchorPos: d.anchorPos, anchorTime: now })
  }) as Op,
  // SHIFT + ジョグ: ビートグリッドを 5ms ずつずらす
  grid: (dir: number): Op => (m, i) => withDeck(m, i, { ...m.decks[i], grid: Math.round(((m.decks[i].grid ?? 0) + dir * 0.005) * 1000) / 1000 }),
  // テンポスライダー: 同期中のデッキで動かすと同期を外す。MASTER 側で動かすと、同期中のデッキもついてくる
  tempo: (v: number): Op => (m, i, now) => {
    const d = m.decks[i]
    const p = deckPos(d, now)
    const next = withDeck(m, i, { ...d, synced: false, tempo: v, rate: 1 + v * tempoRange(d), anchorPos: p, anchorTime: now })
    const j = i === 0 ? 1 : 0
    return next.decks[j].synced ? resync(next, j, now) : next
  },
  // SHIFT + MASTER TEMPO: テンポスライダーの幅を切り替える（±6 → ±10 → ±16 → WIDE ±50%）
  tempoRange: ((m, i) => {
    const d = m.decks[i]
    const range = ((d.range ?? 1) + 1) % TEMPO_RANGES.length
    const r = TEMPO_RANGES[range]
    const rate = Math.max(1 - r, Math.min(1 + r, d.rate))
    return withDeck(m, i, { ...d, range, rate, tempo: (rate - 1) / r })
  }) as Op,
  // SHIFT + BEAT SYNC: テンポを元に戻す
  tempoReset: ((m, i, now) => {
    const d = m.decks[i]
    return withDeck(m, i, { ...d, synced: false, tempo: 0, rate: 1, anchorPos: deckPos(d, now), anchorTime: now })
  }) as Op,
  // BEAT SYNC: 押すと同期（もう一方を MASTER にして、BPM と拍の位置を合わせ続ける）、もう一度押すと解除
  sync: ((m, i, now) => {
    const d = m.decks[i]
    if (d.synced) return withDeck(m, i, { ...d, synced: false })
    const j = i === 0 ? 1 : 0
    // 相手が同期中なら相手の同期を外して、相手を MASTER にする
    const m2 = m.decks[j].synced ? withDeck(m, j, { ...m.decks[j], synced: false }) : m
    return resync(withDeck(m2, i, { ...d, synced: true }), i, now)
  }) as Op,
  loopIn: ((m, i, now) => {
    const d = m.decks[i]
    const p = deckPos(d, now)
    return withDeck(m, i, { ...d, loop: { in: m.quantize ? snap(d, p) : p, out: null, on: false } })
  }) as Op,
  loopOut: ((m, i, now) => {
    const d = m.decks[i]
    if (!d.loop) return m
    const p = deckPos(d, now)
    const out = m.quantize ? snap(d, p) : p
    if (out <= d.loop.in) return m
    return withDeck(m, i, { ...slipStart(d, now), loop: { in: d.loop.in, out, on: true }, anchorPos: p, anchorTime: now })
  }) as Op,
  // RELOOP/EXIT: ループを抜ける／もう一度入る（入るときはループの頭へ）。SLIP 中は抜けたときに裏の位置へ戻る
  reloop: ((m, i, now) => {
    const d = m.decks[i]
    if (!d.loop || d.loop.out === null) return m
    const p = deckPos(d, now)
    if (d.loop.on) return withDeck(m, i, slipEnd({ ...d, loop: { ...d.loop, on: false }, roll: null, anchorPos: p, anchorTime: now }, now))
    return withDeck(m, i, { ...slipStart(d, now), loop: { ...d.loop, on: true }, anchorPos: p >= d.loop.out || p < d.loop.in ? d.loop.in : p, anchorTime: now })
  }) as Op,
  // 4 BEAT LOOP / パッドの BEAT LOOP: いまの拍から n 拍のループ（同じ長さで入っていれば抜ける）
  beatLoop: (beats: number): Op => (m, i, now) => {
    const d = m.decks[i]
    const p = deckPos(d, now)
    const len = beats * beatLen(d)
    if (d.loop?.on && d.loop.out !== null && Math.abs(d.loop.out - d.loop.in - len) < 1e-3)
      return withDeck(m, i, slipEnd({ ...d, loop: { ...d.loop, on: false }, anchorPos: p, anchorTime: now }, now))
    const inP = snapDown(d, p)
    return withDeck(m, i, { ...slipStart(d, now), loop: { in: inP, out: inP + len, on: true }, anchorPos: p, anchorTime: now })
  },
  // ROLL: 短いループを鳴らし、もう一度押すと（止めなかったときの位置へ戻って）続きを再生する
  roll: (beats: number): Op => (m, i, now) => {
    const d = m.decks[i]
    const p = deckPos(d, now)
    if (d.roll !== null) {
      const ended = slipEnd({ ...d, roll: null, loop: null, anchorPos: p, anchorTime: now }, now)
      if (d.roll === beats) return withDeck(m, i, ended)
      return ops.roll(beats)(withDeck(m, i, ended), i, now)
    }
    const len = beats * beatLen(d)
    // 1 拍より短い ROLL は、いまの拍の中の位置から始める
    const inP = firstBeatOf(d) + Math.floor(beatsAt(d, p) / Math.min(1, beats) + 1e-6) * Math.min(1, beats) * beatLen(d)
    return withDeck(m, i, { ...slipStart(d, now, true), roll: beats, loop: { in: inP, out: inP + len, on: true }, anchorPos: p, anchorTime: now })
  },
  // ループの長さを半分／倍に
  loopScale: (k: number): Op => (m, i, now) => {
    const d = m.decks[i]
    if (!d.loop || d.loop.out === null) return m
    const len = Math.max(beatLen(d) / 8, Math.min(beatLen(d) * 64, (d.loop.out - d.loop.in) * k))
    return withDeck(m, i, { ...d, loop: { ...d.loop, out: d.loop.in + len }, anchorPos: deckPos(d, now), anchorTime: now })
  },
  // SHIFT + 1/2X・2X: ループをその長さぶん前後へ動かす（LOOP MOVE）
  loopMove: (dir: number): Op => (m, i, now) => {
    const d = m.decks[i]
    if (!d.loop || d.loop.out === null) return m
    const len = d.loop.out - d.loop.in
    return withDeck(m, i, { ...moveTo(d, deckPos(d, now) + dir * len, now), loop: { ...d.loop, in: d.loop.in + dir * len, out: d.loop.out + dir * len } })
  },
  beatJump: (beats: number): Op => (m, i, now) => {
    const d = m.decks[i]
    const dl = d.loop && d.loop.on && d.loop.out !== null ? { ...d.loop, in: d.loop.in + beats * beatLen(d), out: d.loop.out + beats * beatLen(d) } : d.loop
    return withDeck(m, i, { ...moveTo(d, deckPos(d, now) + beats * beatLen(d), now), loop: dl })
  },
  // ホットキュー: 空なら登録（QUANTIZE 中は拍にそろえる）、あれば飛ぶ（QUANTIZE 中は拍の中の位置を保って飛ぶ）
  hotCue: (k: number, clear: boolean): Op => (m, i, now) => {
    const d = m.decks[i]
    const hot = [...d.hot]
    const p = deckPos(d, now)
    if (clear) hot[k] = null
    else if (hot[k] === null) hot[k] = m.quantize ? snap(d, p) : p
    else {
      let target = hot[k]!
      if (m.quantize && d.playing) {
        let diff = frac(beatsAt(d, p)) - frac(beatsAt(d, target))
        if (diff < -0.5) diff += 1
        if (diff > 0.5) diff -= 1
        target += diff * beatLen(d)
      }
      return withDeck(m, i, { ...moveTo(d, target, now), loop: d.loop ? { ...d.loop, on: false } : null, roll: null, slipShadow: null })
    }
    return withDeck(m, i, { ...d, hot })
  },
  // KEYBOARD: ホットキュー A（なければ CUE）へ飛んで、その高さで鳴らす
  keyboard: (semis: number): Op => (m, i, now) => {
    const d = m.decks[i]
    const at = d.hot[0] ?? d.cue
    return withDeck(m, i, { ...moveTo(d, at, now), keyLock: true, keyShift: semis, loop: d.loop ? { ...d.loop, on: false } : null, playing: true })
  },
  // REVERSE: 逆再生の入／切。SLIP 中は、切ったときに裏で進んでいた位置へ戻る
  reverse: ((m, i, now) => {
    const d = m.decks[i]
    const p = deckPos(d, now)
    if (d.reverse) return withDeck(m, i, slipEnd({ ...d, reverse: false, anchorPos: p, anchorTime: now }, now))
    return withDeck(m, i, { ...slipStart(d, now), reverse: true, anchorPos: p, anchorTime: now })
  }) as Op,
  slip: ((m, i) => {
    const d = m.decks[i]
    return withDeck(m, i, { ...d, slip: !d.slip, slipShadow: d.slip ? null : d.slipShadow })
  }) as Op,
  // MASTER TEMPO の切り替え
  keyLock: ((m, i) => withDeck(m, i, { ...m.decks[i], keyLock: !m.decks[i].keyLock })) as Op,
  // 半音ずつ上げ下げ（-12〜+12）。高さを変えるときはキーロックも入れる（テンポで高さが動かないように）
  keyShift: (delta: number): Op => (m, i) => {
    const d = m.decks[i]
    return withDeck(m, i, { ...d, keyLock: true, keyShift: Math.max(-12, Math.min(12, d.keyShift + delta)) })
  },
  // KEY SHIFT パッド: その高さにする（同じ高さならもとに戻す）
  keySet: (semis: number): Op => (m, i) => {
    const d = m.decks[i]
    return withDeck(m, i, { ...d, keyLock: true, keyShift: d.keyShift === semis ? 0 : semis })
  },
  keyReset: ((m, i) => withDeck(m, i, { ...m.decks[i], keyShift: 0 })) as Op,
  // KEY SYNC: もう一方のデッキのキーに合わせる（調が違えば平行調に）
  keySync: ((m, i) => {
    const d = m.decks[i]
    const o = m.decks[i === 0 ? 1 : 0]
    const base = d.track === null ? null : TRACKS[d.track]?.key
    const target = effectiveKey(o)
    if (!base || !target) return m
    return withDeck(m, i, { ...d, keyLock: true, keyShift: keySyncShift(base, target) })
  }) as Op,
  padMode: (mode: PadMode): Op => (m, i) => withDeck(m, i, { ...m.decks[i], padMode: mode }),
  // LOAD: 止まっているデッキにだけ読み込める（再生中の曲を間違えて替えないように）
  // 読み込み: 再生中でも切り替えられる（再生中なら新しい曲の頭から続けて再生）
  load: ((m, i, now) => {
    const d = liveDeck(m.decks[i], now)
    const list = browseList(m)
    const track = list[Math.min(m.browse, list.length - 1)] ?? 0
    const next = withDeck(m, i, {
      ...d,
      track,
      anchorPos: TRACKS[track]?.firstBeat ?? 0,
      anchorTime: now,
      brake: 0,
      cue: TRACKS[track]?.firstBeat ?? 0,
      hot: Array(8).fill(null),
      loop: null,
      roll: null,
      keyShift: 0,
      reverse: false,
      scratch: false,
      slipShadow: null,
      grid: 0,
    })
    // 同期中なら新しい曲の BPM で合わせ直す（MASTER 側に読み込んだときは、同期中の相手を合わせ直す）
    const j = i === 0 ? 1 : 0
    if (next.decks[i].synced) return resync(next, i, now, false)
    if (next.decks[j].synced) return resync(next, j, now, false)
    return next
  }) as Op,
  set: (key: 'trim' | 'hi' | 'mid' | 'low' | 'cfx' | 'fader', v: number): Op => (m, i) => withDeck(m, i, { ...m.decks[i], [key]: v }),
}

// 古い形の共有状態（項目が足りない）を補う
export const normalizeMix = (m: MixState): MixState => {
  const base = initialMix()
  return {
    ...base,
    ...m,
    fx: { ...base.fx, ...m.fx },
    decks: m.decks.map((d, k) => ({ ...base.decks[k], ...d })) as [DeckState, DeckState],
  }
}
