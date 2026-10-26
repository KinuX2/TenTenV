// REST API で受け渡すデータの形。親サーバーとクライアントで共有する

export const PROTOCOL_VERSION = 1
export const SDK_VERSION = '0.1.0'

export interface ServerInfo {
  protocol: number
  name: string
  description: string
  termsUrl: string | null
  /** 参加チケットを検証するための公開鍵（Ed25519, SPKI DER を base64url） */
  publicKey: string
  /** 公開鍵の指紋。親サーバーの識別子として使う */
  serverId: string
  auth: { guest: boolean; misskey: boolean; misskeyHosts: string[] | null }
  limits: {
    avatarBytes: number
    worldBytes: number
    instanceFileBytes: number
    maxInstanceCapacity: number
  }
  relay: boolean
  iceServers: IceServer[]
  version: string
  /** ホームを決めていない人のホームワールド（標準のワールド） */
  defaultHomeWorldId?: string | null
}

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export type OnlineStatus = 'online' | 'joinme' | 'askme' | 'busy' | 'offline'
/** 現在地を誰に見せるか */
export type LocationVisibility = 'everyone' | 'friends' | 'nobody'

export interface UserSummary {
  id: string
  displayName: string
  iconUrl: string | null
  status: OnlineStatus
  statusText: string
  /** ゲスト（永続データを書けない・アップロードの制限など） */
  isGuest?: boolean
}

export interface UserProfile extends UserSummary {
  /** `@name@host` 形式（Misskey 連携時）または `guest:...` */
  handle: string
  bio: string
  links: string[]
  /** 名前表示の装飾（色・枠など） */
  decoration: { color: string; frame: 'none' | 'round' | 'star' | 'heart' }
  createdAt: string
  isFriend?: boolean
  friendState?: 'none' | 'outgoing' | 'incoming' | 'friends'
  mutualFriends?: UserSummary[]
  /** 公開されている作品 */
  worlds?: WorldSummary[]
  location?: UserLocation | null
}

export interface MeInfo extends UserProfile {
  isGuest: boolean
  isAdmin: boolean
  settings: UserSettings
  homeWorldId: string | null
  currentAvatarId: string | null
}

export interface UserSettings {
  locationVisibility: LocationVisibility
  /** 他人との接触（[43]）を許可する相手 */
  allowContact: 'everyone' | 'friends' | 'nobody'
  /** 誰からの招待を受けるか */
  allowInvites: 'everyone' | 'friends' | 'nobody'
}

export interface UserLocation {
  instanceId: string
  worldId: string
  worldName: string
  access: AccessLevel
}

export interface FriendEntry extends UserSummary {
  location: UserLocation | null
  online: boolean
  since: string
}

export type NotificationKind = 'friend_request' | 'friend_accepted' | 'invite' | 'request_invite' | 'invite_declined' | 'system'
export interface NotificationEntry {
  id: string
  kind: NotificationKind
  from: UserSummary | null
  message: string
  /** 招待なら招待先 */
  instanceId: string | null
  worldName: string | null
  read: boolean
  createdAt: string
}

/** VRM のメタ情報（利用条件） */
export interface AvatarLicense {
  title: string
  authors: string[]
  version: string | null
  licenseUrl: string | null
  /** 'onlyAuthor' | 'onlySeparatelyLicensedPerson' | 'everyone'（VRM 1.0 の avatarPermission） */
  avatarPermission: string | null
  commercialUsage: string | null
  allowRedistribution: boolean | null
  modification: string | null
  allowExcessivelyViolentUsage: boolean | null
  allowExcessivelySexualUsage: boolean | null
  allowPoliticalOrReligiousUsage: boolean | null
  allowAntisocialOrHateUsage: boolean | null
  creditNotation: string | null
  otherLicenseUrl: string | null
}

export interface AvatarInfo {
  id: string
  name: string
  description: string
  owner: UserSummary
  fileUrl: string
  /** ファイルの SHA-256（16 進） */
  sha256: string
  thumbnailUrl: string | null
  fileSize: number
  isPublic: boolean
  /** 他人が自分のアバターとして使えるか */
  allowCloning: boolean
  license: AvatarLicense | null
  /** 衣装・アクションメニューなど本プラットフォーム独自の拡張定義 */
  extensions: AvatarExtensions | null
  tags: string[]
  favorite?: boolean
  favoriteCount: number
  createdAt: string
  updatedAt: string
}

/** アバター拡張定義（VRM に含まれない衣装切り替え・ジェスチャー割り当てなど） */
export interface AvatarExtensions {
  version: 1
  /** 衣装・アクセサリー：グループ名 → 表示を切り替えるノード名の一覧 */
  outfits?: { id: string; label: string; nodes: string[]; default: boolean }[]
  /** ジェスチャー → 表情（VRM Expression 名と重み） */
  gestures?: Partial<Record<HandGesture, Record<string, number>>>
  /** 両手の組み合わせ（"fist+victory" など）→ 表情 */
  gestureCombos?: Record<string, Record<string, number>>
  /** アクションメニューに出す項目 */
  actions?: { id: string; label: string; kind: 'toggle' | 'expression' | 'emote'; target: string }[]
}

export type HandGesture = 'neutral' | 'fist' | 'open' | 'point' | 'victory' | 'rocknroll' | 'gun' | 'thumbsup'

export interface WorldSummary {
  id: string
  name: string
  description: string
  thumbnailUrl: string | null
  author: UserSummary
  tags: string[]
  visibility: WorldVisibility
  favoriteCount: number
  visitCount: number
  /** 今いる人数（全インスタンスの合計） */
  occupants: number
  updatedAt: string
  createdAt: string
}

export type WorldVisibility = 'public' | 'unlisted' | 'private'

export interface WorldInfo extends WorldSummary {
  version: number
  sdkVersion: string
  recommendedCapacity: number
  maxCapacity: number
  /** ワールドのファイル一覧の基準 URL（末尾 /） */
  baseUrl: string
  manifest: WorldManifest
  favorite?: boolean
}

/** ワールドパッケージ内の world.json */
export interface WorldManifest {
  format: 'tentenv-world'
  formatVersion: 1
  name: string
  description: string
  tags: string[]
  sdkVersion: string
  entry: string
  thumbnail: string | null
  recommendedCapacity: number
  maxCapacity: number
  physics?: { gravity?: number; jump?: number; allowInfiniteJump?: boolean }
  camera?: { near?: number; far?: number }
  render?: { hdr?: boolean; toneMapping?: 'aces' | 'agx' | 'neutral' | 'none'; exposure?: number }
  spawn?: { position: [number, number, number]; yaw: number }
  permissions: {
    /** 外部から読み込める・通信できるドメイン */
    allowedDomains: string[]
    /** 緩和する静的検査ルール */
    relaxedRules: string[]
  }
  /** ファイルパス → SHA-256 */
  files: Record<string, string>
  credits?: { name: string; author: string; license: string; url?: string }[]
}

export type AccessLevel = 'public' | 'friends+' | 'friends' | 'invite+' | 'invite'

export interface InstanceSummary {
  id: string
  worldId: string
  worldName: string
  worldThumbnailUrl: string | null
  name: string
  access: AccessLevel
  owner: UserSummary
  occupants: number
  capacity: number
  /** フレンドがいれば名前を出す */
  friends: UserSummary[]
  queue: number
  persistent: boolean
  createdAt: string
}

export interface InstanceInfo extends InstanceSummary {
  members: UserSummary[]
  canJoin: boolean
  /** 参加できない理由 */
  denyReason: string | null
}

export interface ReportInput {
  targetType: 'user' | 'world' | 'avatar'
  targetId: string
  reason: 'harassment' | 'spam' | 'inappropriate' | 'cheating' | 'copyright' | 'other'
  detail: string
}

export interface SharedFileInfo {
  id: string
  fileName: string
  contentType: string
  fileSize: number
  url: string
  description: string | null
  meta: Record<string, string>
  locked: boolean
  uploadedBy: string
  createdAt: string
}

export interface ApiError {
  error: string
  message: string
}
