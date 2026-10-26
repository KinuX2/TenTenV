// アプリのアイコンを作る（apps/client/public/icon.svg と同じ図柄を、依存なしで描いて PNG / ICO にする）
//
//   npm run icons
//   → assets/icon.svg, assets/icon.png (256), assets/icon.ico (16〜256), assets/steamvr-library.png (460x215)
//
// 図柄（64x64 の viewBox）: 角丸の四角 #0d0f17、目 2 つ（#6ea8ff / #ff7eb6）、白い笑った口（3 次ベジェの線）

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'assets')
mkdirSync(assets, { recursive: true })

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const BG = hex('#0d0f17')
const EYE_L = hex('#6ea8ff')
const EYE_R = hex('#ff7eb6')
const WHITE = [255, 255, 255]

// ---------------------------------------------------------------- 形
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r)
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

// 3 次ベジェを折れ線にして、線分までの距離で太い線を描く
function bezierPolyline(p0, p1, p2, p3, n = 64) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    pts.push([u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]])
  }
  return pts
}
function distToPolyline(x, y, pts) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
  }
  return best
}
// M14 46 c10 6 26 6 36 0
const MOUTH = bezierPolyline([14, 46], [24, 52], [40, 52], [50, 46])

/** 64x64 の座標で 1 点の色（null = 透明） */
function iconColor(x, y) {
  if (!inRoundRect(x, y, 0, 0, 64, 64, 14)) return null
  if (y > 40 && y < 56 && x > 10 && x < 54 && distToPolyline(x, y, MOUTH) <= 2) return WHITE
  if (inCircle(x, y, 22, 28, 7)) return EYE_L
  if (inCircle(x, y, 42, 28, 7)) return EYE_R
  return BG
}

// ---------------------------------------------------------------- ラスタライズ（4x4 のスーパーサンプリング）
function render(width, height, colorAt, ss = 4) {
  const px = new Uint8Array(width * height * 4)
  for (let py = 0; py < height; py++) {
    for (let pxi = 0; pxi < width; pxi++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt(pxi + (sx + 0.5) / ss, py + (sy + 0.5) / ss)
          if (!c) continue
          const ca = c[3] ?? 255
          r += c[0] * ca; g += c[1] * ca; b += c[2] * ca; a += ca
        }
      }
      const o = (py * width + pxi) * 4
      const n = ss * ss
      if (a > 0) {
        px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a)
      }
      px[o + 3] = Math.round(a / n)
    }
  }
  return px
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...pngs.map((p) => p.data)])
}

const iconPng = (size) => encodePng(size, size, render(size, size, (x, y) => iconColor((x * 64) / size, (y * 64) / size)))

// ---------------------------------------------------------------- SteamVR のライブラリ用（460x215）: 背景 + アイコン + 「TENTENV」の線文字
const GLYPHS = {
  T: [[[0, 0], [8, 0]], [[4, 0], [4, 14]]],
  E: [[[7, 0], [0, 0], [0, 14], [7, 14]], [[0, 7], [5.5, 7]]],
  N: [[[0, 14], [0, 0], [8, 14], [8, 0]]],
  V: [[[0, 0], [4, 14], [8, 0]]],
}
function textStrokes(text, x0, y0, scale, gap) {
  const segs = []
  let x = x0
  for (const ch of text) {
    for (const line of GLYPHS[ch]) for (let i = 0; i < line.length - 1; i++) segs.push([[x + line[i][0] * scale, y0 + line[i][1] * scale], [x + line[i + 1][0] * scale, y0 + line[i + 1][1] * scale]])
    x += 8 * scale + gap
  }
  return segs
}
function libraryImage() {
  const W = 460, H = 215
  const icon = { x: 32, y: 43.5, size: 128 }
  const text = textStrokes('TENTENV', 192, 82, 3.4, 9)
  const half = 3
  return encodePng(
    W,
    H,
    render(W, H, (x, y) => {
      const ix = ((x - icon.x) / icon.size) * 64, iy = ((y - icon.y) / icon.size) * 64
      if (ix >= 0 && iy >= 0 && ix <= 64 && iy <= 64) {
        const c = iconColor(ix, iy)
        if (c) return c
      }
      if (y > 70 && y < 140 && x > 185) {
        for (const [[ax, ay], [bx, by]] of text) {
          const dx = bx - ax, dy = by - ay
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
          if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= half) return WHITE
        }
      }
      // 背景: 左上 #151a2e → 右下 #2a2150
      const t = (x / W) * 0.6 + (y / H) * 0.4
      return [Math.round(0x15 + (0x2a - 0x15) * t), Math.round(0x1a + (0x21 - 0x1a) * t), Math.round(0x2e + (0x50 - 0x2e) * t)]
    }, 3),
  )
}

copyFileSync(join(root, '..', 'client', 'public', 'icon.svg'), join(assets, 'icon.svg'))
writeFileSync(join(assets, 'icon.png'), iconPng(256))
writeFileSync(join(assets, 'icon.ico'), encodeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: iconPng(size) }))))
writeFileSync(join(assets, 'steamvr-library.png'), libraryImage())
console.log('[icons] OK -> assets/icon.svg, icon.png, icon.ico, steamvr-library.png')
