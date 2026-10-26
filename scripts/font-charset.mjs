// メニューの文字（MSDF フォント）に入れる文字の一覧を作る
// ASCII・かな・記号・JIS 第 1 水準の漢字に、クライアントのソースに出てくる文字（第 2 水準など）を足す
// 使い方: node scripts/font-charset.mjs > charset.txt
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const set = new Set()
const range = (a, b) => {
  for (let c = a; c <= b; c++) set.add(String.fromCodePoint(c))
}
range(0x20, 0x7e) // ASCII
range(0xa0, 0xff) // Latin-1（° ± × ÷ など）
range(0x2010, 0x2027) // ダッシュ・引用符・…
range(0x2190, 0x2199) // 矢印
range(0x2200, 0x221e) // ∞ など
range(0x25a0, 0x25ff) // □ ○ △ など
range(0x2600, 0x2606) // ☆ ★
range(0x3000, 0x303f) // 和文の記号・句読点
range(0x3041, 0x309f) // ひらがな
range(0x30a0, 0x30ff) // カタカナ
range(0xff01, 0xff5e) // 全角英数・記号
range(0xff61, 0xff9f) // 半角カナ

// JIS 第 1 水準の漢字（Shift_JIS の 0x889F〜0x9872）
const sjis = new TextDecoder('shift_jis')
for (let hi = 0x88; hi <= 0x98; hi++) {
  for (let lo = 0x40; lo <= 0xfc; lo++) {
    if (lo === 0x7f) continue
    const code = (hi << 8) | lo
    if (code < 0x889f || code > 0x9872) continue
    const ch = sjis.decode(new Uint8Array([hi, lo]))
    if (ch.length === 1 && ch.charCodeAt(0) >= 0x4e00) set.add(ch)
  }
}

// クライアントのソースに出てくる文字（メニューの文言が必ず出るように）
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|json)$/.test(name)) for (const ch of readFileSync(p, 'utf8')) if (ch.codePointAt(0) >= 0x80 && ch.codePointAt(0) <= 0xffff) set.add(ch)
  }
}
walk(join(import.meta.dirname, '..', 'apps', 'client', 'src'))

process.stdout.write([...set].join(''))
