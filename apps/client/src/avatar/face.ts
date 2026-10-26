// 表情づくり（[35][37][204]）: 手の形・選んだ表情・まばたき・口の動きを合わせる
// 手の形と選んだ表情は送り手が決めて送る。まばたきと口の動きは受け手がそれぞれ計算する
import type { AvatarExtensions, HandGesture } from '@tentenv/protocol'
import type { AvatarModel } from './types'
import type { VoiceLevel } from '../net/voice'

/** 手の形 → 表情（アバターに割り当てがないときの既定） */
export const DEFAULT_GESTURE_EXPRESSIONS: Record<HandGesture, Record<string, number>> = {
  neutral: {},
  fist: { angry: 0.85 },
  open: { surprised: 0.9 },
  point: { relaxed: 0.8 },
  victory: { happy: 1 },
  rocknroll: { happy: 0.6, aa: 0.5 },
  gun: { blinkLeft: 1, happy: 0.3 },
  thumbsup: { happy: 0.85 },
}

const EMOTIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised']

/**
 * 手の形と割り当てから、送る表情を決める
 * 優先順位: 選んだ表情 > 両手の組み合わせ > 右手 > 左手（同じ表情は大きいほう）
 */
export const gestureExpression = (gesture: [HandGesture, HandGesture], ext: AvatarExtensions | null, manual: string | null): Record<string, number> => {
  if (manual) return { [manual]: 1 }
  const map = { ...DEFAULT_GESTURE_EXPRESSIONS, ...(ext?.gestures ?? {}) } as Record<HandGesture, Record<string, number>>
  const [l, r] = gesture
  const combo = ext?.gestureCombos?.[`${l}+${r}`]
  if (combo) return { ...combo }
  const out: Record<string, number> = {}
  for (const g of [l, r]) for (const [k, v] of Object.entries(map[g] ?? {})) out[k] = Math.max(out[k] ?? 0, v)
  // 感情の表情は 1 つだけにする（右手を優先）
  const emo = Object.keys(out).filter((k) => EMOTIONS.includes(k))
  if (emo.length > 1) {
    const keep = Object.keys(map[r] ?? {}).find((k) => EMOTIONS.includes(k)) ?? emo[0]
    for (const k of emo) if (k !== keep) delete out[k]
  }
  return out
}

/** 1 体分の表情の状態 */
export class FaceDriver {
  private blinkT = 2 + Math.random() * 3
  private blink = 0
  private current: Record<string, number> = {}
  private reaction: { name: string; until: number } | null = null

  constructor(private model: AvatarModel) {}

  /** 触れられたときなどの一瞬の表情 */
  react(name: string, ms = 1200) {
    this.reaction = { name, until: performance.now() + ms }
  }

  update(dt: number, base: Record<string, number>, voice: VoiceLevel) {
    const m = this.model
    const target: Record<string, number> = { ...base }
    if (this.reaction && performance.now() < this.reaction.until) target[this.reaction.name] = Math.max(target[this.reaction.name] ?? 0, 1)
    // まばたき: 表情が目を閉じるものなら止める
    // まぶたの値が送られてきている（フェイストラッキング）ときも、自動のまばたきはしない
    const eyesBusy = (target.happy ?? 0) > 0.5 || (target.relaxed ?? 0) > 0.5 || 'blink' in base || 'blinkLeft' in base || 'blinkRight' in base
    this.blinkT -= dt
    if (this.blinkT <= 0) {
      this.blink = 1
      this.blinkT = 2 + Math.random() * 4.5
    }
    this.blink = Math.max(0, this.blink - dt * 7)
    if (!eyesBusy) target.blink = Math.max(target.blink ?? 0, Math.sin(Math.min(1, this.blink) * Math.PI))
    // 口: 声の大きさと母音。口を使う表情（驚きなど）のときは弱める
    const mouthBusy = (target.surprised ?? 0) > 0.5 ? 0.4 : 1
    for (const [k, v] of Object.entries(voice.visemes)) target[k] = Math.max(target[k] ?? 0, v * mouthBusy)
    // なめらかに変える
    const k = 1 - Math.exp(-dt * 14)
    const names = new Set([...Object.keys(this.current), ...Object.keys(target)])
    for (const n of names) {
      if (!m.expressions.includes(n)) continue
      const isFast = n === 'blink' || ['aa', 'ih', 'ou', 'ee', 'oh'].includes(n)
      const cur = this.current[n] ?? 0
      const t = target[n] ?? 0
      const next = isFast ? t : cur + (t - cur) * k
      this.current[n] = next
      m.setExpression(n, next)
    }
  }
}
