import type { UploadQuota } from '@tentenv/protocol'
import type { App } from '../app'
import { tooLarge } from '../http'

/** 現在のアバターとワールドの容量を合計する。ワールドの過去版は含めない。 */
export const uploadQuota = (app: App, userId: string): UploadQuota => {
  const avatarBytes = app.db.get<{ bytes: number }>('SELECT COALESCE(SUM(file_size), 0) AS bytes FROM avatars WHERE owner_id = ?', userId)!.bytes
  const worldBytes = app.db.get<{ bytes: number }>('SELECT COALESCE(SUM(total_bytes), 0) AS bytes FROM worlds WHERE author_id = ?', userId)!.bytes
  return { usedBytes: avatarBytes + worldBytes, limitBytes: app.config.limits.uploadBytes, avatarBytes, worldBytes }
}

/** 更新時は置き換えるワールドの現在版だけを差し引く。 */
export const ensureUploadQuota = (app: App, userId: string, incomingBytes: number, replacedBytes = 0) => {
  const { usedBytes, limitBytes } = uploadQuota(app, userId)
  if (usedBytes - replacedBytes + incomingBytes > limitBytes) {
    throw tooLarge(`アップロード容量が上限 ${Math.round(limitBytes / 1024 ** 3)}GB を超えます`)
  }
}
