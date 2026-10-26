// 音の高さだけを変える（速さは変えない）AudioWorklet。DJ の MASTER TEMPO（キーロック）と KEY SHIFT に使う。
// 方式: 遅延線を 2 本の読み出し位置で少しずつずらしながら読み、半周ずらした sin² の窓で重ねる（軽い方式）。
// ratio は高さの倍率（2 で 1 オクターブ上）。ratio が 1 のときは処理を通さず、そのまま出す（遅れなし）
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]
  }
  constructor() {
    super()
    this.size = 16384
    this.mask = this.size - 1
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)]
    this.w = 0
    this.phase = 0
    // 窓の長さ（約 60ms）。長いほど音が滑らかで、短いほど音の立ち上がりがぼやけにくい
    this.win = Math.round(sampleRate * 0.06)
    this.mix = 0
  }
  process(inputs, outputs, params) {
    const input = inputs[0]
    const output = outputs[0]
    const ratio = params.ratio[0]
    const target = Math.abs(ratio - 1) > 1e-4 ? 1 : 0
    const n = output[0].length
    const W = this.win
    const mask = this.mask
    const step = (1 - ratio) / W
    const chs = output.length
    for (let i = 0; i < n; i++) {
      // 処理あり／なしの切り替えは約 25ms でなめらかに
      this.mix += (target - this.mix) * 0.0008
      let pa = this.phase + step
      if (pa >= 1) pa -= 1
      if (pa < 0) pa += 1
      this.phase = pa
      let pb = pa + 0.5
      if (pb >= 1) pb -= 1
      const sa = Math.sin(Math.PI * pa)
      const ga = sa * sa
      const gb = 1 - ga
      const ra = this.w - (pa * W + 1)
      const rb = this.w - (pb * W + 1)
      const ia = Math.floor(ra)
      const ib = Math.floor(rb)
      const fa = ra - ia
      const fb = rb - ib
      for (let c = 0; c < chs; c++) {
        const src = input[c] || input[0]
        const x = src ? src[i] : 0
        const b = this.buf[c] || this.buf[0]
        b[this.w] = x
        const ya = b[ia & mask] * (1 - fa) + b[(ia + 1) & mask] * fa
        const yb = b[ib & mask] * (1 - fb) + b[(ib + 1) & mask] * fb
        // 窓を重ねると少し小さくなる（約 -0.8dB）ので補う
        output[c][i] = x * (1 - this.mix) + (ga * ya + gb * yb) * 1.09 * this.mix
      }
      this.w = (this.w + 1) & mask
    }
    return true
  }
}
registerProcessor('pitch-shifter', PitchShifter)

// CFX の CRUSH: 音の細かさ（ビット数）とサンプリングの細かさを落として、ザラついた音にする。amount 0 で素通し
class Crusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]
  }
  constructor() {
    super()
    this.hold = [0, 0]
    this.count = 0
  }
  process(inputs, outputs, params) {
    const input = inputs[0]
    const output = outputs[0]
    const amount = params.amount[0]
    const n = output[0].length
    if (amount < 0.001) {
      for (let c = 0; c < output.length; c++) {
        const src = input[c] || input[0]
        if (src) output[c].set(src)
        else output[c].fill(0)
      }
      return true
    }
    const bits = 16 - amount * 12
    const step = Math.pow(2, 1 - bits)
    const every = 1 + Math.floor(amount * 18)
    for (let i = 0; i < n; i++) {
      if (this.count % every === 0) {
        for (let c = 0; c < output.length; c++) {
          const src = input[c] || input[0]
          const x = src ? src[i] : 0
          this.hold[c] = Math.round(x / step) * step
        }
      }
      this.count++
      for (let c = 0; c < output.length; c++) output[c][i] = this.hold[c] || 0
    }
    return true
  }
}
registerProcessor('crusher', Crusher)
