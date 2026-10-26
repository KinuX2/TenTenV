# 使っているライブラリと素材

TenTenV が使っている外部のライブラリと、同梱している素材の一覧です。バージョンは、このリポジトリの `package-lock.json` で入るもの（`node_modules/<パッケージ>/package.json`）です。ライセンスの全文は、各パッケージに含まれるファイルを見てください。

## ライブラリ

### 実行時に使うもの

| パッケージ | バージョン | ライセンス | 使う場所 | 用途 |
|---|---|---|---|---|
| [three](https://github.com/mrdoob/three.js) | 0.186.1 | MIT | クライアント・SDK（ワールドに共有） | 3D の描画 |
| [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) | 9.8.2 | MIT | クライアント・SDK（共有） | React で three.js を書く |
| [@react-three/drei](https://github.com/pmndrs/drei) | 10.7.9 | MIT | クライアント・SDK（共有） | R3F の便利な部品 |
| [@react-three/rapier](https://github.com/pmndrs/react-three-rapier) | 2.2.0 | MIT（パッケージの package.json に記載がないため、リポジトリのライセンスによる） | クライアント・SDK（共有） | 物理演算の React 用の部品 |
| [@dimforge/rapier3d-compat](https://github.com/dimforge/rapier.js) | 0.19.2 | Apache-2.0 | クライアント（@react-three/rapier 経由） | 物理エンジン Rapier（WASM） |
| [@react-three/xr](https://github.com/pmndrs/xr) | 6.6.32 | MIT（LICENSE ファイル） | クライアント | WebXR のセッション |
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) | 3.5.5 | MIT | クライアント | VRM の読み込み・揺れもの・表情 |
| [@react-three/uikit](https://github.com/pmndrs/uikit) / @pmndrs/uikit | 1.0.77 / 1.0.77 | MIT（LICENSE ファイル。Copyright 2024 Bela Bohlender） | クライアント | ワールドの中のメニュー（画面・VR で同じ 3D の UI） |
| [@zappar/msdf-generator](https://github.com/zappar-xr/msdf-generator) | 1.2.4 | MIT | クライアントの開発（scripts/build-font.mjs） | メニューの日本語フォント（MSDF のアトラス）を作る |
| [zustand](https://github.com/pmndrs/zustand) | 5.0.16 | MIT | クライアント | 画面の状態の管理 |
| [react](https://github.com/facebook/react) | 19.3.1 | MIT | クライアント・SDK（共有） | 画面の部品 |
| [react-dom](https://github.com/facebook/react) | 19.3.1 | MIT | クライアント | 同 |
| [hls.js](https://github.com/video-dev/hls.js) | 1.7.3 | Apache-2.0 | SDK（`MediaScreen`） | HLS の動画の再生（ブラウザが対応していないとき） |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | MIT | 親サーバー・SDK の CLI | `.ttvw`（zip）の作成と展開 |
| [ws](https://github.com/websockets/ws) | 8.22.0 | MIT | 親サーバー | WebSocket |
| [tsx](https://github.com/privatenumber/tsx) | 4.23.15 | MIT | 親サーバー・SDK の CLI | TypeScript をそのまま実行する |

- 「共有」と書いたものは、クライアントがワールドのコードに渡すので、ワールドのパッケージには入りません（[SDK.md](SDK.md) の 1 章）。
- `@react-three/xr` は、開発ビルドで WebXR のエミュレーターに `iwer`・`@iwer/devui`・`@iwer/sem`（いずれも MIT）を使います。本番ではエミュレーターを使いません。

### 開発・ビルドだけに使うもの

| パッケージ | バージョン | ライセンス | 用途 |
|---|---|---|---|
| [playwright-core](https://github.com/microsoft/playwright) | 1.64.1 | Apache-2.0 | ブラウザでの自動確認（`tests/e2e`） |
| [vite](https://github.com/vitejs/vite) | 8.3.5 | MIT | クライアントとワールドのビルド |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 6.1.2 | MIT | 同 |
| [typescript](https://github.com/microsoft/TypeScript) | 5.9.3 | Apache-2.0 | 型の検査 |

`apps/desktop`（Windows ネイティブクライアント）の依存は、apps/desktop/README.md を見てください。

## 外部のサービス

| サービス | いつ使うか |
|---|---|
| Google の STUN サーバー（`stun:stun.l.google.com:19302`） | 親サーバーの `iceServers` の既定値。P2P の接続のとき（運営者が変えられます） |
| storage.googleapis.com | Web カメラでの推定をオンにしたとき、推定のモデルをダウンロード |
| 利用者が選んだ Misskey のサーバー | Misskey でログインするとき |

## 同梱している素材

### メニューのフォント「LINE Seed JP Bold」（apps/client/public/fonts/line-seed-jp-bold-msdf.json）

[LINE Seed JP Bold](https://github.com/google/fonts/tree/main/ofl/lineseedjp)（© LY Corporation）を MSDF のアトラス（ASCII・かな・記号・JIS 第 1 水準の漢字など 3,736 文字）に変換して同梱しています。**SIL Open Font License 1.1**。ライセンスの全文は同じフォルダの `OFL.txt` にあります。変換は `scripts/build-font.mjs`（TTF は同梱していません）。

### 標準アバター「Akane」（apps/client/src/assets/avatars/akane.vrm）

作者: **赤山みんと 様**（minto_akayama）。VRM に書かれた利用条件は **CC0**（改変・再配布・商用利用可）。作者の表示は必須ではありませんが、敬意を込めて表示しています（アバターの選択画面にも表示）。

### ホームワールド（worlds/home）

ワールドの形・テクスチャ・音は、すべてコードで作っています（MIT、TenTenV contributors）。外部の素材は使っていません。

### DJ ラウンジ（worlds/dj-lounge）

楽曲は Tricks & Traps による「Free Rhythm Game Music Pack 1 / 2」（OpenGameArt、**CC0 1.0**）を MP3 に変換して同梱しています。

| 曲名 | 収録 |
|---|---|
| Ascend | [Free Rhythm Game Music Pack 1](https://opengameart.org/content/free-rhythm-game-music-pack-1) |
| The Lab | Pack 1 |
| Vessel of Eternity | Pack 1 |
| Bow For Me | Pack 1 |
| Passing Timeline | Pack 1 |
| Glory Days | Pack 1 |
| Psychic | Pack 1 |
| Drama | [Free Rhythm Game Music Pack 2](https://opengameart.org/content/free-rhythm-game-music-pack-2) |
| Mental Corruption | Pack 2 |
| Logic or Emotions | Pack 2 |
| Stomper | Pack 2 |
| Ripped Apart | Pack 2 |
| Celebration and Fear | Pack 2 |
| What's Cooking? | Pack 2 |
| Zen Devils | Pack 2 |

- オリジナル曲（6 曲）とサンプラーの音は、このワールド用にブラウザの中で合成したものです。
- 音の高さを変える AudioWorklet（`public/pitch-shifter.js`）は、このワールド用に書いたコードです（MIT）。
- 一覧は `worlds/dj-lounge/ttv-world.json` の `credits` と、ワールドの中のクレジットボードにもあります。

## 利用者のコンテンツ

利用者がアップロードしたワールド・アバター・ファイルには、TenTenV のライセンスは適用されません。アバターは VRM に書かれた利用条件に、ワールドは制作者が `credits` などで示す条件に従ってください。
