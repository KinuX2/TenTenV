// ワールドのコード（world.js）を読み込む
// - ファイルの SHA-256 をマニフェストと照らし合わせ、合わなければ実行しない
// - React・three.js などは、クライアントのものを window.__TTV__ でワールドに渡す
import * as drei from '@react-three/drei'
import * as fiber from '@react-three/fiber'
import * as rapier from '@react-three/rapier'
import type { WorldManifest } from '@tentenv/protocol'
import * as sdk from '@tentenv/sdk'
import { checkManifest } from '@tentenv/sdk/manifest'
import * as React from 'react'
import * as reactDom from 'react-dom'
import * as jsx from 'react/jsx-runtime'
import { L } from '../i18n'
import * as three from 'three'
import { fetchVerified } from './assetCache'

declare global {
  interface Window {
    __TTV__?: Record<string, unknown>
    __ttvRegister?: (m: unknown) => void
  }
}

window.__TTV__ = { react: React, jsx, reactDom, three, fiber, drei, rapier, sdk }

export type WorldComponent = React.ComponentType<Record<string, never>>

export interface LoadedWorld {
  manifest: WorldManifest
  baseUrl: string
  Component: WorldComponent
}

let queue: Promise<unknown> = Promise.resolve()

/** world.js を実行して、ワールドの部品を受け取る（同時に 1 つずつ） */
const runWorldScript = (code: string) => {
  const job = queue.then(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
        const el = document.createElement('script')
        const timer = setTimeout(() => done(new Error(L('ワールドのコードが応答しません', 'The world code is not responding'))), 15000)
        const done = (err: Error | null, m?: unknown) => {
          clearTimeout(timer)
          window.__ttvRegister = undefined
          URL.revokeObjectURL(url)
          el.remove()
          if (err) reject(err)
          else resolve(m)
        }
        window.__ttvRegister = (m) => done(null, m)
        el.onerror = () => done(new Error(L('ワールドのコードを実行できません', 'Could not run the world code')))
        el.src = url
        document.head.appendChild(el)
      }),
  )
  queue = job.catch(() => {})
  return job
}

const pickComponent = (m: unknown): WorldComponent => {
  if (typeof m === 'function') return m as WorldComponent
  const o = m as { default?: unknown; World?: unknown } | null
  const c = o?.default ?? o?.World
  if (typeof c === 'function' || (typeof c === 'object' && c !== null)) return c as WorldComponent
  throw new Error(L('ワールドの部品（default export か World）が見つかりません', 'The world component (default export or World) was not found'))
}

export const loadWorld = async (manifest: WorldManifest, baseUrl: string, onProgress?: (r: number) => void): Promise<LoadedWorld> => {
  const bad = checkManifest(manifest)
  if (bad) throw new Error(bad)
  const hash = manifest.files[manifest.entry]
  // URL 同士を文字列連結しない。entry が絶対 URL や先頭 / を含む場合に親サーバー URL が重複するのを防ぐ。
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const entryUrl = new URL(manifest.entry.replace(/^\/+/, ''), base).href
  const buf = await fetchVerified(entryUrl, hash, onProgress)
  const code = new TextDecoder().decode(buf)
  const mod = await runWorldScript(code)
  return { manifest, baseUrl, Component: pickComponent(mod) }
}

/** 開発中のワールド（ttv-world dev）: world.json をその場で取ってくる */
export const loadDevWorld = async (devUrl: string, onProgress?: (r: number) => void): Promise<LoadedWorld> => {
  const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`
  const res = await fetch(`${base}world.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`開発用サーバーから world.json を取得できません（${res.status}）`)
  const manifest = (await res.json()) as WorldManifest
  // 開発中は手元に保存しない（ハッシュの照合はする）
  const buf = await fetch(`${base}${manifest.entry}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.arrayBuffer())
  const d = await crypto.subtle.digest('SHA-256', buf)
  const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex !== manifest.files[manifest.entry]) throw new Error('world.js がマニフェストと一致しません（ビルドの途中かもしれません）')
  onProgress?.(1)
  const mod = await runWorldScript(new TextDecoder().decode(buf))
  return { manifest, baseUrl: base, Component: pickComponent(mod) }
}
