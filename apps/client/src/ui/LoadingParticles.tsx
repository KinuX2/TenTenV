import { useEffect, useRef } from 'react'

/** 3D 画面のコードが届くまでの短い間も、同じ粒の見た目を出す。 */
export const LoadingParticles: React.FC = () => {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      element.width = Math.round(width * dpr)
      element.height = Math.round(height * dpr)
      const ctx = element.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      let seed = 0x51a7c8e3
      const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000)
      const scale = height / (2 * 1.3 * Math.tan((75 * Math.PI) / 360))
      for (let i = 0; i < 9000;) {
        const x = (random() * 2 - 1) * 1.38
        const y = 0.88 - Math.pow(random(), 1.3) * 1.78
        const edge = (x / 1.38) ** 2 + ((y - 0.08) / 0.94) ** 2
        if (edge > 1 && random() < Math.min(1, (edge - 1) * 4)) continue
        random() // 3D 画面の奥行き分
        const hueNoise = (random() - 0.5) * 0.04
        const u = (x / 1.38 + 1) / 2
        const brightness = 11 + Math.pow(random(), 3) * 37
        const blend = Math.max(0, Math.min(1, (y + 0.3) / 0.82))
        const px = width / 2 + x * scale
        const py = height / 2 - y * scale
        ctx.globalAlpha = 0.9 * (1 - blend)
        ctx.fillStyle = `hsl(${(0.78 + 0.11 * u + hueNoise) * 360} 88% ${brightness}%)`
        ctx.fillRect(px, py, 1.6, 1.6)
        ctx.globalAlpha = 0.9 * blend
        ctx.fillStyle = `hsl(${(0.67 - 0.66 * u + hueNoise) * 360} 90% ${brightness}%)`
        ctx.fillRect(px, py, 1.6, 1.6)
        i++
      }
      ctx.globalAlpha = 1
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [])
  return <canvas ref={canvas} aria-hidden="true" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', background: '#000' }} />
}
