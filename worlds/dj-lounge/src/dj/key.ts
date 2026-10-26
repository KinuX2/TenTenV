// 曲のキー（調）。tonic は主音（0 = C … 11 = B）、minor は短調か
export interface Key {
  tonic: number
  minor: boolean
}

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const mod12 = (n: number) => ((Math.round(n) % 12) + 12) % 12

export const keyName = (k: Key) => `${NAMES[mod12(k.tonic)]}${k.minor ? 'm' : ''}`
// Camelot（DJ でよく使う表記。数字が隣どうし・同じ数字の A/B が混ぜやすい）
export const camelot = (k: Key) => {
  const t = mod12(k.tonic)
  // 長調: C=8B から 5 度上がるごとに +1。短調は同じ数字の平行調（主音が短 3 度下）
  const major = k.minor ? mod12(t + 3) : t
  const n = ((((major * 7) % 12) + 12) % 12) // C=0, G=1, D=2 … （5 度圏の順）
  return `${((n + 7) % 12) + 1}${k.minor ? 'A' : 'B'}`
}
// 半音ずらしたキー
export const shiftKey = (k: Key, semis: number): Key => ({ tonic: mod12(k.tonic + semis), minor: k.minor })

// KEY SYNC: 自分のキーを相手に合わせるのに何半音ずらすか（-6〜+5）。調が違うときは平行調に合わせる
export const keySyncShift = (mine: Key, target: Key) => {
  let want = target.tonic
  if (mine.minor && !target.minor) want = target.tonic - 3 // 相手の長調の平行短調
  if (!mine.minor && target.minor) want = target.tonic + 3 // 相手の短調の平行長調
  let s = mod12(want - mine.tonic)
  if (s > 5) s -= 12
  return s
}

// ---------- 追加した曲のキーを調べる ----------
// 0.37 秒ごとに音の成分（FFT）を取り、12 の音名ごとの強さ（クロマ）を曲全体で足し、
// 長調・短調の典型的な分布（Krumhansl のプロファイル）といちばん似ているキーを選ぶ
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const fft = (re: Float32Array, im: Float32Array) => {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar
        im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
}

export const detectKey = (buffer: AudioBuffer): Key => {
  const sr = buffer.sampleRate
  const l = buffer.getChannelData(0)
  const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l
  // 1/4 に間引いてから解析（高い音はキーの判定にあまり要らない）
  const dec = 4
  const fs = sr / dec
  const N = 4096
  const hop = Math.floor(fs * 0.37)
  const len = Math.floor(l.length / dec)
  const mono = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    let s = 0
    for (let k = 0; k < dec; k++) s += l[i * dec + k] + r[i * dec + k]
    mono[i] = s / (2 * dec)
  }
  const chroma = new Float64Array(12)
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  // 周波数のビン → 音名（55Hz〜1760Hz だけ使う）
  const pc = new Int8Array(N / 2).fill(-1)
  for (let b = 1; b < N / 2; b++) {
    const f = (b * fs) / N
    if (f < 55 || f > 1760) continue
    pc[b] = mod12(12 * Math.log2(f / 261.6256))
  }
  for (let start = 0; start + N < len; start += hop) {
    for (let i = 0; i < N; i++) {
      // ハン窓
      re[i] = mono[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
      im[i] = 0
    }
    fft(re, im)
    const frame = new Float64Array(12)
    for (let b = 1; b < N / 2; b++) {
      if (pc[b] < 0) continue
      frame[pc[b]] += Math.log1p(Math.hypot(re[b], im[b]) * 10)
    }
    // フレームごとに正規化して、音量の大きい所に引っぱられないようにする
    const sum = frame.reduce((a, v) => a + v, 0) || 1
    for (let k = 0; k < 12; k++) chroma[k] += frame[k] / sum
  }
  const corr = (profile: number[], tonic: number) => {
    let mx = 0
    let my = 0
    for (let k = 0; k < 12; k++) {
      mx += chroma[(k + tonic) % 12]
      my += profile[k]
    }
    mx /= 12
    my /= 12
    let sxy = 0
    let sxx = 0
    let syy = 0
    for (let k = 0; k < 12; k++) {
      const x = chroma[(k + tonic) % 12] - mx
      const y = profile[k] - my
      sxy += x * y
      sxx += x * x
      syy += y * y
    }
    return sxy / Math.sqrt(sxx * syy || 1)
  }
  let best: Key = { tonic: 0, minor: false }
  let score = -Infinity
  for (let t = 0; t < 12; t++) {
    for (const minor of [false, true]) {
      const c = corr(minor ? MINOR : MAJOR, t)
      if (c > score) {
        score = c
        best = { tonic: t, minor }
      }
    }
  }
  return best
}
