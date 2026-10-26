// 性能の計測（[152]・19.1）: フレームレート・描画回数・ポリゴン数・メモリ
import type { WebGLRenderer } from 'three'

class PerfStats {
  fps = 0
  frameMs = 0
  calls = 0
  triangles = 0
  geometries = 0
  textures = 0
  memoryMB = 0
  private frames = 0
  private last = performance.now()
  private lastFrame = performance.now()
  sample(gl: WebGLRenderer) {
    const now = performance.now()
    this.frameMs = this.frameMs * 0.9 + (now - this.lastFrame) * 0.1
    this.lastFrame = now
    this.frames++
    if (now - this.last >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.last))
      this.frames = 0
      this.last = now
      const info = gl.info
      this.calls = info.render.calls
      this.triangles = info.render.triangles
      this.geometries = info.memory.geometries
      this.textures = info.memory.textures
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      this.memoryMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0
    }
  }
}

export const perfStats = new PerfStats()
