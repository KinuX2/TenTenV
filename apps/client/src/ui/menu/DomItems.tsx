// メニューの項目を画面（DOM）に描く。VR では ui/vr/VrItems.tsx が同じ項目を 3D の板に描く
import { useEffect, useState } from 'react'
import { Choice, Range, Toggle } from '../common'
import { FaceIcon, HandIcon, Icon } from '../icons'
import type { MenuButton, MenuIcon, MenuItem } from './model'

export const DomIcon: React.FC<{ icon: MenuIcon; size: number }> = ({ icon, size }) => {
  if ('icon' in icon) return <Icon name={icon.icon} size={size} />
  if ('face' in icon) return <FaceIcon face={icon.face} size={size} />
  if ('hand' in icon) return <HandIcon gesture={icon.hand} size={size} />
  return icon.image ? <img src={icon.image} alt="" width={size} height={size} style={{ borderRadius: 8, objectFit: 'cover' }} /> : <Icon name={icon.fallback ?? 'user'} size={size} />
}

const SmallBtn: React.FC<{ b: MenuButton }> = ({ b }) => (
  <button className={`btn small${b.on ? ' active' : ''}${b.danger ? ' danger' : ''}${b.primary ? ' primary' : ''}`} title={b.label} onClick={b.onClick}>
    {b.icon && <DomIcon icon={b.icon} size={b.iconOnly ? 26 : 16} />}
    {!b.iconOnly && b.label}
  </button>
)

/** 文字の入力（Enter か決定ボタンで確定） */
const InputRow: React.FC<{ label: string; value: string; placeholder?: string; numeric?: boolean; onSubmit: (v: string) => void }> = ({ label, value, placeholder, numeric, onSubmit }) => {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className="field">
      {label}
      <div className="row">
        <input className="input grow" type={numeric ? 'number' : 'text'} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && onSubmit(v))} />
        <button className="btn small" onClick={() => onSubmit(v)}>
          <Icon name="check" size={16} />
        </button>
      </div>
    </label>
  )
}

export const DomItems: React.FC<{ items: MenuItem[] }> = ({ items }) => (
  <>
    {items.map((it, i) => {
      switch (it.t) {
        case 'section':
          return (
            <div key={i} className="section-title">
              {it.title}
            </div>
          )
        case 'note':
          return (
            <div key={i} className="muted small" style={{ whiteSpace: 'pre-wrap', ...(it.mono ? { fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' } : {}) }}>
              {it.text}
            </div>
          )
        case 'buttons':
          return it.size === 'big' ? (
            <div key={i} className="big-grid">
              {it.items.map((b, j) => (
                <button key={b.key ?? j} className={`big-btn${b.on ? ' on' : ''}${b.danger ? ' danger' : ''}`} onClick={b.onClick}>
                  <span className="ic">{b.icon && <DomIcon icon={b.icon} size={24} />}</span>
                  {b.label}
                </button>
              ))}
            </div>
          ) : (
            <div key={i} className="row">
              {it.items.map((b, j) => (
                <SmallBtn key={b.key ?? j} b={b} />
              ))}
            </div>
          )
        case 'toggle':
          return <Toggle key={i} label={it.label} hint={it.hint} value={it.value} onChange={it.onChange} />
        case 'range':
          return <Range key={i} label={it.label} value={it.value} min={it.min} max={it.max} step={it.step} format={it.format} onChange={it.onChange} />
        case 'choice':
          return <Choice key={i} label={it.label} value={it.value} options={it.options} onChange={it.onChange} />
        case 'dropdown':
          return (
            <label key={i} className="field" style={{ maxWidth: 540 }}>
              {it.label}
              <select className="input" style={{ width: '100%' }} value={it.value} onChange={(e) => it.onChange(e.target.value)}>
                {it.options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </label>
          )
        case 'tabs':
          return (
            <div key={i} className="row">
              {it.options.map((o) => (
                <button key={o.v} className={`btn small${it.value === o.v ? ' active' : ''}`} onClick={() => it.onChange(o.v)}>
                  {o.label}
                </button>
              ))}
            </div>
          )
        case 'tiles':
          return (
            <div key={i} className="grid">
              {it.items.map((x) => (
                <div key={x.key} className={`tile${x.on ? ' on' : ''}`} onClick={x.onClick}>
                  <div className="thumb" style={{ aspectRatio: '1', display: 'grid', placeItems: 'center' }}>
                    {x.icon && <DomIcon icon={x.icon} size={'image' in x.icon && x.icon.image ? 200 : 40} />}
                  </div>
                  <div className="body">
                    <div className="title">
                      {x.on && <Icon name="check" size={14} style={{ marginRight: 4 }} />}
                      {x.label}
                    </div>
                    {x.sub && <div className="muted small">{x.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
        case 'input':
          return <InputRow key={i} label={it.label} value={it.value} placeholder={it.placeholder} numeric={it.numeric} onSubmit={it.onSubmit} />
        case 'card':
          return (
            <div key={it.key} className="list-item" style={{ flexWrap: 'wrap', opacity: it.dim ? 0.7 : 1 }}>
              {it.icon && <span className="card-ic">{<DomIcon icon={it.icon} size={36} />}</span>}
              <div className="grow" style={{ minWidth: 140 }}>
                <div>{it.title}</div>
                {it.sub && <div className="muted small">{it.sub}</div>}
              </div>
              {it.range && <input type="range" min={it.range.min} max={it.range.max} step={it.range.step} value={it.range.value} onChange={(e) => it.range!.onChange(Number(e.target.value))} style={{ width: 100 }} title={it.range.label} />}
              {it.buttons?.map((b, j) => (
                <SmallBtn key={b.key ?? j} b={b} />
              ))}
            </div>
          )
      }
    })}
  </>
)
