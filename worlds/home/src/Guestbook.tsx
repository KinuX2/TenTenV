// 永続データ（useWorldStore）を使う物: 訪問者数と芳名帳。ゲストは書き込めないので、読むだけにして案内を出す
import { useCallback, useEffect, useState } from 'react'
import { useDialogs, useEmit, useNetEvent, usePlayers, useWorldEnv, useWorldStore } from '@tentenv/sdk'
import { Board, Button, type V3 } from './ui'

/** このページで数えたワールド（同じ人が描画し直しても二重に数えない） */
const counted = new Map<string, Promise<number | Error>>()

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 60)

/** 書き込めなかった理由を、ゲストにもわかる言葉にする */
const friendly = (e: unknown) =>
  /ゲスト|guest|403|forbidden/i.test(errText(e)) ? 'ゲストの訪問は記録されません。ログインすると記録されます' : '訪問を記録できませんでした（あとでもう一度来てください）'

/** 訪問者数。入ったときに 1 回だけ shared の visits を 1 増やす。書けない人（ゲスト）は読むだけ */
export const useVisitCounter = () => {
  const store = useWorldStore()
  const env = useWorldEnv()
  const { local } = usePlayers()
  const [total, setTotal] = useState<number | null>(null)
  const [mine, setMine] = useState<number | null>(null)
  const [note, setNote] = useState('読み込み中…')
  useEffect(() => {
    let alive = true
    const readOnly = async (why: string) => {
      try {
        const v = await store.shared.get('visits')
        if (alive) setTotal(typeof v === 'number' ? v : 0)
      } catch {
        if (alive) setTotal(null)
      }
      if (alive) setNote(why)
    }
    if (local.isGuest) {
      void readOnly('ゲストの訪問は記録されません。ログインすると記録されます')
      return () => {
        alive = false
      }
    }
    const key = `${env.worldId}:${local.userId}`
    let job = counted.get(key)
    const first = !job
    if (!job) {
      job = store.shared.increment('visits', 1).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
      counted.set(key, job)
    }
    // 自分の訪問回数（プレイヤーごとの保存領域）
    void (first ? store.player.increment('visits', 1) : store.player.get('visits'))
      .then((n) => alive && setMine(typeof n === 'number' ? n : null))
      .catch(() => {})
    void job.then(async (n) => {
      if (!alive) return
      if (n instanceof Error) {
        await readOnly(friendly(n))
        return
      }
      setTotal(n)
      setNote('ようこそ！ あなたの訪問を記録しました')
    })
    return () => {
      alive = false
    }
  }, [store, env.worldId, local.isGuest, local.userId])
  return { total, mine, note }
}

interface Entry {
  name: string
  text: string
  at: number
}

const isEntry = (x: unknown): x is Entry => !!x && typeof x === 'object' && typeof (x as Entry).name === 'string' && typeof (x as Entry).text === 'string' && typeof (x as Entry).at === 'number'

const KEEP = 12
const SHOW = 7

/** 芳名帳。書いた内容はワールドに保存され、次に来た人にも見える */
export const Guestbook: React.FC<{ position: V3; rotation?: V3 }> = ({ position, rotation }) => {
  const store = useWorldStore()
  const { local } = usePlayers()
  const { prompt, notify } = useDialogs()
  const emit = useEmit()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    try {
      const v = await store.shared.get('guestbook')
      setEntries(Array.isArray(v) ? v.filter(isEntry) : [])
      setErr('')
    } catch (e) {
      setEntries([])
      setErr(`読み込めませんでした: ${errText(e)}`)
    }
  }, [store])
  useEffect(() => {
    void reload()
  }, [reload])
  // 誰かが書いたら全員で読み直す
  useNetEvent('guestbook:update', () => void reload())
  const sign = async () => {
    if (busy) return
    if (local.isGuest) {
      notify('ゲストは芳名帳に書けません。ログインすると書けます')
      return
    }
    const text = await prompt({ title: '芳名帳に書く', message: 'ひとこと（40 文字まで）。ワールドに保存され、みんなに見えます', maxLength: 40 })
    const t = text?.replace(/\s+/g, ' ').trim()
    if (!t) return
    setBusy(true)
    try {
      const v = await store.shared.get('guestbook')
      const list = (Array.isArray(v) ? v.filter(isEntry) : []).concat({ name: local.displayName.slice(0, 24), text: t.slice(0, 40), at: Date.now() }).slice(-KEEP)
      await store.shared.set('guestbook', list)
      setEntries(list)
      emit('guestbook:update', null, 'others')
      notify('芳名帳に書きました。ありがとう！')
    } catch (e) {
      notify(/ゲスト|guest|403/i.test(errText(e)) ? 'ゲストは芳名帳に書けません。ログインすると書けます' : `書き込めませんでした（${errText(e)}）`)
    } finally {
      setBusy(false)
    }
  }
  const fmt = (ms: number) => {
    const d = new Date(ms)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  const body =
    entries === null
      ? '読み込み中…'
      : err
        ? err
        : entries.length === 0
          ? 'まだだれも書いていません。最初のひとことをどうぞ！'
          : entries
              .slice(-SHOW)
              .reverse()
              .map((e) => `${fmt(e.at)}  ${e.name}：${e.text}`)
              .join('\n')
  return (
    <Board title="芳名帳" sub="Guestbook — ワールドに保存されます" body={body} width={2.6} legs={false} base={0.6} lineHeight={0.07} accent="#c98a5a" position={position} rotation={rotation}>
      <Button label={busy ? '保存中…' : 'サインする'} sub="Sign" width={0.6} position={[0, 0.42, 0.02]} active={busy} color="#c98a5a" onClick={() => void sign()} />
    </Board>
  )
}
