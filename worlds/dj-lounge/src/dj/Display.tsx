import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { PEAKS_PER_SEC, type DjEngine, type TrackData } from './engine'
import type { ControllerApi } from './Controller'
import { camelot, keyName } from './key'
import { beatsAt, browseList, deckPos, effectiveBpm, effectiveKey, FX_BEATS, FX_TYPES, shadowPos, tempoRange, type DeckState } from './state'
import { TRACKS } from './tracks'

// DJ 用の画面（2 曲の波形・BPM・残り時間など）。ブースのモニターと、フロアの大きな画面で同じ絵を使う
const CW = 1280
const CH = 720
const FONT = '"Arial", "Noto Sans JP", sans-serif'
const DECK_COLOR = ['#2fa8ff', '#ff4f8b']
const fmt = (s: number) => {
  const t = Math.max(0, s)
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`
}

// 曲全体の小さな波形（曲ごとに 1 回だけ描く）
const overviews = new WeakMap<TrackData, HTMLCanvasElement>()
const overview = (t: TrackData) => {
  let c = overviews.get(t)
  if (c) return c
  c = document.createElement('canvas')
  c.width = 560
  c.height = 60
  const ctx = c.getContext('2d')!
  const n = t.peaks.length
  for (let x = 0; x < c.width; x++) {
    const a = Math.floor((x / c.width) * n)
    const b = Math.floor(((x + 1) / c.width) * n)
    let pk = 0
    let lw = 0
    for (let k = a; k < b; k++) {
      pk = Math.max(pk, t.peaks[k])
      lw = Math.max(lw, t.lows[k])
    }
    ctx.fillStyle = '#d8e4ff'
    ctx.fillRect(x, 30 - pk * 28, 1, pk * 56)
    ctx.fillStyle = '#2f6bff'
    ctx.fillRect(x, 30 - lw * 18, 1, lw * 36)
  }
  overviews.set(t, c)
  return c
}

const drawZoom = (ctx: CanvasRenderingContext2D, d: DeckState, data: TrackData | undefined, pos: number, y: number, h: number, color: string, failed: boolean, now: number) => {
  ctx.fillStyle = '#07070a'
  ctx.fillRect(0, y, CW, h)
  if (!data || d.track === null) {
    ctx.fillStyle = '#55555c'
    ctx.font = `24px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(d.track === null ? 'NO TRACK' : failed ? '曲を読み込めませんでした' : 'LOADING...', CW / 2, y + h / 2)
    return
  }
  const span = 6 // 画面の幅で 6 秒
  const mid = y + h / 2
  const t0 = pos - span / 2
  // ループの範囲
  if (d.loop && d.loop.out !== null) {
    const a = ((d.loop.in - t0) / span) * CW
    const b = ((d.loop.out - t0) / span) * CW
    ctx.fillStyle = d.loop.on ? 'rgba(255,160,0,0.28)' : 'rgba(255,160,0,0.12)'
    ctx.fillRect(a, y, b - a, h)
  }
  for (let x = 0; x < CW; x += 2) {
    const t = t0 + (x / CW) * span
    if (t < 0 || t > data.duration) continue
    const k = Math.floor(t * PEAKS_PER_SEC)
    // 3 つの帯域で色分け: 低音（青）・中音（オレンジ）・高音（白）
    const lw = data.lows[k] ?? 0
    const md = data.mids[k] ?? 0
    const hg = data.highs[k] ?? 0
    ctx.fillStyle = '#2a63ff'
    ctx.fillRect(x, mid - lw * h * 0.46, 2, lw * h * 0.92)
    ctx.fillStyle = '#ff9a3c'
    ctx.fillRect(x, mid - md * h * 0.3, 2, md * h * 0.6)
    ctx.fillStyle = '#f2f4ff'
    ctx.fillRect(x, mid - hg * h * 0.17, 2, hg * h * 0.34)
  }
  // SLIP 中は、裏で進んでいる位置を灰色の線で出す
  const sp = shadowPos(d, now)
  if (sp !== null) {
    const sx = ((sp - t0) / span) * CW
    ctx.fillStyle = 'rgba(200,200,210,0.8)'
    for (let yy = y; yy < y + h; yy += 10) ctx.fillRect(sx - 1, yy, 3, 5)
  }
  // 拍の線（小節の頭は太く）
  const beat = 60 / (TRACKS[d.track]?.bpm || 120)
  const fb = TRACKS[d.track]?.firstBeat ?? 0
  for (let b = Math.ceil((t0 - fb) / beat); fb + b * beat < t0 + span; b++) {
    const x = ((fb + b * beat - t0) / span) * CW
    ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)'
    ctx.fillRect(x, y, b % 4 === 0 ? 2 : 1, b % 4 === 0 ? 14 : 8)
  }
  // ホットキューと CUE
  d.hot.forEach((p, k) => {
    if (p === null) return
    const x = ((p - t0) / span) * CW
    ctx.fillStyle = ['#ff3b5c', '#ff8a00', '#ffd400', '#3cff6b', '#00e5ff', '#2f6bff', '#b04bff', '#ff4fd8'][k]
    ctx.fillRect(x - 1, y, 3, h)
    ctx.font = `bold 16px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillText('ABCDEFGH'[k], x + 4, y + 18)
  })
  const cx = ((d.cue - t0) / span) * CW
  ctx.fillStyle = '#ff9a1f'
  ctx.beginPath()
  ctx.moveTo(cx - 8, y + h)
  ctx.lineTo(cx + 8, y + h)
  ctx.lineTo(cx, y + h - 12)
  ctx.fill()
  // いまの位置
  ctx.fillStyle = color
  ctx.fillRect(CW / 2 - 1, y, 3, h)
}

const drawInfo = (ctx: CanvasRenderingContext2D, i: number, d: DeckState, data: TrackData | undefined, pos: number, x: number, y: number, w: number, master: boolean) => {
  const synced = d.synced
  const color = DECK_COLOR[i]
  ctx.fillStyle = '#101016'
  ctx.fillRect(x, y, w, 300)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, 6)
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ctx.font = `bold 28px ${FONT}`
  ctx.fillText(`${i + 1}`, x + 14, y + 42)
  const tr = d.track === null ? null : (TRACKS[d.track] ?? null)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 30px ${FONT}`
  ctx.fillText(tr?.title ?? '— 曲を読み込んでください —', x + 52, y + 42)
  ctx.fillStyle = '#9a9aa6'
  ctx.font = `20px ${FONT}`
  ctx.fillText(tr?.artist ?? '', x + 52, y + 72)
  // BPM とテンポ
  ctx.textAlign = 'right'
  ctx.fillStyle = synced ? '#2fa8ff' : '#ffffff'
  ctx.font = `bold 54px ${FONT}`
  ctx.fillText(tr ? effectiveBpm(d).toFixed(1) : '---.-', x + w - 16, y + 130)
  ctx.fillStyle = '#9a9aa6'
  ctx.font = `18px ${FONT}`
  ctx.fillText(`BPM   ${d.rate >= 1 ? '+' : ''}${((d.rate - 1) * 100).toFixed(1)}%  (±${Math.round(tempoRange(d) * 100)}%)`, x + w - 16, y + 156)
  // 小節.拍 と、次の 8 小節の区切りまで（盛り上がりの切り替わりの目安）
  if (tr) {
    const b = Math.max(0, beatsAt(d, pos))
    const toPhrase = 32 - (b % 32)
    ctx.textAlign = 'left'
    ctx.fillStyle = toPhrase <= 4 ? '#ff5c5c' : '#c8c8d0'
    ctx.font = `bold 22px ${FONT}`
    ctx.fillText(`${Math.floor(b / 4) + 1}.${Math.floor(b % 4) + 1}   ▶ ${Math.floor(toPhrase / 4)}.${Math.ceil(toPhrase % 4) || 0}`, x + 200, y + 128)
  }
  // キー（いま聞こえているキー。KEY SHIFT・テンポの分を含む）
  const base = tr?.key ?? null
  const ek = effectiveKey(d)
  ctx.textAlign = 'right'
  ctx.font = `bold 24px ${FONT}`
  ctx.fillStyle = ek ? '#c88cff' : '#55555c'
  const semis = d.keyShift + (d.keyLock ? 0 : 12 * Math.log2(d.rate))
  ctx.fillText(ek ? `KEY ${camelot(ek)}  ${keyName(ek)}${Math.abs(semis) > 0.05 ? `  (${semis > 0 ? '+' : ''}${semis.toFixed(Number.isInteger(semis) ? 0 : 1)})` : ''}` : 'KEY -', x + w - 16, y + 186)
  void base
  // 経過・残り
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 34px ${FONT}`
  ctx.fillText(fmt(pos), x + 16, y + 128)
  ctx.fillStyle = data && data.duration - pos < 30 && d.playing && Math.floor(pos * 2) % 2 === 0 ? '#ff3b3b' : '#c8c8d0'
  ctx.font = `24px ${FONT}`
  ctx.fillText(data ? `-${fmt(data.duration - pos)}` : '-0:00.0', x + 16, y + 158)
  // 状態
  const tags: [string, boolean, string][] = [
    [d.playing ? 'PLAY' : 'PAUSE', d.playing, '#33ff66'],
    ['LOOP', !!d.loop?.on, '#ffa000'],
    [master ? 'MASTER' : 'SYNC', master || synced, master ? '#ff9a1f' : '#2fa8ff'],
    ['MT', d.keyLock, '#ffd400'],
    ['SLIP', d.slip, '#33ff66'],
    ['REV', d.reverse, '#ff3b5c'],
  ]
  tags.forEach(([t, on, c], k) => {
    ctx.fillStyle = on ? c : '#2a2a30'
    ctx.fillRect(x + 16 + k * 62, y + 176, 58, 30)
    ctx.fillStyle = on ? '#000000' : '#6a6a74'
    ctx.font = `bold 14px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(t, x + 45 + k * 62, y + 197)
  })
  // 全体の波形と位置
  if (data) {
    const ov = overview(data)
    ctx.drawImage(ov, x + 16, y + 222, w - 32, 60)
    const px = x + 16 + (pos / data.duration) * (w - 32)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(x + 16, y + 222, px - x - 16, 60)
    ctx.fillStyle = color
    ctx.fillRect(px - 1, y + 218, 3, 68)
  }
}

export const useDjDisplay = (api: ControllerApi) => {
  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CW
    canvas.height = CH
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return { ctx: canvas.getContext('2d')!, texture }
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  const apiRef = useRef(api)
  apiRef.current = api
  const acc = useRef(0)
  useFrame((_, delta) => {
    acc.current += delta
    if (acc.current < 1 / 30) return
    acc.current = 0
    const a = apiRef.current
    const m = a.m
    const now = a.now()
    const engine: DjEngine | null = a.engine
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, CW, CH)
    // 上の帯: マスターの BPM・FX・クロスフェーダー
    const loud = m.decks[0].fader * (1 - m.xfader) * (m.decks[0].playing ? 1 : 0) >= m.decks[1].fader * m.xfader * (m.decks[1].playing ? 1 : 0) ? 0 : 1
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold 26px ${FONT}`
    ctx.fillText('DJ LOUNGE', 16, 38)
    ctx.fillStyle = '#9a9aa6'
    ctx.font = `20px ${FONT}`
    ctx.fillText(`MASTER ${effectiveBpm(m.decks[loud]).toFixed(1)} BPM`, 200, 38)
    ctx.fillStyle = m.fx.on ? '#ff3b5c' : '#6a6a74'
    ctx.font = `18px ${FONT}`
    ctx.fillText(`FX ${FX_TYPES[m.fx.type]} ${FX_BEATS[m.fx.beat]}拍 ${['CH1', 'CH2', 'MASTER'][m.fx.ch]} ${m.fx.on ? 'ON' : 'OFF'}`, 420, 38)
    // BROWSE で選んでいる曲（LOAD で読み込む曲）
    const bl = browseList(m)
    const bi = bl[Math.min(m.browse, bl.length - 1)] ?? 0
    ctx.fillStyle = '#ffd27a'
    let bt = `▶ ${Math.min(m.browse, bl.length - 1) + 1}/${bl.length} ${TRACKS[bi]?.title ?? ''} (${TRACKS[bi]?.bpm ?? '-'})`
    while (bt.length > 6 && ctx.measureText(bt).width > 300) bt = bt.slice(0, -2)
    ctx.fillText(bt, 720, 38)
    // クロスフェーダーの位置
    ctx.fillStyle = '#2a2a30'
    ctx.fillRect(1040, 22, 220, 18)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(1040 + m.xfader * 210, 18, 10, 26)
    const pos = m.decks.map((d) => deckPos(d, now, engine?.track(d.track)?.duration ?? Infinity))
    // 同期中のデッキがあれば、もう一方が MASTER
    const masterOf = (i: number) => m.decks[i === 0 ? 1 : 0].synced && !m.decks[i].synced
    m.decks.forEach((d, i) => drawZoom(ctx, d, engine?.track(d.track), pos[i], 56 + i * 172, 164, DECK_COLOR[i], !!engine?.isFailed(d.track), now))
    m.decks.forEach((d, i) => drawInfo(ctx, i, d, engine?.track(d.track), pos[i], 8 + i * 636, 408, 628, masterOf(i)))
    texture.needsUpdate = true
  })
  return texture
}
