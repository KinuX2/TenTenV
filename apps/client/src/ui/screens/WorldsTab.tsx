// ワールドを探す（[107]〜[115]）とワールドの詳細・インスタンス（[81]〜[92]）
import type { AccessLevel, InstanceSummary, WorldInfo, WorldSummary } from '@tentenv/protocol'
import { useState } from 'react'
import { L } from '../../i18n'
import { useApp } from '../../state/app'
import { accessHint, accessLabel, Empty, Modal, run, useAsync, WorldTile } from '../common'
import { createAndJoin, joinInstance } from '../join'
import { Icon } from '../icons'
import { DomItems } from '../menu/DomItems'
import type { MenuItem } from '../menu/model'

type Sort = 'recommended' | 'popular' | 'new' | 'favorites' | 'history' | 'mine'

export const WorldsTab: React.FC = () => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recommended')
  const [open, setOpen] = useState<string | null>(null)
  const list = useAsync<WorldSummary[]>(async () => {
    if (sort === 'history') return api.worldHistory()
    if (sort === 'favorites') return api.favorites<WorldSummary>('world')
    if (sort === 'mine') return api.worlds({ author: me.id, q: query || undefined })
    return api.worlds({ q: query || undefined, sort })
  }, [api, query, sort])
  const live = useAsync(() => api.instances({ friends: true }), [api])
  const sorts: { v: Sort; ja: string; en: string }[] = [
    { v: 'recommended', ja: 'おすすめ', en: 'Recommended' },
    { v: 'popular', ja: '人気', en: 'Popular' },
    { v: 'new', ja: '新着', en: 'New' },
    { v: 'favorites', ja: 'お気に入り', en: 'Favorites' },
    { v: 'history', ja: '最近行った', en: 'Recent' },
    { v: 'mine', ja: '自分の作品', en: 'Mine' },
  ]
  const friendsInstances = (live.data ?? []).filter((i) => i.friends.length > 0)
  return (
    <div className="col">
      <h1>{L('ワールド', 'Worlds')}</h1>
      {friendsInstances.length > 0 && (
        <div className="col">
          <div className="section-title">{L('フレンドがいる場所', 'Where your friends are')}</div>
          <div className="grid">
            {friendsInstances.map((i) => (
              <InstanceCard key={i.id} inst={i} />
            ))}
          </div>
        </div>
      )}
      <div className="row">
        <input className="input grow" style={{ minWidth: 200 }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setQuery(q)} placeholder={L('ワールド名・説明で探す', 'Search worlds')} />
        <button className="btn" onClick={() => setQuery(q)}>
          {L('検索', 'Search')}
        </button>
      </div>
      <div className="row">
        {sorts.map((s) => (
          <button key={s.v} className={`btn small${sort === s.v ? ' active' : ''}`} onClick={() => setSort(s.v)}>
            {L(s.ja, s.en)}
          </button>
        ))}
      </div>
      {list.error && <div className="err">{list.error}</div>}
      {list.data && list.data.length === 0 && <Empty>{L('ワールドが見つかりません。「制作」からワールドを登録できます。', 'No worlds found. You can upload one from "Create".')}</Empty>}
      <div className="grid">
        {list.data?.map((w) => (
          <WorldTile key={w.id} w={w} onClick={() => setOpen(w.id)} />
        ))}
      </div>
      {open && <WorldDetail worldId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export const InstanceCard: React.FC<{ inst: InstanceSummary }> = ({ inst }) => {
  const api = useApp((s) => s.api)
  const thumb = api?.abs(inst.worldThumbnailUrl)
  return (
    <div className="tile" onClick={() => joinInstance(inst.id)}>
      <div className="thumb" style={{ backgroundImage: thumb ? `url("${thumb}")` : undefined }}>{!thumb && <Icon name="globe" size={36} stroke={1.4} />}</div>
      <div className="body">
        <div className="title">{inst.worldName}</div>
        <div className="row muted small">
          <span>{accessLabel(inst.access)}</span>
          <span className="row" style={{ gap: 3 }}>
            <Icon name="users" size={14} /> {inst.occupants}/{inst.capacity}
          </span>
          {inst.queue > 0 && (
            <span className="row" style={{ gap: 3 }}>
              <Icon name="clock" size={14} /> {inst.queue}
            </span>
          )}
        </div>
        {inst.friends.length > 0 && <div className="small">{inst.friends.map((f) => f.displayName).join(', ')}</div>}
      </div>
    </div>
  )
}

export const WorldDetail: React.FC<{ worldId: string; onClose: () => void }> = ({ worldId, onClose }) => {
  const api = useApp((s) => s.api)!
  const me = useApp((s) => s.me)!
  const w = useAsync<WorldInfo>(() => api.world(worldId), [api, worldId])
  const insts = useAsync(() => api.instances({ worldId }), [api, worldId])
  const [access, setAccess] = useState<AccessLevel>('public')
  const [capacity, setCapacity] = useState<number | ''>('')
  const [editing, setEditing] = useState(false)
  const data = w.data
  const thumb = api.abs(data?.thumbnailUrl ?? null)
  const fav = async () => {
    if (!data) return
    await run(() => api.favorite('world', data.id, !data.favorite))
    w.reload()
  }
  const detailItems: MenuItem[] = data ? [
    { t: 'section', title: data.name },
    {
      t: 'card', key: data.id, title: data.name,
      sub: `${data.author.displayName} · ${data.occupants}${L('人', ' online')} · ${data.favoriteCount}${L('件のお気に入り', ' favorites')}`,
      icon: { image: thumb, fallback: 'globe' },
      buttons: [
        { label: data.favorite ? L('お気に入り済み', 'Favorited') : L('お気に入り', 'Favorite'), icon: { icon: 'heart' }, on: data.favorite, onClick: () => void fav() },
        ...(me.homeWorldId === data.id ? [] : [{ label: L('ホームにする', 'Set as home'), icon: { icon: 'home' }, onClick: () => void run(async () => useApp.getState().setMe(await api.updateMe({ homeWorldId: data.id })), L('ホームに設定しました', 'Set as home')) }]),
        ...(data.author.id === me.id ? [{ label: L('編集', 'Edit'), icon: { icon: 'edit' }, onClick: () => setEditing(true) }] : []),
      ],
    },
    { t: 'note', text: data.description || L('説明はありません', 'No description') },
    { t: 'note', text: `${L('推奨', 'Recommended')} ${data.recommendedCapacity}${L('人', '')} · ${L('最大', 'Max')} ${data.maxCapacity}${L('人', '')}` },
    { t: 'section', title: L('新しいインスタンス', 'New Instance') },
    { t: 'choice', label: L('公開範囲', 'Access'), value: access, options: (['public', 'friends+', 'friends', 'invite+', 'invite'] as AccessLevel[]).map((value) => ({ v: value, label: accessLabel(value) })), onChange: (value) => setAccess(value as AccessLevel) },
    { t: 'note', text: accessHint(access) },
  ] : []
  const instanceItems: MenuItem[] = [
    { t: 'section', title: L('入れるインスタンス', 'Available Instances') },
    ...(insts.data ?? []).map((instance) => ({
      t: 'card' as const, key: instance.id, title: `${instance.name} · ${instance.occupants}/${instance.capacity}`,
      sub: `${accessLabel(instance.access)} · ${instance.owner.displayName}${instance.queue > 0 ? ` · ${L('待ち', 'Queue')} ${instance.queue}` : ''}`,
      icon: { icon: 'door' },
      buttons: [{ label: instance.occupants >= instance.capacity ? L('並ぶ', 'Queue') : L('入る', 'Go'), primary: true, onClick: () => joinInstance(instance.id) }],
    })),
  ]
  return (
    <Modal title={data?.name ?? L('読み込み中…', 'Loading…')} onClose={onClose} wide className="world-instance-dialog" header={<div className="world-instance-account"><span className="world-instance-online" />{me.displayName}</div>}>
      {w.error && <div className="err">{w.error}</div>}
      {data && (
        <div className="world-instance-content">
          <DomItems items={detailItems} />
          <div className="row world-instance-create">
            <label className="row small">
              {L('人数上限', 'Capacity')}
              <input className="input" style={{ width: 90 }} type="number" min={1} max={data.maxCapacity} value={capacity} placeholder={String(data.recommendedCapacity)} onChange={(e) => setCapacity(e.target.value ? Number(e.target.value) : '')} />
            </label>
            <button className="btn primary" onClick={() => void createAndJoin(data.id, access, { capacity: capacity || undefined })}>{L('作って入る', 'Create & Go')}</button>
          </div>
          <DomItems items={instanceItems} />
          {insts.loading && <div className="muted">{L('インスタンスを読み込み中…', 'Loading instances…')}</div>}
          {insts.data?.length === 0 && <div className="muted">{L('まだインスタンスがありません', 'No instances yet')}</div>}
          {editing && <WorldEdit w={data} onClose={() => (setEditing(false), w.reload())} />}
        </div>
      )}
    </Modal>
  )
}

const WorldEdit: React.FC<{ w: WorldInfo; onClose: () => void }> = ({ w, onClose }) => {
  const api = useApp((s) => s.api)!
  const [name, setName] = useState(w.name)
  const [desc, setDesc] = useState(w.description)
  const [tags, setTags] = useState(w.tags.join(' '))
  const [vis, setVis] = useState(w.visibility)
  const save = async () => {
    const r = await run(() => api.updateWorld(w.id, { name, description: desc, tags: tags.split(/[\s,、]+/).filter(Boolean).slice(0, 10), visibility: vis }), L('保存しました', 'Saved'))
    if (r) onClose()
  }
  return (
    <Modal title={L('ワールドの編集', 'Edit world')} onClose={onClose} footer={<button className="btn primary" onClick={() => void save()}>{L('保存', 'Save')}</button>}>
      <label className="field">
        {L('名前', 'Name')}
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>
      <label className="field">
        {L('説明', 'Description')}
        <textarea className="input" rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} />
      </label>
      <label className="field">
        {L('タグ（空白で区切る）', 'Tags (space separated)')}
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <div className="row">
        {(['public', 'unlisted', 'private'] as const).map((v) => (
          <button key={v} className={`btn small${vis === v ? ' active' : ''}`} onClick={() => setVis(v)}>
            {v === 'public' ? L('公開', 'Public') : v === 'unlisted' ? L('限定公開', 'Unlisted') : L('非公開', 'Private')}
          </button>
        ))}
      </div>
      <div className="row">
        <a className="btn small" href={`${api.base}/api/worlds/${w.id}/export`} onClick={(e) => {
          e.preventDefault()
          void run(async () => {
            const res = await fetch(`${api.base}/api/worlds/${w.id}/export`, { headers: { authorization: `Bearer ${api.getToken()}` } })
            if (!res.ok) throw new Error(L('書き出せません', 'Export failed'))
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `${w.name.replace(/[^\w\-]+/g, '_')}.ttvw`
            a.click()
          })
        }}>
          <Icon name="download" size={15} /> {L('書き出す（別の親サーバーへの移行用）', 'Export (.ttvw for migration)')}
        </a>
        <button className="btn small danger" onClick={() => void run(async () => {
          if (!confirm(L('このワールドを削除しますか？', 'Delete this world?'))) return
          await api.deleteWorld(w.id)
          onClose()
        }, L('削除しました', 'Deleted'))}>
          {L('削除', 'Delete')}
        </button>
      </div>
    </Modal>
  )
}
