// 共有時計。親サーバー（使えなければホスト）との往復時間から、相手の時計とのずれを推定する
// 往復時間がいちばん短かった測定ほど正確なので、直近の測定のうち往復の短いものを使う

interface Sample {
  offset: number
  rtt: number
  at: number
}

export class SharedClock {
  private samples: Sample[] = []
  private offset = 0
  private rtt = Infinity
  private lastAt = 0
  private listeners = new Set<() => void>()
  jumps = 0
  /** 'server' か 'host'（親サーバーが止まったとき）か 'local'（開発用） */
  source: 'server' | 'host' | 'local' = 'server'

  /** 送った時刻 c（自分の performance 基準 ms）、相手の時刻 s、受けた時刻 now */
  addSample(c: number, s: number, now = performance.now()) {
    const rtt = now - c
    if (rtt < 0 || rtt > 10000) return
    const offset = s + rtt / 2 - (performance.timeOrigin + now)
    this.samples.push({ offset, rtt, at: now })
    if (this.samples.length > 12) this.samples.shift()
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt)[0]
    const prevNow = this.now()
    const first = !Number.isFinite(this.rtt)
    this.offset = best.offset
    this.rtt = best.rtt
    this.lastAt = best.at
    // 大きく変わったら「時刻が飛んだ」として知らせる（アニメーションを合わせ直すため）
    if (!first && Math.abs(this.now() - prevNow) > 250) this.jumps++
    this.emit()
  }

  reset(source: SharedClock['source']) {
    this.source = source
    this.samples = []
    this.rtt = Infinity
    this.emit()
  }

  /** 推定した共有時刻（UNIX ms） */
  now() {
    return performance.timeOrigin + performance.now() + this.offset
  }
  get synced() {
    return this.source === 'local' || Number.isFinite(this.rtt)
  }
  /** 誤差の上限: 往復時間の半分 + 時間がたつほど増える分（時計の進み方の差 0.01%） */
  get uncertainty() {
    if (this.source === 'local') return 0
    if (!Number.isFinite(this.rtt)) return Infinity
    return this.rtt / 2 + (performance.now() - this.lastAt) * 0.0001
  }
  get rttMs() {
    return this.rtt
  }
  subscribe(f: () => void) {
    this.listeners.add(f)
    return () => {
      this.listeners.delete(f)
    }
  }
  private emit() {
    this.listeners.forEach((f) => f())
  }
}
