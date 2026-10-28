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

// 文字列で正規表現を組み立てるための部品
/** 大文字・小文字を区別しない語（"SCRIPT" なども拾う。i フラグはほかの部分にまで効くので使わない） */
const ci = (word: string) => word.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`)
/** window.x・globalThis.x・self.x などのグローバル経由の参照 */
const GLOBAL = String.raw`\b(?:window|globalThis|self|top|parent|frames)\s*(?:\?\.|\.)\s*`
/** ["name"] の形の参照（ドット記法を避けたもの） */
const bracket = (names: string) => String.raw`\[\s*["'\`](?:${names})["'\`]\s*\]`
/** window["name"] など、グローバルを ["name"] で参照するもの（ふつうの名前は obj["open"] などと区別する） */
const globalBracket = (names: string) => String.raw`\b(?:window|globalThis|self|document|top|parent|frames)\s*${bracket(names)}`
const re = (...parts: string[]) => new RegExp(parts.join('|'), 'g')

export const SCAN_RULES: ScanRule[] = [
  {
    id: 'no-eval',
    category: 'dynamic-code',
    description: 'eval() の使用',
    // 呼び出し・間接呼び出し（(0, eval)(s)・eval?.(s)）・window.eval・["eval"] を拾う。obj.eval() は対象外
    pattern: re(String.raw`(?<![\w$.'"\`])eval\b(?!\s*:)`, String.raw`${GLOBAL}eval\b`, bracket('eval')),
  },
  {
    id: 'no-new-function',
    category: 'dynamic-code',
    description: 'Function コンストラクタの使用',
    // (() => {}).constructor(s) のように、関数の constructor を呼ぶ形も拾う（new x.constructor() は対象外）
    pattern: re(
      String.raw`\bnew\s+Function\b`,
      String.raw`(?<![\w$.])Function\s*(?:\?\.\s*)?\(`,
      String.raw`${GLOBAL}Function\b`,
      String.raw`(?<!\bnew\s+[\w$.\s[\]]*)\.constructor\s*(?:\?\.\s*)?\(`,
      String.raw`\[\s*["'\`]constructor["'\`]\s*\]\s*(?:\?\.\s*)?\(`,
    ),
  },
  { id: 'no-string-timeout', category: 'dynamic-code', description: '文字列を渡す setTimeout / setInterval', pattern: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/g },
  { id: 'no-javascript-blob', category: 'dynamic-code', description: 'JavaScript の Blob の作成', pattern: /type\s*:\s*["'`](?:text|application)\/(?:x-)?(?:java|ecma)script/gi },
  { id: 'no-worker', category: 'dynamic-code', description: 'Worker・SharedWorker の作成、importScripts', pattern: /\b(?:Shared)?Worker\s*\(|\bimportScripts\s*\(/g },
  { id: 'no-external-import', category: 'network', description: '外部 URL からの import', pattern: /\bimport\s*\(\s*["'`](?:https?:)?\/\//gi },
  {
    id: 'no-network-without-permission',
    category: 'network',
    description: 'SDK を通さない通信（fetch・XMLHttpRequest・WebSocket・画像の URL での送信など）',
    pattern: re(
      String.raw`(?<![\w$.])fetch\s*(?:\?\.\s*)?\(`,
      String.raw`${GLOBAL}fetch\b(?!\s*=(?!=))`, // 上書き（window.fetch = f）は no-sensitive-api-override で見る
      bracket('fetch|XMLHttpRequest|WebSocket|EventSource|WebTransport|sendBeacon'),
      globalBracket('open'),
      String.raw`\bXMLHttpRequest\b`,
      String.raw`\bWebSocket\s*\(`,
      String.raw`\bWebTransport\s*\(`,
      String.raw`\bEventSource\s*\(`,
      String.raw`\bsendBeacon\s*\(`,
      // new Image().src = url は、URL に値を載せて外へ送る典型の形
      String.raw`\bnew\s+Image\s*(?:\([^()]*\))?\s*\)?\s*\.\s*src\s*=(?!=)`,
      // 新しいウィンドウ（URL に値を載せて送れる）
      String.raw`${GLOBAL}open\s*\(`,
    ),
  },
  { id: 'no-rtc-connection', category: 'network', description: 'WebRTC の接続', pattern: /\bRTCPeerConnection\b|\bRTCDataChannel\b/g },
  { id: 'no-storage-access', category: 'storage', description: 'localStorage / sessionStorage', pattern: /\b(?:localStorage|sessionStorage)\b/g },
  { id: 'no-cookie-access', category: 'storage', description: 'Cookie の読み書き', pattern: re(String.raw`\bdocument\s*\.\s*cookie\b`, String.raw`\bcookieStore\b`, bracket('cookie')) },
  { id: 'no-indexeddb-access', category: 'storage', description: 'IndexedDB', pattern: /\bindexedDB\b/g },
  {
    id: 'no-dangerous-dom',
    category: 'dom',
    description: 'innerHTML・document.write・script / iframe 要素の作成・srcdoc',
    pattern: re(
      String.raw`\.\s*(?:innerHTML|outerHTML)\s*\+?=(?!=)`,
      bracket('innerHTML|outerHTML'),
      String.raw`\binsertAdjacentHTML\s*\(`,
      String.raw`\bcreateContextualFragment\s*\(`,
      String.raw`\bdocument\s*\.\s*write(?:ln)?\s*\(`,
      // 大文字（"SCRIPT"）・名前空間付き（createElementNS）も拾う
      String.raw`createElement(?:NS)?\s*\([^)]*?["'\`]\s*(?:${['script', 'iframe', 'frame', 'object', 'embed'].map(ci).join('|')})\s*["'\`]`,
      ci('srcdoc'),
    ),
  },
  {
    id: 'no-navigator-access',
    category: 'browser-api',
    description: '位置情報・カメラ・マイク・画面の取得・クリップボード',
    pattern: re(
      String.raw`\bnavigator\s*(?:\?\.|\.)\s*(?:geolocation|mediaDevices|clipboard|credentials|serviceWorker)\b`,
      String.raw`\b(?:getUserMedia|getDisplayMedia)\b`,
      bracket('geolocation|mediaDevices|clipboard|credentials|serviceWorker'),
    ),
  },
  { id: 'no-sensitive-api-override', category: 'global', description: 'fetch などの上書き', pattern: /\b(?:window|globalThis|self)\s*\.\s*(?:fetch|XMLHttpRequest|WebSocket|RTCPeerConnection|open)\s*=(?!=)/g },
  {
    id: 'no-global-override',
    category: 'global',
    description: 'window・document の上書き、ページの移動（location）',
    pattern: re(
      String.raw`\b(?:window|globalThis|self)\s*\.\s*(?:document|location|top|parent|__TTV__)\s*=(?!=)`,
      // location = url・document.location = url・location.href = url・location.assign(url) など（GLSL の layout(location = 0) は対象外）
      String.raw`(?:(?<![\w$.])(?<!\b(?:var|let|const)\s+)|\b(?:window|globalThis|self|document|top|parent)\s*\.\s*)location\s*(?:=(?![=\s]*\d)|\.\s*(?:href\s*=(?!=)|assign\s*\(|replace\s*\())`,
      globalBracket('location'),
    ),
  },
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
