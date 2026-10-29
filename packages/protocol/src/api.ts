// 親サーバーの REST API の一覧（パスと入出力）。実装とクライアントの両方がこの表に従う
//
// 認証: Authorization: Bearer <sessionToken>
// エラー: HTTP 4xx/5xx + ApiError
//
// GET    /api/info                                → ServerInfo
// POST   /api/auth/misskey/start {host, callback} → {url, session}
// POST   /api/auth/misskey/finish {session}       → {token, me: MeInfo}
// POST   /api/auth/:provider/start {callback?}    → {url, session}   （provider は x。callback なしは finish で待つ）
// GET    /api/auth/:provider/callback?code=&state= （X の許可の画面からの戻り先。callback へ転送する）
// POST   /api/auth/:provider/finish {session}     → {token, me: MeInfo} | 202 {pending: true}
// POST   /api/auth/logout
// GET    /api/me                                  → MeInfo
// PATCH  /api/me  Partial<{displayName,bio,links,statusText,status,decoration,settings,homeWorldId,currentAvatarId,iconUrl}> → MeInfo
// POST   /api/me/icon  (body: image bytes)        → MeInfo
// GET    /api/users?q=                            → UserSummary[]
// GET    /api/users/:id                           → UserProfile
// GET    /api/users/:id/worlds                    → WorldSummary[]
// GET    /api/friends                             → FriendEntry[]
// GET    /api/friends/requests                    → {incoming: UserSummary[], outgoing: UserSummary[]}
// POST   /api/friends/:userId                     （申請 / 相手から申請が来ていれば承認）
// DELETE /api/friends/:userId                     （削除・申請の取り下げ・拒否）
// GET    /api/recent                              → {user: UserSummary, at: string, worldName: string}[]
// GET    /api/blocks                              → UserSummary[]
// POST   /api/blocks/:userId   DELETE /api/blocks/:userId
// GET    /api/favorites?kind=user|world|avatar    → (UserSummary|WorldSummary|AvatarInfo)[]
// POST   /api/favorites/:kind/:id   DELETE /api/favorites/:kind/:id
// GET    /api/notifications                       → NotificationEntry[]
// POST   /api/notifications/read   {ids?: string[]}
// DELETE /api/notifications/:id
// POST   /api/invites   {userId, instanceId, message?}     （招待）
// POST   /api/invite-requests {userId, message?}           （参加申請: 相手のいるインスタンスへの招待を頼む）
// GET    /api/avatars?q=&mine=1&favorites=1       → AvatarInfo[]
// GET    /api/avatars/:id                         → AvatarInfo
// POST   /api/avatars?name=&isPublic=&allowCloning=  (body: VRM bytes) → AvatarInfo
// PATCH  /api/avatars/:id  {name,description,isPublic,allowCloning,tags,extensions}
// POST   /api/avatars/:id/thumbnail (body: image bytes)
// DELETE /api/avatars/:id
// GET    /api/worlds?q=&tag=&sort=popular|new|recommended|favorites&author=  → WorldSummary[]
// GET    /api/worlds/tags                         → {tag: string, count: number}[]
// GET    /api/worlds/history                      → WorldSummary[]
// GET    /api/worlds/:id                          → WorldInfo
// POST   /api/worlds  (body: .ttvw zip bytes)     → WorldInfo   （新規）
// PUT    /api/worlds/:id (body: .ttvw zip bytes)  → WorldInfo   （更新）
// PATCH  /api/worlds/:id {name,description,tags,visibility}
// DELETE /api/worlds/:id
// GET    /api/worlds/:id/export                   → .ttvw（制作者のみ。親サーバー間の移行用）
// GET    /api/instances?worldId=&friends=1        → InstanceSummary[]
// POST   /api/instances {worldId, access, name?, capacity?, persistent?} → InstanceInfo
// GET    /api/instances/:id                       → InstanceInfo
// DELETE /api/instances/:id                        （作成者・管理者のみ）
// GET    /api/instances/:id/files                 → SharedFileInfo[]
// POST   /api/instances/:id/files?name=&meta=<json>&description=  (body: bytes) → SharedFileInfo
// PATCH  /api/instances/:id/files/:fileId {fileName?, description?, meta?, locked?}
// DELETE /api/instances/:id/files/:fileId
// GET    /api/storage/:worldId/shared             → {key, value}[]
// GET    /api/storage/:worldId/shared/:key        → {value}
// PUT    /api/storage/:worldId/shared/:key {value}
// POST   /api/storage/:worldId/shared/:key/increment {delta} → {value}
// DELETE /api/storage/:worldId/shared/:key
// GET    /api/storage/:worldId/player?userId=     → {key, value}[]
// PUT    /api/storage/:worldId/player/:key {value} …（shared と同じ形、自分の分のみ書ける）
// POST   /api/reports  ReportInput
// GET    /api/admin/reports                        （管理者）
// POST   /api/admin/reports/:id/resolve {action: 'dismiss'|'ban'|'remove'}
//
// 静的ファイル:
// GET    /files/avatars/:id.vrm  /files/worlds/:id/:version/<path>  /files/instances/:iid/:fileId  /files/icons/:id
//
// WebSocket: /ws  （signal.ts の ClientSignal / ServerSignal）

export const API_PREFIX = '/api'
