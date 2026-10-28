import type { ServerInfo, WorldInfo } from '@tentenv/protocol'
import { useEffect, useState } from 'react'
import { Api } from '../../api/api'
import { L } from '../../i18n'
import { Icon } from '../icons'
import { applyBrowserBranding, Brand } from '../Brand'

/** 共有URLを開いた人が、ログイン前にワールド情報を見られる画面。 */
export const SharedWorld: React.FC<{ worldId: string; server: string; onContinue: () => void }> = ({ worldId, server, onContinue }) => {
  const [world, setWorld] = useState<WorldInfo | null>(null)
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const api = new Api(server, null)
  useEffect(() => {
    let alive = true
    void api.world(worldId).then(
      (data) => { if (alive) setWorld(data) },
      (reason) => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)) },
    )
    void api.info().then((data) => { if (alive) setInfo(data) }).catch(() => {})
    return () => { alive = false }
  }, [server, worldId])
  useEffect(() => { if (info) applyBrowserBranding(info, server) }, [info, server])
  const thumb = api.abs(world?.thumbnailUrl)
  return <div className="screen shared-world-screen"><main className="shared-world-wrap">
    <Brand info={info} server={server} className="shared-world-brand" />
    <div className="shared-world-card card">
      <div className="shared-world-image" style={{ backgroundImage: thumb ? `url("${thumb}")` : undefined }}>
        {!thumb && <Icon name="globe" size={52} />}
      </div>
      <div className="shared-world-content">
        <div className="muted small">{L('ワールド', 'WORLD')}</div>
        {world ? <>
          <h1>{world.name}</h1>
          <div className="muted">{L('制作', 'By')} {world.author.displayName}</div>
          {world.description && <p>{world.description}</p>}
          {!!world.tags.length && <div className="row">{world.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div>}
        </> : error ? <div className="err">{error}</div> : <p className="muted">{L('ワールド情報を読み込み中…', 'Loading world information…')}</p>}
        <div className="shared-world-actions">
          <button className="btn primary" onClick={onContinue}>{L('ログインしてワールドを開く', 'Sign in to open this world')}</button>
          <div className="muted small">{L('ワールド情報はログインせずに確認できます', 'World details are available without signing in')}</div>
        </div>
      </div>
    </div>
  </main></div>
}
