// プラットフォームの道具（鏡）の状態
import { create } from 'zustand'

interface ToolStore {
  mirror: boolean
  mirrorWorld: boolean
  faceMirror: boolean
  /** フェイスミラーの大きさ（1 が標準） */
  faceMirrorSize: number
  set: (p: Partial<Omit<ToolStore, 'set'>>) => void
}

export const useTools = create<ToolStore>((set) => ({
  mirror: false,
  mirrorWorld: true,
  faceMirror: false,
  faceMirrorSize: 1,
  set: (p) => set(p),
}))

// 開発時だけ: 自動の確かめ（メニューは 3D の板なので、ボタンの代わりにここから切り替える）
if (import.meta.env.DEV) (window as unknown as { __ttvTools?: typeof useTools }).__ttvTools = useTools
