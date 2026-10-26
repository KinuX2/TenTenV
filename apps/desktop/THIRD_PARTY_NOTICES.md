# サードパーティのライセンス / Third-party notices

TenTenV デスクトップ版（`apps/desktop`）は GNU Affero General Public License v3.0 です（リポジトリ直下の `LICENSE`）。
ソースと配布版（`TenTenV-win32-x64`）には、次のサードパーティのものが含まれる、またはそれを元にしています。
それぞれのライセンスに従います。

| もの | 使い方 | ライセンス |
| --- | --- | --- |
| Khronos OpenXR SDK 1.1.65（`openxr_loader.dll`・ヘッダ・インポートライブラリ） | ネイティブアドオンが OpenXR ランタイムを呼ぶ。`scripts/fetch-openxr.mjs` が公式リリースから取得し、配布版の `resources/app/bin/` に同梱 | Apache License 2.0 |
| OpenVR SDK（Valve）の `openvr_capi.h` | SteamVR への登録で使う `IVRApplications` 関数表の並び（先頭 3 関数）を `native/src/addon.cpp` に宣言している。OpenVR 本体（`openvr_api.dll`）は同梱せず、インストール済みの SteamVR のものを実行時に読む | BSD 3-Clause |
| node-addon-api | ネイティブアドオンの C++ ラッパー（ヘッダのみ・アドオンに組み込まれる） | MIT |
| three.js | 自己テスト（`selftest/`・配布版の `resources/app/vendor/three/`） | MIT |
| React / React DOM / @react-three/fiber / @react-three/xr（@pmndrs/xr ほか依存を含む） | 自己テスト `selftest/r3f.bundle.js`（ビルド時に生成） | MIT |
| Electron / Chromium | 実行環境 | MIT ほか（配布版の `LICENSE` と `LICENSES.chromium.html`） |
| TenTenV クライアント（`apps/client/dist`） | 配布版に同梱。クライアントが使うライブラリのライセンスはクライアント側に従う | MIT ほか |
| 先行実験（KinuX2 による Electron + OpenXR の WebXR ブリッジ。MIT） | 方式（WebGPU でのキャンバス読み戻し、XRWebGLLayer を横並び両眼で実装、D3D11 のマルチスレッド保護、OpenVR 関数表での .vrmanifest 登録）と、行列計算などの一部の実装を参考にした | MIT（下記） |

---

## Khronos OpenXR SDK — Apache License 2.0

```
Copyright 2017-2026 The Khronos Group Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

ライセンス全文は取得した SDK の `native/third_party/openxr/LICENSE`、配布版では `resources/app/bin/openxr_loader.LICENSE.txt` にあります。

## OpenVR SDK — BSD 3-Clause

```
Copyright (c) 2015, Valve Corporation
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation and/or
other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
may be used to endorse or promote products derived from this software without
specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 先行実験（Electron + OpenXR WebXR bridge）— MIT License

```
MIT License

Copyright (c) 2026 KinuX2

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## node-addon-api / three.js / React / @react-three — MIT License

```
node-addon-api: Copyright (c) 2017 Node.js API collaborators
three.js:       Copyright © 2010-2026 three.js authors
React:          Copyright (c) Meta Platforms, Inc. and affiliates.
@react-three/*, @pmndrs/*: Copyright (c) Poimandres

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

SteamVR は Valve Corporation の、Meta Quest / Quest Link は Meta Platforms, Inc. の、OpenXR は The Khronos Group Inc. の商標です。
