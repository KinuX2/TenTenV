// ワールドのコードの静的検査。アップロード前（CLI）と親サーバーの受け付け時の両方で同じ検査をする
// 見つかったものは、マニフェストの permissions.relaxedRules で明示的に許可しない限り拒否する

export interface ScanRule {
  id: string
  category: 'dynamic-code' | 'network' | 'storage' | 'dom' | 'browser-api' | 'global' | 'obfuscation'
  description: string
  pattern: RegExp
  /** 何回まで見逃すか（難読化の判定など） */
  threshold?: number
}

export const SCAN_RULES: ScanRule[] = [
  { id: 'no-eval', category: 'dynamic-code', description: 'eval() の使用', pattern: /(?<![\w$.])eval\s*\(/g },
  { id: 'no-new-function', category: 'dynamic-code', description: 'Function コンストラクタの使用', pattern: /\bnew\s+Function\s*\(|(?<![\w$.])Function\s*\(\s*["'`]/g },
  { id: 'no-string-timeout', category: 'dynamic-code', description: '文字列を渡す setTimeout / setInterval', pattern: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/g },
  { id: 'no-javascript-blob', category: 'dynamic-code', description: 'JavaScript の Blob の作成', pattern: /type\s*:\s*["'`](?:text|application)\/javascript/g },
  { id: 'no-external-import', category: 'network', description: '外部 URL からの import', pattern: /\bimport\s*\(\s*["'`]https?:/g },
  { id: 'no-network-without-permission', category: 'network', description: 'SDK を通さない通信（fetch・XMLHttpRequest・WebSocket など）', pattern: /(?<![\w$.])fetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\s*\(|\bEventSource\s*\(|\bsendBeacon\s*\(/g },
  { id: 'no-rtc-connection', category: 'network', description: 'WebRTC の接続', pattern: /\bRTCPeerConnection\b|\bRTCDataChannel\b/g },
  { id: 'no-storage-access', category: 'storage', description: 'localStorage / sessionStorage', pattern: /\b(?:localStorage|sessionStorage)\b/g },
  { id: 'no-cookie-access', category: 'storage', description: 'Cookie の読み書き', pattern: /\bdocument\s*\.\s*cookie\b/g },
  { id: 'no-indexeddb-access', category: 'storage', description: 'IndexedDB', pattern: /\bindexedDB\b/g },
  { id: 'no-dangerous-dom', category: 'dom', description: 'innerHTML・document.write・script 要素の作成', pattern: /\.(?:innerHTML|outerHTML)\s*=(?!=)|\binsertAdjacentHTML\s*\(|\bdocument\s*\.\s*write(?:ln)?\s*\(|createElement\s*\(\s*["'`]script["'`]/g },
  { id: 'no-navigator-access', category: 'browser-api', description: '位置情報・カメラ・マイク・クリップボード', pattern: /\bnavigator\s*\.\s*(?:geolocation|mediaDevices|clipboard|credentials|serviceWorker)\b|\bgetUserMedia\s*\(/g },
  { id: 'no-sensitive-api-override', category: 'global', description: 'fetch などの上書き', pattern: /\b(?:window|globalThis|self)\s*\.\s*(?:fetch|XMLHttpRequest|WebSocket|RTCPeerConnection|open)\s*=(?!=)/g },
  { id: 'no-global-override', category: 'global', description: 'window・document の上書き', pattern: /\b(?:window|globalThis|self)\s*\.\s*(?:document|location|top|parent|__TTV__)\s*=(?!=)|\blocation\s*\.\s*href\s*=(?!=)/g },
  { id: 'no-prototype-pollution', category: 'global', description: '組み込みのプロトタイプの書き換え', pattern: /\b(?:Object|Array|Function|String|Number|Promise|EventTarget|Node|Element|Window)\s*\.\s*prototype\s*\.\s*[\w$]+\s*=(?!=)|__proto__\s*=(?!=)/g },
  { id: 'no-obfuscation', category: 'obfuscation', description: '難読化されたコード（大量の \\x エスケープ）', pattern: /\\x[0-9a-fA-F]{2}/g, threshold: 400 },
]

export interface ScanFinding {
  rule: string
  description: string
  file: string
  line: number
  excerpt: string
}

export const scanCode = (file: string, code: string, relaxed: string[] = []): ScanFinding[] => {
  const out: ScanFinding[] = []
  for (const rule of SCAN_RULES) {
    if (relaxed.includes(rule.id)) continue
    rule.pattern.lastIndex = 0
    const matches = [...code.matchAll(rule.pattern)]
    if (matches.length <= (rule.threshold ?? 0)) continue
    for (const m of matches.slice(0, 5)) {
      const idx = m.index ?? 0
      const line = code.slice(0, idx).split('\n').length
      const start = Math.max(0, idx - 40)
      out.push({ rule: rule.id, description: rule.description, file, line, excerpt: code.slice(start, idx + 60).replace(/\s+/g, ' ') })
    }
  }
  return out
}

export const RELAXABLE_RULES = SCAN_RULES.map((r) => r.id)
