// インスタンスに入る・作る
import type { AccessLevel } from '@tentenv/protocol'
import { L } from '../i18n'
import { app, toast, useApp } from '../state/app'

/** インスタンスに入る */
export const joinInstance = (instanceId: string) => useApp.getState().setScreen({ kind: 'world', instanceId })

/** ワールドへ行く: 空きのあるパブリックなインスタンスがあればそこへ、なければ作る（ポータル・ホーム用） */
export const goToWorld = async (worldId: string, access: AccessLevel = 'public') => {
  const api = app().api
  if (!api) return
  try {
    if (access === 'public') {
      const list = await api.instances({ worldId })
      const open = list.filter((i) => i.access === 'public' && i.occupants < i.capacity).sort((a, b) => b.occupants - a.occupants)[0]
      if (open) return joinInstance(open.id)
    }
    const inst = await api.createInstance({ worldId, access })
    joinInstance(inst.id)
  } catch (e) {
    toast(e instanceof Error ? e.message : L('ワールドに入れません', 'Cannot enter the world'), 'error')
  }
}

export const createAndJoin = async (worldId: string, access: AccessLevel, opts: { name?: string; capacity?: number } = {}) => {
  const api = app().api
  if (!api) return
  try {
    const inst = await api.createInstance({ worldId, access, ...opts })
    joinInstance(inst.id)
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error')
  }
}

/** 公開URLを起点に、Windows版からでもブラウザで開けるリンクを作る。 */
const linkBase = () => {
  const api = app().api
  if (!api) throw new Error(L('親サーバーに接続してください', 'Connect to a server first'))
  const u = new URL(app().info?.publicUrl || api.base)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(L('共有リンクを作れません', 'Cannot create a share link'))
  u.pathname = '/'
  u.search = ''
  u.hash = ''
  u.searchParams.set('server', u.origin)
  return u
}

/** インスタンスを指定しない、ワールド詳細への共有リンク。 */
export const worldLink = (worldId: string) => {
  const u = linkBase()
  u.searchParams.set('world', worldId)
  return u.toString()
}

/** 招待リンク（同じ親サーバーのクライアントで開くとそのインスタンスへ）。 */
export const instanceLink = (instanceId: string) => {
  const u = linkBase()
  u.searchParams.set('instance', instanceId)
  return u.toString()
}

export const copyWorldLink = async (worldId: string) => {
  try {
    const link = worldLink(worldId)
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link)
    else {
      const field = document.createElement('textarea')
      field.value = link
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.append(field)
      field.select()
      try {
        if (!document.execCommand('copy')) throw new Error('copy failed')
      } finally {
        field.remove()
      }
    }
    toast(L('ワールドリンクをコピーしました', 'World link copied'))
  } catch {
    toast(L('リンクをコピーできませんでした', 'Could not copy the link'), 'error')
  }
}
