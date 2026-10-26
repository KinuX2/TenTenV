// ワールドや 3D の中から、画面の UI（確認・入力・ファイル選択・通知）を呼ぶための橋渡し
// PC・スマホでは画面の上に、VR では目の前の 3D の板に出す
import type { ConfirmRequest, FileRequest, PromptRequest } from '@tentenv/sdk'
import { create } from 'zustand'

export type Dialog =
  | { id: number; kind: 'confirm'; req: ConfirmRequest; resolve: (ok: boolean) => void }
  | { id: number; kind: 'prompt'; req: PromptRequest; resolve: (v: string | null) => void }
  | { id: number; kind: 'file'; req: FileRequest }

interface DialogStore {
  dialogs: Dialog[]
  notices: { id: number; text: string; at: number }[]
  push: (d: Dialog) => void
  close: (id: number) => void
  notice: (text: string) => void
}

let n = 0
export const useDialogs = create<DialogStore>((set, get) => ({
  dialogs: [],
  notices: [],
  push: (d) => set({ dialogs: [...get().dialogs, d] }),
  close: (id) => set({ dialogs: get().dialogs.filter((d) => d.id !== id) }),
  notice: (text) => {
    const id = ++n
    set({ notices: [...get().notices.slice(-3), { id, text, at: Date.now() }] })
    setTimeout(() => set({ notices: get().notices.filter((x) => x.id !== id) }), 4500)
  },
}))

export const uiBridge = {
  confirm: (req: ConfirmRequest) =>
    new Promise<boolean>((resolve) => {
      useDialogs.getState().push({ id: ++n, kind: 'confirm', req, resolve })
    }),
  prompt: (req: PromptRequest) =>
    new Promise<string | null>((resolve) => {
      useDialogs.getState().push({ id: ++n, kind: 'prompt', req, resolve })
    }),
  pickFile: (req: FileRequest) => {
    useDialogs.getState().push({ id: ++n, kind: 'file', req })
  },
  notify: (text: string) => useDialogs.getState().notice(text),
}

/** ファイル選択の結果を確かめてからワールドへ渡す */
export const deliverFiles = (req: FileRequest, files: File[]) => {
  const accept = (req.accept ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const ok = (f: File) => {
    if (!accept.length) return true
    const name = f.name.toLowerCase()
    return accept.some((a) => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a))
  }
  const list = req.multiple ? files : files.slice(0, 1)
  for (const f of list) {
    if (req.maxBytes && f.size > req.maxBytes) {
      req.onError?.({ kind: 'too_large', message: `${f.name} は大きすぎます` })
      return
    }
    if (!ok(f)) {
      req.onError?.({ kind: 'wrong_type', message: `${f.name} は選べない種類のファイルです` })
      return
    }
  }
  if (list.length) req.onPick(list)
  else req.onCancel?.()
}
