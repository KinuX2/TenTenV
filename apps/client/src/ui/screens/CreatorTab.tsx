// 制作（[138]）: ワールドの登録・更新
import type { WorldSummary } from '@tentenv/protocol'
import { useState } from 'react'
import { formatTime, L } from '../../i18n'
import { useApp } from '../../state/app'
import { Empty, run, useAsync } from '../common'
import { Icon } from '../icons'
import { UploadQuotaBar } from '../UploadQuotaBar'

export const CreatorTab: React.FC<{ openWorld: (id: string) => void }> = ({ openWorld }) => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const info = useApp((s) => s.info)
  const mine = useAsync<WorldSummary[]>(() => api.worlds({ author: me.id }), [api, me.id])
  const quota = useAsync(() => api.uploadQuota(), [api])
  const [progress, setProgress] = useState<number | null>(null)
  const [target, setTarget] = useState<string>('')
  const upload = async (f: File | undefined) => {
    if (!f) return
    setProgress(0)
    const w = await run(() => api.uploadWorld(f, target || undefined, setProgress), target ? L('更新しました', 'Updated') : L('登録しました', 'Uploaded'))
    setProgress(null)
    if (w) {
      mine.reload()
      quota.reload()
      openWorld(w.id)
    }
  }
  return (
    <div className="col">
      <h1>{L('制作', 'Create')}</h1>
      <UploadQuotaBar quota={quota.data} limitBytes={info?.limits.uploadBytes ?? 3 * 1024 ** 3} error={quota.error} />
      <div className="card col">
        <div className="section-title">{L('ワールドを登録する', 'Upload a world')}</div>
        <div className="muted small">
          {L('ワールドは SDK でビルドした .ttvw ファイルです。テンプレートから始めるには、リポジトリの worlds/template をコピーして npx ttv-world pack を実行します。', 'Worlds are .ttvw packages built with the SDK. Copy worlds/template and run "npx ttv-world pack".')}
        </div>
        <div className="row">
          <select className="input" style={{ maxWidth: 320 }} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{L('新しいワールドとして登録', 'Upload as a new world')}</option>
            {mine.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {L('更新', 'Update')}: {w.name}
              </option>
            ))}
          </select>
          <label className="btn primary">
            <Icon name="upload" size={18} /> {L('.ttvw を選ぶ', 'Choose .ttvw')}
            <input type="file" accept=".ttvw,.zip,application/zip" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        </div>
        {info && <div className="muted small">{L('上限', 'Limit')}: {(info.limits.worldBytes / 1048576).toFixed(0)}MB</div>}
        {progress !== null && (
          <div className="bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        <div className="muted small">
          {L('アップロードしたコードは親サーバーで検査され、危険な操作（eval・SDK を通さない通信・ストレージなど）があると拒否されます。', 'Uploaded code is scanned; unsafe operations are rejected.')}
        </div>
      </div>
      <div className="section-title">{L('自分のワールド', 'My worlds')}</div>
      {mine.data?.length === 0 && <Empty>{L('まだありません', 'None yet')}</Empty>}
      <div className="list">
        {mine.data?.map((w) => (
          <div key={w.id} className="list-item click" onClick={() => openWorld(w.id)}>
            <div className="grow">
              <div>{w.name}</div>
              <div className="muted small">
                {w.visibility} · {L('訪問', 'visits')} {w.visitCount} · {formatTime(w.updatedAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
