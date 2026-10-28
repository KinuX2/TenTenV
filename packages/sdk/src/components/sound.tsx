import { useEffect, useMemo } from 'react'
import { AudioLoader, PositionalAudio, type Vector3Tuple } from 'three'
import { useAudioListener, useExternal, useNetClock, useWorldEnv } from '../hooks'

export interface SpatialSoundProps {
  /** public/ のファイル名か、許可されたドメインの URL */
  src: string
  position?: Vector3Tuple
  volume?: number
  loop?: boolean
  /** この距離までは同じ大きさ、そこから小さくなる（m） */
  refDistance?: number
  maxDistance?: number
  /** 全員で同じ所から鳴らす（ループする環境音など）。共有時計に合わせて再生位置をそろえる */
  synced?: boolean
  playing?: boolean
}

/** 立体音響の音（[63] ワールドの音）。置いた場所から聞こえ、離れると小さくなる */
export const SpatialSound: React.FC<SpatialSoundProps> = ({ src, position, volume = 0.6, loop = true, refDistance = 2, maxDistance = 30, synced = true, playing = true }) => {
  const listener = useAudioListener()
  const env = useWorldEnv()
  const clock = useNetClock()
  const ext = useExternal()
  // ワールドのファイル・同じオリジン・ワールドが許可したドメインだけ。
  // 先に絶対 URL にしてから確かめる（"HTTPS://" のような大文字の書き方も見逃さない）
  const url = useMemo(() => {
    try {
      const full = env.assetUrl(src)
      // assetUrl('') はワールドのフォルダ（末尾が /）なので、前方一致で中のファイルだけが通る
      return full.startsWith(env.assetUrl('')) || ext.isAllowed(full) ? full : ''
    } catch {
      return ''
    }
  }, [env, ext, src])
  const audio = useMemo(() => new PositionalAudio(listener), [listener])
  useEffect(() => {
    let alive = true
    if (!url) return
    new AudioLoader().load(url, (buf) => {
      if (!alive) return
      audio.setBuffer(buf)
      audio.setLoop(loop)
      audio.setRefDistance(refDistance)
      audio.setMaxDistance(maxDistance)
      audio.setDistanceModel('inverse')
      audio.setVolume(volume)
      if (playing) {
        // 全員でそろえる: 共有時計から再生位置を決める
        if (synced && loop) audio.offset = ((clock.now() / 1000) % buf.duration + buf.duration) % buf.duration
        audio.play()
      }
    })
    return () => {
      alive = false
      if (audio.isPlaying) audio.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, url, loop, playing])
  useEffect(() => {
    audio.setVolume(volume)
    audio.setRefDistance(refDistance)
    audio.setMaxDistance(maxDistance)
  }, [audio, volume, refDistance, maxDistance])
  return <primitive object={audio} position={position} />
}
