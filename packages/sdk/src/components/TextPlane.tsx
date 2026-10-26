import { useEffect, useMemo } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

export interface TextPlaneProps {
  text: string
  /** 板の幅（m）。高さは文字の量から決まる */
  width?: number
  /** 1 行の高さ（m） */
  lineHeight?: number
  color?: string
  background?: string | null
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  padding?: number
  maxLines?: number
  radius?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** 両面に出す */
  doubleSide?: boolean
  renderOrder?: number
  depthTest?: boolean
}

const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic UI","Meiryo",system-ui,sans-serif'

/** 文字を折り返して行に分ける（日本語は 1 文字ずつ、英語は単語ごと） */
export const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    const tokens = para.match(/[A-Za-z0-9_\-.,!?'"@#/:;()[\]]+\s*|\s+|./gu) ?? ['']
    for (const tk of tokens) {
      const next = line + tk
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line.trimEnd())
        line = tk.trimStart()
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

/** 文字を描いたテクスチャ（Canvas）。フォントファイルを読み込まずに日本語を出せる */
export const useTextTexture = (p: { text: string; width: number; lineHeight: number; color: string; background: string | null; align: 'left' | 'center' | 'right'; bold: boolean; padding: number; maxLines: number; radius: number }) => {
  const result = useMemo(() => {
    const ppm = 512 // 1m あたりのピクセル
    const W = Math.max(16, Math.round(p.width * ppm))
    const lh = p.lineHeight * ppm
    const pad = p.padding * ppm
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = `${p.bold ? 700 : 400} ${Math.round(lh * 0.72)}px ${FONT}`
    ctx.font = font
    const lines = wrapText(ctx, p.text, W - pad * 2).slice(0, p.maxLines)
    const H = Math.max(16, Math.round(lines.length * lh + pad * 2))
    canvas.width = W
    canvas.height = H
    const c = canvas.getContext('2d')!
    if (p.background) {
      c.fillStyle = p.background
      const r = Math.min(p.radius * ppm, H / 2)
      c.beginPath()
      c.roundRect(0, 0, W, H, r)
      c.fill()
    }
    c.font = font
    c.fillStyle = p.color
    c.textBaseline = 'middle'
    c.textAlign = p.align
    const x = p.align === 'left' ? pad : p.align === 'right' ? W - pad : W / 2
    lines.forEach((l, i) => c.fillText(l, x, pad + lh * (i + 0.5)))
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.minFilter = LinearFilter
    tex.anisotropy = 4
    return { texture: tex, height: H / ppm }
  }, [p.text, p.width, p.lineHeight, p.color, p.background, p.align, p.bold, p.padding, p.maxLines, p.radius])
  useEffect(() => () => result.texture.dispose(), [result])
  return result
}

/** 文字の板。日本語を含む文字をそのまま出せる */
export const TextPlane: React.FC<TextPlaneProps> = ({
  text,
  width = 1,
  lineHeight = 0.08,
  color = '#ffffff',
  background = null,
  align = 'center',
  bold = false,
  padding = 0.03,
  maxLines = 40,
  radius = 0.03,
  position,
  rotation,
  doubleSide = false,
  renderOrder,
  depthTest = true,
}) => {
  const { texture, height } = useTextTexture({ text, width, lineHeight, color, background, align, bold, padding, maxLines, radius })
  return (
    <mesh position={position} rotation={rotation} renderOrder={renderOrder}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} side={doubleSide ? 2 : 0} depthTest={depthTest} depthWrite={!background ? false : true} />
    </mesh>
  )
}
