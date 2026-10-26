// クライアントに同梱しているアバター（標準アバター）
import akaneUrl from '../assets/avatars/akane.vrm?url'
import akaneThumbnailUrl from '../assets/avatars/akane-thumbnail.png?url'

export interface BundledAvatar {
  id: string
  name: string
  /** VRM のファイル（クライアントと同じ場所から配信） */
  url: string
  thumbnailUrl: string
  sha256?: string
  credit: { ja: string; en: string } | null
}

/** 先頭が標準アバター（読み込めない・重すぎるアバターの代わりにも使う） */
export const BUNDLED_AVATARS: BundledAvatar[] = [
  {
    id: 'akane',
    name: 'Akane',
    url: akaneUrl,
    thumbnailUrl: akaneThumbnailUrl,
    sha256: '68e1b0b1393af9010762dcea2aaa037a92cc4bb6e1c501b8929e45aa99db4409',
    credit: { ja: '作者: 赤山みんと 様（CC0）', en: 'by Minto Akayama (CC0)' },
  },
]

export const bundledAvatar = (id: string) => BUNDLED_AVATARS.find((a) => a.id === id) ?? null
