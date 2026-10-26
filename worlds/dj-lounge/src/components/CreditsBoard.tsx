import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { CanvasButton } from './CanvasButton'

// ワールドで使っているアセット・ライブラリの一覧（作者・ライセンス）。MIT などの表示義務に応えるための看板。
// ページ送りは各自の手元だけ（同期しない）
export interface Credit {
  name: string
  author: string
  license: string
  note?: string
}

const W = 0.8
const H = 1.1
const PX = 1000 / W
const PER_PAGE = 7
const FONT = '"Noto Sans JP", "Hiragino Sans", "Meiryo", sans-serif'

const fit = (ctx: CanvasRenderingContext2D, t: string, x: number, y: number, size: number, maxW: number, color: string, weight = '') => {
  let s = size
  ctx.font = `${weight} ${s}px ${FONT}`
  while (s > 10 && ctx.measureText(t).width > maxW) {
    s -= 1
    ctx.font = `${weight} ${s}px ${FONT}`
  }
  ctx.fillStyle = color
  ctx.fillText(t, x, y)
}

// 長い文（ライセンス本文）を幅で折り返して描く
const wrap = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) => {
  for (const para of text.split('\n')) {
    let line = ''
    // 英語は単語ごと、日本語は 1 文字ごとに折り返せる
    for (const ch of para.split(/(?<=\s)|(?=[　-鿿])/)) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line.trimEnd(), x, y)
        y += lineH
        line = ch.trimStart()
      } else line += ch
    }
    ctx.fillText(line, x, y)
    y += lineH * 1.35
  }
}

const draw = (ctx: CanvasRenderingContext2D, cw: number, ch: number, title: string, items: Credit[] | string, page: number, pages: number) => {
  ctx.clearRect(0, 0, cw, ch)
  ctx.fillStyle = '#101014'
  ctx.beginPath()
  ctx.roundRect(0, 0, cw, ch, 28)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fit(ctx, 'CREDITS', cw / 2, 62, 46, cw - 80, '#ffffff', 'bold')
  fit(ctx, title, cw / 2, 110, 26, cw - 80, '#b8b8c0')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(50, 140, cw - 100, 2)
  ctx.textAlign = 'left'
  if (typeof items === 'string') {
    ctx.fillStyle = '#d8d8e0'
    ctx.textBaseline = 'top'
    ctx.font = `19px ${FONT}`
    wrap(ctx, items, 56, 170, cw - 112, 26)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    fit(ctx, `${page + 1} / ${pages}`, cw / 2, ch - 62, 28, 200, '#ffffff', 'bold')
    return
  }
  const rowH = 150
  items.forEach((c, i) => {
    const y = 175 + i * rowH
    ctx.fillStyle = '#1c1c22'
    ctx.beginPath()
    ctx.roundRect(40, y, cw - 80, rowH - 14, 14)
    ctx.fill()
    fit(ctx, c.name, 64, y + 28, 30, cw - 128, '#ffffff', 'bold')
    fit(ctx, `作者・著作権: ${c.author}`, 64, y + 62, 22, cw - 128, '#d0d0d8')
    fit(ctx, `ライセンス: ${c.license}`, 64, y + 92, 22, cw - 128, '#ffd27a')
    if (c.note) fit(ctx, c.note, 64, y + 118, 18, cw - 128, '#9a9aa4')
  })
  ctx.textAlign = 'center'
  fit(ctx, `${page + 1} / ${pages}`, cw / 2, ch - 62, 28, 200, '#ffffff', 'bold')
}

// textPages: 一覧のあとに出す文章のページ（ライセンス本文など）
export const CreditsBoard: React.FC<{ id: string; title: string; credits: Credit[]; textPages?: string[]; position: [number, number, number]; rotationY: number; scale?: number }> = ({
  id,
  title,
  credits,
  textPages = [],
  position,
  rotationY,
  scale = 1,
}) => {
  const [page, setPage] = useState(0)
  const listPages = Math.max(1, Math.ceil(credits.length / PER_PAGE))
  const pages = listPages + textPages.length
  const items = page < listPages ? credits.slice(page * PER_PAGE, (page + 1) * PER_PAGE) : textPages[page - listPages]
  const { canvas, ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(W * PX)
    canvas.height = Math.round(H * PX)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return { canvas, ctx: canvas.getContext('2d')!, texture }
  }, [])
  useEffect(() => {
    draw(ctx, canvas.width, canvas.height, title, items, page, pages)
    texture.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, canvas, texture, title, page, pages, credits, textPages])
  const btn = (label: string, dx: number, onPress: () => void, key: string) => (
    <CanvasButton
      id={`${id}-${key}`}
      position={[dx, -H / 2 + 0.062, 0.002]}
      width={0.16}
      height={0.06}
      px={PX}
      deps={[label]}
      draw={(c, cw, ch) => {
        c.fillStyle = '#ffffff'
        c.beginPath()
        c.roundRect(0, 0, cw, ch, ch / 2)
        c.fill()
        c.fillStyle = '#000000'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.font = `bold 26px ${FONT}`
        c.fillText(label, cw / 2, ch / 2)
      }}
      onPress={onPress}
      label={label === '◀' ? '前のページ' : '次のページ'}
    />
  )
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <mesh>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={texture} toneMapped={false} alphaTest={0.5} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4} />
      </mesh>
      {pages > 1 && btn('◀', -0.22, () => setPage((p) => (p + pages - 1) % pages), 'prev')}
      {pages > 1 && btn('▶', 0.22, () => setPage((p) => (p + 1) % pages), 'next')}
    </group>
  )
}
