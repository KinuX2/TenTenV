// 音はすべてコードで作る（音声ファイルを使わない）。鳴らすのは SDK の AudioListener につないだ PositionalAudio
import { useEffect, useMemo } from 'react'
import { PositionalAudio } from 'three'
import { useAudioListener } from '@tentenv/sdk'

/** 水の流れる音（ループ用。つなぎ目は前後を重ねてなめらかにする） */
export const makeWaterBuffer = (ctx: BaseAudioContext, seconds = 3) => {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const fade = Math.floor(sr * 0.3)
  const raw = new Float32Array(n + fade)
  let lp = 0
  let lp2 = 0
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1
    lp += (w - lp) * 0.18
    lp2 += (lp - lp2) * 0.05
    // 細かい泡の音（高め）と低いうねり
    const bubble = Math.random() < 0.0015 ? (Math.random() - 0.5) * 0.6 : 0
    raw[i] = (lp - lp2) * 0.9 + lp2 * 0.5 + bubble
  }
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = raw[i]
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    d[i] = raw[i] * t + raw[n + i] * (1 - t)
  }
  return buf
}

/** 鐘の音（いくつかの倍音が減衰する） */
export const makeBellBuffer = (ctx: BaseAudioContext, base = 660) => {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * 2.5)
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  const partials: [number, number, number][] = [
    [1, 0.5, 1.6],
    [2.0, 0.25, 1.1],
    [2.76, 0.2, 0.8],
    [5.4, 0.1, 0.45],
    [8.93, 0.05, 0.25],
  ]
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let v = 0
    for (const [m, a, dec] of partials) v += Math.sin(2 * Math.PI * base * m * t) * a * Math.exp(-t / dec)
    d[i] = v * Math.min(1, t * 400) * 0.7
  }
  return buf
}

/** 短い「ポン」という音（ボタン・スイッチ） */
export const makeBlipBuffer = (ctx: BaseAudioContext, freq = 880) => {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * 0.18)
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    d[i] = Math.sin(2 * Math.PI * freq * t * (1 + t * 2)) * Math.exp(-t * 28) * 0.5
  }
  return buf
}

/**
 * 立体音響の音源を 1 つ作る。ブラウザが音を許可するまで（利用者が画面を操作するまで）ループ音は鳴らさない
 */
export const usePositionalSound = (opts: { make: (ctx: BaseAudioContext) => AudioBuffer; loop?: boolean; volume: number; refDistance?: number; maxDistance?: number }) => {
  const listener = useAudioListener()
  const audio = useMemo(() => {
    const a = new PositionalAudio(listener)
    a.setBuffer(opts.make(listener.context))
    a.setLoop(!!opts.loop)
    a.setVolume(opts.volume)
    a.setRefDistance(opts.refDistance ?? 2)
    a.setMaxDistance(opts.maxDistance ?? 30)
    a.setDistanceModel('linear')
    a.setRolloffFactor(1)
    return a
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listener])
  useEffect(() => {
    if (!opts.loop) return
    const ctx = listener.context
    const tryStart = () => {
      if (ctx.state === 'running' && !audio.isPlaying) audio.play()
    }
    tryStart()
    ctx.addEventListener('statechange', tryStart)
    const id = setInterval(tryStart, 2000)
    return () => {
      ctx.removeEventListener('statechange', tryStart)
      clearInterval(id)
    }
  }, [audio, listener, opts.loop])
  useEffect(
    () => () => {
      if (audio.isPlaying) audio.stop()
      audio.disconnect()
    },
    [audio],
  )
  /** 1 回鳴らす（鳴っていたら最初から） */
  const play = useMemo(
    () => () => {
      if (listener.context.state !== 'running') return
      if (audio.isPlaying) audio.stop()
      audio.play()
    },
    [audio, listener],
  )
  return { audio, play }
}
