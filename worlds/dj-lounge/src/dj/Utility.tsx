import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { CanvasButton } from '../components/CanvasButton'
import type { ControllerApi } from './Controller'
import { camelot } from './key'
import { browseList, CFX_TYPES, isCompatible, ops, SORTS, type MixState } from './state'
import { TRACKS } from './tracks'

// DJ の左手の操作パネル（DJ 画面と同じ大きさで、画面の左に並べる）: 曲の一覧（ブラウザ）と、
// SLIP・REVERSE・QUANTIZE・CFX の種類・並べ替え・AUTOMIX・曲の追加のボタン
export const PANEL = { w: 0.72, h: 0.405, tilt: -0.175 }
const W = PANEL.w
const H = PANEL.h
const BROWSER_H = 0.23
const CH = Math.round((1024 * BROWSER_H) / 0.7)
const FONT = '"Arial", "Noto Sans JP", sans-serif'

// ---------- ブラウザの画面 ----------
const ROWS = 7
const drawBrowser = (ctx: CanvasRenderingContext2D, cw: number, ch: number, m: MixState) => {
  ctx.fillStyle = '#0a0a0e'
  ctx.fillRect(0, 0, cw, ch)
  const list = browseList(m)
  const sel = Math.min(m.browse, list.length - 1)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 26px ${FONT}`
  ctx.fillText(`BROWSER  ${sel + 1}/${list.length}`, 18, 26)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd27a'
  ctx.font = `bold 22px ${FONT}`
  ctx.fillText(`並べ方: ${SORTS[m.sort]}${m.sort === 2 ? '（キーが合う曲が先）' : m.sort === 1 ? '（BPM が近い順）' : ''}`, cw - 18, 26)
  const rowH = (ch - 56) / ROWS
  const start = Math.max(0, Math.min(sel - Math.floor(ROWS / 2), list.length - ROWS))
  for (let r = 0; r < ROWS; r++) {
    const k = start + r
    if (k >= list.length) break
    const t = TRACKS[list[k]]
    const y = 52 + r * rowH
    if (k === sel) {
      ctx.fillStyle = '#2a3a66'
      ctx.fillRect(8, y, cw - 16, rowH - 4)
    }
    const loaded = m.decks.map((d, i) => (d.track === list[k] ? i + 1 : 0)).filter(Boolean)
    ctx.textAlign = 'left'
    ctx.fillStyle = loaded.length ? '#33ff66' : '#c8c8d0'
    ctx.font = `20px ${FONT}`
    ctx.fillText(loaded.length ? `[${loaded.join('/')}]` : '', 16, y + rowH / 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = `${k === sel ? 'bold ' : ''}22px ${FONT}`
    let title = t.title
    while (title.length > 3 && ctx.measureText(title).width > cw * 0.5) title = title.slice(0, -2)
    ctx.fillText(title, 70, y + rowH / 2)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#9ad0ff'
    ctx.fillText(t.bpm.toFixed(t.bpm % 1 ? 1 : 0), cw * 0.8, y + rowH / 2)
    ctx.fillStyle = isCompatible(m, list[k]) ? '#c88cff' : '#77777f'
    ctx.fillText(t.key ? camelot(t.key) : '-', cw - 20, y + rowH / 2)
  }
}

export interface UtilityProps {
  api: ControllerApi
  position: [number, number, number]
  rotationY: number
  automixOn: boolean
  toggleAutomix: () => void
  children?: React.ReactNode // 曲を追加ボタン
}

export const Utility: React.FC<UtilityProps> = ({ api, position, rotationY, automixOn, toggleAutomix, children }) => {
  const m = api.m
  const { ctx, texture } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = CH
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return { ctx: c.getContext('2d')!, texture: t }
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  const apiRef = useRef(api)
  apiRef.current = api
  const acc = useRef(0)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.2) return
    acc.current = 0
    drawBrowser(ctx, 1024, CH, apiRef.current.m)
    texture.needsUpdate = true
  })
  const btn = (id: string, x: number, y: number, label: string, text: string, on: boolean, color: string, press: () => void, w = 0.12) => (
    <CanvasButton
      key={id}
      id={id}
      position={[x, y, 0.004]}
      width={w}
      height={0.042}
      px={1600}
      deps={[text, on, color]}
      draw={(c, cw, ch) => {
        c.fillStyle = on ? color : '#24242c'
        c.beginPath()
        c.roundRect(0, 0, cw, ch, 12)
        c.fill()
        c.fillStyle = on ? '#000000' : '#e8e8f0'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.font = `bold 24px ${FONT}`
        let t = text
        while (t.length > 2 && c.measureText(t).width > cw - 10) t = t.slice(0, -1)
        c.fillText(t, cw / 2, ch / 2)
      }}
      onPress={press}
      label={label}
    />
  )
  const list = browseList(m)
  const row1 = -0.06
  const row2 = -0.11
  const row3 = -0.16
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group rotation={[PANEL.tilt, 0, 0]}>
        {/* 枠（DJ 画面と同じ） */}
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[W + 0.06, H + 0.06, 0.03]} />
          <meshStandardMaterial color="#0a0a0c" />
        </mesh>
        <mesh position={[0, 0, -0.004]}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial color="#121216" toneMapped={false} />
        </mesh>
        {/* ブラウザの画面 */}
        <mesh position={[0, H / 2 - 0.005 - BROWSER_H / 2, 0.001]}>
          <planeGeometry args={[0.7, BROWSER_H]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        {/* 1 段目: 曲の読み込み・選択・並べ方 */}
        {([0, 1] as const).map((i) =>
          btn(
            `dj-u-load${i}`,
            i === 0 ? -0.285 : 0.04,
            row1,
            `デッキ ${i + 1} に「${TRACKS[list[Math.min(m.browse, list.length - 1)]]?.title ?? ''}」を読み込む${m.decks[i].playing ? '（再生中の曲から切り替え）' : ''}`,
            `LOAD ${i + 1}`,
            true,
            i === 0 ? '#2fa8ff' : '#ff4f8b',
            () => api.act(ops.load, i),
            0.13
          )
        )}
        {btn('dj-u-up', -0.17, row1, '一覧の上の曲へ', '▲', false, '#ffffff', () => api.actMix((mm) => ({ ...mm, browse: Math.max(0, mm.browse - 1) })), 0.08)}
        {btn('dj-u-down', -0.08, row1, '一覧の下の曲へ', '▼', false, '#ffffff', () => api.actMix((mm) => ({ ...mm, browse: Math.min(list.length - 1, mm.browse + 1) })), 0.08)}
        {btn('dj-u-sort', 0.235, row1, '並べ方を切り替える（ALL / BPM が近い順 / キーが合う順）', `SORT: ${SORTS[m.sort]}`, m.sort !== 0, '#ffd27a', () => api.actMix((mm) => ({ ...mm, sort: ((mm.sort + 1) % 3) as 0 | 1 | 2, browse: 0 })), 0.23)}
        {/* 2 段目: デッキごとの SLIP / REVERSE と QUANTIZE */}
        {([0, 1] as const).map((i) => (
          <group key={i}>
            {btn(`dj-u-slip${i}`, i === 0 ? -0.29 : -0.03, row2, `デッキ ${i + 1} の SLIP（ループ・REVERSE の後、元の流れに戻る）`, `SLIP ${i + 1}`, m.decks[i].slip, '#33ff66', () => api.act(ops.slip, i), 0.12)}
            {btn(`dj-u-rev${i}`, i === 0 ? -0.16 : 0.1, row2, `デッキ ${i + 1} の REVERSE（逆再生）`, `REV ${i + 1}`, m.decks[i].reverse, '#ff3b5c', () => api.act(ops.reverse, i), 0.12)}
          </group>
        ))}
        {btn('dj-u-quantize', 0.265, row2, 'QUANTIZE（キューやループを拍にそろえる）', 'QUANTIZE', m.quantize, '#2fa8ff', () => api.actMix((mm) => ({ ...mm, quantize: !mm.quantize })), 0.17)}
        {/* 3 段目: AUTOMIX・CFX の種類・曲の追加（右は children） */}
        {btn('dj-u-automix', -0.27, row3, automixOn ? 'AUTOMIX を止める' : 'AUTOMIX（曲が終わる前に次の曲を合わせてつなぐ）', automixOn ? 'AUTOMIX ON' : 'AUTOMIX', automixOn, '#c88cff', toggleAutomix, 0.16)}
        {btn('dj-u-cfx', -0.09, row3, `CFX の種類（いま ${CFX_TYPES[m.cfxType]}）`, `CFX: ${CFX_TYPES[m.cfxType]}`, m.cfxType !== 0, '#ff9a1f', () => api.actMix((mm) => ({ ...mm, cfxType: (mm.cfxType + 1) % CFX_TYPES.length })), 0.18)}
        {children}
      </group>
    </group>
  )
}
