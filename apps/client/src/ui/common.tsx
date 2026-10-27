// 画面の共通の部品
import type { UserSummary, WorldSummary } from '@tentenv/protocol'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { L } from '../i18n'
import { app, useApp } from '../state/app'
import { Icon } from './icons'

export const Modal: React.FC<{ title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; className?: string; header?: ReactNode }> = ({ title, onClose, children, wide, footer, className, header }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`} role="dialog" aria-label={title}>
        <div className="row">
          {header ?? <h2 className="grow">{title}</h2>}
          <button className="btn ghost small" onClick={onClose} aria-label={L('閉じる', 'Close')}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="row" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

export const UserIcon: React.FC<{ user: Pick<UserSummary, 'displayName' | 'iconUrl'> | null; size?: number }> = ({ user, size = 36 }) => {
  const api = useApp((s) => s.api)
  const url = api?.abs(user?.iconUrl ?? null)
  return (
    <div className="avatar-icon" style={{ width: size, height: size, backgroundImage: url ? `url("${url}")` : undefined, fontSize: size * 0.42 }}>
      {!url && (user?.displayName?.[0] ?? '?')}
    </div>
  )
}

export const STATUS_COLORS: Record<string, string> = { online: '#91c93f', askme: '#fbbf24', offline: '#6b7280' }
export const statusLabel = (s: string) =>
  ({ online: L('オンライン', 'Online'), askme: L('声をかけて', 'Ask me'), offline: L('オフライン', 'Offline') })[s] ?? s

export const Toggle: React.FC<{ label: ReactNode; value: boolean; onChange: (v: boolean) => void; hint?: string }> = ({ label, value, onChange, hint }) => (
  <label className="switch">
    <span className="grow">
      {label}
      {hint && <div className="muted small">{hint}</div>}
    </span>
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20 }} />
  </label>
)

export const Range: React.FC<{ label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }> = ({ label, value, min, max, step = 0.01, onChange, format }) => (
  <div className="range-row">
    <span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    <span className="muted">{format ? format(value) : value}</span>
  </div>
)

export const Choice = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) => (
  <div className="range-row">
    <span>{label}</span>
    <div className="row" style={{ gridColumn: 'span 2' }}>
      {options.map((o) => (
        <button key={o.v} className={`btn small${o.v === value ? ' active' : ''}`} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  </div>
)

export const WorldTile: React.FC<{ w: WorldSummary; onClick: () => void }> = ({ w, onClick }) => {
  const api = useApp((s) => s.api)
  const thumb = api?.abs(w.thumbnailUrl)
  return (
    <div className="tile" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="thumb" style={{ backgroundImage: thumb ? `url("${thumb}")` : undefined }}>
        {!thumb && <Icon name="globe" size={36} stroke={1.4} />}
      </div>
      <div className="body">
        <div className="title">{w.name}</div>
        <div className="row muted small">
          <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {w.author.displayName}
          </span>
          {w.occupants > 0 && <span className="row" style={{ gap: 3 }}><Icon name="users" size={14} /> {w.occupants}</span>}
          <span className="row" style={{ gap: 3 }}><Icon name="heart" size={14} /> {w.favoriteCount}</span>
        </div>
      </div>
    </div>
  )
}

/** 非同期の読み込み（再読み込みの関数つき） */
export const useAsync = <T,>(fn: () => Promise<T>, deps: unknown[]) => {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  const requestId = useRef(0)
  fnRef.current = fn
  const run = useCallback(() => {
    const id = ++requestId.current
    const request = fnRef.current
    setLoading(true)
    setError(null)
    Promise.resolve()
      .then(request)
      .then((d) => { if (id === requestId.current) setData(d) })
      .catch((e) => { if (id === requestId.current) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (id === requestId.current) setLoading(false) })
    return () => {
      if (id === requestId.current) requestId.current++
    }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps)
  return { data, error, loading, reload: run, setData }
}

export const Toasts: React.FC = () => {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="grow">{t.text}</span>
          {t.action && (
            <button
              className="btn small primary"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="btn ghost small" onClick={() => dismiss(t.id)} aria-label={L('閉じる', 'Close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

export const Empty: React.FC<{ children: ReactNode }> = ({ children }) => <div className="card muted" style={{ textAlign: 'center' }}>{children}</div>

/** エラーを画面の通知にする */
export const run = async <T,>(f: () => Promise<T>, ok?: string): Promise<T | null> => {
  try {
    const r = await f()
    if (ok) app().toast(ok)
    return r
  } catch (e) {
    app().toast(e instanceof Error ? e.message : String(e), 'error')
    return null
  }
}

export const accessLabel = (a: string) =>
  ({
    public: L('パブリック', 'Public'),
    'friends+': L('フレンド+', 'Friends+'),
    friends: L('フレンド', 'Friends'),
    'invite+': L('招待+', 'Invite+'),
    invite: L('招待のみ', 'Invite'),
  })[a] ?? a

export const accessHint = (a: string) =>
  ({
    public: L('この親サーバーのだれでも参加できます', 'Anyone on this server can join'),
    'friends+': L('中にいる人のフレンドが参加できます', 'Friends of anyone inside can join'),
    friends: L('作成した人のフレンドが参加できます', "The creator's friends can join"),
    'invite+': L('招待された人が参加でき、中の人も招待できます', 'Invited users can join and invite others'),
    invite: L('作成した人に招待された人だけが参加できます', 'Only people invited by the creator can join'),
  })[a] ?? ''
