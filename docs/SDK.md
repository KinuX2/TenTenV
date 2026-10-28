# ワールド SDK ガイド

TenTenV のワールドは、React Three Fiber（React で three.js の 3D を書くライブラリ）のコンポーネントです。`@tentenv/sdk` のフックと部品を使うと、押せる物・つかめる物・椅子・鏡・動画・全員で同じになる状態・保存するデータなどを作れます。

このガイドでは、プロジェクトの作り方、設定ファイル、コマンド、API、同期のしくみ、制限をまとめます。実際の例は `worlds/template/`（ひな型）と `worlds/home/src/`（標準のホームワールド。SDK の機能をひととおり使っています）にあります。

---

## 1. プロジェクトを作る

SDK はこのリポジトリのワークスペースの中で使います（npm には公開していません）。`worlds/` の下のフォルダは自動でワークスペースになります。

```sh
cp -r worlds/template worlds/my-world
```

`worlds/my-world/package.json` の `name` を変えます（例 `@tentenv-worlds/my-world`）。そのあとリポジトリのルートで `npm install` を実行します。

できあがるフォルダ:

```
worlds/my-world/
├─ package.json      scripts: dev / build / pack / typecheck
├─ ttv-world.json    ワールドの設定（名前・人数・許可するドメインなど）
├─ vite.config.ts    export default defineWorldConfig()
├─ tsconfig.json
├─ public/           画像・音・モデルなど。そのままパッケージに入る
└─ src/index.tsx     ワールドの入口
```

`src/index.tsx` は、ワールドのコンポーネントを `default` か、名前付きの `World` で export します。

```tsx
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Clickable, SpawnPad, useSyncedState } from '@tentenv/sdk'

export default function World() {
  const [on, setOn] = useSyncedState('lamp', false)
  return (
    <>
      <hemisphereLight args={['#ffffff', '#555555', 1]} />
      <SpawnPad position={[0, 0, 4]} yaw={0} />
      {/* 床（type="fixed" は動かない当たり判定） */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[10, 0.1, 10]} position={[0, -0.1, 0]} />
      </RigidBody>
      <Clickable label={on ? '消す' : '点ける'} onClick={() => setOn(!on)} position={[0, 1, 0]}>
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color={on ? '#ffd040' : '#333'} />
        </mesh>
      </Clickable>
    </>
  )
}
```

- ワールドは、クライアントが用意した `<Physics>`（Rapier の物理演算、1/60 秒ごと）の中で描かれます。床や壁の当たり判定は `@react-three/rapier` の `RigidBody` や `CuboidCollider` で置きます。
- ワールドに照明が 1 つもないと、アバターが見えるようにクライアントが控えめな照明を足します。
- `public/` に置いたファイルは `useWorldEnv().assetUrl('model.glb')` で URL を得ます。

### 共有モジュール（同梱しないもの）

次のモジュールはクライアントが `window.__TTV__` で渡すので、`world.js` には入りません（ファイルを小さくし、バージョンをそろえるため）。

| モジュール | 受け取り先 |
|---|---|
| `react`、`react/jsx-runtime`、`react/jsx-dev-runtime` | クライアントの React |
| `react-dom` | 同 |
| `three` | クライアントの three.js |
| `@react-three/fiber` | 同 |
| `@react-three/drei` | 同 |
| `@react-three/rapier` | 同 |
| `@tentenv/sdk` | クライアントが持つ SDK |

一覧は `packages/sdk/src/build/vite.ts` の `SHARED_MODULES` です。これ以外のライブラリ（`three/examples/jsm/...` を含む）は `world.js` に同梱されます。ワールドは 1 つの `world.js`（IIFE 形式）にビルドされます。

---

## 2. ttv-world.json

ワールドの設定です。`ttv-world pack` がこれをもとに `world.json`（マニフェスト）を作ります。型は `packages/sdk/src/tools/manifest.ts` の `WorldProjectConfig` です。

```json
{
  "name": "ホーム",
  "description": "広場のあるワールド",
  "tags": ["home", "lobby"],
  "thumbnail": "thumbnail.png",
  "recommendedCapacity": 16,
  "maxCapacity": 32,
  "physics": { "gravity": 9.81, "jump": 4.4, "allowInfiniteJump": false },
  "camera": { "near": 0.03, "far": 900 },
  "render": { "toneMapping": "aces", "exposure": 1, "hdr": false },
  "spawn": { "position": [0, 0, 13.5], "yaw": 0 },
  "permissions": { "allowedDomains": [], "relaxedRules": [] },
  "credits": [{ "name": "three.js", "author": "three.js authors", "license": "MIT", "url": "https://github.com/mrdoob/three.js" }],
  "ignore": ["*.psd"]
}
```

| 項目 | 既定値 | 説明 |
|---|---|---|
| `name` | （必須） | ワールド名。80 文字まで |
| `description` | `""` | 説明。2000 文字まで |
| `tags` | `[]` | タグ。10 個まで、1 つ 24 文字まで |
| `thumbnail` | なし | サムネイルのファイル（`public/` に置いた名前）。パッケージにないときは無視されます |
| `recommendedCapacity` | `12` | 推奨人数（1〜80） |
| `maxCapacity` | `16` | 最大人数（1〜80）。インスタンスの定員の既定値になります（親サーバーの `maxInstanceCapacity`、既定 40 が上限） |
| `physics.gravity` | `9.81` | 重力（m/s²） |
| `physics.jump` | `4.4` | ジャンプの初速（m/s） |
| `physics.allowInfiniteJump` | `false` | 空中でも何度でもジャンプできる |
| `camera.near` / `camera.far` | `0.03` / `1000` | カメラの描画範囲（m）。`far` は利用者の「描画距離」の設定でさらに短くなります |
| `render.toneMapping` | `"aces"` | `aces`・`agx`・`neutral`・`none` |
| `render.exposure` | `1` | 露出 |
| `render.hdr` | `false` | 描画の途中を浮動小数点（HalfFloat）で持つ |
| `spawn.position` / `spawn.yaw` | 原点・0 | 出現位置と向き（度）。`<SpawnPad>` があればそちらが優先 |
| `permissions.allowedDomains` | `[]` | 動画・画像・通信を許すドメイン（32 個まで）。`example.com` か `*.example.com`（サブドメインも含む）。https のみ |
| `permissions.relaxedRules` | `[]` | 緩める静的検査のルール名（下の表） |
| `credits` | なし | 素材のクレジット `{name, author, license, url?}`。200 件まで |
| `ignore` | なし | パッケージに入れないファイル（末尾一致、`*` と `**` が使える） |

`.DS_Store`・`Thumbs.db`・`*.map`・`.gitkeep`・`index.html`・`world.json` は常に除かれます。パッケージに入れられるファイルは 2000 個まで、パス名に `..` や絶対パスは使えません。

### permissions.relaxedRules に書けるルール

アップロードの前（CLI）と、親サーバーの受け付けのときに、同じ静的検査（`.js`・`.mjs`・`.cjs` のファイルの文字列を調べること）をします。見つかったら拒否されます。どうしても必要なものだけ、ルール名を `relaxedRules` に書くと通ります。緩めたルールはワールドの詳細画面に「緩和された検査」として表示されます。

| ルール名 | 検出するもの |
|---|---|
| `no-eval` | `eval()` |
| `no-new-function` | `new Function(...)`・文字列を渡す `Function(...)` |
| `no-string-timeout` | 文字列を渡す `setTimeout` / `setInterval` |
| `no-javascript-blob` | JavaScript の Blob の作成 |
| `no-external-import` | 外部 URL からの `import()` |
| `no-network-without-permission` | SDK を通さない通信（`fetch(`・`XMLHttpRequest`・`new WebSocket(`・`EventSource`・`sendBeacon`） |
| `no-rtc-connection` | `RTCPeerConnection`・`RTCDataChannel` |
| `no-storage-access` | `localStorage`・`sessionStorage` |
| `no-cookie-access` | `document.cookie` |
| `no-indexeddb-access` | `indexedDB` |
| `no-dangerous-dom` | `innerHTML`・`outerHTML` への代入、`insertAdjacentHTML`、`document.write`、`<script>` 要素の作成 |
| `no-navigator-access` | 位置情報・カメラ・マイク・クリップボード・`credentials`・`serviceWorker`・`getUserMedia` |
| `no-sensitive-api-override` | `window.fetch = ...` などの上書き |
| `no-global-override` | `window.document`・`location`・`top`・`parent`・`__TTV__` の上書き、`location.href =` |
| `no-prototype-pollution` | 組み込みのプロトタイプの書き換え、`__proto__ =` |
| `no-obfuscation` | `\xNN` のエスケープが 400 個を超える（難読化の目安） |

通信が必要なら、ルールを緩めるより `useExternal().fetch` を使ってください（6.7）。

---

## 3. コマンド（ttv-world）

ワールドのフォルダで `npx ttv-world <コマンド>` として使います（`package.json` の `npm run dev` / `build` / `pack` からも呼べます）。

| コマンド | 内容 |
|---|---|
| `ttv-world build` | `vite build` で `dist/` を作り、ファイルの一覧と静的検査の結果を出す。問題があれば終了コード 1 |
| `ttv-world check` | `dist/world.js` の静的検査だけをする |
| `ttv-world pack [-o out.ttvw] [--no-build]` | ビルドして `.ttvw`（zip）を作る。`-o` がなければ `<name>.ttvw`（英数字以外は `_` になるので、日本語の名前なら `-o` で指定するのがおすすめ） |
| `ttv-world upload --server <URL> [--token <t>] [--world <ID>] [--no-build]` | ビルドして親サーバーへ登録する。`--world` を付けるとそのワールドの新しい版として更新する |
| `ttv-world dev [--port 5180] [--client http://localhost:5190]` | 変更を見張ってビルドし続け、`http://localhost:<port>/` でワールドを配信する。クライアントで開く URL を表示する |

`upload` のトークンは、クライアントの「設定 → アカウント・サーバー → 制作者向け」でコピーできるセッショントークンです。環境変数 `TTV_TOKEN` でも渡せます。人に教えないでください。

```sh
cd worlds/my-world
npx ttv-world upload --server http://localhost:8787 --token <トークン>
# 2 回目からは表示された ID を付けて更新
npx ttv-world upload --server http://localhost:8787 --token <トークン> --world <ワールドID>
```

クライアントのホームの「制作」タブからも `.ttvw` を登録・更新できます。

### 開発中のワールドを試す（複数タブで多人数テスト）

1. リポジトリのルートで `npm run dev:client`（クライアント、http://localhost:5190）
2. ワールドのフォルダで `npx ttv-world dev`
3. 表示された `http://localhost:5190/?devWorld=http%3A%2F%2Flocalhost%3A5180%2F` を開く（接続画面の「ワールド制作者向け: 開発中のワールドを開く」からも開けます）
4. 同じブラウザで複数のタブを開くと、タブどうしが BroadcastChannel でつながり、同期を確かめられます

開発用の実行環境は親サーバーを使いません。そのため次の違いがあります。

- 声は送りません。
- `useWorldStore` はブラウザの localStorage に保存します。
- `useInstanceFiles` の一覧は空で、アップロードはできません。
- `useNavigation` の `getWorldInfo` / `getInstanceInfo` はエラー、`listWorlds` は空の一覧を返します。
- ワールド ID は `dev:<ワールド名>`、インスタンス ID は `dev` です。
- `world.json` はリクエストのたびに作り直され、SHA-256 の照合は本番と同じように行われます。

メニューの「デバッグ」には、ホスト・同期状態・最近のイベント・接続・時計の誤差が出ます。設定の「性能の表示」をオンにすると、FPS・描画回数（draw call）・ポリゴン数が画面の隅に出ます。

---

## 4. 同期のしくみ

インスタンスの参加者は WebRTC で全員とつながり、次のものを共有します。

| しくみ | 使う API | あとから来た人に届くか |
|---|---|---|
| 同期状態（全員が同じ値を持つ） | `useSyncedState`・`useSyncedObjects`・`useOwnership` | 届く（ホストが一覧を渡す） |
| イベント（その場の合図） | `useEmit`・`useNetEvent` | 届かない |
| 共有時計 | `useNetClock`・`useSyncedTicker` | — |
| つかめる物の位置 | `<Pickup>` | 届く |
| 保存するデータ（親サーバー） | `useWorldStore` | インスタンスが閉じても残る |

### ホスト

参加者のうち 1 人が「ホスト」になり、同期状態の変更の順番を決めて全員に配ります。全員が同期状態の複製を持つので、ホストが抜けると次の人が引き継ぎます。順番は全員が同じ規則で計算します（ホストを引き受けられる人 → 先に入った人 → 接続 ID の順）。ホストだけが動かすギミックには `useIsHost()` を使います。

### 同期状態の流れ

1. `set` すると、自分の画面ではすぐに値が変わります（ホスト以外は「確定待ち」）。
2. ホストが受け付けると、全員に確定した値が届きます。
3. ホストが断ると（レート制限・大きすぎるなど）、自分の画面の値は元に戻ります。

同期状態はインスタンスのメモリにあるだけで、全員が抜けると消えます。残したいものは `useWorldStore` に保存してください。

### 上限（packages/protocol/src/limits.ts）

| 項目 | 上限 |
|---|---|
| 同期状態のキー | `w:` の後ろが `[A-Za-z0-9_.\-:/]` で 120 文字まで（`useSyncedState('lamp')` は `w:lamp` になる） |
| 値の大きさ | JSON にして 16KB |
| キーの数 | インスタンス全体で 1024 個（プラットフォームの分も含む） |
| 更新の回数 | 1 人 1 秒 30 回 |
| イベント名 | `[A-Za-z0-9_.\-:]` で 64 文字まで（中で `w.` が付くので、ワールドが使えるのは 62 文字まで） |
| イベントの中身 | JSON にして 8KB |
| イベントの回数 | 1 人 1 秒 40 回 |
| チャット | 300 文字、10 秒に 8 回 |

キーの形が違う・値が大きすぎるときは、`set` や `emit` が例外を投げます。

---

## 5. 部品（コンポーネント）

### `<Clickable>`

中の物を押せるようにします。PC は画面の中心の照準でクリック、スマホはタップ、VR はレイを当ててトリガーか、人差し指で触れます。

| props | 型・既定値 | 説明 |
|---|---|---|
| `label` | string | 照準を合わせたときの説明 |
| `enabled` | `true` | `false` で押せなくする |
| `reach` | PC 3.2m（三人称 6m）・VR 12m | 届く距離（m） |
| `onClick` | `(e: { peerId, hand: 'left'\|'right'\|'none', point: [x,y,z] }) => void` | 押されたとき（押した人の端末だけで呼ばれる） |
| `onHover` | `(hovered: boolean) => void` | VR のレイが当たった・外れた |

ほかの props は `<group>` にそのまま渡ります。当たりは中のメッシュで判定するので、見えない当たり用のメッシュでもかまいません（`visible={false}` の親の下にあると押せません）。

```tsx
<Clickable label="ベルを鳴らす" onClick={() => emit('bell')} position={[0, 1, 0]}>
  <mesh><sphereGeometry args={[0.1]} /><meshStandardMaterial /></mesh>
</Clickable>
```

### `<Pickup>`

つかめる物です。つかんだ人の手（PC は目の前）に付いて動き、位置は全員に同期されます。

| props | 既定値 | 説明 |
|---|---|---|
| `id` | （必須） | ワールドの中で一意な ID |
| `label` | — | 照準を合わせたときの説明（なければ「つかむ」） |
| `physics` | `true` | 離すと落ちる・投げられる。物の大きさの箱の当たり判定が自動で付きます |
| `orientation` | `'keep'` | `'keep'` はつかんだときの向きを保つ、`'grip'` は手の向きに合わせる |
| `throwable` | `true` | 離したときに手の勢いで飛ぶ |
| `onGrab` / `onDrop` / `onUse` | `(by: PlayerInfo) => void` | つかんだ・離した・持ったまま「使う」を押した（その人の端末で呼ばれる） |
| `onUseChange` | `(pressed: boolean, by: PlayerInfo) => void` | 「使う」を押したときに `true`、離したときや物を手放したときに `false`（その人の端末で呼ばれる） |

`ref` で `PickupHandle` を受け取れます: `holder()`（持っている人の peerId）、`isUsing()`（この端末で「使う」を押している間は `true`）、`drop()`、`reset(position, quaternion?)`（全員で元の場所へ戻す）。`onUse` は押した瞬間に一度だけ呼ばれ、押し続けている間は `isUsing()` で状態を読めます。`onUseChange` は状態が変わったときだけ呼ばれます。

- 持ち主（最後につかんだ人。いなければホスト）だけが物理演算で動かし、15 回/秒で位置を配ります。
- `physics={false}` の物は離した場所と向きがインスタンスの同期状態に残り、後から入った人にも復元されます。`reset()` は物理演算の有無にかかわらず全員の位置を合わせます。
- ほかの人が持っている物は取り上げられません。
- 自分で `RigidBody` の中に入れないでください（体は SDK が作ります）。
- 一度に送れる物の位置は 32 個までです。同時に動く物はそれ以下にしてください。

```tsx
const ref = useRef<PickupHandle>(null)
<Pickup ref={ref} id="cup" label="カップ" position={[1, 1, 0]} onUse={() => notify('乾杯！')} onUseChange={(pressed) => setPouring(pressed)}>
  <mesh><cylinderGeometry args={[0.04, 0.04, 0.1]} /><meshStandardMaterial /></mesh>
</Pickup>
<Clickable label="カップを戻す" onClick={() => ref.current?.reset([1, 1, 0])}>…</Clickable>
```

### `<Chair>`

座れる場所です。`group` の原点がお尻の位置、-Z が前です。押すと座り、ジャンプか移動で立ちます。座席の状態（誰が座っているか）は全員に同期されます。

| props | 既定値 | 説明 |
|---|---|---|
| `id` | （必須） | 一意な ID |
| `label` | `'座る'` | 説明 |
| `exit` | `{ forward: 0.6, right: 0, up: 0 }` | 立ち上がったときの位置（座席から見て、m） |
| `onInput` | — | 座っている間の移動入力 `{forward, right, up}` を受け取る（乗り物など）。これを指定すると、移動やジャンプでは立ち上がらなくなるので、立たせる処理は自分で書きます |
| `onEnter` / `onLeave` | — | 自分が座った・立った |
| `hitSize` | `[0.5, 0.5, 0.5]` | 押して座るための見えない当たり。`null` で付けない |

`ref` で `SeatHandle`（`occupant()`・`sit()`・`stand()`）を受け取れます。

### `<SpawnPad>`

入ってきた人が現れる場所です。`position`（既定 `[0,0,0]`）、`yaw`（度）。複数あるときは最後に置いたものが使われます。落ちて y が -80 より下になったときと、リスポーンしたときもここに戻ります。

### `<TriggerZone>`

見えない箱です。プレイヤーの足元から 0.5m 上の点が入っているかで判定します。

| props | 説明 |
|---|---|
| `position` / `size` | 箱の中心と大きさ（置いた場所のローカル座標） |
| `onEnter` / `onLeave` | 自分が入った・出た |
| `onCount` | 中にいる人数が変わった（全員の分を各端末で数える） |
| `debug` | 緑の枠を表示する |

### `<FaceCamera>`

中の物をいつもカメラのほうへ向けます。`mode="y"`（既定。横回転だけ）か `"full"`。

### `<MirrorSurface>`

鏡です。アバターは三人称の見た目（自分の頭も）で映ります。

| props | 既定値 | 説明 |
|---|---|---|
| `width` / `height` | `2` / `2` | 大きさ（m） |
| `position` / `rotation` | — | 置き場所 |
| `resolution` | — | 描画解像度。数値なら縦のピクセル数から鏡の縦横比に合わせて計算し、`[横, 縦]` ならそれぞれ指定（各辺 64〜4096px） |
| `color` | `'#c8ccd0'` | 鏡面の色。CSS 色か RGB の数値で指定 |
| `quality` | `1` | 画面の解像度に対する倍率（最大 2048px） |
| `tint` | `'#c8ccd0'` | 既存ワールド向けの色指定。`color` があればそちらを優先 |
| `showWorld` | `true` | `false` でアバターだけを映す（軽くなる） |

`resolution` と `color` はワールドの React state で変更できます。`resolution` の `[横, 縦]` は鏡の `width / height` と同じ比率にすると映像が伸びません。`resolution` を省略すると、従来どおり画面サイズと `quality` で解像度を決めます。

```tsx
<MirrorSurface width={2.4} height={1.8} resolution={1080} color="#e4f2dc" position={[0, 1.5, -3]} />
```

鏡はシーンをもう一度描くので重い部品です。解像度を下げるか、切り替えられるようにしておくのがおすすめです（ホームの `MirrorCorner.tsx` を参照）。

### `<MediaScreen>`

動画プレイヤーです。再生・停止・シーク・URL は全員で同期し（同期状態 `w:media:<id>`）、共有時計で再生位置をそろえるので、あとから来た人も同じ所から見られます。

| props | 既定値 | 説明 |
|---|---|---|
| `id` | （必須） | 一意な ID |
| `width` | `3.2` | 幅（m）。高さは 16:9 |
| `position` / `rotation` | — | 置き場所 |
| `defaultUrl` | `''` | 最初に流す URL |
| `controls` | `true` | 操作パネル（再生・±10 秒・最初から・URL・ループ・音量・ロック） |
| `range` | `18` | 聞こえる距離（m） |
| `volume` | `0.8` | 音量（音量は各自の手元だけで変わる） |

- URL は `https://` の直接のファイル（mp4・webm）か HLS（`.m3u8`）で、CORS（ほかのサイトから読み込むことの許可）に対応している必要があります。YouTube などの埋め込み専用の動画は再生できません。
- ドメインは `permissions.allowedDomains` に書くか、ワールドと同じ親サーバーのファイル（インスタンス共有ファイルなど）を使います。
- 「ロック」すると、ロックした人とインスタンスの作成者・モデレーターだけが操作できます。ロックした人がいなくなると誰でも操作できます。
- ずれが 0.6 秒を超えると飛び、小さいずれは再生速度を ±4% 変えて合わせます。

同期の状態の形は `MediaState` 型（`url, playing, offset, anchor, loop, lockedBy`）として export しています。

### `<ScreenShareSurface>` / `useScreenShare()`

参加者の画面やウィンドウをワールド内に表示します。ブラウザーの画面選択と許可を経てから共有が始まります。1 インスタンスで同時に共有できるのは 1 人です。複数のスクリーンを置くと同じ映像が映ります。

```tsx
import { ScreenShareSurface, useScreenShare, useDialogs, Clickable } from '@tentenv/sdk'

function SharedStage() {
  const share = useScreenShare()
  const { notify } = useDialogs()
  return <>
    <ScreenShareSurface position={[0, 2, -4]} width={4} controls={false} />
    <Clickable label={share.isSharing ? '共有を停止' : '画面を共有'}
      onClick={() => share.isSharing ? share.stop() : void share.start().catch((e) => notify(String(e)))}>
      <mesh><boxGeometry args={[0.5, 0.2, 0.1]} /><meshStandardMaterial color="#438a42" /></mesh>
    </Clickable>
  </>
}
```

`ScreenShareSurface` の `controls` は既定で `true` なので、スクリーンだけ置いても開始・停止ボタンが使えます。`width` の既定は 3.2m、`position`・`rotation`・未共有時の `placeholder` も指定できます。映像は縦横比を維持して表示します。

`useScreenShare()` は `owner`（共有者の `PlayerInfo` または `null`）、`video`（共有映像の `HTMLVideoElement` または `null`）、`isSharing`、`start()`、`stop()` を返します。独自のスクリーンを作る場合は `video` から `VideoTexture` を作れます。`start()` はクリックなどのユーザー操作から直接呼びます。`start({ frameRate: 15 })` のように映像のフレームレート（1〜30、既定 24）を指定できます。画面取得に失敗した場合は Promise が reject されます。ワールドから退出すると共有は終了します。

映像は、P2P でつながっている参加者には WebRTC で、親サーバーの中継でつながっている参加者には WebCodecs（H.264、使えなければ VP8）で符号化して中継で届きます。中継の映像は帯域を抑えるため、最大 1280×720・15 fps 以下で、中継の相手が増えるほど画質が下がります。WebCodecs が使えないブラウザー同士の中継と、開発用の別タブには映像が届きません。画面の音声は送信しません。ブラウザー版では HTTPS または localhost が必要です。

### `<ImagePanel>`

画像の板です。`url`、`width`（既定 1）、`position`、`rotation`。許可されたドメイン・同じオリジン・`blob:` の URL だけを読み込みます。

### `<PortalGate>`

別のワールドやインスタンスへの入口です。`worldId` か `instanceId`、`position`、`rotation`、`confirm`（既定 `true`、移動の前に確認する）。押すか、くぐる（1.4×2×0.4m の範囲に入る）と移動します。`worldId` のときは、空きのあるパブリックなインスタンスへ入り、なければ新しく作ります。

### `<TextPlane>`

文字の板です。フォントファイルを読み込まずに日本語を表示できます（Canvas に描きます）。

| props | 既定値 |
|---|---|
| `text` | （必須） |
| `width` | `1`（m。高さは文字の量で決まる） |
| `lineHeight` | `0.08` |
| `color` / `background` | `'#ffffff'` / `null` |
| `align` | `'center'` |
| `bold` / `padding` / `maxLines` / `radius` | `false` / `0.03` / `40` / `0.03` |
| `position` / `rotation` / `doubleSide` / `renderOrder` / `depthTest` | — / — / `false` / — / `true` |

文字が変わるたびにテクスチャを作り直すので、毎フレーム変わる文字には向きません。`wrapText` と `useTextTexture` も export しています。

### `<SpatialSound>`

置いた場所から聞こえる音です（three.js の `PositionalAudio`）。

| props | 既定値 | 説明 |
|---|---|---|
| `src` | （必須） | `public/` のファイル名か、`http(s)://` の URL |
| `position` | — | 置き場所 |
| `volume` | `0.6` | 音量 |
| `loop` | `true` | くり返す |
| `refDistance` / `maxDistance` | `2` / `30` | この距離までは同じ大きさ、そこから小さくなる（m） |
| `synced` | `true` | ループする音の再生位置を共有時計に合わせ、全員で同じ所から鳴らす |
| `playing` | `true` | 鳴らすか |

```tsx
<SpatialSound src="fountain.ogg" position={[0, 0.5, 0]} volume={0.4} maxDistance={20} />
```

### `LAYERS`

three.js のレイヤーの使い分けです。`DEFAULT: 0`、`FIRST_PERSON_ONLY: 9`（一人称の視点にだけ映る）、`THIRD_PERSON_ONLY: 10`（鏡・カメラにだけ映る）、`NO_MIRROR: 11`（鏡に映さない）、`AVATAR: 12`。1 と 2 は WebXR が左右の目に使うので避けてください。

### `useSyncedToggle(key, initial)`

`[on, toggle]` を返す、全員で同期するスイッチです（中身は `useSyncedState(key, initial)`）。ドアや照明に使います。

---

## 6. フック

すべてワールドのコンポーネントの中で使います（ワールドの外で使うとエラーになります）。

### 6.1 環境

**`useWorldEnv()`** → `{ baseUrl, assetUrl(path), worldId, worldName, instanceId, persistent, dev }`

```ts
const env = useWorldEnv()
const url = env.assetUrl('models/table.glb') // 先頭の / は付けない
```

**`useDevice()`** → `'desktop' | 'mobile' | 'vr'`。VR に入る・出るときに変わります。

### 6.2 同期状態

**`useSyncedState<T>(key, initial): [T, set]`**

全員で同じ値を持つ状態です。`useState` と同じように使え、`set` には値か関数（前の値を受け取る）を渡せます。値は JSON にできるもの（16KB まで）。

```tsx
const [score, setScore] = useSyncedState('score', 0)
<Clickable onClick={() => setScore((s) => s + 1)}>…</Clickable>
```

**`useSyncedObjects<T>(key, max = 64)`** → `{ items, spawn(data), update(id, data), remove(id), clear() }`

全員で同じ一覧を持つ物（置いたブロック・投げ込んだボールなど）です。`items` は `{ id, by, data }[]`（`by` は作った人の peerId）。`spawn` は新しい ID を返し、`max` を超えると古いものから消えます。一覧全体が 1 つの同期状態 `w:objs:<key>` に入るので、16KB に収まる数（数十個程度）にしてください。

```tsx
const balls = useSyncedObjects<{ x: number; z: number; color: string }>('balls', 30)
<Clickable label="ボールを出す" onClick={() => balls.spawn({ x: Math.random(), z: 0, color: '#ff7eb6' })}>…</Clickable>
{balls.items.map((b) => (
  <mesh key={b.id} position={[b.data.x, 0.2, b.data.z]}>…</mesh>
))}
```

（`worlds/template/src/index.tsx` の `BallMaker` が例です。）

**`useOwnership(id)`** → `{ owner, isMine, take(), release() }`

共有オブジェクトの「持ち主」です。持ち主だけが動かし、ほかの人はその結果を受け取る、という形に使います。持ち主がいなくなるとホストに戻ります。中では同期状態 `w:own:<id>` を使います。

**`useIsHost()`** → `boolean`。自分がホストか。

**`useOnChange(value, cb)`** — 値が変わったときだけ `cb(value, prev)` を呼びます（最初の描画では呼びません）。同期状態の変化に合わせた演出に便利です。

### 6.3 イベント

**`useEmit()`** → `emit(name, payload?, target = 'all')`

| target | 届く先 |
|---|---|
| `'all'` | 自分を含む全員 |
| `'others'` | 自分以外 |
| `'host'` | ホストだけ |
| peerId | その人だけ |

**`useNetEvent(name, handler)`** — `handler(payload, from: PlayerInfo)`。handler は毎回最新のものが呼ばれます。

```tsx
const emit = useEmit()
useNetEvent<{ n: number }>('firework', (p, from) => launch(p.n, from.displayName))
<Clickable onClick={() => emit('firework', { n: 3 })}>…</Clickable>
```

イベントはその場にいる人にだけ届き、保存されません。

### 6.4 時計

**`useNetClock(opts?)`** → `{ now(), synced, uncertainty, trustworthy, jumps }`

インスタンスで共通の時刻（UNIX ミリ秒）です。親サーバーとの往復時間から時計のずれを推定し、親サーバーが使えないときはホストの時計に合わせます。`now()` は `useFrame` の中で毎フレーム呼んでかまいません。

- `uncertainty`: 推定誤差の上限（ms）
- `opts.require`: `'media'`（±300ms）か `'motion'`（±100ms）を満たすまで `trustworthy` が `false`
- `jumps`: 時刻が大きく飛んだ回数（同期し直したとき）。アニメーションを合わせ直すのに使えます

```tsx
const clock = useNetClock({ require: 'motion' })
useFrame(() => { ref.current!.rotation.y = (clock.now() / 1000) % (Math.PI * 2) })
```

**`useSyncedTicker(periodMs)`** → 全員で同じ値になる、一定時間ごとに 1 ずつ増える数。

### 6.5 プレイヤー

**`usePlayers()`** → `{ local, others, all, host, getPose(peerId), getAvatarBones(peerId) }`

`PlayerInfo` は `userId`・`peerId`（その入室のあいだだけの接続 ID）・`displayName`・`iconUrl`・`isLocal`・`isHost`・`isGuest`・`role`（`'owner' | 'moderator' | 'member'`）・`device`。ほかの人の `device` は今の版では `'vr'` か `'desktop'` だけです（スマホかどうかは伝わりません）。

`getPose(peerId)` は `PlayerPose`（`position`（足元）・`yaw`・`head`・`leftHand`・`rightHand`・`headRotation`・`leftHandRotation`・`rightHandRotation`・`handsTracked`・`height`・`eyeHeight`・`grounded`・`sitting`・`velocity`）を返します。`useFrame` の中で呼んでください。

- `headRotation` は頭（視点）の向き、`leftHandRotation`・`rightHandRotation` は手の向きで、どれもワールドの座標の回転 `[x, y, z, w]`（three.js の `Quaternion` にそのまま渡せる）です。頭の正面は -Z です。
- 手の向きは、VR ではコントローラーの握り（ハンドトラッキングでは手首）の向きです。PC・スマホでは手を追跡していないので、`handsTracked` が `false` になり、手の位置と向きは頭と同じ値になります。

`getAvatarBones(peerId)` は、表示しているアバターの骨（`AvatarBones`: 骨の名前 → `{ position, quaternion, rotation }`）を返します。遠くて表示していない人・隠した人・読み込み中のアバターは `null` です。

| 値 | 内容 |
|---|---|
| `position` | 骨のワールドの位置（m） |
| `quaternion` | 骨のワールドの向き `[x, y, z, w]`。T ポーズのとき、すべての骨がアバターの体と同じ向きになる（VRM 0.x と 1.0 で同じ値） |
| `rotation` | 親の骨から見た回転（ラジアン、XYZ 順）。`useAvatarMotion().setPose` と同じ形なので、読んだ値をそのまま渡せる |

読める骨は `AVATAR_BONE_NAMES`（`useAvatarMotion` で動かせる骨と、`leftEye`・`rightEye`・`jaw`）で、アバターにない骨は入りません。値はそのフレームに描いた姿勢で、ワールドの `useFrame` がアバターより先に動くと 1 フレーム前の値になります。

```tsx
import { useRef } from 'react'
import type { Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import { usePlayers, useAvatarMotion } from '@tentenv/sdk'

// 相手の右手の先に光を置き、相手の腕の形をまねる
function Follow({ peerId }: { peerId: string }) {
  const players = usePlayers()
  const motion = useAvatarMotion()
  const light = useRef<Mesh>(null)
  useFrame(() => {
    const pose = players.getPose(peerId)
    if (pose) light.current!.position.set(...pose.rightHand)
    const bones = players.getAvatarBones(peerId)
    const arm = bones?.rightUpperArm
    if (arm && bones.rightLowerArm) motion.setPose({ rightUpperArm: arm.rotation, rightLowerArm: bones.rightLowerArm.rotation })
  })
  return <mesh ref={light}><sphereGeometry args={[0.03]} /><meshBasicMaterial color="yellow" /></mesh>
}
```

**`useTeleport()`** → `{ teleport(position, yaw?), respawn() }`。`yaw` はラジアンです（`<SpawnPad>` とマニフェストは度なので注意）。

**`useAvatarMotion()`** → `{ setPose(bones, weight?), play(motion), stop(), isActive() }`。ワールド内にいる本人のアバターの骨を動かします。ほかの参加者と途中参加者にも同じ動きが表示されます。

```tsx
import { Clickable, useAvatarMotion } from '@tentenv/sdk'

function WaveButton() {
  const avatar = useAvatarMotion()
  return <Clickable label="手を振る" onClick={() => avatar.play({
    frames: [
      { at: 0, bones: { rightUpperArm: [0, 0, 0] } },
      { at: 300, bones: { rightUpperArm: [0, 0, -1.3] } },
      { at: 600, bones: { rightUpperArm: [0, 0, -0.8] } },
      { at: 900, bones: { rightUpperArm: [0, 0, -1.3] } },
      { at: 1200, bones: { rightUpperArm: [0, 0, 0] } },
    ],
  })}>
    <mesh><boxGeometry args={[0.4, 0.2, 0.1]} /><meshStandardMaterial color="#6abf7a" /></mesh>
  </Clickable>
}
```

`setPose({ leftUpperArm: [0, 0, 1] })` は `stop()` まで姿勢を保ちます。`play` はキーフレーム間を補間し、最後の時刻で通常の動きに戻ります。`loop: true` を指定すると繰り返します。`weight` は通常の動きとの混合率（0〜1）。時刻は開始からのミリ秒、骨の回転は中立姿勢からのローカル XYZ ラジアンです。最初のフレームは `at: 0`、動きは 2〜32 フレーム、最長 60 秒で、同期状態の 16KB 制限以内に収めます。頭や手のトラッキング、移動、視点そのものは変更しません。ワールドを出ると解除されます。

**`useVoiceGain()`** → `(peerId, gain | null) => void`。その人の声の音量（0〜2）を、このワールドの中だけで変えます（ステージのマイクなど）。`null` で元に戻します。

**`useAudioListener()`** — カメラに付いている `AudioListener`。ワールドの立体音響はこれにつなぎます。

### 6.6 データ

**`useWorldStore()`** → `{ shared, player }`

親サーバーに保存するデータです。インスタンスが閉じても残ります。

- `shared`: ワールド全体で 1 つ
- `player`: 利用者ごと。書けるのは自分の分だけ。`player.read(userId, key)` で他人の分も読めます

どちらも `get(key)`・`list()`・`set(key, value)`・`increment(key, delta)`・`remove(key)`（すべて Promise）。

```tsx
const store = useWorldStore()
const visits = await store.shared.increment('visits', 1)
await store.player.set('best', 42)
```

| 項目 | 上限 |
|---|---|
| キー | `^[A-Za-z0-9_.\-:]{1,128}$` |
| 値 | JSON で 100KB（キーの長さを含む） |
| キーの数 | `shared` 256 個、1 人あたり 64 個 |
| ワールドの合計 | 10MB |
| 書き込みの回数 | 1 人 1 分 30 回 |

- 書けるのは、そのワールドのインスタンスに入っている人と、ワールドの制作者だけです。読むのはログインしている人なら誰でもできます。
- 値がないキーの `get` は `null` です（開発用の実行環境では `undefined`）。
- `increment` は数値でない値には使えません。
- 開発用の実行環境ではブラウザの localStorage に保存されます。

**`useInstanceFiles()`** → `{ list(), upload(file, opts?), update(id, changes), remove(id) }`

インスタンスで共有するファイル（アップロードした曲・画像など）です。`SharedFileInfo`（`id, fileName, contentType, fileSize, url, description, meta, locked, uploadedBy, createdAt`）を返します。

- アップロードできるのは、そのインスタンスにいる人（と作成者）です。
- 1 ファイルの上限は親サーバーの設定（既定 50MB）、1 インスタンス 200 個・合計 1GB まで。
- `opts`: `description`（500 文字まで）、`meta`（文字列 → 文字列、20 項目まで）、`onProgress(ratio)`。
- 変更・削除はアップロードした人とインスタンスの作成者（と管理者）だけ。`locked: true` にしたファイルは、ロックを外すまで変更・削除できません。
- インスタンスが閉じるとファイルも消えます。
- ファイルの URL（`/files/instances/...`）は認証なしで読めます。URL を知っている人は誰でも取得できるので、秘密のものは置かないでください。

**`useFilePicker()`** → `pickFile({ accept?, multiple?, maxBytes?, onPick, onCancel?, onError? })`

利用者にファイルを選んでもらいます（選んだファイルだけがワールドに渡ります）。`accept` は `"audio/*,.mp3"` のような形。種類や大きさが合わないと `onError({ kind: 'too_large' | 'wrong_type', message })`。VR の中ではファイルを選べないので、ヘッドセットを外して画面で選ぶよう案内が出ます。

```tsx
const pick = useFilePicker()
const files = useInstanceFiles()
<Clickable label="曲を追加" onClick={() => pick({ accept: 'audio/*', maxBytes: 50 * 1024 * 1024, onPick: ([f]) => void files.upload(f) })}>…</Clickable>
```

### 6.7 外部への通信

**`useExternal()`** → `{ isAllowed(url), fetch(url, init?) }`

`fetch` は許可された URL にだけ送れます（Cookie などの資格情報は付けません）。許可されるのは次のどれかです。

- `permissions.allowedDomains` のドメインの `https://` の URL
- クライアントと同じオリジン、親サーバーのオリジン、ワールドのファイルの URL
- 利用者が設定で「許可されていないドメインの動画・画像も読み込む」をオンにしているときの `https://` の URL

`<SpatialSound>` は今の版では許可の確認をせずに URL を読み込みます。外部の音を使うときも `allowedDomains` に書いておいてください。

### 6.8 ダイアログ

**`useDialogs()`** → `{ confirm(req), prompt(req), notify(text) }`

- `confirm({ title?, message, okLabel?, cancelLabel? })` → `Promise<boolean>`
- `prompt({ title?, message?, initial?, maxLength?, multiline? })` → `Promise<string | null>`（VR では仮想キーボード。ローマ字かな入力ができます）
- `notify(text)` — 数秒で消える通知

PC・スマホでは画面の上に、VR では目の前の板に出ます。

### 6.9 移動

**`useNavigation()`** → `{ openWorld(worldId), openInstance(instanceId), getWorldInfo(id), getInstanceInfo(id), listWorlds({ query?, tag?, sort?, limit? }) }`

`listWorlds` の `sort` は `'popular' | 'new' | 'recommended'`（既定 `popular`）、`limit` は 1〜50（既定 12）。ポータルの一覧などに使います（ホームの `PortalHall.tsx` を参照）。

### 6.10 そのほか

- `useRuntime()` — 実行環境（`WorldRuntime`）そのもの。ふつうは上のフックを使ってください。
- `SDK_VERSION` — SDK のバージョン文字列（`'0.1.1'`）。

### ビルド・ツール用のエントリ

| import | 中身 |
|---|---|
| `@tentenv/sdk/vite` | `defineWorldConfig({ entry?, vite? })`・`SHARED_MODULES` |
| `@tentenv/sdk/tools` | `packWorld`・`unpackWorld`・`scanCode`・`SCAN_RULES`・`RELAXABLE_RULES`・`buildManifest`・`checkManifest`・`domainAllowed` |
| `@tentenv/sdk/manifest` | マニフェストの関数だけ（ブラウザでも使える） |

`defineWorldConfig` の `entry` は入口のファイル（既定 `src/index.tsx`）、`vite` は追加の Vite 設定です。

---

## 7. 性能のコツ

PC だけでなく、スマホや Quest のような単体の VR ヘッドセットでも動くように作るのがおすすめです。スマホは既定で画質「低」・影なしになります。

- **描画回数（draw call）を減らす**: メッシュとマテリアルの組み合わせごとに 1 回の描画になります。同じ物をたくさん置くときは `InstancedMesh`（drei の `<Instances>` でも可）を使い、動かない物はジオメトリをまとめます。設定の「性能の表示」で回数を確かめられます。
- **ポリゴンとテクスチャ**: テクスチャは必要な大きさに。1024px 程度までを目安にし、大きな画像をたくさん使わない。
- **影と光**: 影を落とす光は 1 つまでにし、影の範囲（shadow camera）を狭く。動かない光は、明るさをテクスチャに焼き込むと軽くなります。
- **鏡**: シーンをもう一度描くので重い。`quality` を下げる、`showWorld={false}` にする、押したときだけ出すなど。
- **動画・音**: 同時に再生するのは最小限に。
- **毎フレームの処理**: `useFrame` の中で `new` を繰り返さない。React の state を毎フレーム変えない（`ref` を直接動かす）。
- **文字**: `TextPlane` は文字が変わるたびに作り直すので、頻繁に変わる表示は数を絞る。
- **同期**: 位置のように速く変わる値を同期状態に入れない（1 秒 30 回の制限があります）。動く物は `<Pickup>` か、ホストや持ち主が決めた値を共有時計で再生する形にします。

---

## 8. 安全のための制限

- ワールドのコードは、クライアントと同じページの中で動きます（iframe などでの隔離はまだしていません）。そのため、アップロード時と受け付け時の静的検査（2 章）と、SDK の API の制限で守っています。
- `world.js` とファイルは、マニフェストの SHA-256 と照合してから使います。合わないものは読み込みません。
- 外部への通信は `useExternal()` を通し、許可したドメインだけに送れます。
- 同期状態の `sys:` で始まるキー（座席・つかんだ物など）はプラットフォームが使い、ホストが書き込める人を確かめます。ワールドの値は `w:` に入ります。
- 静的検査は文字列のパターンでの検査なので、完全ではありません。利用者は、知らないワールドに入るときは注意してください。

---

## 9. アバターの拡張定義

VRM に含まれない、衣装の切り替え・手の形と表情の対応・アクションメニューを JSON で定義できます（型は `packages/protocol/src/models.ts` の `AvatarExtensions`）。

**書く場所**: クライアントのホームの「アバター」→ 自分のアバターを選ぶ →「自分のアバターの設定」の「拡張定義（衣装・ジェスチャー・アクションメニュー、JSON）」。保存すると親サーバーに記録されます（32KB まで）。

```json
{
  "version": 1,
  "outfits": [
    { "id": "hat", "label": "帽子", "nodes": ["Hat", "HatRibbon"], "default": true },
    { "id": "coat", "label": "コート", "nodes": ["Coat"], "default": false }
  ],
  "gestures": {
    "fist": { "angry": 1 },
    "victory": { "happy": 1 },
    "thumbsup": { "happy": 0.6, "relaxed": 0.4 }
  },
  "gestureCombos": {
    "victory+victory": { "surprised": 1 }
  },
  "actions": [
    { "id": "glasses", "label": "メガネ", "kind": "toggle", "target": "Glasses" },
    { "id": "smile", "label": "にっこり", "kind": "expression", "target": "happy" },
    { "id": "wow", "label": "びっくり", "kind": "emote", "target": "surprised" }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `version` | `1`（必須） |
| `outfits` | 衣装・アクセサリー。`nodes` は表示を切り替える VRM のノード（オブジェクト）名。`default: true` は最初から表示 |
| `gestures` | 手の形 → 表情（VRM の Expression 名と重み 0〜1）。手の形は `neutral`・`fist`・`open`・`point`・`victory`・`rocknroll`・`gun`・`thumbsup` |
| `gestureCombos` | `"左手+右手"` の組み合わせ → 表情 |
| `actions` | アクションメニューの項目。`kind` が `toggle` なら `target` のノードの表示を切り替え、`expression` なら `target` の表情を付けたり外したり、`emote` なら `target` の表情を 3 秒だけ付ける |

表情の決まり方（優先順位）: メニューで選んだ表情 → 両手の組み合わせ → 左右の手の表情（同じ表情は大きいほう。感情の表情 happy・angry・sad・relaxed・surprised は 1 つだけにし、右手を優先）。`gestures` に書かない手の形は既定の対応（`fist` → angry、`open` → surprised、`point` → relaxed、`victory` → happy、`rocknroll` → happy＋aa、`gun` → 左目を閉じる、`thumbsup` → happy）を使います。

衣装とトグルの状態は、ほかの人にも伝わります（1 体あたり 32 個まで）。
