// 入力（キー・VR のボタン）から UI を開くための合図
import { create } from 'zustand'

export type MenuPage = 'debug' | 'main' | 'friends' | 'avatars' | 'expressions' | 'poses' | 'worlds' | 'tools' | 'instance' | 'settings' | 'notifications' | 'chat' | 'user'

interface MenuStore {
  open: boolean
  page: MenuPage
  userId: string | null
  muted: boolean
  ptt: boolean
  setOpen: (open: boolean, page?: MenuPage) => void
  setPage: (page: MenuPage, userId?: string | null) => void
  setMuted: (m: boolean) => void
}

export const useMenu = create<MenuStore>((set) => ({
  open: false,
  page: 'main',
  userId: null,
  muted: false,
  ptt: false,
  setOpen: (open, page) => set({ open, page: page ?? 'main' }),
  setPage: (page, userId = null) => set({ page, userId, open: true }),
  setMuted: (muted) => set({ muted }),
}))

type GestureHandler = (n: number) => void
let gestureHandler: GestureHandler = () => {}
let muteHandler: () => void = () => {}
let pttHandler: (down: boolean) => void = () => {}

export const menuBus = {
  toggle: () => {
    const m = useMenu.getState()
    m.setOpen(!m.open)
    if (!m.open && document.pointerLockElement) document.exitPointerLock()
  },
  openChat: () => {
    useMenu.getState().setPage('chat')
    if (document.pointerLockElement) document.exitPointerLock()
  },
  toggleMute: () => muteHandler(),
  setPtt: (down: boolean) => {
    if (useMenu.getState().ptt !== down) {
      useMenu.setState({ ptt: down })
      pttHandler(down)
    }
  },
  gesture: (n: number) => gestureHandler(n),
  bind: (h: { gesture: GestureHandler; mute: () => void; ptt: (down: boolean) => void }) => {
    gestureHandler = h.gesture
    muteHandler = h.mute
    pttHandler = h.ptt
  },
}

// 開発時だけ: 自動の確かめ（VR のメニューのタブ切り替えなど）から操作できるようにする
if (import.meta.env.DEV) (window as unknown as { __ttvMenu?: typeof useMenu }).__ttvMenu = useMenu
