// TenTenV の標準のホームワールド。広場を中心に、SDK の機能をひととおり置いた見本でもある
//
// - 北: シアター（MediaScreen・同期再生）     - 西: 鏡（MirrorSurface・その人だけの設定）
// - 東: ポータルホール（listWorlds・PortalGate） - 南: 出現位置と案内板（usePlayers・useWorldStore）
// - 南西: ラウンジ（Chair・同期ランプ）        - 南東: 持てる物（Pickup・onUse・useNetEvent）
// - 北西: 小屋（押すと開くドア・芳名帳）  - 中央: 噴水（TriggerZone）と共有時計の彫刻（useNetClock）
// 外部のファイルは使わず、形・テクスチャ・音はすべてコードで作る
import { SpawnPad } from '@tentenv/sdk'
import { SpawnBoards } from './Boards'
import { Cabin } from './Cabin'
import { SkyAndLights, Terrain } from './Environment'
import { Lounge } from './Lounge'
import { MirrorCorner } from './MirrorCorner'
import { PickupTable } from './Pickups'
import { Fountain, LampPosts, PlazaFloor, SPAWN_Z, WelcomeArch } from './Plaza'
import { PortalHall } from './PortalHall'
import { Theater } from './Theater'

/** 出現位置の足元の輪 */
const SpawnRing: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, SPAWN_Z]}>
    <ringGeometry args={[0.55, 0.7, 48]} />
    <meshBasicMaterial color="#7fb2ff" transparent opacity={0.7} toneMapped={false} />
  </mesh>
)

export default function World() {
  return (
    <>
      <SkyAndLights />
      <Terrain />
      <PlazaFloor />
      <Fountain />
      <LampPosts />
      <WelcomeArch />
      <SpawnPad position={[0, 0, SPAWN_Z]} yaw={0} />
      <SpawnRing />
      <SpawnBoards />
      <Theater />
      <MirrorCorner />
      <PortalHall />
      <Lounge />
      <PickupTable />
      <Cabin />
    </>
  )
}
