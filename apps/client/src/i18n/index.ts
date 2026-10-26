// 多言語表示（[203]）。文言は使う場所に日本語と英語を並べて書き、表示する言語で選ぶ
import { useSyncExternalStore } from 'react'

export type Lang = 'ja' | 'en'

const detect = (): Lang => {
  try {
    const saved = localStorage.getItem('ttv.lang')
    if (saved === 'ja' || saved === 'en') return saved
  } catch {
    // 保存できない環境
  }
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()

export const getLang = () => current
export const setLang = (l: Lang) => {
  current = l
  try {
    localStorage.setItem('ttv.lang', l)
  } catch {
    // 保存できなくても表示は切り替える
  }
  document.documentElement.lang = l
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** 日本語と英語の文言から、今の言語のものを返す */
export const L = (ja: string, en: string) => (current === 'ja' ? ja : en)

/** 言語が変わったら描き直す */
export const useLang = () => useSyncExternalStore(subscribe, getLang, getLang)

export const formatTime = (iso: string | number) => {
  const d = new Date(iso)
  return d.toLocaleString(current === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
