// この端末の設定（ブラウザに保存）。アカウントの設定は親サーバー側（MeInfo.settings）
import { create } from 'zustand'

export interface DeviceSettings {
  // ---- 移動・快適性（[16][200]） ----
  turnMode: 'snap' | 'smooth'
  snapAngle: number
  smoothTurnSpeed: number
  /** 移動中に視界の端を暗くする（VR 酔い対策） */
  vignette: number
  moveSpeed: number
  runMultiplier: number
  /** VR の移動方向: 頭の向き・左手の向き */
  moveDirection: 'head' | 'hand'
  dominantHand: 'left' | 'right'
  portalMode: 'manual' | 'front'
  portalPrompt: boolean
  /** 座ったまま遊ぶ（[11]）。視点を立っている高さに補正する */
  seatedMode: boolean
  /** 本人の身長（m）。VR の視点の高さとアバターの大きさ合わせに使う（[17][24]） */
  playerHeight: number
  /** PC の視点の高さを手で変える（0 で自動） */
  desktopEyeOffset: number
  invertY: boolean
  mouseSensitivity: number
  fov: number
  thirdPerson: boolean
  // ---- 表示（[198]） ----
  quality: 'low' | 'medium' | 'high' | 'ultra'
  renderScale: number
  shadows: boolean
  drawDistance: number
  maxAvatars: number
  /** アバターを表示する距離 */
  avatarCullDistance: number
  showNameplates: boolean
  showChatBubbles: boolean
  showFps: boolean
  /** 他人のアバターを安全のため標準の姿にする（[168] の一括版） */
  hideAllAvatars: boolean
  // ---- 音（[57][58][64][199]） ----
  micDeviceId: string
  outputDeviceId: string
  pushToTalk: boolean
  /** 入室時にミュート */
  startMuted: boolean
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGain: boolean
  micGain: number
  masterVolume: number
  voiceVolume: number
  worldVolume: number
  uiVolume: number
  /** 声の聞こえる距離 */
  voiceRange: number
  // ---- アバター ----
  avatarScale: number
  /** 寝転んだら自動で寝るポーズにする（[205]） */
  autoSleep: boolean
  /** OSC で表情を受け取る（フェイス・アイトラッキング） */
  oscFace: boolean
  /** OSC を受ける UDP のポート（Windows 版） */
  oscPort: number
  // ---- 通信・プライバシー（17.5） ----
  /** IP アドレスを相手に知られないよう、常に中継を使う */
  relayOnly: boolean
  /** ホストを引き受けない（バッテリー・回線が弱い端末） */
  refuseHost: boolean
  /** ワールドが許可していないドメインの動画・画像も、確認のうえで読み込む */
  allowUntrustedMedia: boolean
  // ---- そのほか ----
  language: 'ja' | 'en'
  hapticsStrength: number
}

const isMobile = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))

export const defaultSettings = (): DeviceSettings => {
  const mobile = isMobile()
  return {
    turnMode: 'snap',
    snapAngle: 30,
    smoothTurnSpeed: 120,
    vignette: 0.4,
    moveSpeed: 2.2,
    runMultiplier: 1.9,
    moveDirection: 'head',
    dominantHand: 'right',
    portalMode: 'manual',
    portalPrompt: true,
    seatedMode: false,
    playerHeight: 1.65,
    desktopEyeOffset: 0,
    invertY: false,
    mouseSensitivity: 1,
    fov: 75,
    thirdPerson: false,
    quality: mobile ? 'low' : 'high',
    renderScale: 1,
    shadows: !mobile,
    drawDistance: 500,
    maxAvatars: mobile ? 12 : 40,
    avatarCullDistance: mobile ? 25 : 60,
    showNameplates: true,
    showChatBubbles: true,
    showFps: false,
    hideAllAvatars: false,
    micDeviceId: '',
    outputDeviceId: '',
    pushToTalk: false,
    startMuted: false,
    noiseSuppression: true,
    echoCancellation: true,
    autoGain: true,
    micGain: 1,
    masterVolume: 1,
    voiceVolume: 1,
    worldVolume: 0.8,
    uiVolume: 0.6,
    voiceRange: 25,
    avatarScale: 1,
    autoSleep: true,
    oscFace: false,
    oscPort: 9000,
    relayOnly: false,
    refuseHost: mobile,
    allowUntrustedMedia: false,
    language: navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en',
    hapticsStrength: 0.6,
  }
}

const KEY = 'ttv.settings.v1'
const load = (): DeviceSettings => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) }
  } catch {
    // 壊れていたら既定値
  }
  return defaultSettings()
}

interface SettingsStore {
  s: DeviceSettings
  set: (p: Partial<DeviceSettings>) => void
  reset: () => void
}

export const useSettings = create<SettingsStore>((set, get) => ({
  s: load(),
  set: (p) => {
    const s = { ...get().s, ...p }
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // 保存できなくても今回は反映する
    }
    set({ s })
  },
  reset: () => {
    const s = defaultSettings()
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // 同上
    }
    set({ s })
  },
}))

/** React の外から今の設定を読む */
export const settings = () => useSettings.getState().s

export const qualityProfile = (q: DeviceSettings['quality']) =>
  ({
    low: { dpr: 0.75, shadowMap: 512, antialias: false, mirrorScale: 0.4 },
    medium: { dpr: 1, shadowMap: 1024, antialias: true, mirrorScale: 0.6 },
    high: { dpr: Math.min(window.devicePixelRatio, 1.5), shadowMap: 2048, antialias: true, mirrorScale: 0.8 },
    ultra: { dpr: Math.min(window.devicePixelRatio, 2), shadowMap: 4096, antialias: true, mirrorScale: 1 },
  })[q]

export const isMobileDevice = isMobile
