// ログイン中の親サーバーとの常時接続（通知・フレンドの状態・インスタンスへの参加）
import type { FriendEntry, NotificationEntry } from '@tentenv/protocol'
import { create } from 'zustand'
import { SignalClient } from '../net/signaling'
import { L } from '../i18n'
import { app, toast, useApp } from './app'

interface NetStore {
  signal: SignalClient | null
  online: boolean
  friends: FriendEntry[]
  setFriends: (f: FriendEntry[]) => void
}

export const useNet = create<NetStore>((set) => ({
  signal: null,
  online: false,
  friends: [],
  setFriends: (friends) => set({ friends }),
}))

let offs: (() => void)[] = []

/** ログインしたらつなぐ。ログアウト・サーバー変更で閉じる */
export const startSignal = () => {
  stopSignal()
  const a = app()
  if (!a.api) return null
  const api = a.api
  const s = new SignalClient(api.base, () => api.getToken())
  offs.push(
    s.onOpenChange((online) => {
      useNet.setState({ online })
      if (online) void refreshSocial()
    }),
    s.on('notify', (m) => onNotification(m.notification)),
    s.on('friend-status', (m) => {
      const list = useNet.getState().friends.map((f) =>
        f.id === m.user.id ? { ...f, ...m.user, online: m.online, location: m.location ? { ...m.location, worldId: f.location?.worldId ?? '' } : null } : f,
      )
      useNet.setState({ friends: list })
      if (m.online && !useNet.getState().friends.find((f) => f.id === m.user.id)?.online) toast(L(`${m.user.displayName} さんがオンラインになりました`, `${m.user.displayName} is online`))
    }),
    s.on('kicked', (m) => {
      toast(L(`インスタンスから退出させられました: ${m.reason}`, `You were removed from the instance: ${m.reason}`), 'error')
      useApp.getState().setScreen({ kind: 'home' })
    }),
    s.on('error', (m) => console.warn('[signal]', m.code, m.message)),
  )
  useNet.setState({ signal: s })
  // 開発時だけ: 自動テストから親サーバーとのやり取りを見られるようにする
  if (import.meta.env.DEV) {
    const w = window as unknown as { __ttvSignalLog?: string[] }
    w.__ttvSignalLog = []
    s.onAny((m) => m.t !== 'pong' && m.t !== 'relay' && m.t !== 'signal' && w.__ttvSignalLog!.push(`${Date.now() % 100000} ${m.t} ${JSON.stringify(m).slice(0, 160)}`))
  }
  return s
}

export const stopSignal = () => {
  offs.forEach((f) => f())
  offs = []
  useNet.getState().signal?.close()
  useNet.setState({ signal: null, online: false })
}

export const refreshSocial = async () => {
  const api = app().api
  if (!api || !app().me) return
  try {
    const [friends, notes] = await Promise.all([api.friends(), api.notifications()])
    useNet.setState({ friends })
    useApp.getState().setNotifications(notes)
  } catch {
    // つながらなければあとで
  }
}

const onNotification = (n: NotificationEntry) => {
  const st = useApp.getState()
  st.setNotifications([n, ...st.notifications.filter((x) => x.id !== n.id)])
  const from = n.from?.displayName ?? ''
  if (n.kind === 'invite' && n.instanceId) {
    const iid = n.instanceId
    toast(L(`${from} さんから招待: ${n.worldName ?? ''}`, `${from} invited you to ${n.worldName ?? ''}`), 'invite', {
      label: L('参加する', 'Join'),
      run: () => useApp.getState().setScreen({ kind: 'world', instanceId: iid }),
    })
  } else if (n.kind === 'friend_request') toast(L(`${from} さんからフレンド申請が届きました`, `Friend request from ${from}`), 'invite')
  else if (n.kind === 'friend_accepted') toast(L(`${from} さんとフレンドになりました`, `You are now friends with ${from}`))
  else if (n.kind === 'request_invite') toast(L(`${from} さんが参加を希望しています`, `${from} is asking to join you`), 'invite')
  else toast(n.message || L('通知があります', 'New notification'))
  void refreshSocial()
}
