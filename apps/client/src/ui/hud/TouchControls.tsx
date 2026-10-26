// スマホの操作（[9]）: 左に仮想スティック、右半分をなぞって視点、タップで押す、右下にボタン
import { useRef } from 'react'
import { L } from '../../i18n'
import { input } from '../../player/input'

export const TouchControls: React.FC = () => {
  const stick = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const stickId = useRef<number | null>(null)
  const look = useRef<{ id: number; x: number; y: number; sx: number; sy: number; t: number } | null>(null)
  const moveStick = (x: number, y: number) => {
    const r = stick.current!.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    let dx = (x - cx) / (r.width / 2)
    let dy = (y - cy) / (r.height / 2)
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      dx /= len
      dy /= len
    }
    input.stick.x = dx
    input.stick.y = -dy
    if (knob.current) knob.current.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`
  }
  const resetStick = () => {
    stickId.current = null
    input.stick.x = input.stick.y = 0
    if (knob.current) knob.current.style.transform = ''
  }
  const btn = (name: string, label: string) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault()
        input.touchButton(name, true)
      }}
      onPointerUp={() => input.touchButton(name, false)}
      onPointerLeave={() => input.touchButton(name, false)}
      onPointerCancel={() => input.touchButton(name, false)}
    >
      {label}
    </button>
  )
  return (
    <>
      <div
        className="touch-look"
        onPointerDown={(e) => {
          if (look.current) return
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const l = look.current
          if (!l || l.id !== e.pointerId) return
          input.touchLookDelta(e.clientX - l.x, e.clientY - l.y)
          l.x = e.clientX
          l.y = e.clientY
        }}
        onPointerUp={(e) => {
          const l = look.current
          if (!l || l.id !== e.pointerId) return
          look.current = null
          // ほとんど動かさずに離したらタップ（その場所を押す）
          if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 10 && performance.now() - l.t < 350) {
            input.touchTap((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
          }
        }}
        onPointerCancel={() => (look.current = null)}
      />
      <div
        className="touch-stick"
        ref={stick}
        onPointerDown={(e) => {
          stickId.current = e.pointerId
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          moveStick(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => stickId.current === e.pointerId && moveStick(e.clientX, e.clientY)}
        onPointerUp={resetStick}
        onPointerCancel={resetStick}
      >
        <div className="knob" ref={knob} />
      </div>
      <div className="touch-btns">
        {btn('use', L('使う', 'Use'))}
        {btn('jump', L('ジャンプ', 'Jump'))}
        {btn('grab', L('つかむ', 'Grab'))}
        {btn('crouch', L('しゃがむ', 'Crouch'))}
      </div>
    </>
  )
}
