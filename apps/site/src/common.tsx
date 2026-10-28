// サイトの共通部品: 言語・リンク先
import { useSyncExternalStore } from 'react'
import { Icon } from '../../client/src/ui/icons'

export { Icon }

// ---------------- 言語 ----------------

type Lang = 'ja' | 'en'
const KEY = 'ttv.site.lang'
const detect = (): Lang => {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'ja' || s === 'en') return s
  } catch {
    // 保存できない環境
  }
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}
let lang: Lang = detect()
const subs = new Set<() => void>()
export const setLang = (l: Lang) => {
  lang = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    // 保存できなくても切り替える
  }
  document.documentElement.lang = l
  subs.forEach((f) => f())
}
export const useLang = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => lang,
    () => lang,
  )
export const L = (ja: string, en: string) => (lang === 'ja' ? ja : en)

// ---------------- リンク先 ----------------

/** ソースコードの置き場所（あれば） */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? 'https://github.com/KinuX2/TenTenV'
/** サイトのトップ（ドキュメントの一覧） */
export const HOME = import.meta.env.BASE_URL
