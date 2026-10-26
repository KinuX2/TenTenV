import { useState } from 'react'
import { AL } from '../dj/audiolink'
import { CanvasButton } from './CanvasButton'
import { ROOM } from './Club'

// ストロボや白いフラッシュを弱める切り替え（各自の手元だけ。光に敏感な人向け）
export const CalmButton: React.FC = () => {
  const [calm, setCalm] = useState(AL.calm)
  return (
    <CanvasButton
      id="calm"
      position={[ROOM.w / 2 - 0.015, 1.45, 4.1]}
      rotation={[0, -Math.PI / 2, 0]}
      width={0.56}
      height={0.2}
      label={calm ? 'フラッシュを元に戻す' : 'フラッシュを弱める'}
      deps={[calm]}
      onPress={() => {
        AL.setCalm(!calm)
        setCalm(!calm)
      }}
      draw={(ctx, W, H) => {
        ctx.fillStyle = calm ? '#2fd08a' : '#2a2436'
        ctx.beginPath()
        ctx.roundRect(4, 4, W - 8, H - 8, 30)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 6
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `bold ${Math.round(H * 0.34)}px "Noto Sans JP", "Meiryo", sans-serif`
        ctx.fillText(calm ? 'フラッシュ: 弱め' : 'フラッシュ: 通常', W / 2, H / 2)
      }}
    />
  )
}
