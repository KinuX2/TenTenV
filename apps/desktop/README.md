# TenTenV デスクトップ版（Windows ネイティブクライアント）

TenTenV の Web クライアントを Electron で包み、**PC につないだ VR ヘッドセットでブラウザを使わずに遊べる**ようにしたアプリです。

- ページの WebXR（`navigator.xr`）を差し替え、ネイティブアドオン経由で **OpenXR**（SteamVR・Meta Quest Link・Virtual Desktop など）に出力します
- SteamVR のライブラリに登録でき、SteamVR から起動すると自動で VR に入ります
- VR を使わない普通のデスクトップアプリとしても使えます（ブラウザ版と同じ画面・操作）
- クライアントは本体（`apps/client`）を無改造で使います。親サーバーはいつも通りアプリの画面で選びます

```
TenTenV クライアント（three.js + React Three Fiber + @react-three/xr）  ※無改造
   │ navigator.xr.requestSession('immersive-vr')
   ▼
electron/webxr-polyfill.cjs  ページ内の WebXR 実装（XRSession / XRFrame / 入力 / 手 / XRWebGLLayer）
   │ three がキャンバスに左右の目を横並びで描く
   ▼
electron/preload.cjs         WebGPU でキャンバスを GPU コピー → 非同期で読み戻し（ページには XR 用の関数だけを公開）
   ▼
native/（C++17 / N-API）     OpenXR（D3D11）: フレーム待ち・姿勢・入力・ハンドトラッキング・振動・スワップチェーンへの書き込み
   ▼
OpenXR ランタイム（SteamVR / Quest Link / Virtual Desktop / WMR …）
```

## 必要なもの

**使うだけ（配布版）**: Windows 10 / 11（x64）、WebGPU が動く GPU（D3D12 対応）。VR で遊ぶなら OpenXR ランタイム（SteamVR など）。

**ソースからビルドする**:

| もの | 備考 |
| --- | --- |
| Node.js 22.13 以上 | リポジトリ全体の要件 |
| Visual Studio 2022（Build Tools 可）の「C++ によるデスクトップ開発」 | MSVC と Windows SDK |
| CMake 3.15 以上 | `cmake --version` で確認 |
| ネット接続（初回のみ） | Electron 本体と Khronos の OpenXR SDK（ローダー）を取得します |

## ビルドと起動

リポジトリのルートで:

```powershell
npm install
node node_modules/electron/install.js      # Electron 本体の取得（npm 11 の allowScripts でインストールスクリプトが止まる環境向け）
npm run build:native -w @tentenv/desktop   # OpenXR SDK を取得し、bin/tentenv_xr.node をビルド
```

起動のしかた（`apps/desktop` で実行。ルートからなら `-w @tentenv/desktop` を付ける）:

```powershell
# 開発: 別のターミナルで npm run dev:client（http://127.0.0.1:5190）を起動しておく
npm start

# ビルド済みのクライアント（apps/client/dist）をアプリ内で開く
npm run build -w @tentenv/protocol -w @tentenv/sdk; npm run build -w @tentenv/client
npx electron . --client-url bundled

# VR で起動（ワールドに入って「VR」ボタンが出たら自動で押す）
npm run start:vr
```

> VS Code のターミナルなど `ELECTRON_RUN_AS_NODE=1` が設定されている環境では、Electron が Node として動いてしまいます。その変数を消してから `npx electron` を実行してください（`npm run selftest` と配布版の `TenTenV.exe` は影響を受けません）。

## 使い方

1. 起動すると、ブラウザ版と同じ「親サーバーの選択」画面が出ます。親サーバーの URL を入れて接続し、ログインします
2. ホーム画面の「VR モード」は初期状態でオンです。オフにした場合も、ワールド右上の **「VR」ボタン**（または **Ctrl+Shift+V**）で VR に入れます
3. VR を終えるには、ランタイム側のメニュー（SteamVR のダッシュボードなど）か **Ctrl+Shift+X**

デスクトップのウィンドウには VR 中、左目の映像が表示されます。メニューバーは **Alt** キーで出ます。

| キー | 動作 |
| --- | --- |
| F11 | フルスクリーン |
| Ctrl+Shift+V / Ctrl+Shift+X | VR に入る / 終了 |
| Ctrl+Shift+C | VR の正面をリセット（いま向いている方向を正面にする） |
| Ctrl+R | 再読み込み |
| F12 | 開発者ツール |

### コマンドラインと設定ファイル

| オプション | 説明 |
| --- | --- |
| `--client-url <URL>` | 開くクライアント。`bundled`（同梱 / `apps/client/dist`）、`dev`（`http://127.0.0.1:5190`）も使える |
| `--vr` | ワールドに入ったら自動で VR に入る（SteamVR から起動したときに付く） |
| `--scale <倍率>` | ランタイムの推奨解像度に対する倍率（0.25〜2、既定 1）。重いときは 0.7〜0.8 に |
| `--latency low\|smooth` | `smooth`（既定）: 転送待ちでフレーム処理を止めない / `low`: 描いた画像をなるべく同じフレームで出す |
| `--bridge native\|ipc` | `native`（既定）: preload がアドオンを直接使う / `ipc`: preload もサンドボックス化し、アドオンはメインプロセスで動かす（画素を IPC でコピーするので遅い） |
| `--xr-mock [controllers\|hands\|cycle]` | ヘッドセット無しで疑似 HMD を使う（開発・動作確認用） |
| `--profile <フォルダ>` | ログイン状態・設定・ログの保存先（既定 `%APPDATA%\TenTenV`）。複数アカウントを同時に使うとき |
| `--unlock-fps` | Chromium の垂直同期を外す（`--vr` のときは既定でオン） |
| `--devtools` | 開発者ツールを開いて起動 |
| `--register` / `--unregister` | ウィンドウを出さずに SteamVR へ登録 / 解除して終了 |
| `--selftest [three\|r3f]` | 自己テスト（下記） |

同じ設定は JSON の設定ファイルにも書けます（後のものほど優先。コマンドライン > 環境変数 `TENTENV_CLIENT_URL` > 設定ファイル）:

- `%APPDATA%\TenTenV\config.json`（メニュー「TenTenV」→「設定ファイルを開く」）
- 配布版: `TenTenV.exe` の隣の `tentenv.config.json` / 開発時: `apps/desktop/tentenv.config.json`

```json
{
  "clientUrl": "https://client.example.org/",
  "resolutionScale": 0.8,
  "latency": "smooth",
  "bridge": "native",
  "allowedOrigins": []
}
```

`allowedOrigins` には、ウィンドウ内で開いてよい追加のオリジンを書けます（既定ではクライアント以外のページは既定のブラウザで開きます。Misskey のログイン画面などは小さなログイン用ウィンドウで開き、クライアントに戻ってきたら閉じます）。

## VR ランタイム別の使い方

アプリは Windows に登録された **アクティブな OpenXR ランタイム**（レジストリ `HKLM\SOFTWARE\Khronos\OpenXR\1\ActiveRuntime`、または環境変数 `XR_RUNTIME_JSON`）を使います。メニュー「ヘルプ」→「VR の状態」で、どのランタイムを見ているか確認できます。

### SteamVR（Valve Index / Vive / Quest + Steam Link・ALVR など）

1. SteamVR の設定 →「OpenXR」→「SteamVR を OpenXR ランタイムに設定」
2. アプリのメニュー「TenTenV」→「**SteamVR のライブラリに登録**」（初回のみ）
   - 開発中は `npm run register`（`--packaged` で `dist` の配布版を登録）。`npm run register -- --dry-run` で中身だけ確認できます
   - SteamVR が起動していれば OpenVR の `IVRApplications` で即時に登録します。起動していなければ Steam の `config\appconfig.json` に追記し、次回の SteamVR 起動時に反映されます（書き換え前に `.bak` を残します）
3. SteamVR のライブラリ（ソース「非 Steam」）に「TenTenV」が出ます。そこから起動すると `--vr` 付きで起動し、ワールドに入ると自動で VR になります

登録の解除はメニュー「SteamVR の登録を解除」か `npm run unregister`。アプリキーは `tentenv.client`、マニフェストは `%APPDATA%\TenTenV\tentenv.vrmanifest` に書かれます（配布版フォルダの `tentenv.vrmanifest` は exe からの相対パスで書いた見本です）。

### Meta Quest Link / Air Link

1. PC の Meta Quest Link アプリ →「設定」→「一般」→「OpenXR ランタイム」で Meta Quest Link を有効にする
2. Link でつないだ状態で TenTenV を起動し、ワールドで「VR」を押す

ランタイムが対応していれば、ハンドトラッキング（`XR_EXT_hand_tracking`）とリフレッシュレートの切り替え（`XR_FB_display_refresh_rate`）も使えます（Quest Link は両方に対応しています）。

### トラッカー・ハンドトラッキング・フェイストラッキング

- **フルトラッキング**: ランタイムが `XR_HTCX_vive_tracker_interaction` に対応していれば（SteamVR は対応）、役割が「腰・左足・右足」のトラッカーを読みます。値はページの `XRFrame.__ttvExtra(referenceSpace).trackers` に出ます（TenTenV の拡張。WebXR にはない）。クライアントのメニュー「トラッカーを合わせる」で合わせてから使います
- **ハンドトラッキング**: `XR_EXT_hand_tracking` の関節を、コントローラーが無いときは WebXR の `XRHand` として、コントローラーを持ったまま取れるとき（SteamVR + Index など）は `__ttvExtra(...).skeletal` として渡します
- **フェイストラッキング（OSC）**: アプリが UDP（既定 9000、クライアントの設定で変更）で OSC を受け、ページへ渡します（`window.__tentenvOSC`）。VMC プロトコルと `/avatar/parameters` に対応します

### Meta XR Simulator で確かめる

システムの OpenXR ランタイム（SteamVR など）を切り替えずに、このアプリだけをシミュレーターで動かせます。

```powershell
$env:XR_RUNTIME_JSON = "$env:APPDATA\MetaXR\MetaXrSimulator\<版>\meta_openxr_simulator.json"
npx electron . --client-url "http://127.0.0.1:5173/?noemu"
```

先にクライアントの開発サーバーを起動してください。シミュレーターの Inputs → Point + Click で「Enable Point + Click」を有効にすると、マウスでコントローラーのビームを向け、クリックでトリガーを操作できます。メニューのタブ切り替えまで確認しています。

### Virtual Desktop

- Virtual Desktop Streamer の設定で OpenXR ランタイムを **VDXR** にすると、SteamVR を経由せずに使えます
- SteamVR 経由（VD から SteamVR を起動）でも使えます。その場合は上の SteamVR の手順に従ってください

## 配布用パッケージ

```powershell
npm run build:native -w @tentenv/desktop
npm run package -w @tentenv/desktop        # → apps/desktop/dist/TenTenV-win32-x64/ と TenTenV-win32-x64.zip
```

- `apps/client/dist` が無ければクライアントをビルドしてから同梱します（`--rebuild-client` で必ずビルドし直し、`--no-client` で同梱しない）
- 同梱クライアントのオリジンは `app://tentenv` です。親サーバーの初期値は `https://tenten.marusankakusikakuonline.com/` です。別の初期値にする場合は、クライアントのビルド時に環境変数 `VITE_DEFAULT_SERVER=https://your-server.example` を設定してください
- `RunAsNode` などの Electron のヒューズは無効化しています（配布版の exe は Node として動きません）

## テスト

| コマンド | 内容 |
| --- | --- |
| `npm test` | 単体テスト（設定・オリジン判定・`app://` のパス・SteamVR マニフェスト）+ アドオンの疎通（未ビルドならスキップ） |
| `npm run test:native` | アドオンを Node で読み込み、疑似 HMD で 2 秒フレームを回して、提出した画素・イベント・振動・境界・リフレッシュレート・体のトラッカーを確認 |
| `node test/native-smoke.cjs --real` | さらに本物の OpenXR ランタイムで 5 秒間、左目=青・右目=橙を表示（ヘッドセットが必要。SteamVR が起動することがあります） |
| `npm run selftest` | Electron を起動し、疑似 HMD で three.js の WebXR（native / ipc ブリッジ）と R3F + `@react-three/xr` の `enterVR()` を確認 |
| `npm run selftest -- --real three` | 自己テストを本物のランタイムで |
| `TenTenV.exe --selftest three` | 配布版の自己テスト（結果は `%TEMP%\tentenv-selftest\`） |

自己テストが確かめること: `isSessionSupported`、`requestSession`、three の `XRWebGLLayer` 経路でのキャンバスの横並び化、ビューアーの姿勢と投影行列、`local-floor` の高さ、コントローラー（`xr-standard` の buttons / axes、トリガー・A・スティック）、`gripSpace` / `targetRaySpace`、ハンドトラッキング（`hand.get()` + `getJointPose` / `fillPoses`）、`select*` / `squeeze*` / `inputsourceschange` / `visibilitychange` / `end` イベント、振動、`bounded-floor` の境界、`updateTargetFrameRate`、正面リセット（`reset` イベント）、**提出された画素がシーンの色と一致すること**（WebGPU の読み戻し → ネイティブの経路）。結果は `test/output/selftest-*.json` と `*.png` に残ります。

## 仕組みの詳細

- **フレームループ**: `waitFrame`（ネイティブの別スレッド）→ `beginFrame` / `locateViews` / `syncInput` → ページの XR コールバック（three が両眼を描く）→ 同じタスク内で WebGPU に GPU コピーを積む → 読み戻し → アドオンの別スレッドでステージングテクスチャへコピー → スワップチェーン → `endFrame`。画像は「それを描いたときの姿勢」と一緒に提出するので、遅れたフレームもランタイムが正しく再投影します
- **フレーム処理**: 既定では画像転送を待たずに `endFrame` し、転送が遅れたときは直前の画像を使います。`--latency low` を指定した場合だけ、フレーム時間の 8 割を上限として転送を待ちます
- **表示開始時の描画**: OpenXR が同期状態で `shouldRender=false` を返し続ける場合も描画を続けます。表示状態に進んだ後はランタイムの描画指示に従います
- **基準空間**: ネイティブ側は STAGE（無ければ LOCAL_FLOOR → LOCAL）。WebXR の `local` / `local-floor` は、ブラウザと同じく「VR に入ったときの立ち位置と向き」を原点にします。`bounded-floor` はプレイエリア（`boundsGeometry` はプレイエリアの長方形）
- **入力**（`xr-standard`）: `buttons[0]` トリガー、`[1]` グリップ、`[2]` タッチパッド、`[3]` スティック押し込み、`[4]` A / X、`[5]` B / Y、`axes[0,1]` タッチパッド、`axes[2,3]` スティック。Touch / Touch Plus / Index / Vive / WMR / simple のバインドを用意しています。プロファイル名は WebXR Input Profiles の名前（`oculus-touch-v3`、`valve-index` など）
- **ハンドトラッキング**: `hand-tracking` を要求したページで、コントローラーを持っていない手を `XRHand`（25 関節）として出します。親指と人差し指の先が近づくと `select` になります
- **リフレッシュレート**: `XR_FB_display_refresh_rate` に対応したランタイムでは `supportedFrameRates` / `updateTargetFrameRate` が使えます（`@react-three/xr` の `frameRate: 'high'` が最高値を選びます）
- **VR 中**: ページと GPU のプロセスの優先度を「高」にし、画面のスリープを止めます

## セキュリティ

- すべてのウィンドウで `contextIsolation: true`、`nodeIntegration: false`。ページには `window.__tentenvXR`（XR のフレームループ用の関数だけ）を公開し、Node の機能は渡しません
- ブリッジと権限は**クライアントのオリジンだけ**に与えます（他のオリジンのページには preload がブリッジを出しません）
- 権限: マイク・全画面・マウスロック・クリップボードへの書き込み・出力先の選択を、クライアントのオリジンにだけ許可。ワールドのコードも同じオリジンで動くため、カメラはそのつど確認のダイアログを出します（TenTenV 自体はカメラを使いません）。それ以外とデバイス系の権限は拒否します
- OSC（フェイストラッキング）は `127.0.0.1` でだけ受けます。ほかの機器（スマホのアプリなど）から送るときは、PC 上の中継アプリ（VSeeFace など）を通してください
- 外部のリンク（新しいウィンドウ）は既定のブラウザで開きます。ログイン画面はサンドボックス化した別ウィンドウで開きます
- **サンドボックスについて**: 既定の `native` ブリッジでは、preload がネイティブアドオンを読むため**メインのウィンドウだけ** `sandbox: false` です（ログイン用などほかのウィンドウはサンドボックス有効）。完全にサンドボックス化したい場合は `--bridge ipc`（または設定の `"bridge": "ipc"`）にしてください。アドオンはメインプロセスで動き、preload はサンドボックスのまま動きますが、毎フレームの画素（片目 2000x2000 なら 1 フレーム約 30MB）を IPC でコピーするため、高解像度では fps が落ちます
- 二重起動は防止し、2 回目の起動（SteamVR からの起動など）は既存のウィンドウを前に出します。ウィンドウの位置と大きさは `%APPDATA%\TenTenV\window-state.json` に保存します

## 困ったとき

| 症状 | 対処 |
| --- | --- |
| 「VR」ボタンが出ない | メニュー「ヘルプ」→「VR の状態」を確認。OpenXR ランタイムが登録されていないか、`bin/tentenv_xr.node` が無い（`npm run build:native`） |
| 「VR を開始できませんでした（XR_ERROR_FORM_FACTOR_UNAVAILABLE）」 | ヘッドセットが見つかりません。接続し、ランタイム（SteamVR / Link など）を起動してから再度「VR」 |
| 「WebGPU is not available」 | GPU ドライバを更新してください。リモートデスクトップ越しや古い GPU では WebGPU が使えません |
| SteamVR のグリッドのまま映像が出ない / 止まる | 一部の環境（ALVR + SteamVR の OpenXR など）で OpenXR アプリが表示状態に進まないことがあります。SteamVR を再起動するか、Quest なら Quest Link / VDXR を試してください |
| 重い・カクつく | `--scale 0.7` で解像度を下げる。ログ（下記）の `page …ms` がページ自体の 1 フレームの処理時間です（72Hz なら 13.9ms 以内が目安） |
| 親サーバーに接続できない（CORS） | 親サーバーが接続元のオリジンを制限している場合は、サーバーの `corsOrigins` に `app://tentenv` を加えてください（既定の `*` なら不要） |
| 開発時に「クライアントを開けませんでした」 | `npm run dev:client` が動いているか確認。または `--client-url bundled` |
| SteamVR に登録できない | SteamVR を起動してからもう一度。止まっている場合は `appconfig.json` への追記になり、次回の SteamVR 起動で反映されます |
| ウィンドウを閉じようとすると確認が出る | ワールドにいる間はクライアントが離脱を確認します。「退出する」で閉じます |

ログ: `%APPDATA%\TenTenV\logs\desktop.log`（メニュー「ログのフォルダを開く」）。ページの `[TenTenV XR]` の行に、10 秒ごとの fps・ページの描画時間などが出ます。

## 既知の制限

- WebXR の Layers・AR（`immersive-ar`）・hit-test・アンカー・深度は未対応です（TenTenV のクライアントは使っていません）
- 画素を CPU 経由でコピーする方式のため、GPU 間の直接共有に比べて 1 フレームあたり数 ms の転送時間がかかります
- このリポジトリでの確認は、疑似 HMD（`--xr-mock`。トラッカーも疑似で出す）、Meta XR Simulator（Quest 3 として VR・メニューまで）、SteamVR の OpenXR ランタイムの読み込み（ヘッドセット未接続）までです。実機・実物のトラッカーでの確認はこれからです

## ファイル

| パス | 内容 |
| --- | --- |
| `electron/main.cjs` | メインプロセス（ウィンドウ・メニュー・権限・`app://` プロトコル・SteamVR 登録・自己テスト） |
| `electron/preload.cjs` | preload（WebGPU の読み戻しとブリッジ） |
| `electron/webxr-polyfill.cjs` | ページに注入する WebXR 実装 |
| `electron/xr-host.cjs` | アドオンの読み込み・VR の可否判定・ipc ブリッジ |
| `electron/config.cjs` / `protocol.cjs` / `steamvr.cjs` | 設定、`app://` の配信、SteamVR マニフェスト |
| `native/` | OpenXR ネイティブアドオン（C++17・CMake・cmake-js）。`src/openxr_session.cpp` が本体、`src/mock_session.cpp` が疑似 HMD |
| `scripts/` | ビルド・OpenXR SDK の取得・アイコン生成・登録・パッケージ・自己テスト |
| `selftest/` | 自己テストのページ（three.js / R3F + `@react-three/xr`） |
| `test/` | 単体テストとアドオンの疎通テスト |
| `assets/` | アイコン（`npm run icons` で `apps/client/public/icon.svg` の図柄から生成） |
| `tentenv.vrmanifest` | SteamVR 用マニフェストの見本 |

## ライセンス

GNU Affero General Public License v3.0（リポジトリの `LICENSE`）。同梱・参照しているサードパーティのものは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
