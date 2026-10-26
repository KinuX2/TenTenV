// 今入っているインスタンスの WorldEngine（3D のコードを読み込まずに参照するための入れ物）
import type { WorldEngine } from '../world/engine'

let current: WorldEngine | null = null
export const setActiveEngine = (e: WorldEngine | null) => {
  current = e
}
export const activeEngine = () => current
