// 接続中の親サーバー・ログイン状態・画面の切り替え
import type { AvatarRef } from '@tentenv/protocol'
import type { MeInfo, NotificationEntry, ServerInfo } from '@tentenv/protocol'
import { create } from 'zustand'
import { Api } from '../api/api'

export interface SavedServer {
  url: string
  name: string
  token: string | null
  lastUsed: number
}

export type Screen =
  | { kind: 'connect' }
  | { kind: 'home'; tab?: string }
  | { kind: 'world'; instanceId: string }
  /** ワールド制作者のローカル実行（親サーバーなし・複数タブで同期） */
  | { kind: 'dev'; worldUrl: string }

interface AppStore {
  servers: SavedServer[]
  api: Api | null
  info: ServerInfo | null
  me: MeInfo | null
  screen: Screen
  avatar: AvatarRef
  notifications: NotificationEntry[]
  toasts: { id: number; text: string; kind: 'info' | 'error' | 'invite'; action?: { label: string; run: () => void } }[]
  setScreen: (s: Screen) => void
  connect: (url: string, info: ServerInfo) => void
  login: (token: string, me: MeInfo) => void
  logout: () => void
  setMe: (me: MeInfo) => void
  setAvatar: (a: AvatarRef) => void
  forgetServer: (url: string) => void
  setNotifications: (n: NotificationEntry[]) => void
  toast: (text: string, kind?: 'info' | 'error' | 'invite', action?: { label: string; run: () => void }) => void
  dismissToast: (id: number) => void
}

const SERVERS_KEY = 'ttv.servers.v1'
const AVATAR_KEY = 'ttv.avatar.v1'

const loadServers = (): SavedServer[] => {
  try {
    return JSON.parse(localStorage.getItem(SERVERS_KEY) ?? '[]')
  } catch {
    return []
  }
}
const saveServers = (s: SavedServer[]) => {
  try {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(s))
  } catch {
    // 保存できない環境
  }
}
export const DEFAULT_AVATAR: AvatarRef = { kind: 'builtin', id: 'akane', color: '#6ea8ff', scale: 1 }
const loadAvatar = (): AvatarRef => {
  try {
    const a = JSON.parse(localStorage.getItem(AVATAR_KEY) ?? 'null')
    if (a && (a.kind === 'builtin' || a.kind === 'vrm')) return a
  } catch {
    // 既定のアバター
  }
  return DEFAULT_AVATAR
}

let toastId = 0

export const useApp = create<AppStore>((set, get) => ({
  servers: loadServers(),
  api: null,
  info: null,
  me: null,
  screen: { kind: 'connect' },
  avatar: loadAvatar(),
  notifications: [],
  toasts: [],
  setScreen: (screen) => set({ screen }),
  connect: (url, info) => {
    const servers = get().servers.filter((s) => s.url !== url)
    const prev = get().servers.find((s) => s.url === url)
    const entry: SavedServer = { url, name: info.name, token: prev?.token ?? null, lastUsed: Date.now() }
    const next = [entry, ...servers].slice(0, 20)
    saveServers(next)
    set({ servers: next, api: new Api(url, entry.token), info, me: null })
  },
  login: (token, me) => {
    const api = get().api
    if (!api) return
    api.setToken(token)
    const servers = get().servers.map((s) => (s.url === api.base ? { ...s, token } : s))
    saveServers(servers)
    set({ servers, me })
  },
  logout: () => {
    const api = get().api
    if (api) {
      void api.logout().catch(() => {})
      api.setToken(null)
      const servers = get().servers.map((s) => (s.url === api.base ? { ...s, token: null } : s))
      saveServers(servers)
      set({ servers })
    }
    set({ me: null, screen: { kind: 'connect' } })
  },
  setMe: (me) => set({ me }),
  setAvatar: (avatar) => {
    try {
      localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar))
    } catch {
      // 同上
    }
    set({ avatar })
  },
  forgetServer: (url) => {
    const servers = get().servers.filter((s) => s.url !== url)
    saveServers(servers)
    set({ servers })
  },
  setNotifications: (notifications) => set({ notifications }),
  toast: (text, kind = 'info', action) => {
    const id = ++toastId
    set({ toasts: [...get().toasts.slice(-4), { id, text, kind, action }] })
    setTimeout(() => get().dismissToast(id), kind === 'invite' ? 15000 : 5000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const app = () => useApp.getState()
export const toast = (text: string, kind?: 'info' | 'error' | 'invite', action?: { label: string; run: () => void }) => useApp.getState().toast(text, kind, action)
