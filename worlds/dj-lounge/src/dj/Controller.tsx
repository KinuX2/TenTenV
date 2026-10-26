import { useFrame } from '@react-three/fiber'
import { Clickable } from '@tentenv/sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, Color, CylinderGeometry, type Group, type Mesh, MeshBasicMaterial, SRGBColorSpace, type Vector3 } from 'three'
import type { DjEngine } from './engine'
import { type TouchHot, useDrag, useTouchTarget } from './input'
import { BODY_H, D, deckX, L, outer, TOP, W } from './layout'
import { camelot } from './key'
import { BEAT_JUMPS, BEAT_LOOPS, browseList, deckPos, effectiveKey, FX_BEATS, KEYBOARD_SEMIS, KEYSHIFT_SEMIS, ROLLS, tempoRange, FX_TYPES, ops, type DeckState, type MixState, type PadMode } from './state'
import { SAMPLE_NAMES, TRACKS } from './tracks'

// DDJ-400 と同じ並びの DJ コントローラー（ロゴや製品名は入れない）。
// ボタンは見えている部品そのものを Clickable にする（BGM スイッチと同じ書き方）
type DeckOp = (m: MixState, i: 0 | 1, now: number) => MixState
export interface ControllerApi {
  m: MixState
  // ボタン: その場で状態を変えて共有する
  act: (op: DeckOp, i: 0 | 1) => void
  actMix: (fn: (m: MixState) => MixState) => void
  // つまみ・フェーダー: 動かしている間は手元で変え、少しずつ共有する
  live: (fn: (m: MixState) => MixState) => void
  endLive: () => void
  now: () => number
  engine: DjEngine | null
}

const OFF = '#2a2a2e'
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const PAD_HUES = ['#ff3b5c', '#ff8a00', '#ffd400', '#3cff6b', '#00e5ff', '#2f6bff', '#b04bff', '#ff4fd8']
const MODE_COLORS: Record<PadMode, string> = { hotcue: '#ff3b5c', beatloop: '#ffa000', beatjump: '#7a5cff', sampler: '#28d07a', roll: '#00c8ff', keyboard: '#ff6ad5', keyshift: '#c88cff' }
// パッドのモードボタン: 押すと上、SHIFT と押すと下のモード
const MODE_PAIRS: [PadMode, PadMode, string, string][] = [
  ['hotcue', 'keyboard', 'HOT CUE', 'KEYBOARD'],
  ['beatloop', 'roll', 'BEAT LOOP', 'ROLL'],
  ['beatjump', 'keyshift', 'BEAT JUMP', 'KEY SHIFT'],
  ['sampler', 'sampler', 'SAMPLER', 'SAMPLER'],
]

// ---------- 部品 ----------
// VR で手を近づけたとき（薄い水色）と、つかんでいるとき（濃い水色）の光
const HOT_MATS = [
  null,
  new MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
  new MeshBasicMaterial({ color: '#4fd2ff', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
]
const hotMat = (h: TouchHot) => HOT_MATS[h] ?? undefined

const Button: React.FC<{
  id: string
  x: number
  z: number
  w?: number
  d?: number
  round?: boolean
  color?: string
  lit?: boolean
  litColor?: string
  label: string
  onPress: () => void
}> = ({ id, x, z, w = 0.026, d = 0.018, round = false, color = OFF, lit = false, litColor = '#ffffff', label, onPress }) => {
  const drag = useDrag()
  const h = 0.008
  const ref = useRef<Mesh>(null)
  const pressRef = useRef(onPress)
  pressRef.current = onPress
  const hot = useTouchTarget(() => (ref.current ? { obj: ref.current, radius: Math.max(w, d) / 2 + 0.016, press: () => pressRef.current(), label: id } : null))
  return (
    <>
      <Clickable label={label} onClick={() => !drag.busy() && onPress()}>
        <mesh ref={ref} position={[x, TOP + h / 2, z]}>
          {round ? <cylinderGeometry args={[w / 2, w / 2, h, 24]} /> : <boxGeometry args={[w, h, d]} />}
          <meshBasicMaterial color={lit ? litColor : color} toneMapped={false} />
        </mesh>
      </Clickable>
      {hot > 0 && (
        <mesh position={[x, TOP + h + 0.0012, z]} material={hotMat(hot)}>
          {round ? <cylinderGeometry args={[w / 2 + 0.003, w / 2 + 0.003, 0.002, 24]} /> : <boxGeometry args={[w + 0.006, 0.002, d + 0.006]} />}
        </mesh>
      )}
    </>
  )
}

const Knob: React.FC<{ id: string; x: number; z: number; r?: number; value: number; label: string; surface: React.RefObject<Group | null>; onChange: (v: number) => void; onEnd: () => void; detent?: boolean }> = ({
  id,
  x,
  z,
  r = 0.011,
  value,
  label,
  surface,
  onChange,
  onEnd,
  detent = true,
}) => {
  const drag = useDrag()
  const h = 0.018
  const angle = -(value - 0.5) * Math.PI * 1.5
  // VR: 手を近づけてトリガーでつかみ、手首をひねって回す（約 145° で端から端まで）
  const ref = useRef<Group>(null)
  const live = useRef({ value, v0: value, onChange, onEnd })
  live.current.value = value
  live.current.onChange = onChange
  live.current.onEnd = onEnd
  const hot = useTouchTarget(() =>
    ref.current && surface.current
      ? {
          obj: ref.current,
          radius: r + 0.018,
          grab: {
            surface: surface.current,
            start: () => (live.current.v0 = live.current.value),
            move: (_p, _s, twist) => {
              let v = clamp01(live.current.v0 + twist / (Math.PI * 0.8))
              if (detent && Math.abs(v - 0.5) < 0.025) v = 0.5
              live.current.onChange(v)
            },
            end: () => live.current.onEnd(),
          },
        }
      : null
  )
  const press = () => {
    if (drag.busy() || !surface.current) return
    const v0 = value
    drag.begin({
      surface: surface.current,
      y: TOP + h,
      // 右・奥へ動かすと上がる（25cm で端から端まで）
      onMove: (p: Vector3, s: Vector3) => {
        let v = clamp01(v0 + (p.x - s.x - (p.z - s.z)) * 4)
        if (detent && Math.abs(v - 0.5) < 0.025) v = 0.5
        onChange(v)
      },
      onEnd,
    })
  }
  return (
    <Clickable label={`${label}（押してつかむ・動かして回す）`} onClick={() => press()}>
      <group ref={ref} position={[x, TOP, z]}>
        {hot > 0 && (
          <mesh position={[0, h / 2, 0]} material={hotMat(hot)}>
            <cylinderGeometry args={[r * 1.3, r * 1.4, h + 0.003, 24]} />
          </mesh>
        )}
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[r, r * 1.12, h, 24]} />
          <meshStandardMaterial color="#1a1a1c" roughness={0.6} />
        </mesh>
        <mesh position={[0, h + 0.0006, 0]} rotation={[0, angle, 0]}>
          <boxGeometry args={[0.0022, 0.001, r * 0.95]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        {/* つまみの向きの目印は奥側（12 時）から回る */}
      </group>
    </Clickable>
  )
}

// 縦のフェーダー（奥 z0 → 手前 z1）。値の向きは呼ぶ側で決める
const Fader: React.FC<{
  id: string
  x: number
  z0: number
  z1: number
  pos: number // 0（奥）..1（手前）
  label: string
  surface: React.RefObject<Group | null>
  onChange: (pos: number) => void
  onEnd: () => void
  horizontal?: boolean
  capColor?: string
}> = ({ id, x, z0, z1, pos, label, surface, onChange, onEnd, horizontal = false, capColor = '#d8d8dc' }) => {
  const drag = useDrag()
  const len = z1 - z0
  // VR: つまみ（キャップ）に手を近づけてトリガーでつかみ、そのまま手を動かす
  const capRef = useRef<Mesh>(null)
  const live = useRef({ pos, p0: pos, onChange, onEnd })
  live.current.pos = pos
  live.current.onChange = onChange
  live.current.onEnd = onEnd
  const hot = useTouchTarget(() =>
    capRef.current && surface.current
      ? {
          obj: capRef.current,
          radius: 0.03,
          grab: {
            surface: surface.current,
            start: () => (live.current.p0 = live.current.pos),
            move: (p, st) => live.current.onChange(clamp01(live.current.p0 + ((horizontal ? p.x - st.x : p.z - st.z) / len))),
            end: () => live.current.onEnd(),
          },
        }
      : null
  )
  const press = () => {
    if (drag.busy() || !surface.current) return
    drag.begin({
      surface: surface.current,
      y: TOP + 0.012,
      onMove: (p: Vector3) => onChange(clamp01(((horizontal ? p.x : p.z) - z0) / len)),
      onEnd,
    })
  }
  const along = z0 + pos * len
  const slot: [number, number, number] = horizontal ? [(z0 + z1) / 2, TOP + 0.001, x] : [x, TOP + 0.001, (z0 + z1) / 2]
  const cap: [number, number, number] = horizontal ? [along, TOP + 0.009, x] : [x, TOP + 0.009, along]
  return (
    <Clickable label={`${label}（押してつかむ・動かして調整）`} onClick={() => press()}>
      <group>
        <mesh position={slot}>
          <boxGeometry args={horizontal ? [len + 0.02, 0.002, 0.008] : [0.008, 0.002, len + 0.02]} />
          <meshBasicMaterial color="#050506" toneMapped={false} />
        </mesh>
        <mesh ref={capRef} position={cap}>
          <boxGeometry args={horizontal ? [0.014, 0.014, 0.026] : [0.026, 0.014, 0.014]} />
          <meshStandardMaterial color={capColor} roughness={0.5} />
        </mesh>
        {hot > 0 && (
          <mesh position={cap} material={hotMat(hot)}>
            <boxGeometry args={horizontal ? [0.022, 0.018, 0.034] : [0.034, 0.018, 0.022]} />
          </mesh>
        )}
      </group>
    </Clickable>
  )
}

// ---------- 天板の印刷（ラベル・区切り線） ----------
const PX = 2000
const toPx = (x: number, z: number): [number, number] => [(x + W / 2) * PX, (z + D / 2) * PX]
const drawFaceplate = (ctx: CanvasRenderingContext2D) => {
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  ctx.fillStyle = '#17171a'
  ctx.fillRect(0, 0, cw, ch)
  // ミキサー部分は少し明るい板
  ctx.fillStyle = '#202024'
  const [mx0] = toPx(-0.1, 0)
  const [mx1] = toPx(0.1, 0)
  ctx.fillRect(mx0, 0, mx1 - mx0, ch)
  ctx.strokeStyle = '#3a3a40'
  ctx.lineWidth = 3
  ctx.strokeRect(mx0, 6, mx1 - mx0, ch - 12)
  const label = (x: number, z: number, t: string, size = 15, color = '#c8c8cc', align: CanvasTextAlign = 'center') => {
    ctx.fillStyle = color
    ctx.font = `bold ${Math.round(size * 1.35)}px "Arial", sans-serif`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText(t, ...toPx(x, z))
  }
  for (const i of [0, 1] as const) {
    const x0 = deckX(i)
    label(x0, L.jog.z + L.jog.r + 0.012, '◀  JOG  ▶  (SHIFT: GRID)', 12, '#8a8a90')
    const names = ['IN / 4BEAT', 'OUT', 'RELOOP/EXIT', '◀ 1/2X (MOVE)', '2X ▶ (MOVE)']
    L.loopX.forEach((dx, k) => label(x0 + dx, L.loopRowZ - 0.017, names[k], 12))
    label(x0 + outer(i) * L.tempo.dx, L.tempo.z0 - 0.014, 'TEMPO', 12)
    label(x0 + outer(i) * L.tempo.dx + outer(i) * 0.016, L.tempo.z0 + 0.004, '−', 18)
    label(x0 + outer(i) * L.tempo.dx + outer(i) * 0.016, L.tempo.z1 - 0.004, '+', 18)
    label(x0 - outer(i) * L.sync.dx, L.sync.z - 0.017, 'BEAT SYNC (RESET)', 9)
    label(x0 - outer(i) * L.sync.dx, L.key.mtZ - 0.014, 'MASTER TEMPO (RANGE)', 8)
    label(x0 - outer(i) * L.sync.dx, L.key.upZ - 0.014, 'KEY ▲', 9)
    label(x0 - outer(i) * L.sync.dx, L.key.downZ - 0.014, 'KEY ▼', 9)
    label(x0 - outer(i) * L.sync.dx, L.key.syncZ - 0.014, 'KEY SYNC', 9)
    label(x0 + L.left.dx, L.left.shiftZ - 0.016, 'SHIFT', 11)
    label(x0 + L.left.dx, L.left.cueZ - 0.017, 'CUE', 12)
    label(x0 + L.left.dx, L.left.playZ - 0.017, 'PLAY (BRAKE)', 10)
    MODE_PAIRS.forEach(([, , na, nb], k) => {
      label(x0 + L.padX(k), L.modeZ - 0.019, na, 9)
      if (nb !== na) label(x0 + L.padX(k), L.modeZ - 0.0115, `(${nb})`, 7, '#8a8a90')
    })
    label(x0, -0.212, i === 0 ? 'DECK 1' : 'DECK 2', 14, '#ffffff')
  }
  const mx = L.mixer
  label(0, mx.loadZ - 0.019, 'BROWSE', 11)
  label(0, mx.trimZ - 0.017, 'MASTER', 11)
  for (const s of [-1, 1]) {
    label(s * mx.knobX, mx.trimZ - 0.016, 'TRIM', 11)
    ;['HI', 'MID', 'LOW'].forEach((t, k) => label(s * (mx.knobX + 0.024), mx.eqZ[k], t, 11, '#c8c8cc'))
    label(s * mx.knobX, mx.cfxZ - 0.016, 'CFX', 11)
    label(s * mx.knobX, mx.faderZ0 - 0.012, s < 0 ? 'CH 1' : 'CH 2', 11)
  }
  label(0, mx.xfZ - 0.016, 'CROSSFADER', 11)
  label(-0.075, mx.xfZ, '1', 14)
  label(0.075, mx.xfZ, '2', 14)
  const f = L.fx
  label((f.beatL + f.on) / 2, L.fxRowZ - 0.02, 'BEAT FX', 13, '#ffffff')
  label((f.beatL + f.beatR) / 2, L.fxRowZ + 0.017, '◀ BEAT ▶', 10)
  label(f.select, L.fxRowZ + 0.017, 'FX SELECT', 10)
  label(f.ch, L.fxRowZ + 0.017, 'CH SELECT', 10)
  label(f.level, L.fxRowZ + 0.02, 'LEVEL/DEPTH', 10)
  label(f.on, L.fxRowZ + 0.017, 'ON/OFF', 10)
  label(-0.235, L.fxRowZ, 'DJ LOUNGE', 20, '#6d6d75')
}

// ---------- ジョグ（左半分で戻す・右半分で進める）。円盤の目印は曲の位置で回る ----------
const halfGeom = (r: number, h: number, start: number) => new CylinderGeometry(r, r, h, 32, 1, false, start, Math.PI)
const Jog: React.FC<{ i: 0 | 1; api: ControllerApi; shift: boolean; setShift: (v: boolean) => void; surface: React.RefObject<Group | null> }> = ({ i, api, shift, setShift, surface }) => {
  const drag = useDrag()
  const x0 = deckX(i)
  const r = L.jog.r
  const left = useMemo(() => halfGeom(r, 0.012, Math.PI), [r])
  const right = useMemo(() => halfGeom(r, 0.012, 0), [r])
  const marker = useRef<Group>(null)
  const apiRef = useRef(api)
  apiRef.current = api
  useFrame(() => {
    const a = apiRef.current
    const d = a.m.decks[i]
    if (marker.current) marker.current.rotation.y = -deckPos(d, a.now()) * Math.PI * 2 * (33.3 / 60)
  })
  // SHIFT と押すとビートグリッドを 5ms ずつずらす
  const doPress = (dir: number) => {
    api.act(shift ? ops.grid(dir) : ops.jog(dir), i)
    if (shift) setShift(false)
  }
  const press = (dir: number) => () => {
    if (drag.busy()) return
    doPress(dir)
  }
  // ---- VR: 円盤をつかんで回す（スクラッチ）。後ろへ勢いよく回して離すとスピンバック（巻き戻し）してから再生 ----
  // 1 回転 = 1.8 秒（33 1/3 回転のレコードと同じ）。SHIFT を押しながらつかむと、回した向きにビートグリッドをずらす
  const SEC_PER_RAD = 1.8 / (Math.PI * 2)
  const g = useRef({ mode: 'none' as 'none' | 'scratch' | 'grid', first: true, prev: 0, acc: 0, p0: 0, gridAcc: 0, samples: [] as { a: number; t: number }[] })
  const spin = useRef<{ v: number; pos: number } | null>(null)
  const shiftRef = useRef(shift)
  shiftRef.current = shift
  // 離す: 最後の位置と「離した」を 1 回の更新で共有する（2 回に分けると順番が入れ替わって押さえたままになることがある）
  const finish = () => {
    const a = apiRef.current
    a.live((mm) => ops.scratchEnd(mm, i, a.now()))
    a.endLive()
  }
  useFrame((_, dt) => {
    const sp = spin.current
    if (!sp) return
    const a = apiRef.current
    sp.v *= Math.exp(-3.2 * dt)
    sp.pos = Math.max(0, sp.pos + sp.v * dt)
    a.live((mm) => ops.scratchMove(sp.pos)(mm, i, a.now()))
    if (Math.abs(sp.v) < 0.35 || sp.pos <= 0) {
      spin.current = null
      finish()
    }
  })
  const centerRef = useRef<Group>(null)
  const hotJog = useTouchTarget(() =>
    centerRef.current && surface.current
      ? {
          obj: centerRef.current,
          radius: r + 0.015,
          grab: {
            surface: surface.current,
            start: () => {
              const st = g.current
              st.first = true
              st.acc = 0
              st.gridAcc = 0
              st.samples = []
              if (spin.current) spin.current = null
              const a = apiRef.current
              st.p0 = deckPos(a.m.decks[i], a.now())
              if (shiftRef.current) st.mode = 'grid'
              else {
                st.mode = 'scratch'
                a.act(ops.scratchStart, i)
              }
            },
            move: (p) => {
              const st = g.current
              const a = apiRef.current
              const dx = p.x - x0
              const dz = p.z - L.jog.z
              const keep = () => {
                // 手が止まっていても、押さえている間は毎フレーム位置と時刻を送る
                if (st.mode !== 'scratch') return
                const pos = Math.max(0, st.p0 + st.acc * SEC_PER_RAD)
                a.live((mm) => ops.scratchMove(pos)(mm, i, a.now()))
              }
              // 真ん中のあたりでは角度が安定しないので使わない
              if (dx * dx + dz * dz < 0.012 * 0.012) return keep()
              const ang = Math.atan2(dz, dx)
              if (st.first) {
                st.first = false
                st.prev = ang
                return keep()
              }
              let d = ang - st.prev
              if (d > Math.PI) d -= Math.PI * 2
              if (d < -Math.PI) d += Math.PI * 2
              st.prev = ang
              st.acc += d
              const t = performance.now()
              st.samples.push({ a: st.acc, t })
              while (st.samples.length > 2 && t - st.samples[0].t > 120) st.samples.shift()
              if (st.mode === 'grid') {
                st.gridAcc += d
                while (Math.abs(st.gridAcc) > 0.18) {
                  const dir = st.gridAcc > 0 ? 1 : -1
                  st.gridAcc -= dir * 0.18
                  a.act(ops.grid(dir), i)
                }
                return
              }
              const pos = Math.max(0, st.p0 + st.acc * SEC_PER_RAD)
              a.live((mm) => ops.scratchMove(pos)(mm, i, a.now()))
            },
            end: () => {
              const st = g.current
              if (st.mode === 'grid') {
                setShift(false)
                st.mode = 'none'
                return
              }
              st.mode = 'none'
              // 離す直前の回す速さ（曲の秒 / 秒）
              const sm = st.samples
              const v = sm.length >= 2 ? ((sm[sm.length - 1].a - sm[0].a) / Math.max(0.016, (sm[sm.length - 1].t - sm[0].t) / 1000)) * SEC_PER_RAD : 0
              if (v < -1.2) spin.current = { v: Math.max(-8, v), pos: Math.max(0, st.p0 + st.acc * SEC_PER_RAD) }
              else finish()
            },
          },
        }
      : null
  )
  return (
    <group position={[x0, TOP, L.jog.z]}>
      <Clickable label={shift ? 'ビートグリッドを 5ms 前へ' : 'ジョグ: 戻す（再生中は少し遅らせる）'} onClick={press(-1)}>
        <mesh geometry={left} position={[0, 0.006, 0]}>
          <meshStandardMaterial color="#26262a" roughness={0.35} metalness={0.4} />
        </mesh>
      </Clickable>
      <Clickable label={shift ? 'ビートグリッドを 5ms 後ろへ' : 'ジョグ: 進める（再生中は少し早める）'} onClick={press(1)}>
        <mesh geometry={right} position={[0, 0.006, 0]}>
          <meshStandardMaterial color="#26262a" roughness={0.35} metalness={0.4} />
        </mesh>
      </Clickable>
      <mesh position={[0, 0.0125, 0]}>
        <cylinderGeometry args={[r * 0.55, r * 0.55, 0.001, 32]} />
        <meshBasicMaterial color="#0e0e10" toneMapped={false} />
      </mesh>
      <group ref={marker} position={[0, 0.0132, 0]}>
        <mesh position={[0, 0, -r * 0.4]}>
          <boxGeometry args={[0.004, 0.001, r * 0.28]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      </group>
      <group ref={centerRef} position={[0, 0.012, 0]} />
      {hotJog > 0 && (
        <mesh position={[0, 0.0135, 0]} material={hotMat(hotJog)}>
          <cylinderGeometry args={[r + 0.004, r + 0.004, 0.0015, 48]} />
        </mesh>
      )}
      <mesh position={[0, 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r + 0.002, r + 0.006, 48]} />
        <meshBasicMaterial color={i === 0 ? '#2fa8ff' : '#ff4f8b'} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---------- レベルメーター（各自の手元の音から） ----------
const Meter: React.FC<{ i: 0 | 1; engine: DjEngine | null }> = ({ i, engine }) => {
  const n = 10
  const mats = useMemo(() => Array.from({ length: n }, () => new MeshBasicMaterial({ color: '#101012', toneMapped: false })), [])
  const on = useMemo(() => Array.from({ length: n }, (_, k) => new Color(k >= 8 ? '#ff2d2d' : k >= 6 ? '#ffb000' : '#33ff66')), [])
  const off = useMemo(() => new Color('#101012'), [])
  useFrame(() => {
    const lv = engine ? engine.decks[i].level() : 0
    const dbv = 20 * Math.log10(lv + 1e-6)
    // -36dB〜0dB を 10 段に
    const lit = Math.max(0, Math.min(n, Math.round(((dbv + 36) / 36) * n)))
    mats.forEach((m, k) => m.color.copy(k < lit ? on[k] : off))
  })
  const mx = L.mixer
  const x = (i === 0 ? -1 : 1) * mx.meterX
  return (
    <group>
      {mats.map((m, k) => (
        <mesh key={k} material={m} position={[x, TOP + 0.0008, mx.meterZ1 - (k * (mx.meterZ1 - mx.meterZ0)) / (n - 1)]}>
          <boxGeometry args={[0.009, 0.0016, 0.007]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------- 1 台分のデッキ ----------
const Deck: React.FC<{ i: 0 | 1; api: ControllerApi; surface: React.RefObject<Group | null>; shift: boolean; setShift: (v: boolean) => void }> = ({ i, api, surface, shift, setShift }) => {
  const d: DeckState = api.m.decks[i]
  const x0 = deckX(i)
  const now = api.now()
  const pos = deckPos(d, now)
  const loopOn = !!d.loop?.on
  const blink = Math.floor(now / 400) % 2 === 0
  const act = (op: DeckOp) => () => {
    api.act(op, i)
    if (shift) setShift(false)
  }
  const pad = (k: number) => {
    switch (d.padMode) {
      case 'hotcue':
        return { color: d.hot[k] !== null ? PAD_HUES[k] : '#3a1820', label: d.hot[k] !== null ? (shift ? `ホットキュー ${k + 1} を消す` : `ホットキュー ${k + 1} へ`) : `ホットキュー ${k + 1} を登録`, op: ops.hotCue(k, shift) }
      case 'beatloop': {
        const len = BEAT_LOOPS[k] * (60 / (TRACKS[d.track ?? 0]?.bpm || 120))
        const active = loopOn && d.loop!.out !== null && Math.abs(d.loop!.out - d.loop!.in - len) < 1e-3
        return { color: active ? '#ffd27a' : '#5a3a00', label: `${BEAT_LOOPS[k]} 拍のループ`, op: ops.beatLoop(BEAT_LOOPS[k]) }
      }
      case 'beatjump':
        return { color: '#3a2a80', label: `${BEAT_JUMPS[k] > 0 ? '+' : ''}${BEAT_JUMPS[k]} 拍ジャンプ`, op: ops.beatJump(BEAT_JUMPS[k]) }
      case 'roll': {
        const r = ROLLS[k]
        const name = r < 1 ? `1/${Math.round(1 / r)}` : `${r}`
        return { color: d.roll === r ? '#9ff0ff' : '#004a66', label: d.roll === r ? 'ROLL を止める（元の位置へ戻る）' : `${name} 拍の ROLL`, op: ops.roll(r) }
      }
      case 'keyboard':
        return { color: d.keyShift === KEYBOARD_SEMIS[k] ? '#ffc4f0' : '#5a1f4a', label: `KEYBOARD: ホットキュー A を ${KEYBOARD_SEMIS[k] > 0 ? '+' : ''}${KEYBOARD_SEMIS[k]} 半音で鳴らす`, op: ops.keyboard(KEYBOARD_SEMIS[k]) }
      case 'keyshift':
        return { color: d.keyShift === KEYSHIFT_SEMIS[k] ? '#e6ccff' : '#3a2050', label: `KEY SHIFT: ${KEYSHIFT_SEMIS[k] > 0 ? '+' : ''}${KEYSHIFT_SEMIS[k]} 半音`, op: ops.keySet(KEYSHIFT_SEMIS[k]) }
      default:
        return {
          color: '#1f6b45',
          label: `サンプラー: ${SAMPLE_NAMES[k]}`,
          op: ((m: MixState, _i: 0 | 1, t: number) => ({ ...m, sampler: { n: m.sampler.n + 1, k, t } })) as DeckOp,
        }
    }
  }
  const sideX = (dx: number) => x0 + dx
  // 2 曲のキーが合っている（同じキーか平行調）
  const ka = effectiveKey(d)
  const kb = effectiveKey(api.m.decks[i === 0 ? 1 : 0])
  const keyMatched = !!ka && !!kb && camelot(ka).slice(0, -1) === camelot(kb).slice(0, -1)
  return (
    <group>
      {/* ループ */}
      <Button id={`dj-${i}-loopin`} x={sideX(L.loopX[0])} z={L.loopRowZ} lit={!!d.loop && !d.loop.on && d.loop.out === null} litColor="#ffa000" label={shift ? '4 拍のループ' : 'ループの始まり'} onPress={act(shift ? ops.beatLoop(4) : ops.loopIn)} />
      <Button id={`dj-${i}-loopout`} x={sideX(L.loopX[1])} z={L.loopRowZ} lit={loopOn} litColor="#ffa000" label="ループの終わり" onPress={act(ops.loopOut)} />
      <Button id={`dj-${i}-reloop`} x={sideX(L.loopX[2])} z={L.loopRowZ} lit={loopOn} litColor="#ffa000" label={loopOn ? 'ループを抜ける' : 'ループに戻る'} onPress={act(ops.reloop)} />
      <Button id={`dj-${i}-loophalf`} x={sideX(L.loopX[3])} z={L.loopRowZ} label={shift ? 'ループを前へ動かす' : 'ループを半分に'} onPress={act(shift ? ops.loopMove(-1) : ops.loopScale(0.5))} />
      <Button id={`dj-${i}-loopdouble`} x={sideX(L.loopX[4])} z={L.loopRowZ} label={shift ? 'ループを後ろへ動かす' : 'ループを倍に'} onPress={act(shift ? ops.loopMove(1) : ops.loopScale(2))} />
      <Jog i={i} api={api} shift={shift} setShift={setShift} surface={surface} />
      {/* テンポスライダー */}
      <Fader
        id={`dj-${i}-tempo`}
        x={x0 + outer(i) * L.tempo.dx}
        z0={L.tempo.z0}
        z1={L.tempo.z1}
        pos={(Math.max(-1, Math.min(1, d.tempo)) + 1) / 2}
        label={`テンポ ${d.rate >= 1 ? '+' : ''}${((d.rate - 1) * 100).toFixed(1)}%${d.synced ? '（動かすと SYNC を解除）' : ''}`}
        surface={surface}
        onChange={(p) => {
          let v = p * 2 - 1
          if (Math.abs(v) < 0.04) v = 0
          api.live((m) => ops.tempo(v)(m, i, api.now()))
        }}
        onEnd={api.endLive}
      />
      <Button id={`dj-${i}-sync`} x={x0 - outer(i) * L.sync.dx} z={L.sync.z} w={0.03} d={0.016} lit={d.synced} litColor="#2fa8ff" label={shift ? 'テンポを元に戻す（TEMPO RESET）' : d.synced ? 'BEAT SYNC を解除' : 'BEAT SYNC（もう一方に BPM と拍を合わせ続ける）'} onPress={act(shift ? ops.tempoReset : ops.sync)} />
      {/* MASTER TEMPO / KEY ▲▼ / KEY SYNC（SHIFT + KEY SYNC で元のキーに戻す） */}
      <Button id={`dj-${i}-mt`} x={x0 - outer(i) * L.sync.dx} z={L.key.mtZ} w={0.03} d={0.012} lit={d.keyLock} litColor="#ffd400" label={shift ? `テンポの幅を切り替える（いま ±${Math.round(tempoRange(d) * 100)}%）` : d.keyLock ? 'MASTER TEMPO を切る（テンポで高さも変わる）' : 'MASTER TEMPO（テンポを変えても高さを保つ）'} onPress={act(shift ? ops.tempoRange : ops.keyLock)} />
      <Button id={`dj-${i}-keyup`} x={x0 - outer(i) * L.sync.dx} z={L.key.upZ} w={0.03} d={0.012} lit={d.keyShift > 0} litColor="#c88cff" label={`キーを半音上げる（いま ${d.keyShift > 0 ? '+' : ''}${d.keyShift}）`} onPress={act(ops.keyShift(1))} />
      <Button id={`dj-${i}-keydown`} x={x0 - outer(i) * L.sync.dx} z={L.key.downZ} w={0.03} d={0.012} lit={d.keyShift < 0} litColor="#c88cff" label={`キーを半音下げる（いま ${d.keyShift > 0 ? '+' : ''}${d.keyShift}）`} onPress={act(ops.keyShift(-1))} />
      <Button id={`dj-${i}-keysync`} x={x0 - outer(i) * L.sync.dx} z={L.key.syncZ} w={0.03} d={0.014} lit={keyMatched} litColor="#c88cff" label={shift ? 'キーを元に戻す' : 'KEY SYNC（もう一方のキーに合わせる）'} onPress={act(shift ? ops.keyReset : ops.keySync)} />
      {/* SHIFT / CUE / PLAY */}
      <Button id={`dj-${i}-shift`} x={sideX(L.left.dx)} z={L.left.shiftZ} w={0.03} d={0.016} lit={shift} litColor="#ffffff" label="SHIFT（次に押すボタンの別の働き）" onPress={() => setShift(!shift)} />
      <Button
        id={`dj-${i}-cue`}
        x={sideX(L.left.dx)}
        z={L.left.cueZ}
        w={0.032}
        round
        lit={!d.playing ? blink || Math.abs(pos - d.cue) < 0.02 : false}
        litColor="#ff9a1f"
        label={shift ? '曲の頭へ' : d.playing ? 'キューに戻る' : 'キューを登録'}
        onPress={act(shift ? ops.toStart : ops.cue)}
      />
      <Button id={`dj-${i}-play`} x={sideX(L.left.dx)} z={L.left.playZ} w={0.032} round lit={d.playing || blink} litColor="#33ff66" label={shift && d.playing ? 'ゆっくり止める（VINYL BRAKE）' : d.playing ? '一時停止' : '再生'} onPress={act(shift ? ops.brake : ops.play)} />
      {/* パッドのモード */}
      {MODE_PAIRS.map(([a, b, na, nb], k) => (
        <Button
          key={a}
          id={`dj-${i}-mode-${a}`}
          x={sideX(L.padX(k))}
          z={L.modeZ}
          w={0.036}
          d={0.012}
          lit={d.padMode === a || d.padMode === b}
          litColor={MODE_COLORS[d.padMode === b ? b : a]}
          label={shift ? `パッド: ${nb}` : `パッド: ${na}（SHIFT と押すと ${nb}）`}
          onPress={act(ops.padMode(shift ? b : a))}
        />
      ))}
      {/* パッド 8 個 */}
      {Array.from({ length: 8 }, (_, k) => {
        const p = pad(k)
        return <Button key={k} id={`dj-${i}-pad-${k}`} x={sideX(L.padX(k % 4))} z={L.padsZ[Math.floor(k / 4)]} w={L.pad.w} d={L.pad.d} color={p.color} label={p.label} onPress={act(p.op)} />
      })}
    </group>
  )
}

// ---------- 全体 ----------
export const Controller: React.FC<{ api: ControllerApi; position: [number, number, number]; rotationY: number }> = ({ api, position, rotationY }) => {
  const surface = useRef<Group>(null)
  const [shift, setShiftState] = useState<[boolean, boolean]>([false, false])
  const setShift = (i: 0 | 1) => (v: boolean) => setShiftState((s) => (i === 0 ? [v, s[1]] : [s[0], v]))
  const m = api.m
  const face = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = Math.round(W * PX)
    c.height = Math.round(D * PX)
    drawFaceplate(c.getContext('2d')!)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])
  useEffect(() => () => face.dispose(), [face])
  // 点滅を描き直すため、少しずつ再描画する
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((v) => v + 1), 200)
    return () => clearInterval(id)
  }, [])
  const mx = L.mixer
  const knob = (id: string, x: number, z: number, value: number, label: string, set: (m: MixState, v: number) => MixState, detent = true, r?: number) => (
    <Knob id={id} x={x} z={z} r={r} value={value} label={label} surface={surface} detent={detent} onChange={(v) => api.live((mm) => set(mm, v))} onEnd={api.endLive} />
  )
  const deckSet = (i: 0 | 1, key: 'trim' | 'hi' | 'mid' | 'low' | 'cfx') => (mm: MixState, v: number) => ops.set(key, v)(mm, i, 0)
  const fx = m.fx
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group ref={surface}>
        {/* 本体と天板 */}
        <mesh position={[0, BODY_H / 2, 0]}>
          <boxGeometry args={[W, BODY_H, D]} />
          <meshStandardMaterial color="#141416" roughness={0.7} />
        </mesh>
        <mesh position={[0, TOP + 0.0004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[W, D]} />
          <meshBasicMaterial map={face} toneMapped={false} />
        </mesh>
        <Deck i={0} api={api} surface={surface} shift={shift[0]} setShift={setShift(0)} />
        <Deck i={1} api={api} surface={surface} shift={shift[1]} setShift={setShift(1)} />
        {/* ミキサー */}
        <Knob
          id="dj-browse"
          x={0}
          z={mx.loadZ}
          r={0.014}
          value={(m.browse + 0.5) / TRACKS.length}
          label={`曲を選ぶ: ${TRACKS[browseList(m)[Math.min(m.browse, TRACKS.length - 1)]]?.title}`}
          surface={surface}
          detent={false}
          onChange={(v) => api.live((mm) => ({ ...mm, browse: Math.min(TRACKS.length - 1, Math.floor(v * TRACKS.length)) }))}
          onEnd={api.endLive}
        />
        {knob('dj-master', 0, mx.trimZ, m.master, 'MASTER（全体の音量）', (mm, v) => ({ ...mm, master: v }), false)}
        {([0, 1] as const).map((i) => {
          const s = i === 0 ? -1 : 1
          const d = m.decks[i]
          return (
            <group key={i}>
              {knob(`dj-${i}-trim`, s * mx.knobX, mx.trimZ, d.trim, `TRIM ${i + 1}`, deckSet(i, 'trim'))}
              {knob(`dj-${i}-hi`, s * mx.knobX, mx.eqZ[0], d.hi, `HI ${i + 1}`, deckSet(i, 'hi'))}
              {knob(`dj-${i}-mid`, s * mx.knobX, mx.eqZ[1], d.mid, `MID ${i + 1}`, deckSet(i, 'mid'))}
              {knob(`dj-${i}-low`, s * mx.knobX, mx.eqZ[2], d.low, `LOW ${i + 1}`, deckSet(i, 'low'))}
              {knob(`dj-${i}-cfx`, s * mx.knobX, mx.cfxZ, d.cfx, `CFX ${i + 1}（左: こもらせる・右: 低音を削る）`, deckSet(i, 'cfx'))}
              <Meter i={i} engine={api.engine} />
              <Fader
                id={`dj-${i}-fader`}
                x={s * mx.knobX}
                z0={mx.faderZ0}
                z1={mx.faderZ1}
                pos={1 - d.fader}
                label={`チャンネル ${i + 1} の音量`}
                surface={surface}
                onChange={(p) => api.live((mm) => ops.set('fader', 1 - p)(mm, i, 0))}
                onEnd={api.endLive}
              />
            </group>
          )
        })}
        <Fader id="dj-xfader" x={mx.xfZ} z0={-mx.xfX} z1={mx.xfX} pos={m.xfader} horizontal label="クロスフェーダー" surface={surface} onChange={(p) => api.live((mm) => ({ ...mm, xfader: p }))} onEnd={api.endLive} capColor="#f0f0f4" />
        {/* BEAT FX */}
        <Button id="dj-fx-beatl" x={L.fx.beatL} z={L.fxRowZ} w={0.026} d={0.014} label={`FX の長さを短く（いま ${FX_BEATS[fx.beat]} 拍）`} onPress={() => api.actMix((mm) => ({ ...mm, fx: { ...mm.fx, beat: Math.max(0, mm.fx.beat - 1) } }))} />
        <Button id="dj-fx-beatr" x={L.fx.beatR} z={L.fxRowZ} w={0.026} d={0.014} label={`FX の長さを長く（いま ${FX_BEATS[fx.beat]} 拍）`} onPress={() => api.actMix((mm) => ({ ...mm, fx: { ...mm.fx, beat: Math.min(FX_BEATS.length - 1, mm.fx.beat + 1) } }))} />
        <Button id="dj-fx-select" x={L.fx.select} z={L.fxRowZ} w={0.03} d={0.014} label={`エフェクト: ${FX_TYPES[fx.type]}（押して切り替え）`} onPress={() => api.actMix((mm) => ({ ...mm, fx: { ...mm.fx, type: (mm.fx.type + 1) % FX_TYPES.length } }))} />
        <Button id="dj-fx-ch" x={L.fx.ch} z={L.fxRowZ} w={0.03} d={0.014} label={`かける所: ${['CH 1', 'CH 2', 'MASTER'][fx.ch]}（押して切り替え）`} onPress={() => api.actMix((mm) => ({ ...mm, fx: { ...mm.fx, ch: ((mm.fx.ch + 1) % 3) as 0 | 1 | 2 } }))} />
        {knob('dj-fx-level', L.fx.level, L.fxRowZ, fx.level, 'FX LEVEL/DEPTH', (mm, v) => ({ ...mm, fx: { ...mm.fx, level: v } }), false)}
        <Button id="dj-fx-on" x={L.fx.on} z={L.fxRowZ} w={0.03} d={0.016} lit={fx.on} litColor="#ff3b5c" label={fx.on ? 'FX を止める' : 'FX をかける'} onPress={() => api.actMix((mm) => ({ ...mm, fx: { ...mm.fx, on: !mm.fx.on } }))} />
      </group>
    </group>
  )
}
