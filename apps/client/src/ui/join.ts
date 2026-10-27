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

/** 招待リンク（同じ親サーバーのクライアントで開くとそのインスタンスへ） */
export const instanceLink = (instanceId: string) => {
  const api = app().api
  const u = new URL(location.origin + location.pathname)
  if (api) u.searchParams.set('server', api.base)
  u.searchParams.set('instance', instanceId)
  return u.toString()
}
