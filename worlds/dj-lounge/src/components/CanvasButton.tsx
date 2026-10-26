import { Clickable } from '@tentenv/sdk'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

// ボタンの書き方をそろえる（BGM スイッチと同じ）: 見えている板そのものを Clickable にする。
// - 半透明（transparent）を使わない。角の丸みなどは切り抜き（alphaTest）で表す
// - 奥行きを少し手前へずらし、下のパネルや壁より必ず前に描く
// 見えない当たり判定の箱や、半透明の板をボタンにすると、VR で表示が乱れることがあったため
export interface CanvasButtonProps {
  id: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  width: number
  height: number
  // 1m あたりのピクセル数
  px?: number
  // キャンバス全体（W×H ピクセル）にボタンの見た目を描く。透明のまま残した所は切り抜かれる
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void
  // 描き直しのきっかけ
  deps: unknown[]
  onPress: () => void
  label: string
  enabled?: boolean
}

export const CanvasButton: React.FC<CanvasButtonProps> = ({ id, position = [0, 0, 0], rotation = [0, 0, 0], width, height, px = 1500, draw, deps, onPress, label, enabled = true }) => {
  const { canvas, ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(8, Math.round(width * px))
    canvas.height = Math.max(8, Math.round(height * px))
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return { canvas, ctx: canvas.getContext('2d')!, texture }
  }, [width, height, px])
  useEffect(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    draw(ctx, canvas.width, canvas.height)
    texture.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, ctx, texture, ...deps])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <group position={position} rotation={rotation}>
      <Clickable onClick={() => onPress()} label={label} enabled={enabled}>
        <mesh>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} toneMapped={false} alphaTest={0.5} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-8} />
        </mesh>
      </Clickable>
    </group>
  )
}

// 見えない当たり判定（立体の物に触るため）。半透明は使わず、色も奥行きも書かない不透明の材質にする
export const HitMaterial: React.FC = () => <meshBasicMaterial colorWrite={false} depthWrite={false} />
