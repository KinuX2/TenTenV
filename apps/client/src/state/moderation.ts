// 自分を守る設定（[166][167][168]）。ミュートとアバターの表示はこの端末に、ブロックは親サーバーに保存する
import { create } from 'zustand'

interface ModerationStore {
  muted: Set<string>
  hiddenAvatars: Set<string>
  /** 重さの制限を超えていても表示する相手 */
  shownAvatars: Set<string>
  blocked: Set<string>
  /** 人ごとの音量（userId → 0〜2） */
  volumes: Record<string, number>
  toggleMute: (userId: string) => void
  setHidden: (userId: string, hidden: boolean) => void
  setShown: (userId: string, shown: boolean) => void
  setBlocked: (ids: string[]) => void
  setVolume: (userId: string, v: number) => void
}

const KEY = 'ttv.moderation.v1'
const load = () => {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { muted: new Set<string>(o.muted ?? []), hiddenAvatars: new Set<string>(o.hidden ?? []), shownAvatars: new Set<string>(o.shown ?? []), volumes: (o.volumes ?? {}) as Record<string, number> }
  } catch {
    return { muted: new Set<string>(), hiddenAvatars: new Set<string>(), shownAvatars: new Set<string>(), volumes: {} }
  }
}
const save = (s: Pick<ModerationStore, 'muted' | 'hiddenAvatars' | 'shownAvatars' | 'volumes'>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ muted: [...s.muted], hidden: [...s.hiddenAvatars], shown: [...s.shownAvatars], volumes: s.volumes }))
  } catch {
    // 保存できない環境
  }
}

export const useModeration = create<ModerationStore>((set, get) => ({
  ...load(),
  blocked: new Set(),
  toggleMute: (id) => {
    const muted = new Set(get().muted)
    if (muted.has(id)) muted.delete(id)
    else muted.add(id)
    set({ muted })
    save({ ...get(), muted })
  },
  setHidden: (id, hidden) => {
    const hiddenAvatars = new Set(get().hiddenAvatars)
    const shownAvatars = new Set(get().shownAvatars)
    if (hidden) {
      hiddenAvatars.add(id)
      shownAvatars.delete(id)
    } else hiddenAvatars.delete(id)
    set({ hiddenAvatars, shownAvatars })
    save({ ...get(), hiddenAvatars, shownAvatars })
  },
  setShown: (id, shown) => {
    const shownAvatars = new Set(get().shownAvatars)
    const hiddenAvatars = new Set(get().hiddenAvatars)
    if (shown) {
      shownAvatars.add(id)
      hiddenAvatars.delete(id)
    } else shownAvatars.delete(id)
    set({ shownAvatars, hiddenAvatars })
    save({ ...get(), shownAvatars, hiddenAvatars })
  },
  setBlocked: (ids) => set({ blocked: new Set(ids) }),
  setVolume: (id, v) => {
    const volumes = { ...get().volumes, [id]: v }
    set({ volumes })
    save({ ...get(), volumes })
  },
}))
