// 使い回す材質と形。描画の回数とメモリを抑えるため、同じ見た目の物は同じインスタンスを共有する
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three'

/** 再現できる乱数（毎回同じ模様になるように） */
export const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const canvasTex = (size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat: number): Texture => {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  draw(cv.getContext('2d')!, size)
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  return t
}

// ---- 手続きで描くテクスチャ ----

const grassTex = () =>
  canvasTex(
    256,
    (c, s) => {
      const r = rng(7)
      c.fillStyle = '#6f9a4e'
      c.fillRect(0, 0, s, s)
      for (let i = 0; i < 2600; i++) {
        const g = 120 + Math.floor(r() * 70)
        c.fillStyle = `rgba(${60 + Math.floor(r() * 50)},${g},${50 + Math.floor(r() * 30)},0.55)`
        c.fillRect(r() * s, r() * s, 1 + r() * 2, 2 + r() * 4)
      }
    },
    60,
  )

const stoneTex = () =>
  canvasTex(
    256,
    (c, s) => {
      const r = rng(11)
      const n = 4
      const w = s / n
      c.fillStyle = '#b9b3a8'
      c.fillRect(0, 0, s, s)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const v = 200 + Math.floor(r() * 30)
          c.fillStyle = `rgb(${v},${v - 6},${v - 16})`
          c.fillRect(x * w + 2, y * w + 2, w - 4, w - 4)
          for (let k = 0; k < 40; k++) {
            c.fillStyle = `rgba(120,110,100,${r() * 0.15})`
            c.fillRect(x * w + r() * w, y * w + r() * w, 2, 2)
          }
        }
    },
    6,
  )

const woodTex = () =>
  canvasTex(
    128,
    (c, s) => {
      const r = rng(5)
      c.fillStyle = '#8a5a36'
      c.fillRect(0, 0, s, s)
      for (let i = 0; i < 60; i++) {
        c.strokeStyle = `rgba(${70 + r() * 40},${40 + r() * 20},20,${0.25 + r() * 0.25})`
        c.lineWidth = 1 + r() * 2
        const y = r() * s
        c.beginPath()
        c.moveTo(0, y)
        c.bezierCurveTo(s * 0.3, y + r() * 6 - 3, s * 0.6, y + r() * 6 - 3, s, y)
        c.stroke()
      }
      c.fillStyle = 'rgba(40,20,10,0.5)'
      for (let i = 1; i < 4; i++) c.fillRect(0, (i * s) / 4, s, 2)
    },
    1,
  )

/** 同じ絵を別の繰り返し回数で使う */
const repeatOf = (t: Texture, x: number, y: number) => {
  const c = t.clone()
  c.repeat.set(x, y)
  c.needsUpdate = true
  return c
}

let cache: ReturnType<typeof makeMaterials> | null = null

const makeMaterials = () => {
  const grass = grassTex()
  const stone = stoneTex()
  const wood = woodTex()
  return {
    grass: new MeshStandardMaterial({ map: grass, roughness: 1 }),
    plaza: new MeshStandardMaterial({ map: stone, roughness: 0.9, color: '#ffffff' }),
    path: new MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.95 }),
    marble: new MeshStandardMaterial({ color: '#f1ede6', roughness: 0.45 }),
    stoneDark: new MeshStandardMaterial({ color: '#8d8a86', roughness: 0.85 }),
    wood: new MeshStandardMaterial({ map: wood, roughness: 0.75 }),
    woodFloor: new MeshStandardMaterial({ map: repeatOf(wood, 6, 4), roughness: 0.8 }),
    door: new MeshStandardMaterial({ color: '#7a5236', roughness: 0.7 }),
    rug: new MeshStandardMaterial({ color: '#7d4a5a', roughness: 1 }),
    woodDark: new MeshStandardMaterial({ color: '#5a3b26', roughness: 0.7 }),
    plaster: new MeshStandardMaterial({ color: '#f4efe7', roughness: 0.9 }),
    roof: new MeshStandardMaterial({ color: '#c0654a', roughness: 0.8 }),
    roofTeal: new MeshStandardMaterial({ color: '#3f8a8c', roughness: 0.6 }),
    metal: new MeshStandardMaterial({ color: '#3a3f4b', roughness: 0.45, metalness: 0.5 }),
    brass: new MeshStandardMaterial({ color: '#e0b450', roughness: 0.3, metalness: 0.75 }),
    fabric: new MeshStandardMaterial({ color: '#4f6fa8', roughness: 1 }),
    fabricWarm: new MeshStandardMaterial({ color: '#c98a5a', roughness: 1 }),
    cushion: new MeshStandardMaterial({ color: '#f0e3cf', roughness: 1 }),
    water: new MeshStandardMaterial({ color: '#3d9fd0', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.82, emissive: '#0b3a55', emissiveIntensity: 0.4 }),
    leaf: new MeshStandardMaterial({ color: '#4f8a3c', roughness: 0.9, flatShading: true }),
    leafDark: new MeshStandardMaterial({ color: '#3a6e34', roughness: 0.9, flatShading: true }),
    hedge: new MeshStandardMaterial({ color: '#46783a', roughness: 1 }),
    trunk: new MeshStandardMaterial({ color: '#6b4a32', roughness: 1 }),
    hill: new MeshStandardMaterial({ color: '#7fa66a', roughness: 1, flatShading: true }),
    pot: new MeshStandardMaterial({ color: '#b5653f', roughness: 0.8 }),
    screenFrame: new MeshStandardMaterial({ color: '#1c1f26', roughness: 0.5 }),
    panel: new MeshStandardMaterial({ color: '#232838', roughness: 0.6 }),
    // 夜に光る電球（昼は消えている）
    bulb: new MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffcf70', emissiveIntensity: 0, roughness: 0.3 }),
    glowBlue: new MeshStandardMaterial({ color: '#9fd3ff', emissive: '#4aa8ff', emissiveIntensity: 1.6, roughness: 0.3 }),
    flower: [
      new MeshStandardMaterial({ color: '#f28aa8', roughness: 0.8 }),
      new MeshStandardMaterial({ color: '#f7d154', roughness: 0.8 }),
      new MeshStandardMaterial({ color: '#b495f0', roughness: 0.8 }),
      new MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
    ],
  }
}

/** 材質の一覧（最初に使ったときに 1 度だけ作る） */
export const mats = () => (cache ??= makeMaterials())

let geoCache: ReturnType<typeof makeGeos> | null = null
const makeGeos = () => ({
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(0.5, 0.5, 1, 20),
  cylLow: new CylinderGeometry(0.5, 0.5, 1, 10),
  sphere: new SphereGeometry(0.5, 20, 14),
  ico: new IcosahedronGeometry(0.5, 1),
  cone: new CylinderGeometry(0, 0.5, 1, 10),
})
/** 単位の大きさの形。scale で大きさを変えて使う */
export const geos = () => (geoCache ??= makeGeos())
