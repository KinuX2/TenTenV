# DJ Lounge

2 台のデッキとミキサーで DJ ができるクラブのワールドです。曲の読み込み・再生・テンポ・EQ・エフェクトなどの操作は、インスタンスにいる全員で同期されます。

## できること

- 2 デッキ＋ミキサーの DJ コントローラー（ホットキュー・ループ・ビートジャンプ・サンプラー・ロール・キーボード・キーシフトのパッド、BEAT SYNC、MASTER TEMPO、KEY SYNC、BEAT FX、カラー FX、SLIP・REVERSE・AUTOMIX）
- BPM と 1 拍目・キーの自動解析（手元の音声ファイルを「＋ 曲を追加」でインスタンスの共有ファイルにアップロード）
- 音に合わせて動く照明・LED ビジョン・レーザー、左右の PA スピーカー（立体音響）
- VR では手やコントローラーを近づけてボタン・つまみ・フェーダー・ジョグを直接操作
- フラッシュを弱める切り替え（各自の手元だけ）、素材とライブラリのクレジットボード

## ビルド

リポジトリのルートで:

```sh
npm run build -w @tentenv-worlds/dj-lounge
```

またはこのフォルダで `npx ttv-world build`。`dist/` にワールドのコード（`world.js`）と `public/` のファイルが出力され、コードの検査とパッケージの確認が行われます。

型の確認は `npm run typecheck`（`tsc --noEmit`）です。

## ローカルで試す

このフォルダで:

```sh
npx ttv-world dev
```

変更を見張ってビルドし続け、`http://localhost:5180/` でワールドを配信します。表示される「クライアントで開く」の URL（`http://localhost:5190/?devWorld=...`）をブラウザで開くと、ローカルのクライアントでワールドに入れます。複数のタブで開くと、多人数での同期を確かめられます（クライアントの開発サーバーを先に起動しておいてください）。

## ライセンスとクレジット

- ワールドのコード: GNU Affero General Public License v3.0（Copyright (C) 2026 TenTenV contributors）
- 曲: Tricks & Traps「Free Rhythm Game Music Pack 1 / 2」（OpenGameArt、CC0 1.0。MP3 に変換して同梱）
- オリジナル曲とサンプラーの音: このワールド用にブラウザの中で合成
- ライブラリ: three.js（MIT）、React（MIT）、React Three Fiber（MIT）、drei（MIT）、Rapier（Apache-2.0）、TenTenV SDK（AGPL-3.0）

一覧は `ttv-world.json` の `credits` と、ワールド内のクレジットボードにもあります。
