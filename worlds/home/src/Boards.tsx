// 出現位置のまわりの案内板: 操作方法・メニュー・訪問者数・いまいる人・クレジット
import { TextPlane, usePlayers, type DeviceKind } from '@tentenv/sdk'
import { useVisitCounter } from './Guestbook'
import { SPAWN_Z } from './Plaza'
import { Board } from './ui'

const DEVICE: Record<DeviceKind, string> = { desktop: 'PC', mobile: 'スマホ', vr: 'VR' }

const HOW_TO_MOVE =
  '【PC】WASD で移動、Shift で走る、Space でジャンプ。画面をクリックすると視点を動かせます。物はクリックで押す・つかむ、F か右クリックで「使う」。\n' +
  '【スマホ】左下のスティックで移動、画面をなぞって見回し、タップで押す・つかむ。\n' +
  '【VR】左スティックで移動、右スティックで向きを変える。トリガーで押す、グリップでつかむ。'

const MENU =
  'メニューは PC なら R か Esc、VR なら左手の Y / B ボタンで開きます。\n' +
  'ステッカー・鏡・フェイスミラー・アバターの変更・ワールドの移動・設定はメニューの中にあります。\n' +
  'Enter でチャット、V を押している間だけマイク（設定で変えられます）。'

/** 訪問者数と、いまこのインスタンスにいる人 */
const PeopleBoard: React.FC<{ position: [number, number, number]; rotation: [number, number, number] }> = ({ position, rotation }) => {
  const players = usePlayers()
  const visits = useVisitCounter()
  const list = players.all
    .slice(0, 16)
    .map((p) => `・${p.displayName}${p.isLocal ? '（あなた）' : ''}  ${DEVICE[p.device]}${p.isHost ? '  ホスト' : ''}${p.isGuest ? '  ゲスト' : ''}`)
    .join('\n')
  const more = players.all.length > 16 ? `\nほか ${players.all.length - 16} 人` : ''
  const total = visits.total === null ? '—' : visits.total.toLocaleString('ja-JP')
  return (
    <group position={position} rotation={rotation}>
      <Board
        title={`訪問者 ${total} 人`}
        sub={visits.mine ? `Visitors — あなたは ${visits.mine} 回目の訪問です` : 'Visitors — このワールドに来た人の合計'}
        body={visits.note}
        width={2.2}
        base={2.0}
        lineHeight={0.075}
        accent="#1fa37a"
      />
      <Board title={`いまいる人  ${players.all.length} 人`} sub="Players in this instance" body={list + more} width={2.2} base={0.3} lineHeight={0.08} accent="#e0a530" legs={false} />
    </group>
  )
}

export const SpawnBoards: React.FC = () => (
  <>
    {/* 左: 操作方法とメニュー（出現位置のほうへ少し向ける） */}
    <group position={[-4.3, 0, SPAWN_Z - 1.6]} rotation={[0, 0.5, 0]}>
      <Board title="うごきかた" sub="How to move — PC / Mobile / VR" body={HOW_TO_MOVE} width={2.5} base={0.75} lineHeight={0.085} />
    </group>
    <group position={[-5.6, 0, SPAWN_Z + 1.4]} rotation={[0, 1.05, 0]}>
      <Board title="メニュー" sub="Menu — R / Esc, VR: Y / B" body={MENU} width={2.4} base={0.75} lineHeight={0.085} accent="#6a5cff" />
    </group>
    {/* 右: 訪問者数・いまいる人 */}
    <PeopleBoard position={[4.4, 0, SPAWN_Z - 1.4]} rotation={[0, -0.55, 0]} />
    {/* 後ろ: クレジット */}
    <group position={[0, 0, SPAWN_Z + 3.6]} rotation={[0, Math.PI, 0]}>
      <Board
        title="TenTenV Home"
        sub="Credits — AGPL-3.0"
        body={'TenTenV のホームワールド（AGPL-3.0）。建物・木・音・テクスチャはすべてコードで作っています。\nthree.js（MIT）/ React（MIT）/ React Three Fiber（MIT）/ Rapier（Apache-2.0）/ TenTenV SDK（AGPL-3.0）'}
        width={2.6}
        base={0.8}
        lineHeight={0.08}
        accent="#7a8599"
      />
    </group>
    <TextPlane text="ここが出現位置です  Spawn" width={1.6} lineHeight={0.08} color="#ffffff" background="#00000088" position={[0, 0.06, SPAWN_Z + 0.9]} rotation={[-Math.PI / 2, 0, 0]} />
  </>
)
