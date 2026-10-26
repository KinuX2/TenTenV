import { SpawnPad } from '@tentenv/sdk'
import { BOOTH, Club, ROOM } from './components/Club'
import { CreditsBoard } from './components/CreditsBoard'
import { CalmButton } from './components/CalmButton'
import { Stage } from './components/Stage'
import { CREDITS } from './credits'
import { DjBooth } from './dj/DjBooth'
import { PANEL } from './dj/Utility'
import { MIT_TEXT, OTHER_LICENSES_TEXT } from './licenseText'

export interface WorldProps {
  position?: [number, number, number]
  scale?: number
}

// DJ 画面と操作パネル: 下の縁を DJ コントローラーの奥の縁にのせる（傾けた分を計算して中心を決める）
const CTRL = { top: BOOTH.tableH + 0.045, farZ: BOOTH.z + 0.44 / 2 }
const FRAME_HALF = PANEL.h / 2 + 0.03
const SCREEN_Y = CTRL.top + 0.004 + FRAME_HALF * Math.cos(PANEL.tilt)
// 奥へ倒すと下の縁は DJ 側（-Z）へ出るので、その分だけ中心を奥へ
const SCREEN_Z = CTRL.farZ + 0.012 - FRAME_HALF * Math.sin(PANEL.tilt)

export const World: React.FC<WorldProps> = ({ position = [0, 0, 0], scale = 1 }) => {
  return (
    <group position={position} scale={scale}>
      <Club />
      <Stage />
      <CalmButton />
      {/* DJ ブース: DJ は台の奥（-Z 側）に立ってフロアを向く。コントローラーの手前側が DJ 側になるよう 180° 回す */}
      <DjBooth
        controller={{ position: [0, BOOTH.tableH, BOOTH.z], rotationY: Math.PI }}
        screens={[
          // DJ 用のモニター（台のフロア側の端に、DJ のほうを向けて置く）
          { position: [0, SCREEN_Y, SCREEN_Z], rotationY: Math.PI, width: PANEL.w, tilt: PANEL.tilt },
          // フロア向けの情報画面（左右の壁。DJ の後ろは LED ビジョン）
          { position: [-ROOM.w / 2 + 0.06, 2.5, 2.2], rotationY: Math.PI / 2, width: 3.2 },
          { position: [ROOM.w / 2 - 0.06, 2.5, 2.2], rotationY: -Math.PI / 2, width: 3.2 },
        ]}
        // フロアの左右に立てる PA スピーカー（少し内向き）
        speakers={[
          { position: [-4.3, 0, BOOTH.z - 0.3], rotationY: 0.35 },
          { position: [4.3, 0, BOOTH.z - 0.3], rotationY: -0.35 },
        ]}
        // 操作パネル（曲のブラウザ）: DJ 画面と同じ大きさで、DJ から見て画面の左に並べる（枠どうしが接する）
        utility={{ position: [PANEL.w + 0.06, SCREEN_Y, SCREEN_Z], rotationY: Math.PI }}
      />
      {/* 使っている素材とライブラリの一覧（入口の右の壁） */}
      <CreditsBoard id="credits" title="DJ ラウンジ で使っている素材とライブラリ" credits={CREDITS} textPages={[MIT_TEXT, OTHER_LICENSES_TEXT]} position={[ROOM.w / 2 - 0.015, 1.45, 5]} rotationY={-Math.PI / 2} />
      <SpawnPad position={[0, 0, 6]} yaw={0} />
    </group>
  )
}
