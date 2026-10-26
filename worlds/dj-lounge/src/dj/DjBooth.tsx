import { useFrame } from '@react-three/fiber'
import { useFilePicker, useInstanceFiles, useNetClock, usePlayers, useSyncedState, useWorldEnv } from '@tentenv/sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { type AudioListener, type Group, PositionalAudio } from 'three'
import { Controller, type ControllerApi } from './Controller'
import { useDjDisplay } from './Display'
import { DjEngine } from './engine'
import { DragProvider, resumeAudio, useAudioListener } from './input'
import { beatLen, browseList, deckPos, effectiveBpm, initialMix, masterDeck, normalizeMix, ops, type MixState } from './state'
import { Utility } from './Utility'
import { setLibrary, type LibraryEntry } from './tracks'
import { keyName } from './key'
import { AL } from './audiolink'
import { SPEAKER_HEIGHT, SpeakerModel } from './SpeakerModel'
import { CanvasButton } from '../components/CanvasButton'

// DJ ブース: 共有の状態・音・コントローラー・画面・スピーカーをまとめる
const LIVE_FLUSH_MS = 100

export interface DjBoothProps {
  // コントローラーの位置と向き（DJ は手前 = ローカル +Z 側に立つ）
  controller: { position: [number, number, number]; rotationY: number }
  // DJ 用のモニターと、フロア向けの大きな画面
  screens: { position: [number, number, number]; rotationY: number; width: number; tilt?: number }[]
  speakers: { position: [number, number, number]; rotationY?: number }[]
  // 曲を追加するボタンの位置
  // 操作パネル（ブラウザ・SLIP・REVERSE・AUTOMIX・録音など）の位置
  utility: { position: [number, number, number]; rotationY: number }
  // 光らせる物に渡す（低音の強さ 0..1）
  onBass?: (v: number) => void
}

const Speaker: React.FC<{ engine: DjEngine; position: [number, number, number]; rotationY?: number }> = ({ engine, position, rotationY = 0 }) => {
  const listener = useAudioListener()
  const group = useRef<Group>(null)
  const audio = useMemo(() => {
    const a = new PositionalAudio(listener)
    a.setNodeSource(engine.out as unknown as AudioBufferSourceNode)
    a.setRefDistance(7)
    a.setRolloffFactor(1.1)
    a.setDistanceModel('inverse')
    return a
  }, [listener, engine])
  useEffect(() => {
    const g = group.current
    g?.add(audio)
    return () => {
      g?.remove(audio)
      // audio.disconnect() は音の出どころ（全スピーカー共通）まで切ってしまうので、このスピーカーへの線だけ外す
      try {
        engine.out.disconnect(audio.panner)
      } catch {
        // つながっていない
      }
    }
  }, [audio, engine])
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <SpeakerModel />
      {/* 音の出どころ（トップの高さ） */}
      <group ref={group} position={[0, SPEAKER_HEIGHT - 0.4, 0]} />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.4, SPEAKER_HEIGHT / 2, 0.38]} position={[0, SPEAKER_HEIGHT / 2, 0]} />
      </RigidBody>
    </group>
  )
}

// tilt: 上を奥へ倒す角度（ラジアン、マイナスで奥へ）
const Screen: React.FC<{ texture: ReturnType<typeof useDjDisplay>; position: [number, number, number]; rotationY: number; width: number; tilt?: number }> = ({ texture, position, rotationY, width, tilt = 0 }) => (
  <group position={position} rotation={[0, rotationY, 0]}>
    <group rotation={[tilt, 0, 0]}>
    <mesh position={[0, 0, -0.02]}>
      <boxGeometry args={[width + 0.06, (width * 9) / 16 + 0.06, 0.03]} />
      <meshStandardMaterial color="#0a0a0c" />
    </mesh>
    <mesh>
      <planeGeometry args={[width, (width * 9) / 16]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
    </group>
  </group>
)

// ---------- 曲の追加（手元の音声ファイル → 解析 → 共有ファイルへアップロード） ----------
// 追加した曲は共有ファイルの情報（meta）に BPM と 1 拍目を入れて残すので、次に来たときも使える。
// 並び順は全員で同じにする（追加した順）。曲の番号で同期しているため、消す操作は用意しない
const TRACK_KIND = 'dj-track'
const useLibrary = () => {
  const files = useInstanceFiles()
  const [rev, setRev] = useSyncedState('dj-library-rev', 0)
  const [lib, setLib] = useState<LibraryEntry[]>([])
  useEffect(() => {
    let alive = true
    files
      .list()
      .then((all) => {
        if (!alive) return
        const list = all
          .filter((f) => f.meta?.kind === TRACK_KIND)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
          .map((f) => ({
            url: f.url,
            title: f.meta?.title ?? f.fileName,
            bpm: Number(f.meta?.bpm) || 120,
            firstBeat: Number(f.meta?.firstBeat) || 0,
            key: f.meta?.keyTonic !== undefined ? { tonic: Number(f.meta.keyTonic), minor: f.meta.keyMinor === '1' } : null,
          }))
        setLib(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [files, rev])
  setLibrary(lib)
  return { count: lib.length, bump: () => setRev((v) => v + 1) }
}

// 操作パネルの 3 段目の右（パネルの中の位置）。状態はボタンの文字で出す
const AddTrackButton: React.FC<{ engine: DjEngine; onAdded: () => void; position: [number, number, number] }> = ({ engine, onAdded, position }) => {
  const pickFile = useFilePicker()
  const files = useInstanceFiles()
  const [status, setStatus] = useState('')
  const busy = useRef(false)
  const add = () => {
    if (busy.current) return
    pickFile({
      accept: 'audio/*,.mp3,.wav,.ogg,.m4a,.flac',
      multiple: true,
      maxBytes: 40 * 1024 * 1024,
      onError: (e) => setStatus(e.kind === 'too_large' ? '40MB までのファイルにしてください' : '音声ファイルを選んでください'),
      onPick: async (picked) => {
        busy.current = true
        for (const f of picked) {
          const title = f.name.replace(/\.[^.]+$/, '').slice(0, 60)
          try {
            setStatus(`BPM を調べています: ${title}`)
            const a = await engine.analyze(f)
            setStatus(`アップロード中: ${title}`)
            await files.upload(f, {
              onProgress: (p) => setStatus(`アップロード中 ${Math.round(p * 100)}%: ${title}`),
              description: 'DJ ラウンジの曲',
              meta: { kind: TRACK_KIND, title, bpm: String(a.bpm), firstBeat: a.firstBeat.toFixed(3), keyTonic: String(a.key.tonic), keyMinor: a.key.minor ? '1' : '0' },
            })
            setStatus(`追加しました: ${title}（${a.bpm} BPM・${keyName(a.key)}）`)
            onAdded()
          } catch {
            setStatus(`追加できませんでした: ${title}`)
          }
        }
        busy.current = false
      },
    })
  }
  return (
    <CanvasButton
      id="dj-add-track"
      position={position}
      width={0.34}
      height={0.042}
      px={1600}
      deps={[status]}
      draw={(ctx, w, h) => {
        ctx.fillStyle = status ? '#2fa8ff' : '#24242c'
        ctx.beginPath()
        ctx.roundRect(0, 0, w, h, 12)
        ctx.fill()
        ctx.strokeStyle = '#2fa8ff'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.fillStyle = status ? '#000000' : '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = 'bold 24px "Arial", "Noto Sans JP", sans-serif'
        let t = status || '＋ 曲を追加'
        while (t.length > 4 && ctx.measureText(t).width > w - 16) t = t.slice(0, -2)
        ctx.fillText(t, w / 2, h / 2)
      }}
      onPress={add}
      label="曲を追加（PC の音声ファイルを選ぶ）"
    />
  )
}

// 音が止まっている間（ブラウザの自動再生の制限）だけ、ブースの上に「音を出す」ボタンを出す。押すと動く
const SoundButton: React.FC<{ listener: AudioListener; position: [number, number, number] }> = ({ listener, position }) => {
  const [stopped, setStopped] = useState(false)
  const last = useRef(0)
  useFrame(() => {
    const now = performance.now()
    if (now - last.current < 500) return
    last.current = now
    const s = listener.context.state !== 'running'
    if (s !== stopped) setStopped(s)
  })
  if (!stopped) return null
  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.fillStyle = '#c4f01e'
    ctx.beginPath()
    ctx.roundRect(6, 6, W - 12, H - 12, H / 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.round(H * 0.42)}px "Noto Sans JP", "Meiryo", sans-serif`
    // スピーカーの形（線で描く）と文字
    const text = 'タップで音を出す'
    const tw = ctx.measureText(text).width
    const s = H * 0.42
    const x0 = W / 2 - (tw + s * 1.5) / 2
    const cy = H / 2
    ctx.beginPath()
    ctx.moveTo(x0, cy - s * 0.22)
    ctx.lineTo(x0 + s * 0.3, cy - s * 0.22)
    ctx.lineTo(x0 + s * 0.65, cy - s * 0.5)
    ctx.lineTo(x0 + s * 0.65, cy + s * 0.5)
    ctx.lineTo(x0 + s * 0.3, cy + s * 0.22)
    ctx.lineTo(x0, cy + s * 0.22)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = s * 0.1
    ctx.lineCap = 'round'
    for (const r of [0.35, 0.6]) {
      ctx.beginPath()
      ctx.arc(x0 + s * 0.7, cy, s * r, -0.8, 0.8)
      ctx.stroke()
    }
    ctx.textAlign = 'left'
    ctx.fillText(text, x0 + s * 1.5, cy + 2)
  }
  return (
    <>
      {[0, Math.PI].map((ry) => (
        <CanvasButton
          key={ry}
          id={`dj-sound-${ry ? 'b' : 'f'}`}
          position={[position[0], position[1], position[2] + (ry ? -0.02 : 0.02)]}
          rotation={[0, ry, 0]}
          width={0.9}
          height={0.2}
          label="音を出す"
          deps={[]}
          draw={draw}
          onPress={() => resumeAudio(listener)}
        />
      ))}
    </>
  )
}

export const DjBooth: React.FC<DjBoothProps> = ({ controller, screens, speakers, utility, onBass }) => {
  const library = useLibrary()
  const listener = useAudioListener()
  const clock = useNetClock({ require: 'media' })
  const initial = useMemo(initialMix, [])
  const [shared, setShared] = useSyncedState<MixState>('dj-mix-v6', initial)
  const { baseUrl } = useWorldEnv()
  const engine = useMemo(() => new DjEngine(listener.context, baseUrl), [listener, baseUrl])
  useEffect(() => () => engine.dispose(), [engine])
  // つまみ・フェーダーを動かしている間は手元の値を使い、100ms ごとに共有する
  const live = useRef<MixState | null>(null)
  const lastFlush = useRef(0)
  const [, force] = useState(0)
  const sharedN = useMemo(() => normalizeMix(shared), [shared])
  const view = live.current ?? sharedN
  const viewRef = useRef(view)
  viewRef.current = view
  const now = clock.now
  useFrame((_, dt) => {
    engine.apply(viewRef.current, now())
    AL.update(engine, viewRef.current, now(), Math.min(0.1, dt))
    onBass?.(engine.bass())
  })
  const api: ControllerApi = {
    m: view,
    act: (op, i) => {
      // 操作は「ユーザーの操作」なので、ここで止まっている音を動かす（VR のコントローラーでも効く）
      resumeAudio(listener)
      const next = op(viewRef.current, i, now())
      live.current = null
      viewRef.current = next
      setShared(next)
    },
    actMix: (fn) => {
      resumeAudio(listener)
      const next = fn(viewRef.current)
      live.current = null
      viewRef.current = next
      setShared(next)
    },
    live: (fn) => {
      resumeAudio(listener)
      const next = fn(live.current ?? viewRef.current)
      live.current = next
      viewRef.current = next
      force((v) => v + 1)
      if (performance.now() - lastFlush.current > LIVE_FLUSH_MS) {
        lastFlush.current = performance.now()
        setShared(next)
      }
    },
    endLive: () => {
      if (live.current) setShared(live.current)
      live.current = null
      force((v) => v + 1)
    },
    now,
    engine,
  }
  // ---------- AUTOMIX（動かしている人のブラウザだけが操作する） ----------
  const { local } = usePlayers()
  const myId = local?.userId ?? 'local'
  const am = useRef({ acc: 0, fading: false, start: 0, ms: 0, from: 0, to: 0, old: 0 as 0 | 1 })
  useFrame((_, dt) => {
    const m = viewRef.current
    const a = am.current
    if (m.automix !== myId) {
      a.fading = false
      return
    }
    a.acc += dt
    if (a.acc < 0.25) return
    a.acc = 0
    const t = now()
    if (a.fading) {
      // クロスフェーダーを 32 拍かけて動かし、終わったら前の曲を止める
      const k = Math.min(1, (t - a.start) / a.ms)
      api.live((mm) => ({ ...mm, xfader: a.from + (a.to - a.from) * k }))
      if (k >= 1) {
        api.endLive()
        a.fading = false
        const nw = a.old === 0 ? 1 : 0
        api.actMix((mm) => {
          let x = mm.decks[a.old].playing ? ops.play(mm, a.old, t) : mm
          if (x.decks[nw].synced) x = ops.sync(x, nw, t)
          return x
        })
      }
      return
    }
    const A = masterDeck(m)
    const B = A === 0 ? 1 : 0
    const da = m.decks[A]
    const db = m.decks[B]
    // 何も鳴っていなければ、曲の入っているデッキを再生する
    if (!da.playing && !db.playing) {
      const s = da.track !== null ? A : B
      api.actMix((mm) => ({ ...ops.play(mm, s, t), xfader: s === 0 ? 0 : 1 }))
      return
    }
    const data = engine.track(da.track)
    if (!data || !da.playing || db.playing) return
    const left = (data.duration - deckPos(da, t)) / beatLen(da)
    if (left > 72) return
    // 残り 72 拍で次の曲（一覧の次）をもう一方に読み込み、合わせて再生し、32 拍かけてつなぐ
    const list = browseList(m)
    const idx = list.indexOf(da.track ?? 0)
    let ni = (idx + 1) % list.length
    if (list[ni] === da.track) ni = (ni + 1) % list.length
    let mm: MixState = { ...m, browse: ni }
    mm = ops.load(mm, B, t)
    mm = ops.sync(mm, B, t)
    mm = ops.play(mm, B, t)
    api.actMix(() => mm)
    a.fading = true
    a.start = t
    a.ms = 32 * (60 / (effectiveBpm(da) || 120)) * 1000
    a.from = m.xfader
    a.to = B === 0 ? 0 : 1
    a.old = A
  })
  const toggleAutomix = () => api.actMix((mm) => ({ ...mm, automix: mm.automix ? null : myId }))

  const texture = useDjDisplay(api)
  return (
    <DragProvider>
      <SoundButton listener={listener} position={[controller.position[0], controller.position[1] + 0.85, controller.position[2]]} />
      <Controller api={api} position={controller.position} rotationY={controller.rotationY} />
      {screens.map((s, k) => (
        <Screen key={k} texture={texture} {...s} />
      ))}
      {speakers.map((p, k) => (
        <Speaker key={k} engine={engine} {...p} />
      ))}
      <Utility api={api} {...utility} automixOn={view.automix !== null} toggleAutomix={toggleAutomix}>
        <AddTrackButton engine={engine} onAdded={library.bump} position={[0.18, -0.16, 0.004]} />
      </Utility>
    </DragProvider>
  )
}
