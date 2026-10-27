import type { UploadQuota } from '@tentenv/protocol'
import { L } from '../i18n'

const sizeLabel = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)}GB` : `${(bytes / 1024 ** 2).toFixed(1)}MB`

export const UploadQuotaBar: React.FC<{ quota: UploadQuota | null; limitBytes: number; error?: string | null }> = ({ quota, limitBytes, error }) => {
  const limit = quota?.limitBytes ?? limitBytes
  const used = quota?.usedBytes ?? 0
  return (
    <div className="card col" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{L('アップロード容量', 'Upload storage')}</b>
        <span className="muted">{quota ? `${sizeLabel(used)} / ${sizeLabel(limit)}` : error ? L('使用量を取得できません', 'Usage unavailable') : L('使用量を取得中', 'Loading usage')}</span>
      </div>
      <div className="bar" role="progressbar" aria-label={L('アップロード容量', 'Upload storage')} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={quota ? used : undefined}>
        <div style={{ width: `${Math.min(100, limit > 0 ? used / limit * 100 : 0)}%` }} />
      </div>
      {quota && <div className="muted small">{L('アバター', 'Avatars')} {sizeLabel(quota.avatarBytes)} · {L('ワールド', 'Worlds')} {sizeLabel(quota.worldBytes)}</div>}
    </div>
  )
}
