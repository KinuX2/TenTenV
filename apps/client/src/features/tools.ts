// プラットフォームの道具（鏡）の状態
import { create } from 'zustand'

interface ToolStore {
  mirror: boolean
  faceMirror: boolean
  /** PC・スマホでの表示サイズ */
  faceMirrorSize: number
  faceMirrorVrSize: number
  faceMirrorDesktopAnchor: 'center' | 'leftTop' | 'rightTop' | 'leftBottom' | 'rightBottom'
  faceMirrorAnchor: 'center' | 'leftTop' | 'rightTop' | 'leftBottom' | 'rightBottom'
  faceMirrorOpacity: number
  faceMirrorDesktopX: number
  faceMirrorDesktopY: number
  faceMirrorVrX: number
  faceMirrorVrY: number
  faceMirrorCaptureScale: number
  faceMirrorCaptureY: number
  set: (p: Partial<Omit<ToolStore, 'set'>>) => void
}

const mirrorDefaults = {
  faceMirror: true,
  faceMirrorSize: 0.22,
  faceMirrorVrSize: 0.18,
  faceMirrorDesktopAnchor: 'rightBottom' as ToolStore['faceMirrorDesktopAnchor'],
  faceMirrorAnchor: 'center' as ToolStore['faceMirrorAnchor'],
  faceMirrorOpacity: 0.8,
  faceMirrorDesktopX: 0,
  faceMirrorDesktopY: 0,
  faceMirrorVrX: -0.3,
  faceMirrorVrY: 0.5,
  faceMirrorCaptureScale: 1,
  faceMirrorCaptureY: 0,
}
const mirrorKey = 'ttv.faceMirror.v2'
const mirrorRanges: Record<string, [number, number]> = {
  faceMirrorSize: [0.08, 0.5], faceMirrorVrSize: [0.08, 0.5], faceMirrorOpacity: [0.1, 1],
  faceMirrorDesktopX: [-1, 1], faceMirrorDesktopY: [-1, 1], faceMirrorVrX: [-1, 1], faceMirrorVrY: [-1, 1],
  faceMirrorCaptureScale: [0.6, 1.8], faceMirrorCaptureY: [-0.2, 0.2],
}
const mirrorSettings = (): typeof mirrorDefaults => {
  try {
    const current = localStorage.getItem(mirrorKey)
    const old = current === null ? localStorage.getItem('ttv.faceMirror.v1') : null
    const raw = JSON.parse(current ?? old ?? 'null')
    if (!raw || typeof raw !== 'object') return mirrorDefaults
    const out = { ...mirrorDefaults }
    for (const key of Object.keys(mirrorDefaults) as (keyof typeof mirrorDefaults)[]) {
      const value = raw[key]
      if (key === 'faceMirror') {
        if (typeof value === 'boolean') out.faceMirror = value
      } else if (key === 'faceMirrorAnchor' || key === 'faceMirrorDesktopAnchor') {
        if (['center', 'leftTop', 'rightTop', 'leftBottom', 'rightBottom'].includes(value)) out[key] = value
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        if (old !== null && value === 0 && (key === 'faceMirrorVrX' || key === 'faceMirrorVrY')) continue
        const [min, max] = mirrorRanges[key];
        (out as Record<string, string | number | boolean>)[key] = Math.min(max, Math.max(min, value))
      }
    }
    if (out.faceMirrorDesktopAnchor === 'rightBottom') {
      // 旧設定の画面中央基準の補正値が残っていても、右下から外側へ押し出さない。
      out.faceMirrorDesktopX = Math.min(0, out.faceMirrorDesktopX)
      out.faceMirrorDesktopY = Math.max(0, out.faceMirrorDesktopY)
    }
    if (old !== null || JSON.stringify(raw) !== JSON.stringify(out)) localStorage.setItem(mirrorKey, JSON.stringify(out))
    return out
  } catch { return mirrorDefaults }
}

export const useTools = create<ToolStore>((set) => ({
  mirror: false,
  ...mirrorSettings(),
  set: (p) => set(p),
}))

useTools.subscribe((s, prev) => {
  if ((Object.keys(mirrorDefaults) as (keyof typeof mirrorDefaults)[]).every((key) => s[key] === prev[key])) return
  try {
    localStorage.setItem(mirrorKey, JSON.stringify(Object.fromEntries((Object.keys(mirrorDefaults) as (keyof typeof mirrorDefaults)[]).map((key) => [key, s[key]]))))
  } catch { /* 保存できない環境では現在のセッションだけ反映する */ }
})

// 開発時だけ: 自動の確かめ（メニューは 3D の板なので、ボタンの代わりにここから切り替える）
if (import.meta.env.DEV) (window as unknown as { __ttvTools?: typeof useTools }).__ttvTools = useTools
