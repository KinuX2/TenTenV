// メニューの操作（画面の UI と VR の 3D メニューで共通）
import { SleepPose, type AvatarRef, type HandGesture } from '@tentenv/protocol'
import { L } from '../i18n'
import { app, toast, useApp } from '../state/app'
import { useModeration } from '../state/moderation'
import { settings, useSettings } from '../state/settings'
import type { WorldEngine } from '../world/engine'
import { useMenu } from './menuBus'
import { outfitTokens, useAvatarExt, withOutfits } from '../state/avatarExt'
import { useTools } from '../features/tools'

import { activeEngine } from '../state/activeEngine'
export { activeEngine, setActiveEngine } from '../state/activeEngine'

/** アバターの指定に、設定のアバターの大きさを入れる */
export const withScale = (a: AvatarRef): AvatarRef => ({ ...a, scale: settings().avatarScale })

export const GESTURES: { id: HandGesture; ja: string; en: string }[] = [
  { id: 'neutral', ja: 'ふつう', en: 'Neutral' },
  { id: 'fist', ja: 'グー', en: 'Fist' },
  { id: 'open', ja: 'パー', en: 'Open' },
  { id: 'point', ja: '指差し', en: 'Point' },
  { id: 'victory', ja: 'チョキ', en: 'Victory' },
  { id: 'rocknroll', ja: 'ロック', en: 'Rock' },
  { id: 'gun', ja: 'ピストル', en: 'Gun' },
  { id: 'thumbsup', ja: 'いいね', en: 'Thumbs up' },
]

export const EXPRESSIONS: { id: string | null; ja: string; en: string }[] = [
  { id: null, ja: '手の形に合わせる', en: 'Follow hands' },
  { id: 'happy', ja: '笑顔', en: 'Happy' },
  { id: 'angry', ja: '怒り', en: 'Angry' },
  { id: 'sad', ja: '悲しい', en: 'Sad' },
  { id: 'relaxed', ja: 'リラックス', en: 'Relaxed' },
  { id: 'surprised', ja: '驚き', en: 'Surprised' },
  { id: 'blink', ja: '目を閉じる', en: 'Eyes closed' },
]

export const SLEEP_POSES: { id: SleepPose; ja: string; en: string }[] = [
  { id: SleepPose.None, ja: '起きる', en: 'Stand up' },
  { id: SleepPose.Supine, ja: '仰向け', en: 'On back' },
  { id: SleepPose.Prone, ja: 'うつ伏せ', en: 'On stomach' },
  { id: SleepPose.Left, ja: '左向き', en: 'Left side' },
  { id: SleepPose.Right, ja: '右向き', en: 'Right side' },
  { id: SleepPose.Relax, ja: 'くつろぐ', en: 'Relax' },
]

export const actions = {
  toggleMute: () => {
    const e = activeEngine()
    if (!e) return
    e.voice.setMuted(!e.voice.muted)
    useMenu.getState().setMuted(e.voice.muted)
  },
  setPtt: (down: boolean) => activeEngine()?.voice.setPtt(down),
  respawn: () => activeEngine()?.runtime.respawn(),
  /** 手の形（PC・スマホ）。side: 'left' | 'right' | 'both' */
  setGesture: (g: HandGesture | null, side: 'left' | 'right' | 'both' = 'both') => {
    const p = activeEngine()?.player
    if (!p) return
    const v = g === 'neutral' ? null : g
    if (side !== 'right') p.manualGesture[0] = v
    if (side !== 'left') p.manualGesture[1] = v
  },
  setExpression: (name: string | null) => {
    const cur = activeEngine()
    if (cur) cur.player.manualExpression = name
  },
  setSleep: (pose: SleepPose) => {
    const p = activeEngine()?.player
    if (!p) return
    if (p.sitting) activeEngine()!.stand()
    p.sleep = pose
    p.autoSleep = false
    p.crouch = p.prone = false
  },
  tool: (p: Parameters<ReturnType<typeof useTools.getState>['set']>[0]) => useTools.getState().set(p),
  chat: (text: string) => activeEngine()?.session.sendChat(text),
  /** アバターの変更（インスタンスの中なら全員へ伝える） */
  setAvatar: (a0: AvatarRef) => {
    // 大きさは設定の値を使い、ほかの人にも同じ大きさで見えるようにする
    const a = withScale(a0)
    useApp.getState().setAvatar(a)
    const current = activeEngine()
    if (current) {
      current.avatarRef = a
      current.session.setAvatar(a)
      window.dispatchEvent(new Event('ttv-avatar-changed'))
    }
  },
  /** アバターのアクションメニュー（[39]）: 衣装・トグル・表情・エモート */
  avatarAction: (id: string) => {
    const st = useAvatarExt.getState()
    const ext = st.ext
    if (!ext) return
    const action = ext.actions?.find((x) => x.id === id)
    if (action?.kind === 'expression') {
      const p = activeEngine()?.player
      if (p) p.manualExpression = p.manualExpression === action.target ? null : action.target
      return
    }
    if (action?.kind === 'emote') {
      const p = activeEngine()?.player
      if (!p) return
      p.manualExpression = action.target
      setTimeout(() => p.manualExpression === action.target && (p.manualExpression = null), 3000)
      return
    }
    st.toggle(id)
    const tokens = outfitTokens(ext, useAvatarExt.getState().active)
    actions.setAvatar(withOutfits(useApp.getState().avatar, tokens))
  },
  muteUser: (userId: string) => useModeration.getState().toggleMute(userId),
  setUserVolume: (userId: string, peerId: string, v: number) => {
    useModeration.getState().setVolume(userId, v)
    activeEngine()?.voice.setUserGain(peerId, v)
  },
  hideAvatar: (userId: string, hidden: boolean) => useModeration.getState().setHidden(userId, hidden),
  showAvatar: (userId: string, shown: boolean) => useModeration.getState().setShown(userId, shown),
  block: async (userId: string) => {
    const api = app().api
    if (!api) return
    try {
      await api.block(userId)
      const list = await api.blocks()
      useModeration.getState().setBlocked(list.map((u) => u.id))
      toast(L('ブロックしました。お互いに見えなくなり、声も聞こえなくなります', 'Blocked. You will no longer see or hear each other.'))
    } catch (e) {
      toast(String((e as Error).message), 'error')
    }
  },
  kick: (peerId: string, reason = '') => {
    const current = activeEngine()
    if (!current) return
    // 親サーバーへ頼む（作成者・モデレーターだけが通る）
    window.dispatchEvent(new CustomEvent('ttv-kick', { detail: { peerId, reason } }))
  },
  /** 身長合わせ（[24]）: VR で今の目の高さを自分の身長として使う */
  calibrateHeight: () => {
    const p = activeEngine()?.player
    if (!p || !p.vr) {
      toast(L('VR で使えます', 'Available in VR'))
      return
    }
    const realEye = (window as unknown as { __ttvRealEye?: number }).__ttvRealEye
    if (realEye && realEye > 0.8) {
      useSettings.getState().set({ playerHeight: Math.round((realEye / 0.935) * 100) / 100 })
      toast(L(`身長を ${Math.round(realEye / 0.935 * 100)} cm にしました`, `Height set to ${Math.round((realEye / 0.935) * 100)} cm`))
    }
  },
  leave: () => useApp.getState().setScreen({ kind: 'home' }),
  goHome: () => {
    const home = app().me?.homeWorldId ?? app().info?.defaultHomeWorldId
    if (home) window.dispatchEvent(new CustomEvent('ttv-go-world', { detail: { worldId: home } }))
    else useApp.getState().setScreen({ kind: 'home' })
  },
  settings,
}
