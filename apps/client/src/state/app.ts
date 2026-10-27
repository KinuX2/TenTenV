// 接続中の親サーバー・ログイン状態・画面の切り替え
import type { AvatarRef } from '@tentenv/protocol'
import type { MeInfo, NotificationEntry, ServerInfo } from '@tentenv/protocol'
import { create } from 'zustand'
import { Api, ApiError } from '../api/api'
import { outfitTokens } from './avatarExt'

export interface SavedServer {
  url: string
  name: string
  token: string | null
  lastUsed: number
}

export type Screen =
  | { kind: 'connect' }
  | { kind: 'home'; tab?: string; worldId?: string }
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
const avatarSelectionKey = (server: string, userId: string) => `ttv.avatarSelection.v1:${encodeURIComponent(server)}:${userId}`

export const rememberAvatarSelection = (server: string, userId: string, avatarId: string | null) => {
  try {
    localStorage.setItem(avatarSelectionKey(server, userId), JSON.stringify(avatarId))
  } catch { /* 保存できない環境 */ }
}

const rememberedAvatarSelection = (server: string, userId: string): { found: boolean; id: string | null } => {
  try {
    const raw = localStorage.getItem(avatarSelectionKey(server, userId))
    if (raw === null) return { found: false, id: null }
    const id: unknown = JSON.parse(raw)
    if (id === null || (typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id))) return { found: true, id }
  } catch { /* 古いデータは無視する */ }
  return { found: false, id: null }
}

const loadServers = (): SavedServer[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SERVERS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const servers: SavedServer[] = []
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue
      const entry = value as Record<string, unknown>
      if (typeof entry.url !== 'string' || !/^https?:\/\//.test(entry.url)) continue
      const url = entry.url.trim().replace(/\/+$/, '')
      if (seen.has(url)) continue
      seen.add(url)
      servers.push({ url, name: typeof entry.name === 'string' ? entry.name : url, token: typeof entry.token === 'string' ? entry.token : null, lastUsed: typeof entry.lastUsed === 'number' ? entry.lastUsed : 0 })
      if (servers.length === 20) break
    }
    return servers
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
    const a: unknown = JSON.parse(localStorage.getItem(AVATAR_KEY) ?? 'null')
    if (a && typeof a === 'object') {
      const saved = a as Record<string, unknown>
      const scale = typeof saved.scale === 'number' && Number.isFinite(saved.scale) && saved.scale > 0 ? saved.scale : 1
      const outfits = Array.isArray(saved.outfits) ? saved.outfits.filter((x): x is string => typeof x === 'string').slice(0, 32) : undefined
      if (saved.kind === 'builtin' && typeof saved.id === 'string') return { kind: 'builtin', id: saved.id, color: typeof saved.color === 'string' ? saved.color : DEFAULT_AVATAR.color, scale, outfits }
      if (saved.kind === 'vrm' && typeof saved.id === 'string' && typeof saved.url === 'string' && /^https?:\/\//.test(saved.url) && typeof saved.sha256 === 'string') return { kind: 'vrm', id: saved.id, url: saved.url, sha256: saved.sha256, scale, outfits }
    }
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
    const previous = get().avatar
    const remembered = rememberedAvatarSelection(api.base, me.id)
    const legacyId = previous.kind === 'vrm' && previous.url.startsWith(`${api.base}/`) ? previous.id : null
    const selectedId = remembered.found ? remembered.id : me.currentAvatarId ?? legacyId
    const selectedMe = selectedId === me.currentAvatarId ? me : { ...me, currentAvatarId: selectedId }
    // 保存済みのモデルは別のアカウントや親サーバーのものかもしれない。
    const sameAvatar = previous.kind === 'vrm' && previous.id === selectedId && previous.url.startsWith(`${api.base}/`)
    set({ servers, me: selectedMe, avatar: selectedId ? (sameAvatar ? previous : DEFAULT_AVATAR) : previous.kind === 'vrm' ? DEFAULT_AVATAR : previous })
    if (selectedId) {
      const clearInvalid = () => {
        const now = get()
        if (now.api !== api || now.me?.id !== me.id || now.me.currentAvatarId !== selectedId) return
        now.setAvatar(DEFAULT_AVATAR)
        now.setMe({ ...now.me, currentAvatarId: null })
        rememberAvatarSelection(api.base, me.id, null)
        if (me.currentAvatarId) void api.updateMe({ currentAvatarId: null }).catch(() => {})
      }
      void api.avatar(selectedId).then(async (avatar) => {
        if (get().api !== api || get().me?.id !== me.id || get().me?.currentAvatarId !== selectedId) return
        if (avatar.owner.id !== me.id && !(avatar.isPublic && avatar.allowCloning)) {
          clearInvalid()
          return
        }
        const defaults = outfitTokens(avatar.extensions, new Set((avatar.extensions?.outfits ?? []).filter((o) => o.default).map((o) => o.id)))
        get().setAvatar({ kind: 'vrm', id: avatar.id, url: api.abs(avatar.fileUrl)!, sha256: avatar.sha256, scale: 1, outfits: sameAvatar ? previous.outfits : defaults })
        rememberAvatarSelection(api.base, me.id, avatar.id)
        if (me.currentAvatarId !== avatar.id) await api.updateMe({ currentAvatarId: avatar.id })
      }).catch((e) => {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) clearInvalid()
        if (get().api === api && get().me?.id === me.id) get().toast(`アバターを復元できません: ${e instanceof Error ? e.message : String(e)}`, 'error')
      })
    } else if (remembered.found && me.currentAvatarId) {
      void api.updateMe({ currentAvatarId: null }).catch((e) => {
        if (get().api === api && get().me?.id === me.id) get().toast(`アバターの選択を保存できません: ${e instanceof Error ? e.message : String(e)}`, 'error')
      })
    }
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
