// VR のコントローラー・手の入力（LocalPlayer が毎フレーム書き、操作の処理が読む）
import { Quaternion, Vector3 } from 'three'

export interface HandInput {
  connected: boolean
  handTracking: boolean
  trigger: number
  triggerHeld: boolean
  triggerDown: boolean
  triggerUp: boolean
  squeeze: number
  squeezeDown: boolean
  squeezeUp: boolean
  /** A/X */
  primaryDown: boolean
  /** B/Y */
  secondaryDown: boolean
  stickDown: boolean
  stick: { x: number; y: number }
  /** レイの出どころと向き（ワールド） */
  rayP: Vector3
  rayDir: Vector3
  /** 握っている所（ワールド） */
  gripP: Vector3
  gripQ: Quaternion
  /** 人差し指の先（触る操作） */
  tipP: Vector3
  source: XRInputSource | null
}

const make = (): HandInput => ({
  connected: false,
  handTracking: false,
  trigger: 0,
  triggerHeld: false,
  triggerDown: false,
  triggerUp: false,
  squeeze: 0,
  squeezeDown: false,
  squeezeUp: false,
  primaryDown: false,
  secondaryDown: false,
  stickDown: false,
  stick: { x: 0, y: 0 },
  rayP: new Vector3(),
  rayDir: new Vector3(0, 0, -1),
  gripP: new Vector3(),
  gripQ: new Quaternion(),
  tipP: new Vector3(),
  source: null,
})

export const xrInput = { left: make(), right: make(), active: false }

/**
 * 毎フレーム読む前に戻す。つながっていない手は、前の状態（ハンドトラッキング・握り・振動の宛先）を残さない
 * （手からコントローラーへ持ち替えた・電池が切れたときに、古い値が残らないように）
 */
export const resetHandInputs = () => {
  for (const h of ['left', 'right'] as const) {
    const st = xrInput[h]
    st.connected = false
    st.handTracking = false
    st.source = null
    st.trigger = st.squeeze = 0
    st.triggerHeld = false
    st.triggerDown = st.triggerUp = st.squeezeDown = st.squeezeUp = st.primaryDown = st.secondaryDown = st.stickDown = false
    st.stick.x = st.stick.y = 0
  }
}

if (import.meta.env?.DEV) (window as unknown as { __ttvXRInput?: typeof xrInput }).__ttvXRInput = xrInput

/** 手を振るわせる（触れたとき・つかんだとき） */
export const haptic = (hand: 'left' | 'right', strength = 0.5, ms = 30) => {
  const src = xrInput[hand].source
  const act = src?.gamepad?.hapticActuators?.[0] as unknown as { pulse?: (v: number, d: number) => void } | undefined
  try {
    act?.pulse?.(Math.min(1, strength), ms)
  } catch {
    // 振動に対応していない
  }
}
