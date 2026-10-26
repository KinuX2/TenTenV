// アバター（[26][27][29][31][33][34][38]）
import { Canvas, useThree } from '@react-three/fiber'
import { SleepPose, type AvatarInfo, type AvatarRef } from '@tentenv/protocol'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { LAYERS } from '@tentenv/sdk'
import { AvatarView, type AvatarFrame } from '../../avatar/AvatarView'
import type { AvatarModel } from '../../avatar/types'
import { describeMeta } from '../../avatar/vrm'
import { outfitTokens } from '../../state/avatarExt'
import { L } from '../../i18n'
import { DEFAULT_AVATAR, useApp } from '../../state/app'
import { BUNDLED_AVATARS } from '../../avatar/bundled'
import { useSettings } from '../../state/settings'
import { actions } from '../actions'
import { Empty, Modal, Range, run, useAsync } from '../common'
import { ReportModal } from './FriendsTab'
import { Icon } from '../icons'

/** アバターの見本（ゆっくり回る） */
export const AvatarPreview: React.FC<{ avatar: AvatarRef; height?: number; onModel?: (m: AvatarModel | null) => void; capture?: (fn: () => Promise<Blob | null>) => void }> = ({ avatar, height = 320, onModel, capture }) => (
  <div style={{ height, borderRadius: 12, overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 40%, #27304f, #0d0f17)' }}>
    <Canvas camera={{ fov: 30, position: [0, 1.1, 4.2] }} gl={{ preserveDrawingBuffer: true, antialias: true }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} />
      <Suspense fallback={null}>
        <PreviewAvatar avatar={avatar} onModel={onModel} capture={capture} />
      </Suspense>
    </Canvas>
  </div>
)

const PreviewAvatar: React.FC<{ avatar: AvatarRef; onModel?: (m: AvatarModel | null) => void; capture?: (fn: () => Promise<Blob | null>) => void }> = ({ avatar, onModel, capture }) => {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const t0 = useRef(performance.now())
  // アバターは専用のレイヤーにあるので、プレビューのカメラにも映す（頭は三人称の見た目）
  useEffect(() => {
    camera.layers.enable(LAYERS.AVATAR)
    camera.layers.enable(LAYERS.THIRD_PERSON_ONLY)
  }, [camera])
  useEffect(() => {
    capture?.(() => new Promise((res) => gl.domElement.toBlob((b) => res(b), 'image/png')))
  }, [capture, gl])
  const frame = (): AvatarFrame => {
    const t = (performance.now() - t0.current) / 1000
    return {
      pose: {
        root: new Vector3(0, 0, 0),
        yaw: Math.PI + Math.sin(t * 0.5) * 0.6,
        vr: false,
        head: null,
        left: null,
        right: null,
        pitch: 0,
        fingers: null,
        trackers: null,
        speed: 0,
        moveX: 0,
        moveZ: 0,
        grounded: true,
        crouch: false,
        prone: false,
        sitting: false,
        sleep: SleepPose.None,
        scale: 1,
      },
      expression: {},
      voice: { level: 0, visemes: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, talking: false },
      look: [camera.position.x, camera.position.y, camera.position.z],
    }
  }
  return (
    <AvatarView
      avatar={avatar}
      ignoreLimits
      frame={frame}
      onModel={(m) => {
        if (m) {
          // 全身が入るようにカメラを合わせる
          const h = m.height
          camera.position.set(0, h * 0.55, h * 2.4)
          camera.lookAt(0, h * 0.5, 0)
        }
        onModel?.(m)
      }}
    />
  )
}

export const AvatarsTab: React.FC = () => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const current = useApp((s) => s.avatar)
  const [mode, setMode] = useState<'mine' | 'favorites'>('mine')
  const [detail, setDetail] = useState<AvatarInfo | null>(null)
  const [uploading, setUploading] = useState(false)
  const scale = useSettings((s) => s.s.avatarScale)
  const list = useAsync(() => (mode === 'mine' ? api.avatars({ mine: true }) : api.avatars({ favorites: true })), [api, mode])
  const useBuiltin = (id: string) => actions.setAvatar({ ...DEFAULT_AVATAR, id })
  const useVrm = (a: AvatarInfo) => {
    actions.setAvatar({ kind: 'vrm', id: a.id, url: api.abs(a.fileUrl)!, sha256: a.sha256, scale: 1, outfits: outfitTokens(a.extensions, new Set((a.extensions?.outfits ?? []).filter((o) => o.default).map((o) => o.id))) })
    void api.updateMe({ currentAvatarId: a.id }).catch(() => {})
  }
  return (
    <div className="col">
      <h1>{L('アバター', 'Avatars')}</h1>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card col" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div className="section-title">{L('今のアバター', 'Current avatar')}</div>
          <AvatarPreview avatar={current} height={300} />
          <Range label={L('大きさ', 'Size')} value={scale} min={0.3} max={3} step={0.05} onChange={(v) => useSettings.getState().set({ avatarScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
        <div className="card col" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div className="section-title">{L('標準のアバター', 'Built-in avatar')}</div>
          <div className="col" style={{ gap: 6 }}>
            {BUNDLED_AVATARS.map((b) => (
              <button key={b.id} className={`btn${current.kind === 'builtin' && current.id === b.id ? ' active' : ''}`} onClick={() => useBuiltin(b.id)} style={{ justifyContent: 'space-between' }}>
                <img src={b.thumbnailUrl} alt="" width={36} height={36} style={{ borderRadius: 6, objectFit: 'cover' }} />
                <span className="grow" style={{ textAlign: 'left' }}>{b.name}</span>
                {b.credit && <span className="muted small">{L(b.credit.ja, b.credit.en)}</span>}
              </button>
            ))}
          </div>
          <hr className="sep" />
          <div className="section-title">{L('VRM をアップロード', 'Upload VRM')}</div>
          <div className="muted small">{L('VRM 0.x / 1.0 に対応しています。VRM に書かれた利用条件を守って使ってください。', 'VRM 0.x and 1.0 are supported. Follow the license written in the VRM.')}</div>
          <button className="btn primary" onClick={() => setUploading(true)}>
            <Icon name="upload" size={18} /> {L('VRM を選ぶ', 'Choose VRM')}
          </button>
        </div>
      </div>
      <div className="row">
        {(['mine', 'favorites'] as const).map((m) => (
          <button key={m} className={`btn small${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
            {m === 'mine' ? L('自分のアバター', 'Mine') : L('お気に入り', 'Favorites')}
          </button>
        ))}
      </div>
      {list.data?.length === 0 && <Empty>{mode === 'mine' ? L('まだアップロードしていません', 'No uploads yet') : L('見つかりません', 'Nothing found')}</Empty>}
      <div className="grid">
        {list.data?.map((a) => {
          const thumb = api.abs(a.thumbnailUrl)
          const isCur = current.kind === 'vrm' && current.id === a.id
          return (
            <div key={a.id} className="tile" onClick={() => setDetail(a)}>
              <div className="thumb" style={{ backgroundImage: thumb ? `url("${thumb}")` : undefined, aspectRatio: '1' }}>{!thumb && <Icon name="avatar" size={40} stroke={1.4} />}</div>
              <div className="body">
                <div className="title">
                  {isCur && <Icon name="check" size={14} style={{ marginRight: 4 }} />}
                  {a.name}
                </div>
                <div className="muted small">
                  {a.owner.displayName} · {(a.fileSize / 1048576).toFixed(1)}MB
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {detail && <AvatarDetail a={detail} me={me.id} onUse={() => (useVrm(detail), setDetail(null))} onClose={() => (setDetail(null), list.reload())} />}
      {uploading && <AvatarUpload onClose={() => (setUploading(false), list.reload())} />}
    </div>
  )
}

const AvatarDetail: React.FC<{ a: AvatarInfo; me: string; onUse: () => void; onClose: () => void }> = ({ a, me, onUse, onClose }) => {
  const api = useApp((s) => s.api)!
  const [meta, setMeta] = useState<ReturnType<typeof describeMeta>>(null)
  const [stats, setStats] = useState<AvatarModel['stats'] | null>(null)
  const [reporting, setReporting] = useState(false)
  const capRef = useRef<(() => Promise<Blob | null>) | null>(null)
  const ref: AvatarRef = { kind: 'vrm', id: a.id, url: api.abs(a.fileUrl)!, sha256: a.sha256, scale: 1 }
  const lic = a.license
  const mine = a.owner.id === me
  const canUse = mine || a.allowCloning
  return (
    <Modal title={a.name} onClose={onClose} wide>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <AvatarPreview avatar={ref} height={340} onModel={(m) => (setMeta(describeMeta(m?.meta ?? null)), setStats(m?.stats ?? null))} capture={(fn) => (capRef.current = fn)} />
        </div>
        <div className="col" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div className="muted small">
            {L('アップロード', 'Uploaded by')}: {a.owner.displayName} · {(a.fileSize / 1048576).toFixed(1)}MB
          </div>
          {a.description && <div style={{ whiteSpace: 'pre-wrap' }}>{a.description}</div>}
          {stats && (
            <div className="muted small">
              {L('ポリゴン', 'Triangles')} {stats.triangles.toLocaleString()} · {L('マテリアル', 'Materials')} {stats.materials} · {L('ボーン', 'Bones')} {stats.bones}
            </div>
          )}
          <div className="card col" style={{ gap: 4 }}>
            <div className="section-title">{L('利用条件（VRM に記載）', 'License (from VRM)')}</div>
            <div className="small">{L('作者', 'Author')}: {lic?.authors.join(', ') || meta?.authors || '—'}</div>
            <div className="small">{L('使える人', 'Who may use')}: {lic?.avatarPermission ?? meta?.avatarPermission ?? '—'}</div>
            <div className="small">{L('商用利用', 'Commercial')}: {lic?.commercialUsage ?? meta?.commercial ?? '—'}</div>
            <div className="small">{L('改変', 'Modification')}: {lic?.modification ?? meta?.modification ?? '—'}</div>
            <div className="small">{L('再配布', 'Redistribution')}: {String(lic?.allowRedistribution ?? meta?.redistribution ?? '—')}</div>
            <div className="small">{L('暴力表現', 'Violence')}: {String(lic?.allowExcessivelyViolentUsage ?? meta?.violent ?? '—')} · {L('性的表現', 'Sexual')}: {String(lic?.allowExcessivelySexualUsage ?? meta?.sexual ?? '—')}</div>
            {(lic?.licenseUrl || meta?.license) && (
              <a className="small" href={lic?.licenseUrl ?? meta?.license ?? '#'} target="_blank" rel="noreferrer">
                {L('ライセンス', 'License')}
              </a>
            )}
            {lic?.creditNotation && <div className="small">{L('クレジット表記', 'Credit')}: {lic.creditNotation}</div>}
          </div>
          <div className="row">
            <button className="btn primary" disabled={!canUse} onClick={onUse}>
              {L('このアバターを使う', 'Use this avatar')}
            </button>
            <button className={`btn small${a.favorite ? ' active' : ''}`} onClick={() => void run(() => api.favorite('avatar', a.id, !a.favorite), a.favorite ? undefined : L('お気に入りに入れました', 'Favorited'))}>
              <Icon name="heart" size={15} style={{ fill: a.favorite ? 'currentColor' : 'none' }} /> {a.favoriteCount}
            </button>
            {!mine && (
              <button className="btn small" onClick={() => setReporting(true)}>
                {L('通報', 'Report')}
              </button>
            )}
          </div>
          {!canUse && <div className="muted small">{L('作者が他の人の利用を許可していません', 'The uploader does not allow others to use it')}</div>}
          {mine && <AvatarOwnerTools a={a} capture={() => capRef.current?.() ?? Promise.resolve(null)} onChanged={onClose} />}
        </div>
      </div>
      {reporting && <ReportModal targetType="avatar" targetId={a.id} onClose={() => setReporting(false)} />}
    </Modal>
  )
}

const AvatarOwnerTools: React.FC<{ a: AvatarInfo; capture: () => Promise<Blob | null>; onChanged: () => void }> = ({ a, capture, onChanged }) => {
  const api = useApp((s) => s.api)!
  const [name, setName] = useState(a.name)
  const [desc, setDesc] = useState(a.description)
  const [ext, setExt] = useState(JSON.stringify(a.extensions ?? { version: 1, outfits: [], gestures: {}, actions: [] }, null, 2))
  const save = async () => {
    let extensions = null
    try {
      extensions = JSON.parse(ext)
    } catch {
      useApp.getState().toast(L('拡張定義の JSON が正しくありません', 'Invalid extension JSON'), 'error')
      return
    }
    await run(() => api.updateAvatar(a.id, { name, description: desc, isPublic: false, allowCloning: false, extensions }), L('保存しました', 'Saved'))
  }
  return (
    <details className="card">
      <summary style={{ cursor: 'pointer' }}>{L('自分のアバターの設定', 'Owner settings')}</summary>
      <div className="col" style={{ marginTop: 10 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="input" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={L('説明', 'Description')} />
        <label className="field">
          {L('拡張定義（衣装・ジェスチャー・アクションメニュー、JSON）', 'Extensions (outfits, gestures, actions; JSON)')}
          <textarea className="input" rows={6} value={ext} onChange={(e) => setExt(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        </label>
        <div className="row">
          <button className="btn primary" onClick={() => void save()}>
            {L('保存', 'Save')}
          </button>
          <button className="btn small" onClick={() => void run(async () => {
            const b = await capture()
            if (b) await api.avatarThumbnail(a.id, b)
          }, L('サムネイルを更新しました', 'Thumbnail updated'))}>
            <Icon name="camera" size={15} /> {L('今の見た目をサムネイルに', 'Use preview as thumbnail')}
          </button>
          <button className="btn small danger" onClick={() => void run(async () => {
            if (!confirm(L('削除しますか？', 'Delete?'))) return
            await api.deleteAvatar(a.id)
            onChanged()
          })}>
            {L('削除', 'Delete')}
          </button>
        </div>
      </div>
    </details>
  )
}

const AvatarUpload: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const api = useApp((s) => s.api)!
  const info = useApp((s) => s.info)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [agree, setAgree] = useState(false)
  const capRef = useRef<(() => Promise<Blob | null>) | null>(null)
  const [preview, setPreview] = useState<AvatarRef | null>(null)
  const [meta, setMeta] = useState<ReturnType<typeof describeMeta>>(null)
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    // 手元で確かめるだけなのでハッシュは見ない
    void file.arrayBuffer().then(async (b) => {
      const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('')
      setPreview({ kind: 'vrm', id: 'local', url, sha256: h, scale: 1 })
    })
    if (!name) setName(file.name.replace(/\.vrm$/i, ''))
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])
  const upload = async () => {
    if (!file) return
    setProgress(0)
    const a = await run(() => api.uploadAvatar(file, { name, isPublic: false, allowCloning: false }, setProgress), L('アップロードしました', 'Uploaded'))
    if (a) {
      const b = await capRef.current?.()
      if (b) await api.avatarThumbnail(a.id, b).catch(() => {})
      onClose()
    } else setProgress(null)
  }
  return (
    <Modal title={L('VRM のアップロード', 'Upload VRM')} onClose={onClose} wide>
      <input type="file" accept=".vrm,model/gltf-binary" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {info && <div className="muted small">{L('上限', 'Limit')}: {(info.limits.avatarBytes / 1048576).toFixed(0)}MB</div>}
      {preview && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <AvatarPreview avatar={preview} height={280} onModel={(m) => setMeta(describeMeta(m?.meta ?? null))} capture={(fn) => (capRef.current = fn)} />
          </div>
          <div className="col" style={{ flex: '1 1 240px', minWidth: 0 }}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('名前', 'Name')} />
            {meta && (
              <div className="card small">
                {L('作者', 'Author')}: {meta.authors ?? '—'} / {L('使える人', 'Who may use')}: {meta.avatarPermission ?? '—'} / {L('再配布', 'Redistribution')}: {meta.redistribution ?? '—'}
              </div>
            )}
            <label className="row small">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {L('このアバターをアップロード・利用する権利があります', 'I have the right to upload and use this avatar')}
            </label>
            {progress !== null && (
              <div className="bar">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            <button className="btn primary" disabled={!agree || progress !== null} onClick={() => void upload()}>
              {L('アップロード', 'Upload')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
