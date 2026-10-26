// メニュー（uikit）の日本語フォント。scripts/build-font.mjs で作った MSDF のアトラス（public/fonts）を読む
// アトラスにない文字（絵文字・まれな漢字）は □ に置き換えて出す
import { setGlobalProperties } from '@pmndrs/uikit'

interface BitmapFont {
  chars: { char: string }[]
}

let font: BitmapFont | null = null
let chars: Set<string> | null = null
let loading: Promise<void> | null = null

/** フォントを読み、uikit の既定のフォントにする（一度だけ） */
export const loadMenuFont = () =>
  (loading ??= fetch(new URL('fonts/line-seed-jp-bold-msdf.json', document.baseURI).href)
    .then((r) => {
      if (!r.ok) throw new Error(`フォントを読めません（${r.status}）`)
      return r.json() as Promise<BitmapFont>
    })
    .then((f) => {
      font = f
      chars = new Set(f.chars.map((c) => c.char))
      // メニューのすべての太さに LINE Seed JP Bold を使う
      const all = { normal: f, medium: f, bold: f } as never
      setGlobalProperties({ fontFamilies: { lineSeed: all }, fontFamily: 'lineSeed' })
    }))

export const menuFontReady = () => !!font

/** フォントにない文字を □ にする */
export const safeText = (s: string) => {
  if (!chars) return s
  let out = ''
  for (const ch of s) out += ch === '\n' || ch === '\t' || chars.has(ch) ? ch : '□'
  return out
}
