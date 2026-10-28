// 同期・通信の上限（クライアントとサーバーで同じ値を使う）

export const LIMITS = {
  /** 同期状態のキー（ワールド用は "w:"、プラットフォーム用は "sys:" で始まる） */
  stateKey: /^(w|sys):[A-Za-z0-9_.\-:/]{1,120}$/,
  stateValueBytes: 16 * 1024,
  stateKeys: 1024,
  /** 1 人あたりの同期状態の更新回数（1 秒あたり） */
  stateSetsPerSecond: 30,
  eventsPerSecond: 40,
  eventPayloadBytes: 8 * 1024,
  eventName: /^[A-Za-z0-9_.\-:]{1,64}$/,
  chatLength: 300,
  chatPerTenSeconds: 8,
  posesPerSecond: 40,
  /** 1 つの WebSocket 接続から受け付けるメッセージ数（1 秒あたり） */
  signalPerSecond: 200,
  relayBytesPerSecond: 64 * 1024,
  /** 中継の画面共有の映像（1 接続あたり、送り先の数を掛けた量。データの中継とは別に数える） */
  relayVideoBytesPerSecond: 256 * 1024,
  displayName: 32,
  bio: 1000,
  statusText: 64,
  links: 5,
  avatarScale: { min: 0.1, max: 5 },
} as const

export const stateValueSize = (value: unknown) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? 'null').length
  } catch {
    return Infinity
  }
}

/** 窓の中の回数を数える簡単なレート制限 */
export class RateLimiter {
  private hits: number[] = []
  constructor(private readonly max: number, private readonly windowMs: number) {}
  take(now = Date.now(), cost = 1) {
    const from = now - this.windowMs
    while (this.hits.length && this.hits[0] < from) this.hits.shift()
    if (this.hits.length + cost > this.max) return false
    for (let i = 0; i < cost; i++) this.hits.push(now)
    return true
  }
}

/** バイト数で数えるレート制限（トークンバケット） */
export class ByteBucket {
  private tokens: number
  private last: number
  constructor(private readonly perSecond: number, private readonly burst = perSecond * 2) {
    this.tokens = burst
    this.last = Date.now()
  }
  take(bytes: number, now = Date.now()) {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond)
    this.last = now
    if (bytes > this.tokens) return false
    this.tokens -= bytes
    return true
  }
}
