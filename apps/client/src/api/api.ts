// 親サーバーの REST API を呼ぶ
import type {
  AccessLevel,
  AvatarInfo,
  FriendEntry,
  InstanceInfo,
  InstanceSummary,
  MeInfo,
  NotificationEntry,
  ReportInput,
  ServerInfo,
  SharedFileInfo,
  UserProfile,
  UserSummary,
  WorldInfo,
  WorldSummary,
} from '@tentenv/protocol'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export class Api {
  constructor(
    public readonly base: string,
    private token: string | null,
  ) {}

  setToken(t: string | null) {
    this.token = t
  }
  getToken() {
    return this.token
  }

  /** サーバーが返した相対 URL を絶対 URL にする */
  abs(url: string | null | undefined) {
    if (!url) return null
    if (/^(https?:|blob:|data:)/.test(url)) return url
    // Resolve file URLs against the public origin and avoid duplicated hostnames.
    try {
      const base = new URL(this.base)
      let path = url.startsWith('/') ? url.replace(/^\\/+/, '') : url
      const hostPrefix = `${base.host}/`
      if (path.startsWith(hostPrefix)) path = path.slice(hostPrefix.length)
      return new URL(`/${path}`, base.origin).href
    } catch {
      return url
    }
  }

  async req<T>(method: string, path: string, body?: unknown, raw?: { body: BodyInit; type: string }): Promise<T> {
    const headers: Record<string, string> = {}
    if (this.token) headers.authorization = `Bearer ${this.token}`
    let payload: BodyInit | undefined
    if (raw) {
      headers['content-type'] = raw.type
      payload = raw.body
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    let res: Response
    try {
      res = await fetch(this.base.replace(/\/$/, '') + path, { method, headers, body: payload })
    } catch {
      throw new ApiError(0, 'network', '親サーバーに接続できません')
    }
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!res.ok) {
      const e = (data ?? {}) as { error?: string; message?: string }
      throw new ApiError(res.status, e.error ?? 'error', e.message ?? `エラー（${res.status}）`)
    }
    return data as T
  }

  /** 進み具合がわかるアップロード */
  upload<T>(method: string, path: string, body: Blob, type: string, onProgress?: (r: number) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(method, this.base.replace(/\/$/, '') + path)
      if (this.token) xhr.setRequestHeader('authorization', `Bearer ${this.token}`)
      xhr.setRequestHeader('content-type', type || 'application/octet-stream')
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        let data: { error?: string; message?: string } | null = null
        try {
          data = JSON.parse(xhr.responseText)
        } catch {
          data = null
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
        else reject(new ApiError(xhr.status, data?.error ?? 'error', data?.message ?? `エラー（${xhr.status}）`))
      }
      xhr.onerror = () => reject(new ApiError(0, 'network', '親サーバーに接続できません'))
      xhr.send(body)
    })
  }

  // ---- サーバー・認証 ----
  info = () => this.req<ServerInfo>('GET', '/api/info')
  guest = (displayName: string) => this.req<{ token: string; me: MeInfo }>('POST', '/api/auth/guest', { displayName })
  misskeyStart = (host: string, callback: string) => this.req<{ url: string; session: string }>('POST', '/api/auth/misskey/start', { host, callback })
  misskeyFinish = (session: string) => this.req<{ token: string; me: MeInfo }>('POST', '/api/auth/misskey/finish', { session })
  logout = () => this.req<void>('POST', '/api/auth/logout')
  me = () => this.req<MeInfo>('GET', '/api/me')
  updateMe = (p: Partial<Pick<MeInfo, 'displayName' | 'bio' | 'links' | 'statusText' | 'status' | 'decoration' | 'settings' | 'homeWorldId' | 'currentAvatarId'>>) => this.req<MeInfo>('PATCH', '/api/me', p)
  uploadIcon = (file: Blob) => this.upload<MeInfo>('POST', '/api/me/icon', file, file.type || 'image/png')

  // ---- ユーザー・フレンド ----
  users = (q: string) => this.req<UserSummary[]>('GET', `/api/users?q=${encodeURIComponent(q)}`)
  user = (id: string) => this.req<UserProfile>('GET', `/api/users/${id}`)
  userWorlds = (id: string) => this.req<WorldSummary[]>('GET', `/api/users/${id}/worlds`)
  friends = () => this.req<FriendEntry[]>('GET', '/api/friends')
  friendRequests = () => this.req<{ incoming: UserSummary[]; outgoing: UserSummary[] }>('GET', '/api/friends/requests')
  addFriend = (id: string) => this.req<void>('POST', `/api/friends/${id}`)
  removeFriend = (id: string) => this.req<void>('DELETE', `/api/friends/${id}`)
  recent = () => this.req<{ user: UserSummary; at: string; worldName: string }[]>('GET', '/api/recent')
  blocks = () => this.req<UserSummary[]>('GET', '/api/blocks')
  block = (id: string) => this.req<void>('POST', `/api/blocks/${id}`)
  unblock = (id: string) => this.req<void>('DELETE', `/api/blocks/${id}`)
  favorites = <T>(kind: 'user' | 'world' | 'avatar') => this.req<T[]>('GET', `/api/favorites?kind=${kind}`)
  favorite = (kind: 'user' | 'world' | 'avatar', id: string, on: boolean) => this.req<void>(on ? 'POST' : 'DELETE', `/api/favorites/${kind}/${id}`)

  // ---- 通知・招待 ----
  notifications = () => this.req<NotificationEntry[]>('GET', '/api/notifications')
  readNotifications = (ids?: string[]) => this.req<void>('POST', '/api/notifications/read', { ids })
  deleteNotification = (id: string) => this.req<void>('DELETE', `/api/notifications/${id}`)
  invite = (userId: string, instanceId: string, message?: string) => this.req<void>('POST', '/api/invites', { userId, instanceId, message })
  requestInvite = (userId: string, message?: string) => this.req<void>('POST', '/api/invite-requests', { userId, message })

  // ---- アバター ----
  avatars = (p: { q?: string; mine?: boolean; favorites?: boolean } = {}) =>
    this.req<AvatarInfo[]>('GET', `/api/avatars?q=${encodeURIComponent(p.q ?? '')}${p.mine ? '&mine=1' : ''}${p.favorites ? '&favorites=1' : ''}`)
  avatar = (id: string) => this.req<AvatarInfo>('GET', `/api/avatars/${id}`)
  uploadAvatar = (file: Blob, meta: { name: string; isPublic: boolean; allowCloning: boolean }, onProgress?: (r: number) => void) =>
    this.upload<AvatarInfo>('POST', `/api/avatars?name=${encodeURIComponent(meta.name)}&isPublic=${meta.isPublic ? 1 : 0}&allowCloning=${meta.allowCloning ? 1 : 0}`, file, 'model/gltf-binary', onProgress)
  updateAvatar = (id: string, p: Partial<Pick<AvatarInfo, 'name' | 'description' | 'isPublic' | 'allowCloning' | 'tags' | 'extensions'>>) => this.req<AvatarInfo>('PATCH', `/api/avatars/${id}`, p)
  avatarThumbnail = (id: string, img: Blob) => this.upload<AvatarInfo>('POST', `/api/avatars/${id}/thumbnail`, img, img.type || 'image/png')
  deleteAvatar = (id: string) => this.req<void>('DELETE', `/api/avatars/${id}`)

  // ---- ワールド ----
  worlds = (p: { q?: string; tag?: string; sort?: 'popular' | 'new' | 'recommended' | 'favorites'; author?: string } = {}) => {
    const s = new URLSearchParams()
    if (p.q) s.set('q', p.q)
    if (p.tag) s.set('tag', p.tag)
    if (p.sort) s.set('sort', p.sort)
    if (p.author) s.set('author', p.author)
    return this.req<WorldSummary[]>('GET', `/api/worlds?${s}`)
  }
  worldTags = () => this.req<{ tag: string; count: number }[]>('GET', '/api/worlds/tags')
  worldHistory = () => this.req<WorldSummary[]>('GET', '/api/worlds/history')
  world = (id: string) => this.req<WorldInfo>('GET', `/api/worlds/${id}`)
  uploadWorld = (file: Blob, id?: string, onProgress?: (r: number) => void) => this.upload<WorldInfo>(id ? 'PUT' : 'POST', `/api/worlds${id ? `/${id}` : ''}`, file, 'application/zip', onProgress)
  updateWorld = (id: string, p: Partial<Pick<WorldInfo, 'name' | 'description' | 'tags' | 'visibility'>>) => this.req<WorldInfo>('PATCH', `/api/worlds/${id}`, p)
  deleteWorld = (id: string) => this.req<void>('DELETE', `/api/worlds/${id}`)

  // ---- インスタンス ----
  instances = (p: { worldId?: string; friends?: boolean } = {}) => this.req<InstanceSummary[]>('GET', `/api/instances?${p.worldId ? `worldId=${p.worldId}` : ''}${p.friends ? '&friends=1' : ''}`)
  createInstance = (p: { worldId: string; access: AccessLevel; name?: string; capacity?: number; persistent?: boolean }) => this.req<InstanceInfo>('POST', '/api/instances', p)
  instance = (id: string) => this.req<InstanceInfo>('GET', `/api/instances/${id}`)
  deleteInstance = (id: string) => this.req<void>('DELETE', `/api/instances/${id}`)
  instanceFiles = (id: string) => this.req<SharedFileInfo[]>('GET', `/api/instances/${id}/files`)
  uploadInstanceFile = (id: string, file: File, opts: { description?: string; meta?: Record<string, string> }, onProgress?: (r: number) => void) =>
    this.upload<SharedFileInfo>(
      'POST',
      `/api/instances/${id}/files?name=${encodeURIComponent(file.name)}&description=${encodeURIComponent(opts.description ?? '')}&meta=${encodeURIComponent(JSON.stringify(opts.meta ?? {}))}`,
      file,
      file.type || 'application/octet-stream',
      onProgress,
    )
  updateInstanceFile = (id: string, fileId: string, p: { fileName?: string; description?: string | null; meta?: Record<string, string> | null; locked?: boolean }) =>
    this.req<SharedFileInfo>('PATCH', `/api/instances/${id}/files/${fileId}`, p)
  deleteInstanceFile = (id: string, fileId: string) => this.req<void>('DELETE', `/api/instances/${id}/files/${fileId}`)

  // ---- ワールドの永続データ ----
  storageList = (worldId: string, scope: 'shared' | 'player', userId?: string) =>
    this.req<{ key: string; value: unknown }[]>('GET', `/api/storage/${worldId}/${scope}${userId ? `?userId=${userId}` : ''}`)
  storageGet = (worldId: string, scope: 'shared' | 'player', key: string, userId?: string) =>
    this.req<{ value: unknown }>('GET', `/api/storage/${worldId}/${scope}/${encodeURIComponent(key)}${userId ? `?userId=${userId}` : ''}`)
  storageSet = (worldId: string, scope: 'shared' | 'player', key: string, value: unknown) => this.req<void>('PUT', `/api/storage/${worldId}/${scope}/${encodeURIComponent(key)}`, { value })
  storageInc = (worldId: string, scope: 'shared' | 'player', key: string, delta: number) =>
    this.req<{ value: number }>('POST', `/api/storage/${worldId}/${scope}/${encodeURIComponent(key)}/increment`, { delta })
  storageDel = (worldId: string, scope: 'shared' | 'player', key: string) => this.req<void>('DELETE', `/api/storage/${worldId}/${scope}/${encodeURIComponent(key)}`)

  report = (r: ReportInput) => this.req<void>('POST', '/api/reports', r)
}
