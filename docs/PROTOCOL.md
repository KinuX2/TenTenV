# TenTenV 通信仕様

TenTenV の親サーバー・クライアント・参加者どうしの通信の仕様です。親サーバーとのプロトコルはバージョン 2 です。型と上限の定義は `packages/protocol/src/` にあります（`api.ts`・`signal.ts`・`peer.ts`・`models.ts`・`limits.ts`）。この文書はそれをまとめたもので、食い違うときはコードが正です。

全体の流れ:

1. クライアントは親サーバーの REST API（HTTP）でログインし、ワールドやインスタンスを探します。
2. 親サーバーと WebSocket（`/ws`）をつなぎ、インスタンスに参加します。親サーバーは署名した参加チケットと、中にいる人の一覧を返します。
3. 参加者どうしは WebSocket で WebRTC の接続情報を受け渡し（シグナリング）、P2P のフルメッシュ（全員と直接つながる形）を作ります。
4. P2P がつながらない相手とは、親サーバーの WebSocket でデータを中継します。

---

## 1. REST API

- すべて `/api` で始まり、本文は JSON です（アップロードは生のバイト列）。
- 認証は `Authorization: Bearer <セッショントークン>`。トークンはログインで受け取り、30 日有効（使うと延長）です。親サーバーは SHA-256 にしたものだけを保存します。
- エラーは HTTP 4xx/5xx と `{ "error": "コード", "message": "説明" }`。
- CORS は設定 `corsOrigins` に従います。

| メソッド・パス | 入力 | 出力・内容 |
|---|---|---|
| `GET /api/info` | — | `ServerInfo`（名前・`branding` のサイト名とロゴ URL・公開鍵・serverId・ログイン方法・上限・中継の可否・ICE サーバー・既定のホームワールド） |
| `GET /branding/logo` | — | 設定されたロゴ画像。`branding.logoUrl` が `null` の場合は未設定 |
| `POST /api/auth/misskey/start` | `{host, callback}` | `{url, session}`。`url` は Misskey の MiAuth の画面（権限は `read:account` だけ） |
| `POST /api/auth/misskey/finish` | `{session}` | `{token, me}` |
| `POST /api/auth/:provider/start` | `{callback?}` | `{url, session}`。`provider` は `google`・`x`。`url` は許可の画面。`callback` を省くと、`finish` で待つ（デスクトップ版） |
| `GET /api/auth/:provider/callback` | `?code=&state=` | 許可の画面からの戻り先。`callback` へ `?session=` を付けて転送する（省いたときは「アプリに戻って」のページ） |
| `POST /api/auth/:provider/finish` | `{session}` | `{token, me}`。まだ許可されていなければ `202 {pending: true}` |
| `POST /api/auth/logout` | — | セッションを消す |
| `GET /api/me` / `PATCH /api/me` | `displayName, bio, links, statusText, status, decoration, settings, homeWorldId, currentAvatarId, iconUrl` の一部 | `MeInfo` |
| `POST /api/me/icon` | 画像のバイト列 | `MeInfo` |
| `GET /api/users?q=` | — | `UserSummary[]` |
| `GET /api/users/:id`・`/api/users/:id/worlds` | — | `UserProfile`・`WorldSummary[]` |
| `GET /api/friends`・`/api/friends/requests` | — | `FriendEntry[]`・`{incoming, outgoing}` |
| `POST /api/friends/:userId` | — | 申請（相手から申請が来ていれば承認） |
| `DELETE /api/friends/:userId` | — | 解除・取り下げ・拒否 |
| `GET /api/recent` | — | 最近一緒にいた人 `{user, at, worldName}[]` |
| `GET /api/blocks`・`POST/DELETE /api/blocks/:userId` | — | ブロック |
| `GET /api/favorites?kind=user\|world\|avatar`・`POST/DELETE /api/favorites/:kind/:id` | — | お気に入り |
| `GET /api/notifications`・`POST /api/notifications/read {ids?}`・`DELETE /api/notifications/:id` | — | 通知 |
| `POST /api/invites` | `{userId, instanceId, message?}` | 招待 |
| `POST /api/invite-requests` | `{userId, message?}` | 参加申請（相手のいるインスタンスへの招待を頼む） |
| `GET /api/avatars?q=&mine=1&favorites=1`・`GET /api/avatars/:id` | — | `AvatarInfo[]`・`AvatarInfo` |
| `POST /api/avatars?name=&isPublic=&allowCloning=` | VRM のバイト列 | `AvatarInfo` |
| `PATCH /api/avatars/:id` | `{name, description, isPublic, allowCloning, tags, extensions}` | 変更 |
| `POST /api/avatars/:id/thumbnail`・`DELETE /api/avatars/:id` | 画像 / — | サムネイル・削除 |
| `GET /api/worlds?q=&tag=&sort=popular\|new\|recommended\|favorites&author=` | — | `WorldSummary[]` |
| `GET /api/worlds/tags`・`/api/worlds/history` | — | タグの一覧・訪れたワールド |
| `GET /api/worlds/:id` | — | `WorldInfo`（マニフェストとファイルの基準 URL を含む） |
| `POST /api/worlds`・`PUT /api/worlds/:id` | `.ttvw` のバイト列 | 新規登録・新しい版 |
| `PATCH /api/worlds/:id` | `{name, description, tags, visibility}` | 変更 |
| `DELETE /api/worlds/:id`・`GET /api/worlds/:id/export` | — | 削除・`.ttvw` の書き出し（制作者のみ。親サーバー間の移行用） |
| `GET /api/instances?worldId=&friends=1` | — | `InstanceSummary[]`（自分が入れるもの・公開のもの） |
| `POST /api/instances` | `{worldId, access, name?, capacity?, persistent?}` | `InstanceInfo` |
| `GET /api/instances/:id`・`DELETE /api/instances/:id` | — | 情報・閉じる（作成者・管理者のみ） |
| `GET /api/instances/:id/files` | — | `SharedFileInfo[]` |
| `POST /api/instances/:id/files?name=&meta=<json>&description=` | バイト列 | `SharedFileInfo` |
| `PATCH /api/instances/:id/files/:fileId` | `{fileName?, description?, meta?, locked?}` | 変更 |
| `DELETE /api/instances/:id/files/:fileId` | — | 削除 |
| `GET /api/storage/:worldId/shared`・`GET .../shared/:key` | — | `{key, value}[]`・`{value}` |
| `PUT .../shared/:key {value}`・`POST .../shared/:key/increment {delta}`・`DELETE .../shared/:key` | — | ワールド共有の永続データ |
| `GET /api/storage/:worldId/player?userId=`・`GET .../player/:key?userId=` | — | 利用者ごとの永続データ（他人の分も読める） |
| `PUT/POST(increment)/DELETE .../player/:key` | — | 自分の分だけ書ける |
| `POST /api/reports` | `ReportInput` | 通報 |
| `GET /api/admin/reports`・`POST /api/admin/reports/:id/resolve {action: dismiss\|ban\|remove}` | — | 管理者のみ |

静的ファイル（認証なし）:

```
GET /files/avatars/<id>.vrm
GET /files/worlds/<id>/<版>/<パス>
GET /files/instances/<インスタンスID>/<ファイルID>
GET /files/icons/<id>
GET /files/thumbs/<id>
```

`/files/` は `X-Content-Type-Options: nosniff` と `Content-Security-Policy: sandbox` 付きで配信します。インスタンス共有ファイルの HTML・XML・JavaScript・SVG は `application/octet-stream` として返します。認証がないので、URL を知っている人は誰でも取得できます。

インスタンスの公開範囲と、上限・レート制限の値は [apps/server/README.md](../apps/server/README.md) にあります。

---

## 2. WebSocket（/ws）

- URL は親サーバーの URL の `/ws`（https なら `wss:`）。
- メッセージはすべて JSON の文字列です。バイナリのメッセージは拒否します。
- 親サーバーは受け取ったメッセージの形を厳密に確かめ（`apps/server/src/wsmsg.ts`）、知らない種類・型の違う値・長すぎる文字列は拒否します。ID は `^[A-Za-z0-9_-]{1,64}$`。
- 1 接続あたり 1 秒 200 メッセージまで。不正なメッセージや回数超過が 20 回を超えると切断します（10 秒間何もなければ数え直します）。
- 親サーバーは 30 秒ごとに WebSocket の ping を送り、応答がなければ切ります。

### クライアント → 親サーバー（ClientSignal）

| t | 項目 | 内容 |
|---|---|---|
| `hello` | `token`、`protocol` | 最初に送る。10 秒以内に送らないと切断（4001） |
| `ping` | `id`、`c` | 時計合わせ（`c` は送った時刻） |
| `join` | `instanceId`、`hostScore`、`queue?` | インスタンスに参加。`queue` で満員なら並ぶ |
| `leave` | — | 退出・順番待ちの取り消し |
| `signal` | `to`、`data` | WebRTC の接続情報を相手へ |
| `relay` | `to`（peerId か `'*'`）、`ch`（`'r'`・`'u'`・`'v'`）、`data` | P2P の代わりの中継（4 章） |
| `status` | `status`、`statusText?` | オンライン状態 |
| `p2pfail` | `peerId` | P2P がつながらなかった相手（記録のみ） |
| `kick` | `peerId`、`reason` | 退出させる（作成者・モデレーターのみ） |
| `renew` | — | 参加チケットの再発行 |

`signal.data` は `{kind: 'offer'|'answer', sdp}`（SDP は 64KB まで）、`{kind: 'ice', candidate, sdpMid, sdpMLineIndex}`、`{kind: 'restart'}`。

### 親サーバー → クライアント（ServerSignal）

| t | 項目 | 内容 |
|---|---|---|
| `welcome` | `userId`、`serverTime` | 認証できた |
| `pong` | `id`、`c`、`s` | `s` は親サーバーの時刻（UNIX ms） |
| `joined` | `instance`、`peerId`、`ticket`、`peers` | 参加できた。`peers` は先にいた人の `PeerDescriptor[]` |
| `queued` | `instanceId`、`position` | 満員で並んでいる（順番が変わるたびに届く） |
| `peer-joined` / `peer-left` | `peer` / `peerId` | 人の出入り |
| `signal` | `from`、`data` | 相手からの接続情報 |
| `relay` | `from`、`ch`、`data` | 中継されたデータ |
| `ticket` | `ticket` | 再発行したチケット |
| `notify` | `notification` | 通知 |
| `friend-status` | `user`、`online`、`location` | フレンドの状態 |
| `kicked` | `reason` | 退出させられた・インスタンスが閉じた |
| `error` | `code`、`message` | エラー |

`PeerDescriptor` は `{peerId, user, joinedAt, hostScore, ticket, hidden?}` です。`peerId` は参加ごとに変わる接続 ID、`joinedAt` は親サーバーの時計で入った時刻です。どちらかがブロックしている相手は `hidden: true` になり、P2P も中継も通りません。

主なエラーコード: `not_found`、`denied`（公開範囲で入れない・キックされた）、`full`、`already_joined`、`not_joined`、`peer_not_found`、`relay_disabled`、`relay_rate`、`bad_message`、`not_authenticated`、`forbidden`、`closed`、`internal`。

切断のコード: `4000` プロトコルの版が違う、`4001` 認証できない・hello が来ない、`4003` 利用停止、`1008` 不正なメッセージ・回数超過が多すぎる、`1001` サーバーの終了。

1 つの接続が入れるインスタンスは 1 つです。別のインスタンスに `join` すると、前のところからは抜けます。

---

## 3. 参加チケット

親サーバーが参加者ごとに発行する、署名付きの身分証です。参加者どうしはこれを親サーバーの公開鍵で確かめるので、親サーバーが止まっていても相手が本物か確認できます。

### 形

```
<本体>.<署名>
本体 = base64url( JSON の TicketPayload を UTF-8 にしたもの )
署名 = base64url( Ed25519 の署名 )
```

base64url は `+` を `-`、`/` を `_` にし、末尾の `=` を取った base64 です。

**署名の対象は、本体の base64url 文字列そのもの（ASCII のバイト列）**です。JSON を署名し直すのではありません（`apps/server/src/ticket.ts` の `encodeTicket`）。

```ts
interface TicketPayload {
  v: 1
  sid: string   // 発行した親サーバーの serverId
  iid: string   // インスタンス ID
  uid: string   // 利用者 ID
  pid: string   // 接続 ID（peerId）
  name: string  // 表示名
  role: 'owner' | 'moderator' | 'member'
  iat: number   // 発行時刻（UNIX ms）
  exp: number   // 有効期限（UNIX ms）。発行から 6 時間
}
```

### 鍵

- 親サーバーは初回起動時に Ed25519 の鍵を作り、`data/keys/ed25519.pem` に保存します。
- 公開鍵は SPKI DER を base64url にしたもので、`/api/info` の `publicKey` です。
- `serverId` は SPKI DER の SHA-256 を base64url にした先頭 22 文字です。

### 確かめ方（クライアント、`apps/client/src/net/ticket.ts`・`session.ts`）

相手の `hello` に入っているチケットについて、

1. WebCrypto の Ed25519 で、本体の ASCII バイト列に対する署名を確かめる
2. `iid` が今のインスタンス、`pid` が相手の peerId、`sid` が接続している親サーバーの serverId と一致する
3. `exp` が今より 60 秒以上前でない

を満たさなければ、その相手のメッセージを無視します。Ed25519 の検証に対応していない古いブラウザでは、署名を確かめずに中身を使います（相手の一覧は親サーバーから受け取っているため）。

親サーバー側の `verifyTicket` は、さらに `iat` が 5 分より先の時刻でないことも確かめます。

`renew` で新しいチケットを受け取れます（クライアントは 1 時間ごとに送ります）。

---

## 4. 参加者どうしの通信

### 接続

- インスタンスの全員が WebRTC で全員とつながります（フルメッシュ）。
- **後から入った側**（`joinedAt` が大きい側。同じなら peerId が大きい側）が offer を出します。同時に出し合う衝突を避けるためです。
- データチャネルは最初から 2 本決めておきます（negotiated）。
  - id 0 `r`: 信頼性あり・順序あり。JSON のメッセージ（`PeerMessage`）
  - id 1 `u`: 信頼性なし・順序なし（再送なし）。バイナリ（姿勢・物の位置・中継の声）
- 音声のトランシーバー（sendrecv）も最初から作り、マイクを入れたら `replaceTrack` するだけにします（再交渉しない）。
- ICE サーバー（STUN / TURN）は `/api/info` の `iceServers` を使います。
- 接続が `failed` になったら ICE をやり直します（offer を出す側が `iceRestart`、反対側は `{kind: 'restart'}` を送る）。
- `r` のメッセージは 64KB（`PEER_MESSAGE_LIMIT`）まで、`u` は 2048 バイトまで受け付けます。`u` は送信待ちが 16KB を超えたら捨てます（古い姿勢は役に立たないため）。

### 中継

次のときは、その相手とは親サーバーの WebSocket で話します（状態 `relay`）。

- 10 秒たっても P2P が開かない
- P2P が開いたあとで切れた（親サーバーがつながっている場合）
- 相手から中継でメッセージが来た

中継のメッセージ `{t: 'relay', to, ch, data}`:

- `ch: 'r'`: `data` は `PeerMessage` の JSON 文字列
- `ch: 'u'`: `data` はバイナリを標準の base64 にした文字列
- `ch: 'v'`: 画面共有の映像の断片（種類 4）か画面共有の音（種類 5、どちらも 6 章）を base64 にした文字列。受け手は 16KB を超える断片と 1500 バイトを超える音を捨てます
- `data` の長さは `ceil(65536 × 4 / 3) + 16` 文字まで
- 親サーバーは 1 接続あたり 1 秒 64KB（`relayBytesPerSecond`、一時的には 128KB まで）を、`data の長さ × 送り先の数` で数えます。超えたぶんは捨て、`relay_rate` のエラーを返します
- `ch: 'v'` は別に、1 接続あたり 1 秒 256KB（`relayVideoBytesPerSecond`、一時的には 512KB まで）で数えます（映像のせいで声や姿勢が止まらないように）
- 設定 `relay: false` の親サーバーでは中継を使えません

声は WebRTC の音声トラックで送れない相手（中継の相手）には、Opus にして `u` で送ります（6 章）。

### 親サーバーが止まったとき

P2P でつながっている相手とは、そのまま話し続けます。P2P も切れて親サーバーもない相手は `lost` になり、15 秒たつと一覧から外れます。親サーバーにつなぎ直すと、クライアントはインスタンスに入り直します。

---

## 5. P2P のメッセージ（PeerMessage、チャネル r）

| t | 項目 | 内容 |
|---|---|---|
| `hello` | `v`、`ticket`、`avatar`、`allowContact`、`hostScore`、`stateEpoch` | 名乗る。つながったら（中継も含む）互いに送る |
| `avatar` | `avatar` | アバターを変えた（`AvatarRef`） |
| `expr` | `weights`、`gesture` | 表情の重みと左右の手の形 |
| `chat` | `id`、`text` | チャット（300 文字まで） |
| `typing` | `on` | 入力中 |
| `set` | `key`、`value`、`nonce` | 同期状態の変更の依頼（ホストへ） |
| `state` | `key`、`value`、`rev`、`by`、`nonce?` | 確定した変更（ホストから全員へ） |
| `snapshot` | `epoch`、`host`、`entries` | 同期状態の一覧（ホストから） |
| `reject` | `key`、`nonce`、`reason` | 変更を断った（ホストから依頼した人へ） |
| `event` | `name`、`payload`、`target` | イベント |
| `tping` / `tpong` | `c` / `c`、`h` | ホストとの時計合わせ |
| `touch` | `part`、`strength` | 相手に触れた部位 |
| `bye` | — | 抜ける |

- `hello` を受け取って確かめるまでは、ほかのメッセージは無視します。初めて確かめられた相手には自分も `hello` を送り直し、自分がホストなら `snapshot` を送ります。
- `AvatarRef` は `{kind: 'builtin', id, color, scale, outfits?}` か `{kind: 'vrm', id, url, sha256, scale, outfits?}`。受け手は `scale` を 0.1〜5 に収め、VRM は `http(s)` の URL と 64 桁の SHA-256 のものだけを受け付けます。
- `expr` の重みは 64 個まで、0〜1 に収めます。
- `hostScore` は受け手が 0〜100 に収めます。

受け手が相手ごとに数える上限（これを超えたものは捨てる）:

| 種類 | 上限 |
|---|---|
| `set` | 2 秒に 60 回（1 秒 30 回）。超えると `reject` |
| `event` | 2 秒に 80 回 |
| `chat` | 10 秒に 8 回 |
| バイナリ（姿勢と中継の声の合計） | 2 秒に 80 個 |

---

## 6. バイナリの形式（チャネル u）

数値はすべてリトルエンディアンです。先頭の 1 バイトで種類を見分けます（1: 姿勢、2: 物の位置、3: 声）。

### 姿勢（PoseFrame、種類 1）

20 回/秒で送ります。

| 位置 | 型 | 内容 |
|---|---|---|
| 0 | u8 | 種類 = 1 |
| 1 | u8 | 寝るポーズ（0 なし、1 仰向け、2 うつ伏せ、3 左向き、4 右向き、5 くつろぐ） |
| 2 | u16 | 連番 |
| 4 | u16 | フラグ（下の表） |
| 6 | u32 | 送った時刻（共有時計の ms の下位 32 ビット） |
| 10 | f32 × 3 | 足元の位置（ワールド座標、m） |
| 22 | i16 | 体の向き（ラジアン ÷ π × 32767） |
| 24 | u8 | 移動の速さ（m/s × 25） |
| 25 | i8 | 横の移動（−1〜1 × 127） |
| 26 | i8 | 前後の移動（−1〜1 × 127） |
| 27 | 14 バイト | 頭 |
| 41 | 14 バイト | 左手 |
| 55 | 14 バイト | 右手 |
| 69 | u8 × 10 | （フラグ Fingers のとき）指の曲がり 0〜255。左の親指〜小指、右の親指〜小指 |
| 69 または 79 | 14 バイト × 3 | （フラグ Trackers のとき）腰・左足・右足 |

「14 バイト」の点は、位置 i16 × 3（足元からの相対位置、mm）と回転 i16 × 4（四元数 x, y, z, w を正規化し、w ≥ 0 にそろえて × 32767）です。基本の大きさは 69 バイトで、受け手は大きさがフラグと合わないもの、256 バイトを超えるもの、足元の位置が 10 万 m を超えるものを捨てます。

| フラグ | 値 |
|---|---|
| VR | 1 |
| Grounded（接地） | 2 |
| Crouch（しゃがみ） | 4 |
| Prone（伏せ） | 8 |
| Sitting（着席） | 16 |
| HandTracking | 32 |
| Fingers | 64 |
| Trackers | 128 |
| Talking | 256 |
| Muted | 512 |
| Jumping | 1024 |
| Flying | 2048 |
| Seated | 4096 |

今のクライアントは Trackers・Flying・Seated を送っていません。

受け手は時刻を共有時計の近くに戻して並べ、少し遅らせて前後のフレームの間を補います（2 秒より古いものは捨てる）。

### 物の位置（種類 2）

つかめる物の持ち主が 15 回/秒で送ります。

| 位置 | 型 | 内容 |
|---|---|---|
| 0 | u8 | 種類 = 2 |
| 1 | u8 | 個数 n（32 まで） |
| 2 | u32 | 時刻（共有時計の ms の下位 32 ビット） |
| 6 + 30i | u32 | 物の ID のハッシュ（FNV-1a 32 ビット） |
| +4 | f32 × 3 | 位置（m） |
| +16 | i16 × 4 | 回転（姿勢と同じ形式） |
| +24 | i16 × 3 | 速度（m/s × 100） |

大きさは `6 + 30 × n` バイトちょうどでなければ捨てます。

### 声（種類 3、中継の相手だけ）

```
[0] u8  種類 = 3
[1] u16 連番
[3〜]   Opus のデータ 1 フレーム
```

48kHz・モノラル・24kbps・20ms ごとの Opus です（ブラウザの WebCodecs の `AudioEncoder` / `AudioDecoder` を使う）。受け手は 4〜1500 バイトのものだけを受け付け、60ms ぶんたまってから鳴らし始めます。WebCodecs や AudioWorklet が使えないブラウザでは、声の中継は動きません。

### 画面共有の映像（種類 4、中継の相手だけ・チャンネル v）

```
[0]  u8  種類 = 4
[1]  u8  フラグ（bit0: キーフレーム、bit1: H.264。0 なら VP8）
[2]  u16 フレームの連番
[4]  u8  断片の番号（0 から）
[5]  u8  断片の数（1〜255）
[6]  u16 幅（px）
[8]  u16 高さ（px）
[10] u32 時刻（ms）
[14〜]   符号化したフレームの一部
```

画面を共有している人は、中継でつながっている相手がいるあいだだけ、WebCodecs の `VideoEncoder` で符号化して送ります（H.264 の Annex B、使えなければ VP8）。1 つの断片は 16KB（ヘッダーを含む）までです。キーフレームは 3 秒ごとと、中継の相手が増えたときに送ります。受け手は共有している人（`sys:screenShare` の `owner`）からの断片だけを組み立て、フレームが抜けたら次のキーフレームまで差分を捨てます。

### 画面共有の音（種類 5、全員・チャンネル u または v）

```
[0]  u8  種類 = 5
[1]  u8  チャンネル数（1 か 2）
[2]  u16 連番
[4〜]    Opus のデータ（20ms ぶん）
```

画面を共有している人は、共有した画面に音があるとき、48kHz・ステレオ・64kbps の Opus にして全員に送ります。P2P の相手には信頼性なしのデータチャネル（u）で、中継の相手には親サーバーの中継のチャンネル v で送ります（映像の断片と同じ 1 秒 256KB の枠で数える）。1 つは 1500 バイトまでです。受け手は共有している人からの音だけを復号し、100ms ぶんたまってから鳴らし始めます。種類 5 を知らない古いクライアントは、このデータを捨てます。

---

## 7. ホストの選び方

ホストは同期状態の順番を決める参加者です。全員が同じ規則で計算するので、話し合いはしません。

候補は「自分」と「`hello` を確かめた相手のうち、状態が `lost` でない人」で、次の順に並べた先頭がホストです。

1. `hostScore > 0` の人（ホストを引き受けられる人）
2. `joinedAt` が小さい人（先に入った人）
3. peerId が小さい人

クライアントの `hostScore` は、「ホストを引き受けない」設定なら 0、スマホなら 20、それ以外は 60 です（スマホは既定で「引き受けない」がオン）。人の出入りや接続の変化があるたびに計算し直します。

---

## 8. 同期状態

キーと値の組で、全員が複製を持ちます。

- キーは `^(w|sys):[A-Za-z0-9_.\-:/]{1,120}$`。`w:` はワールド、`sys:` はプラットフォームが使います。
- 値は JSON で 16KB まで、キーは全部で 1024 個まで。

### 流れ

1. ホスト以外が変えるときは、確定待ちとして手元に置いて自分の画面に反映し、ホストへ `set {key, value, nonce}` を送ります。
2. ホストは確かめて、通れば `rev`（通し番号）を 1 増やし、全員へ `state {key, value, rev, by, nonce}` を送ります。通らなければ依頼した人へ `reject` を送ります。
3. 依頼した人は、自分の `nonce` の `state` が来たら確定、`reject` が来たら確定待ちを捨てて元の値に戻します。確定待ちのあいだに他人の変更が来ても、自分の画面は自分の値のままにします。
4. ホスト自身の変更は、確かめてすぐ確定します。
5. `sys:` のキーに `null` を書くと、そのキーは消えます（`w:` は `null` という値として残ります）。

### 一覧（snapshot）

ホストは、新しく確かめた相手に `snapshot {epoch, host, entries}` を送ります。`entries` は `[key, value, rev, by]` の配列で、48KB を超えるときは複数に分けます。受け手は今のホストから来たものだけを使います。一覧を受け取るまでは `synced = false` です。

### ホストの交代（epoch）

ホストが抜けて自分が新しいホストになったら、`epoch`（世代）を 1 増やし、自分の確定待ちを確定させてから、自分の複製を正として全員へ `snapshot` を送ります。ホスト以外の人は、新しいホストへ確定待ちの変更を送り直します。`hello` の `stateEpoch` は今の版では判断に使っていません。

### sys: のキーの検査（ホストの validate）

ホストは `sys:` のキーについて、書き込める人を確かめます（`apps/client/src/net/session.ts`）。`by` は依頼した人の peerId です。

| キー | 書ける条件 |
|---|---|
| `sys:pen:<持ち主>:...`・`sys:pin:<持ち主>:...` | 持ち主本人。消す（`null`）のは、モデレーターか、持ち主がもういないとき |
| `sys:seat:<席ID>` | 値が自分の peerId で、席が空いている・自分・座っていた人がもういないとき。立つ（`null`）のは、自分か、空いている・座っていた人がいない・モデレーターのとき |
| `sys:pick:<物ID>` | 値は `{holder, owner}` で、`owner` が自分、`holder` が `null` か自分。`null` も可 |
| `sys:world:...` | 作成者・モデレーター（チケットの `role` が `member` でない人） |
| それ以外の `sys:` | 拒否 |

`w:` のキーは、キーの形・大きさ・個数の検査だけです。

---

## 9. イベント

`event {name, payload, target}` は、送り手が相手へ直接送ります（ホストを通しません）。

- `target`: `'all'`（自分も含む全員）、`'others'`、`'host'`、peerId
- 名前は `^[A-Za-z0-9_.\-:]{1,64}$`、中身は JSON で 8KB まで
- ワールドのイベントの名前には `w.` を付けて送ります（`useEmit()('bell')` は `w.bell`）
- あとから来た人には届きません

---

## 10. 時計合わせ

### 親サーバーの時計（ふつう）

クライアントは `ping {id, c}`（`c` は `performance.now()`）を送り、`pong {id, c, s}` を受け取ります。受け取った時刻を `now` として、

```
rtt    = now - c
offset = s + rtt / 2 - (performance.timeOrigin + now)
```

を計算します。直近 12 回のうち往復時間がいちばん短い測定を使い、共有時刻は `performance.timeOrigin + performance.now() + offset` です。最初の 6 回は 0.4 秒ごと、そのあとは 10 秒ごとに測ります。

誤差の上限は `rtt / 2 + 最後に測ってからの時間 × 0.0001` です。共有時刻が 250ms を超えて変わると「時刻が飛んだ」（`jumps`）として数えます。

### ホストの時計（親サーバーが使えないとき）

親サーバーにつながっていないときは、ホスト以外の人がホストへ 2 秒ごとに `tping {c}` を送り、ホストは `tpong {c, h}`（`h` はホストの共有時刻）を返します。計算は同じです。

---

## 11. バージョン

| 名前 | 今の値 | 確かめる場所 |
|---|---|---|
| `PROTOCOL_VERSION` | `2` | クライアントは `/api/info` の `protocol`、親サーバーは `hello` の `protocol` を確かめ、違えば接続しない |
| `PEER_PROTOCOL` | `1` | `hello` の `v` で送る（今の版では受け手は確かめていない） |
| ワールドの `formatVersion` | `1` | 親サーバーとクライアントが確かめる |
| `SDK_VERSION` | `'0.1.1'` | マニフェストに記録する（読み込みのときには確かめていない） |
| アバター拡張定義の `version` | `1` | 親サーバーが確かめる |

方針: 互換性のない変更をするときは、その番号を上げます。足すだけの変更（知らない項目は無視できるもの）では上げません。
