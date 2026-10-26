// 接触（[43]）を許すかどうか。相手の設定と、自分の設定の両方を見る
import { useApp } from '../state/app'
import { useNet } from '../state/net'

const isFriend = (userId: string) => useNet.getState().friends.some((f) => f.id === userId)

/** 相手の設定 setting が、自分が触れることを許しているか（userId は相手。フレンドは双方向なので相手がフレンドかを見る） */
export const contactAllowed = (setting: 'everyone' | 'friends' | 'nobody', userId: string) => setting === 'everyone' || (setting === 'friends' && isFriend(userId))

/** 自分の設定で、相手（userId）が自分に触れてよいか */
export const myContactAllows = (userId: string) => contactAllowed(useApp.getState().me?.settings.allowContact ?? 'everyone', userId)
