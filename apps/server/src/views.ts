// DB の行を API の形（protocol の models）に直す
import type {
  AvatarExtensions,
  AvatarInfo,
  AvatarLicense,
  MeInfo,
  NotificationEntry,
  OnlineStatus,
  UserLocation,
  UserProfile,
  UserSettings,
  UserSummary,
  WorldInfo,
  WorldManifest,
  WorldSummary,
  WorldVisibility,
} from '@tentenv/protocol'
import type { App } from './app'

export interface UserRow {
  id: string
  handle: string
  display_name: string
  icon_url: string | null
  bio: string
  links: string
  status: string
  status_text: string
  decoration: string
  settings: string
  home_world_id: string | null
  current_avatar_id: string | null
  is_guest: number
  banned: number
  created_at: number
  last_seen: number
}

export interface WorldRow {
  id: string
  author_id: string
  name: string
  description: string
  tags: string
  visibility: WorldVisibility
  version: number
  manifest: string
  visit_count: number
  total_bytes: number
  created_at: number
  updated_at: number
  fav_count: number
}

export interface AvatarRow {
  id: string
  owner_id: string
  name: string
  description: string
  sha256: string
  file_size: number
  thumbnail: string | null
  is_public: number
  allow_cloning: number
  license: string | null
  extensions: string | null
  tags: string
  created_at: number
  updated_at: number
  fav_count: number
}

export interface NotificationRow {
  id: string
  user_id: string
  kind: NotificationEntry['kind']
  from_id: string | null
  message: string
  instance_id: string | null
  world_name: string | null
  read: number
  created_at: number
}

export const WORLD_SELECT = `SELECT w.*, (SELECT COUNT(*) FROM favorites f WHERE f.kind = 'world' AND f.target_id = w.id) AS fav_count FROM worlds w`
export const AVATAR_SELECT = `SELECT a.*, (SELECT COUNT(*) FROM favorites f WHERE f.kind = 'avatar' AND f.target_id = a.id) AS fav_count FROM avatars a`

export const iso = (ms: number) => new Date(ms).toISOString()

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export const DEFAULT_SETTINGS: UserSettings = { locationVisibility: 'friends', allowContact: 'friends', allowInvites: 'everyone' }

export const userSettings = (row: UserRow): UserSettings => ({ ...DEFAULT_SETTINGS, ...parseJson<Partial<UserSettings>>(row.settings, {}) })

/** 保存してある相対パス（/files/...）を公開 URL にする */
export const absUrl = (app: App, url: string | null) => (url ? (url.startsWith('/') ? app.publicUrl + url : url) : null)

/** パスの各部分を URL 用にエンコードする */
export const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export const getUser = (app: App, id: string) => app.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)

/** 相手から見たオンライン状態（接続がなければ offline。自分で offline にしていれば隠す） */
export const visibleStatus = (app: App, row: UserRow): OnlineStatus => (app.hub.isOnline(row.id) && row.status !== 'offline' ? (row.status as OnlineStatus) : 'offline')

export const userSummary = (app: App, row: UserRow): UserSummary => ({
  id: row.id,
  displayName: row.display_name,
  iconUrl: absUrl(app, row.icon_url),
  status: visibleStatus(app, row),
  statusText: row.status_text,
  isGuest: !!row.is_guest,
})

export const summaryById = (app: App, id: string): UserSummary => {
  const row = getUser(app, id)
  return row ? userSummary(app, row) : { id, displayName: '（削除されたユーザー）', iconUrl: null, status: 'offline', statusText: '' }
}

/** viewer から見た userId の現在地。見せない設定なら null */
export const locationFor = (app: App, row: UserRow, viewerId: string | null): UserLocation | null => {
  if (visibleStatus(app, row) === 'offline' && viewerId !== row.id) return null
  const inst = app.instances.locationOf(row.id)
  if (!inst) return null
  if (viewerId !== row.id) {
    const vis = userSettings(row).locationVisibility
    if (vis === 'nobody') return null
    if (vis === 'friends' && !(viewerId && app.social.areFriends(row.id, viewerId))) return null
    if (viewerId && app.social.blockedEither(row.id, viewerId)) return null
  }
  return { instanceId: inst.id, worldId: inst.worldId, worldName: inst.worldName, access: inst.access }
}

export const userProfile = (app: App, row: UserRow, viewerId: string | null): UserProfile => {
  const p: UserProfile = {
    ...userSummary(app, row),
    handle: row.handle,
    bio: row.bio,
    links: parseJson<string[]>(row.links, []),
    decoration: parseJson(row.decoration, { color: '#ffffff', frame: 'none' as const }),
    createdAt: iso(row.created_at),
  }
  if (viewerId && viewerId !== row.id) {
    const st = app.social.friendState(viewerId, row.id)
    p.friendState = st
    p.isFriend = st === 'friends'
    p.mutualFriends = app.db
      .all<UserRow>('SELECT u.* FROM friends a JOIN friends b ON a.friend_id = b.friend_id JOIN users u ON u.id = a.friend_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 20', viewerId, row.id)
      .map((u) => userSummary(app, u))
  }
  p.worlds = app.db.all<WorldRow>(`${WORLD_SELECT} WHERE w.author_id = ? AND w.visibility = 'public' ORDER BY w.updated_at DESC LIMIT 50`, row.id).map((w) => worldSummary(app, w))
  p.location = locationFor(app, row, viewerId)
  return p
}

export const meInfo = (app: App, row: UserRow): MeInfo => ({
  ...userProfile(app, row, row.id),
  status: (row.status as OnlineStatus) ?? 'online',
  isGuest: !!row.is_guest,
  isAdmin: app.isAdmin(row),
  settings: userSettings(row),
  homeWorldId: row.home_world_id,
  currentAvatarId: row.current_avatar_id,
})

export const worldBaseUrl = (app: App, id: string, version: number) => `${app.publicUrl}/files/worlds/${id}/${version}/`

export const worldSummary = (app: App, row: WorldRow): WorldSummary => {
  const m = parseJson<WorldManifest | null>(row.manifest, null)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    thumbnailUrl: m?.thumbnail ? worldBaseUrl(app, row.id, row.version) + encodePath(m.thumbnail) : null,
    author: summaryById(app, row.author_id),
    tags: parseJson<string[]>(row.tags, []),
    visibility: row.visibility,
    favoriteCount: row.fav_count ?? 0,
    visitCount: row.visit_count,
    occupants: app.instances.occupantsOfWorld(row.id),
    updatedAt: iso(row.updated_at),
    createdAt: iso(row.created_at),
  }
}

export const worldInfo = (app: App, row: WorldRow, viewerId: string | null): WorldInfo => {
  const manifest = parseJson<WorldManifest>(row.manifest, {} as WorldManifest)
  return {
    ...worldSummary(app, row),
    version: row.version,
    sdkVersion: manifest.sdkVersion,
    recommendedCapacity: manifest.recommendedCapacity,
    maxCapacity: manifest.maxCapacity,
    baseUrl: worldBaseUrl(app, row.id, row.version),
    manifest,
    favorite: viewerId ? app.social.isFavorite(viewerId, 'world', row.id) : undefined,
  }
}

export const avatarInfo = (app: App, row: AvatarRow, viewerId: string | null): AvatarInfo => ({
  id: row.id,
  name: row.name,
  description: row.description,
  owner: summaryById(app, row.owner_id),
  fileUrl: `${app.publicUrl}/files/avatars/${row.id}.vrm`,
  sha256: row.sha256,
  thumbnailUrl: absUrl(app, row.thumbnail),
  fileSize: row.file_size,
  isPublic: !!row.is_public,
  allowCloning: !!row.allow_cloning,
  license: parseJson<AvatarLicense | null>(row.license, null),
  extensions: parseJson<AvatarExtensions | null>(row.extensions, null),
  tags: parseJson<string[]>(row.tags, []),
  favorite: viewerId ? app.social.isFavorite(viewerId, 'avatar', row.id) : undefined,
  favoriteCount: row.fav_count ?? 0,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

export const notificationEntry = (app: App, row: NotificationRow): NotificationEntry => ({
  id: row.id,
  kind: row.kind,
  from: row.from_id ? summaryById(app, row.from_id) : null,
  message: row.message,
  instanceId: row.instance_id,
  worldName: row.world_name,
  read: !!row.read,
  createdAt: iso(row.created_at),
})
