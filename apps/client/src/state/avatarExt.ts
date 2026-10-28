// 今使っているアバターの拡張定義（衣装・アクションメニュー）と、その状態
import type { AvatarExtensions, AvatarInfo, AvatarRef } from '@tentenv/protocol'
import { create } from 'zustand'

interface ExtStore {
  ext: AvatarExtensions | null
  /** 拡張定義の持ち主のアバター（VRM の id）。着替えた直後の古い定義を使わないように見る */
  avatarId: string | null
  /** 有効にしている衣装・トグルの id */
  active: Set<string>
  /** outfits を渡すと、今の見た目（衣装の指定）から有効なものを決める。なければ既定の衣装 */
  set: (ext: AvatarExtensions | null, avatarId?: string | null, outfits?: string[]) => void
  toggle: (id: string) => void
}

export const useAvatarExt = create<ExtStore>((set, get) => ({
  ext: null,
  avatarId: null,
  active: new Set(),
  set: (ext, avatarId = null, outfits) => set({ ext, avatarId: ext ? avatarId : null, active: activeFromTokens(ext, outfits) }),
  toggle: (id) => {
    const active = new Set(get().active)
    if (active.has(id)) active.delete(id)
    else active.add(id)
    set({ active })
  },
}))

/** 既定で有効な衣装の id */
export const defaultOutfits = (ext: AvatarExtensions | null) => new Set((ext?.outfits ?? []).filter((o) => o.default).map((o) => o.id))

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

/** outfitTokens の逆: 衣装の指定から、有効な衣装・トグルの id を出す（指定のないものは既定のまま） */
export const activeFromTokens = (ext: AvatarExtensions | null, tokens?: string[]): Set<string> => {
  const active = defaultOutfits(ext)
  if (!ext || !tokens?.length) return active
  const shown = new Map<string, boolean>()
  for (const t of tokens) shown.set(t.replace(/^[+-]/, ''), !t.startsWith('-'))
  for (const o of ext.outfits ?? []) {
    if (!o.nodes.length || !o.nodes.every((n) => shown.has(n))) continue
    if (o.nodes.every((n) => shown.get(n))) active.add(o.id)
    else active.delete(o.id)
  }
  for (const a of ext.actions ?? []) {
    if (a.kind !== 'toggle' || !shown.has(a.target)) continue
    if (shown.get(a.target)) active.add(a.id)
    else active.delete(a.id)
  }
  return active
}

export const withOutfits = (a: AvatarRef, tokens: string[]): AvatarRef => (a.kind === 'vrm' ? { ...a, outfits: tokens } : a)

/** 自分が使ってよいアバターか（自分のもの、または公開で利用を許可しているもの）。起動時の復元と同じ条件 */
export const canWearAvatar = (a: Pick<AvatarInfo, 'owner' | 'isPublic' | 'allowCloning'>, meId: string | null | undefined) => a.owner.id === meId || (a.isPublic && a.allowCloning)

/** 一覧のアバターを使うときの指定（既定の衣装を着る） */
export const vrmAvatarRef = (a: Pick<AvatarInfo, 'id' | 'fileUrl' | 'sha256' | 'extensions'>, abs: (url: string) => string | null): AvatarRef => ({
  kind: 'vrm',
  id: a.id,
  url: abs(a.fileUrl)!,
  sha256: a.sha256,
  scale: 1,
  outfits: outfitTokens(a.extensions, defaultOutfits(a.extensions)),
})
