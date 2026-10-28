# TenTenV 親サーバー

TenTenV の親サーバーです。ログイン、プロフィール・フレンド・通知、アバターとワールドの保存と配信、インスタンスの管理と参加判定、P2P 接続の仲介（シグナリング）、P2P が張れない相手への中継、通報・ブロック、ワールドの永続データ、インスタンス共有ファイルを受け持ちます。

誰でも自分の親サーバーを立てられます。利用者はクライアントの起動時に接続先の親サーバーを選びます。

- Node.js 24 以上（DB は Node 標準の `node:sqlite` を使うので、追加のデータベースは不要です）
- 依存パッケージは `ws` と `fflate` だけです

## 起動

リポジトリのルートで:

```sh
npm install
npm run dev:server          # 開発用（ファイルを変えると再起動）
# または
npm start -w @tentenv/server
```

初回起動時に `apps/server/data/` が作られ、署名用の鍵（Ed25519）も自動で作られます。既定では `http://localhost:8787` で待ち受けます。

## ログと障害調査

サーバーログは 1 行 1 JSON（JSON Lines）で標準出力・標準エラーに出力します。Docker では `docker compose logs -f server`、systemd では `journalctl -u tentenv -f` で確認できます。

主なイベント:

- `server.started` / `server.listening` / `server.shutdown.*`: 起動・待受・終了処理
- `http.request.completed`: HTTP メソッド、パス（クエリ文字列を除く）、ステータス、処理時間、応答サイズ、`requestId`
- `http.request.failed` / `http.server.error`: HTTP 処理やサーバーのエラー（スタックトレースを含む）
- `websocket.connected` / `websocket.authenticated` / `websocket.disconnected`: WebSocket の接続・認証・切断と接続数
- `process.unhandled_rejection` / `process.uncaught_exception`: プロセスで処理されなかったエラー

HTTP レスポンスには `x-request-id` が付与されます。問い合わせ時はこの値と発生時刻を合わせると該当リクエストを追いやすくなります。ログには認証トークン、Cookie、クエリ文字列、クライアント IP は記録しません。ログの保存期間・ローテーションは Docker / systemd / ホスティング側のログ管理で設定してください。

テスト:

```sh
npm test -w @tentenv/server
npm run typecheck -w @tentenv/server
```

Docker Compose で起動する場合は、リポジトリのルートで `docker compose up --build -d` を実行します。設定方法と保存先は [ルートのREADME](../../README.md#docker-compose-で起動) を参照してください。

## 設定

設定はデータフォルダの隣にある `server.config.json`（既定では `apps/server/server.config.json`）に書きます。ひな形は `server.config.example.json` です。ファイルがなければすべて既定値で動きます。

```sh
cp apps/server/server.config.example.json apps/server/server.config.json
```

| 項目 | 既定値 | 説明 |
|---|---|---|
| `name` | `"TenTenV Server"` | サーバーの名前（クライアントと、共有リンクのプレビューに表示） |
| `branding.siteName` | `"TenTenV"` | 接続画面・ホーム画面・共有ページ・ブラウザのタブ・認証画面に表示する名前 |
| `branding.logoFile` | `null` | ロゴ画像のファイル。設定ファイルからの相対パス、または絶対パス。PNG・JPEG・WebP・GIF・AVIF・SVG、最大 2MB。未設定なら標準のアイコン。SVG 以外なら、共有リンクのプレビュー画像にも使う |
| `branding.logoLayout` | `"icon"` | 正方形ロゴは `"icon"`。文字入りの横長ロゴは `"wide"` にすると縦横比を保って大きく表示し、隣にサイト名を重複表示しません |
| `description` | `""` | サーバーの説明（共有リンクのプレビューにも使う） |
| `termsUrl` | `null` | 利用規約の URL |
| `publicUrl` | `""` | 外から見たこのサーバーの URL（例 `https://vr.example.com`）。ワールドやアバターのファイルの URL に使います（パスは無視します。サブパスへの設置には対応していません）。**公開するときは必ず設定してください**。空なら `http://localhost:<port>` |
| `port` | `8787` | 待ち受けるポート |
| `misskey.enabled` | `true` | Misskey でのログインを使うか |
| `misskey.allowedHosts` | `null` | ログインを許す Misskey サーバー（例 `["misskey.io"]`）。`null` ならどこでも可 |
| `google.clientId` / `google.clientSecret` | `null` | Google ログインの OAuth クライアント。両方あれば Google でログインできます（[下記](#google-x-ログインの設定)） |
| `x.clientId` / `x.clientSecret` | `null` | X ログインの OAuth 2.0 クライアント。両方あれば X でログインできます |
| `limits.avatarBytes` | 100MB | アバター（VRM）の上限 |
| `limits.worldBytes` | 300MB | ワールドパッケージ（.ttvw）の上限（展開後の合計にも適用） |
| `limits.uploadBytes` | 3GB | 1 人あたりのアップロード容量（アバターとワールドの現在版の合計）。ワールドの古い版はこの容量に収まる分だけ残します |
| `limits.instanceFileBytes` | 50MB | インスタンス共有ファイル 1 つの上限 |
| `limits.maxInstanceCapacity` | `40` | インスタンスの定員の上限 |
| `relay` | `true` | P2P が張れない相手への WebSocket 中継を許すか |
| `iceServers` | Google の STUN | クライアントに渡す STUN / TURN サーバー |
| `admins` | `[]` | 管理者（Misskey のハンドル `@name@host` か利用者 ID） |
| `corsOrigins` | `"*"` | API を呼べるクライアントのオリジン。`"*"` か `["https://client.example"]` のような配列 |
| `trustProxy` | `false` | リバースプロキシの `X-Forwarded-For` を信用するか（プロキシの後ろに置くときは `true`）。右端（直前のプロキシが足したもの）を利用者の IP とみなすので、プロキシは 1 段にしてください |
| `rateLimits.authPerMinute` | `30` | IP ごとのログインの回数（1 分あたり） |
| `rateLimits.uploadsPerMinute` | `20` | IP ごとのアップロードの回数（1 分あたり） |

例えば `apps/server/branding/logo.png` を置き、設定ファイルに `"branding": { "siteName": "My World", "logoFile": "./branding/logo.png" }` と書きます。ロゴは公開 URL `/branding/logo` から配信されます。Docker Compose では `deploy/branding/logo.png` を置き、`deploy/compose.config.json` の `logoFile` に `/app/branding/logo.png` を指定します。名前の変更は再起動後、ロゴ画像の差し替えは再読み込み後に反映されます。

文字入りの横長ロゴなら `"logoLayout": "wide"` も指定してください。接続画面では幅を最大 280px、ホームのサイドバーではサイドバー幅に収まる大きさで表示します。画像は切り抜かず、元の縦横比を保ちます。`siteName` はブラウザのタブ名と認証画面にも使われます。
背景透過の PNG または WebP を使うと、画面の背景色になじみます。運営者が置く画像は `.gitignore` の対象で、リポジトリには含めません。

環境変数でも一部を上書きできます。

| 環境変数 | 説明 |
|---|---|
| `TTV_PORT` | 待ち受けるポート |
| `TTV_DATA` | データフォルダ（既定 `apps/server/data`）。設定ファイルはその隣の `server.config.json` を読みます |
| `TTV_PUBLIC_URL` | `publicUrl` |
| `TTV_CONFIG` | 設定ファイルの場所を直接指定する |

### 共有リンクのプレビュー（OGP）

親サーバーがクライアントの画面を配信するとき、SNS やチャットに貼ったリンクのプレビュー用に、`<title>` と OGP・Twitter Card のタグを入れます。`publicUrl` を正しく設定しておいてください（画像や URL はそれを基準に作ります）。

| 開いた URL | タイトル | 説明 | 画像 |
|---|---|---|---|
| ワールドの共有リンク（`?world=`） | ワールドの名前 | ワールドの説明 | ワールドのサムネイル |
| 招待リンク（`?instance=`） | 「ワールドの名前」への招待 | ワールドの説明 | ワールドのサムネイル |
| それ以外（トップなど） | `name` | `description` | `branding.logoFile`（SVG のときは標準のアイコン） |

非公開のワールドと、見つからないワールド・インスタンスは、トップと同じプレビューになります。インスタンスの名前は出しません。

## データの置き場所

```
apps/server/
├─ server.config.json
└─ data/                  （git には入りません）
   ├─ db.sqlite           利用者・フレンド・ワールド・通知などすべての表
   ├─ db.sqlite-wal / -shm
   ├─ keys/
   │  ├─ ed25519.pem      参加チケットの署名鍵（秘密鍵。漏らさないこと）
   │  └─ ed25519.pub      公開鍵（/api/info の publicKey と同じ）
   └─ files/
      ├─ avatars/<id>.vrm
      ├─ thumbs/          アバターのサムネイル
      ├─ icons/           利用者のアイコン
      ├─ worlds/<id>/<版>/ ワールドの中身（world.json・world.js・アセット）。古い版も 10 個まで残します
      └─ instances/<インスタンス ID>/<ファイル ID>  インスタンス共有ファイル
```

- ログインのトークンは SHA-256 にして保存し、元のトークンは保存しません（有効期限 30 日、使うたびに延長）。
- Misskey から受け取ったアクセストークンはプロフィールを読んだらすぐ捨て、保存しません。
- `serverId` は公開鍵の指紋です。**鍵を消すと serverId が変わり、別のサーバーとして扱われます**。

## 本番での動かし方（リバースプロキシと TLS）

WebXR とマイクは https でないと使えないので、公開するときは TLS を終端するリバースプロキシ（Caddy・nginx など）の後ろに置きます。設定は `publicUrl` を `https://...` にし、`trustProxy` を `true` にします。

Caddy の例（証明書は自動で取得されます）:

```
vr.example.com {
  reverse_proxy 127.0.0.1:8787
  request_body {
    max_size 320MB
  }
}
```

nginx の例:

```nginx
server {
  listen 443 ssl http2;
  server_name vr.example.com;
  ssl_certificate     /etc/letsencrypt/live/vr.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/vr.example.com/privkey.pem;

  client_max_body_size 320m;       # ワールドの上限より少し大きく
  proxy_request_buffering off;     # 大きなアップロードをそのまま流す

  location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
  }
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

常駐させるには systemd などを使います:

```ini
[Unit]
Description=TenTenV server
After=network.target

[Service]
WorkingDirectory=/srv/tentenv
ExecStart=/usr/bin/npm start -w @tentenv/server
Environment=TTV_PUBLIC_URL=https://vr.example.com
Restart=always
User=tentenv

[Install]
WantedBy=multi-user.target
```

## TURN サーバー（推奨）

P2P（WebRTC）は、片方が厳しい NAT や会社のネットワークの中にいると繋がらないことがあります。データ（位置・チャットなど）と音声は親サーバーの WebSocket で中継されます（音声は WebCodecs の Opus に変換して送るため、対応していないブラウザでは届きません）。中継は親サーバーの回線と CPU を使い、遅延も増えるので、公開するサーバーでは [coturn](https://github.com/coturn/coturn) を立てることをおすすめします。TURN があれば、P2P が繋がらない相手とも WebRTC の音声のまま話せます。

`/etc/turnserver.conf` の例:

```
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=tentenv:長いパスワード
realm=vr.example.com
cert=/etc/letsencrypt/live/vr.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/vr.example.com/privkey.pem
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
```

`server.config.json` に追加します:

```json
"iceServers": [
  { "urls": "stun:vr.example.com:3478" },
  { "urls": ["turn:vr.example.com:3478", "turns:vr.example.com:5349"], "username": "tentenv", "credential": "長いパスワード" }
]
```

この資格情報は `/api/info` でクライアントに渡されるので、TURN 専用の使い捨てのものにしてください。

## Misskey ログインの設定

Misskey の MiAuth を使います。親サーバーはパスワードを受け取らず、要求する権限は `read:account`（プロフィールを読む）だけです。Misskey 側でアプリの登録は不要です。

1. クライアントが `POST /api/auth/misskey/start {host, callback}` を呼ぶと、親サーバーは `https://<host>/miauth/<session>?name=TenTenV&callback=...&permission=read:account` を返します。
2. 利用者が Misskey で許可すると、`callback` に戻ってきます。
3. クライアントが `POST /api/auth/misskey/finish {session}` を呼ぶと、親サーバーが `https://<host>/api/miauth/<session>/check` に問い合わせ、`@username@host` の利用者としてログインさせます。

特定の Misskey サーバーの利用者だけにしたいときは `misskey.allowedHosts` に並べます。管理者は `admins` に `@name@host` で書きます。

## Google・X ログインの設定

OAuth 2.0（認可コード + PKCE）を使います。親サーバーはパスワードを受け取らず、読むのは名前・アイコン・変わらない ID だけです。アクセストークンはプロフィールを読んだらすぐ捨て、保存しません。どちらも、Google・X の開発者向けの画面でアプリ（クライアント）を登録する必要があります。**`publicUrl` を必ず設定してください**（戻り先の URL になります）。

**Google**

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で「OAuth クライアント ID」を作ります。種類は「ウェブ アプリケーション」。
2. 「承認済みのリダイレクト URI」に `https://<publicUrl のホスト>/api/auth/google/callback` を入れます。
3. 範囲（スコープ）は `openid` と `profile` だけです。OAuth 同意画面を「本番環境」にすると、テストユーザー以外もログインできます。

**X**

1. [X Developer Portal](https://developer.x.com/) でアプリを作り、「User authentication settings」で OAuth 2.0 を有効にします。種類は「Web App, Automated App or Bot」（Confidential client）。
2. 「Callback URI」に `https://<publicUrl のホスト>/api/auth/x/callback` を入れます。
3. 範囲は `users.read` と `tweet.read`（`/2/users/me` を読むのに要ります。投稿はしません）。`/2/users/me` を呼べるプランが必要です。

できた Client ID と Client Secret を設定に書きます。秘密の値は設定ファイルに書かず、環境変数 `TTV_GOOGLE_CLIENT_ID`・`TTV_GOOGLE_CLIENT_SECRET`・`TTV_X_CLIENT_ID`・`TTV_X_CLIENT_SECRET` で渡すこともできます（環境変数が優先）。Client Secret は `/api/info` などでクライアントに渡ることはありません。

```json
{ "google": { "clientId": "xxxx.apps.googleusercontent.com", "clientSecret": "..." }, "x": { "clientId": "...", "clientSecret": "..." } }
```

流れ:

1. クライアントが `POST /api/auth/<google|x>/start {callback}` を呼ぶと、親サーバーは Google・X の許可の画面の URL を返します。戻り先は親サーバーの `/api/auth/<google|x>/callback` です。
2. 利用者が許可すると親サーバーに戻り、親サーバーは認可コードを預かって `callback`（クライアントの画面）へ転送します。
3. クライアントが `POST /api/auth/<google|x>/finish {session}` を呼ぶと、親サーバーが認可コードをトークンに替えてプロフィールを読み、`google:<ID>`・`x:<ID>` の利用者としてログインさせます。

デスクトップ版は、許可の画面を既定のブラウザーで開きます（Google はアプリ内のログイン画面を受け付けないため）。このときは `callback` を省き、許可されるまで `finish` が `202 {pending: true}` を返すので、クライアントは繰り返して待ちます。管理者を `admins` に書くときは、`google:<ID>` などのハンドルか、利用者 ID を使います。

## バックアップ

`data/` フォルダをまるごと保存すれば復元できます。最低限、次の 2 つは必ず保存してください。

- `data/keys/ed25519.pem` … なくすと serverId が変わり、発行済みのチケットも使えなくなります
- `data/db.sqlite` … 動かしたままでもコピーできるように、SQLite のバックアップ機能を使います:

```sh
sqlite3 apps/server/data/db.sqlite ".backup '/backup/db-$(date +%F).sqlite'"
```

`data/files/` は大きくなるので、rsync などで差分を取るのがおすすめです。

## 制限と安全対策（概要）

- SQL はすべてプレースホルダで値を渡しています。
- 入力の長さは `@tentenv/protocol` の `LIMITS` に合わせて検査します。
- アップロードは読みながら大きさを確かめ、上限を超えた時点で 413 を返して接続を閉じます。
- ワールドは受け付け時に SDK と同じ検査（ファイル名・SHA-256・コードの静的検査）をします。
- アバターは glTF バイナリで、VRM（`VRMC_vrm` / `VRM`）拡張を持つものだけを受け付けます。
- `/files/` は `X-Content-Type-Options: nosniff` と `Content-Security-Policy: sandbox` 付きで配信し、共有ファイルの HTML などはバイナリとして返します。
- WebSocket はメッセージの形を厳密に確かめ、回数（1 秒 120 回）と中継の送信量（1 秒 64KB）を制限し、違反が続く接続は切断します。
- ワールドの永続データ: キーは `^[A-Za-z0-9_.\-:]{1,128}$`、値は 100KB まで、共有キー 256 個・1 人 64 個、ワールドあたり 10MB、書き込みは 1 人 1 分 30 回まで。書き込めるのはそのワールドのインスタンスにいる人と制作者だけで、非公開ワールドのデータは見られる人（制作者・管理者・中にいる人）だけが読めます。

## インスタンスの公開範囲

| 公開範囲 | 入れる人 |
|---|---|
| `public` | このサーバーの誰でも |
| `friends+` | 中にいる人（と作成者）のフレンド |
| `friends` | 作成者のフレンド |
| `invite+` | 中にいる人から招待された人 |
| `invite` | 作成者から招待された人 |

作成者は常に入れます。作成者がブロックした人は入れません。キックされた人はそのインスタンスに入り直せません。空になったインスタンスは 5 分後に消えます（`persistent` のものは 24 時間残ります）。管理者はどのインスタンスでもモデレーターになります。
