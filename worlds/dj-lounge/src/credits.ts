import type { Credit } from './components/CreditsBoard'

// このワールドで使っている素材とライブラリ。曲・効果音・部屋はこのワールドのために作ったもの
export const CREDITS: Credit[] = [
  { name: 'Free Rhythm Game Music Pack 1（7 曲）', author: 'Tricks & Traps', license: 'CC0 1.0', note: 'opengameart.org/content/free-rhythm-game-music-pack-1（MP3 に変換）' },
  { name: 'Free Rhythm Game Music Pack 2（8 曲）', author: 'Tricks & Traps', license: 'CC0 1.0', note: 'opengameart.org/content/free-rhythm-game-music-pack-2（MP3 に変換）' },
  { name: 'オリジナル曲（6 曲）とサンプラーの音', author: 'DJ Lounge Original', license: 'このワールド用に作成', note: 'ブラウザの中で音を合成して作っています' },
  { name: 'DJ コントローラーの配置', author: '—', license: '—', note: '一般的な 2 デッキ DJ コントローラーの並びを参考にした独自のモデル' },
  { name: 'three.js', author: 'Copyright © 2010-2026 three.js authors', license: 'MIT License' },
  { name: 'React', author: 'Copyright (c) Meta Platforms, Inc. and affiliates', license: 'MIT License' },
  { name: 'React Three Fiber', author: 'Paul Henschel（pmndrs）', license: 'MIT License' },
  { name: 'drei', author: 'Copyright (c) 2020 react-spring', license: 'MIT License' },
  { name: 'Rapier（@dimforge/rapier3d-compat）', author: 'Dimforge', license: 'Apache License 2.0' },
  { name: 'TenTenV SDK', author: 'Copyright (C) 2026 TenTenV contributors', license: 'GNU AGPL-3.0' },
]
