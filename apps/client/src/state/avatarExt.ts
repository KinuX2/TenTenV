// 今使っているアバターの拡張定義（衣装・アクションメニュー）と、その状態
import type { AvatarExtensions, AvatarRef } from '@tentenv/protocol'
import { create } from 'zustand'

interface ExtStore {
  ext: AvatarExtensions | null
  /** 有効にしている衣装・トグルの id */
  active: Set<string>
  set: (ext: AvatarExtensions | null) => void
  toggle: (id: string) => void
}

export const useAvatarExt = create<ExtStore>((set, get) => ({
  ext: null,
  active: new Set(),
  set: (ext) => set({ ext, active: new Set((ext?.outfits ?? []).filter((o) => o.default).map((o) => o.id)) }),
  toggle: (id) => {
    const active = new Set(get().active)
    if (active.has(id)) active.delete(id)
    else active.add(id)
    set({ active })
  },
}))

/**
 * 衣装・トグルの状態を、アバターの指定（outfits）にする
 * VRM: "+ノード名" は表示、"-ノード名" は非表示。標準アバター: 衣装の id
 */
export const outfitTokens = (ext: AvatarExtensions | null, active: Set<string>): string[] => {
  if (!ext) return []
  const out: string[] = []
  for (const o of ext.outfits ?? []) for (const n of o.nodes) out.push(`${active.has(o.id) ? '+' : '-'}${n}`)
  for (const a of ext.actions ?? []) if (a.kind === 'toggle') out.push(`${active.has(a.id) ? '+' : '-'}${a.target}`)
  return out.slice(0, 32)
}

export const withOutfits = (a: AvatarRef, tokens: string[]): AvatarRef => (a.kind === 'vrm' ? { ...a, outfits: tokens } : a)
