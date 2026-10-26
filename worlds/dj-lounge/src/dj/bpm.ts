// 追加した曲の BPM と 1 拍目の位置を求める。
// 1. 低音の強さの「増えた分」を 5ms ごとに取り出す（キックやベースの立ち上がり）
// 2. その自己相関で、いちばんよく繰り返す間隔（＝ 1 拍）を探す（60〜200 BPM）
// 3. 曲全体で拍の位置がいちばん合う BPM を 0.01 刻みで詰め、拍の頭（位相）を決める
const TARGET_FPS = 200

const onsetEnvelope = (buffer: AudioBuffer) => {
  const sr = buffer.sampleRate
  const ch0 = buffer.getChannelData(0)
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0
  const hop = Math.floor(sr / TARGET_FPS)
  const n = Math.floor(ch0.length / hop)
  const env = new Float32Array(n)
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sr)
  let y = 0
  let prev = 0
  for (let f = 0; f < n; f++) {
    let e = 0
    for (let s = f * hop; s < (f + 1) * hop; s++) {
      y += a * ((ch0[s] + ch1[s]) / 2 - y)
      e += y * y
    }
    e = Math.sqrt(e / hop)
    env[f] = Math.max(0, e - prev)
    prev = e
  }
  // 実際の 1 秒あたりのフレーム数（hop を整数にした分だけ 200 からずれる）
  return { env, fps: sr / hop }
}

// 拍の位置での強さの平均（拍間隔 period フレーム、位相 phase フレーム）。平均なので速い BPM ほど有利にはならない
const combMean = (env: Float32Array, period: number, phase: number) => {
  let s = 0
  let c = 0
  for (let t = phase; t < env.length - 1; t += period) {
    const k = Math.round(t)
    s += env[k] + 0.5 * ((env[k - 1] ?? 0) + env[k + 1])
    c++
  }
  return c ? s / c : 0
}
const bestPhase = (env: Float32Array, fps: number, bpm: number, step: number) => {
  const period = (60 * fps) / bpm
  let score = -1
  let phase = 0
  for (let ph = 0; ph < period; ph += step) {
    const sc = combMean(env, period, ph)
    if (sc > score) {
      score = sc
      phase = ph
    }
  }
  return { score, phase }
}

export const detectBeat = (buffer: AudioBuffer): { bpm: number; firstBeat: number } => {
  const { env, fps } = onsetEnvelope(buffer)
  // 85〜200 BPM を 0.2 刻みでざっと調べる（ハードコアの 190 前後まで入る）
  let bpm = 120
  let best = -1
  for (let b = 85; b <= 200; b += 0.2) {
    const { score } = bestPhase(env, fps, b, 2)
    if (score > best) {
      best = score
      bpm = b
    }
  }
  // 半分の速さを拾っていたら倍にする（キックが毎拍ある曲では倍でも同じくらい当たる）
  if (bpm * 2 <= 210 && bestPhase(env, fps, bpm * 2, 2).score >= best * 0.8) bpm *= 2
  // ±1 BPM を 0.02 刻み、さらに ±0.03 を 0.01 刻みで詰める
  let bestBpm = bpm
  let bestScore = -1
  let phase = 0
  const refine = (from: number, to: number, step: number) => {
    for (let k = Math.round(from / step); k <= Math.round(to / step); k++) {
      const cand = Math.round(k * step * 100) / 100
      const r = bestPhase(env, fps, cand, 1)
      if (r.score > bestScore) {
        bestScore = r.score
        bestBpm = cand
        phase = r.phase
      }
    }
  }
  refine(bpm - 1, bpm + 1, 0.02)
  const mid = bestBpm
  refine(mid - 0.03, mid + 0.03, 0.01)
  // 整数に近ければ整数にそろえる（多くの曲は整数 BPM）
  if (Math.abs(bestBpm - Math.round(bestBpm)) < 0.06) {
    bestBpm = Math.round(bestBpm)
    phase = bestPhase(env, fps, bestBpm, 1).phase
  }
  return { bpm: bestBpm, firstBeat: phase / fps }
}

// BPM がわかっている曲の 1 拍目の位置（秒）
export const firstBeatFor = (buffer: AudioBuffer, bpm: number) => {
  const { env, fps } = onsetEnvelope(buffer)
  return bestPhase(env, fps, bpm, 1).phase / fps
}
