// アイコンの SVG を 3D の中で使うテクスチャにする
import { CanvasTexture, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import { faceSvg, handSvgString, svgString } from './icons'

const texCache = new Map<string, CanvasTexture>()
const toTexture = (key: string, svg: string, size: number) => {
  let t = texCache.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = c.height = size
  t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  const tex = t
  const img = new Image()
  img.onload = () => {
    c.getContext('2d')!.drawImage(img, 0, 0, size, size)
    tex.needsUpdate = true
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  texCache.set(key, t)
  return t
}

/** 線画のアイコンのテクスチャ */
export const iconTexture = (name: string, color = '#ffffff', size = 128) => toTexture(`i:${name}:${color}:${size}`, svgString(name, color, 1.8, size), size)
/** 表情のアイコンのテクスチャ */
export const faceTexture = (face: string, color = '#ffffff', size = 128) => toTexture(`f:${face}:${color}:${size}`, faceSvg(face, color, size), size)
/** 手の形のアイコンのテクスチャ */
export const handTexture = (gesture: string, color = '#ffffff', size = 128) => toTexture(`h:${gesture}:${color}:${size}`, handSvgString(gesture, color, size), size)

const imgCache = new Map<string, Texture>()
const loader = new TextureLoader()
loader.setCrossOrigin('anonymous')
/** 画像（サムネイル・アイコン）のテクスチャ。最近使った 64 枚まで覚えておく */
export const imageTexture = (url: string) => {
  let t = imgCache.get(url)
  if (t) return t
  t = loader.load(url)
  t.colorSpace = SRGBColorSpace
  imgCache.set(url, t)
  if (imgCache.size > 64) {
    const [k, old] = imgCache.entries().next().value as [string, Texture]
    imgCache.delete(k)
    old.dispose()
  }
  return t
}
