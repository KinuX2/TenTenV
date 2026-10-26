// ワールド制作のひな型（[137]）。ここから書き換えて自分のワールドを作る
//
// - 物理の当たり判定: @react-three/rapier の RigidBody（type="fixed" は動かない床や壁）
// - 押せる物: Clickable、つかめる物: Pickup、座れる場所: Chair、出現位置: SpawnPad
// - 全員で同じ値: useSyncedState（あとから来た人にも届く）
// - ファイル（画像・音・モデル）は public/ に置き、useWorldEnv().assetUrl('ファイル名') で読む
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Chair, Clickable, MirrorSurface, Pickup, SpawnPad, TextPlane, useSyncedObjects, useSyncedState } from '@tentenv/sdk'

const Floor = () => (
  <RigidBody type="fixed" colliders={false}>
    <CuboidCollider args={[15, 0.1, 15]} position={[0, -0.1, 0]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial color="#8a93a6" />
    </mesh>
  </RigidBody>
)

/** 押すと全員の画面で点いたり消えたりするライト */
const Lamp = () => {
  const [on, setOn] = useSyncedState('lamp', false)
  return (
    <group position={[-2, 0, 0]}>
      <Clickable label={on ? 'ライトを消す' : 'ライトを点ける'} onClick={() => setOn(!on)} position={[0, 1, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.12, 0.15, 0.12, 24]} />
          <meshStandardMaterial color={on ? '#ffd040' : '#3a3f4b'} emissive={on ? '#ffb000' : '#000000'} emissiveIntensity={2} />
        </mesh>
      </Clickable>
      <mesh position={[0, 0.47, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.94, 12]} />
        <meshStandardMaterial color="#2a2d36" />
      </mesh>
      {on && <pointLight position={[0, 1.3, 0]} intensity={6} distance={6} color="#ffcf70" />}
      <TextPlane text="押してみてください" width={0.8} lineHeight={0.07} position={[0, 1.4, 0]} background="#000000aa" />
    </group>
  )
}

/** 押すたびに色つきの玉が出る（全員に同じ玉が見える）。全部消すボタンつき */
const BallMaker = () => {
  const balls = useSyncedObjects<{ x: number; z: number; color: string }>('balls', 30)
  const colors = ['#ff7eb6', '#7be495', '#5ac8fa', '#ffd040']
  return (
    <group position={[0, 0, -1.5]}>
      <Clickable label="玉を出す" onClick={() => balls.spawn({ x: Math.random() * 2 - 1, z: Math.random() * 2 - 1, color: colors[balls.items.length % colors.length] })} position={[-0.4, 1, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.2, 0.1]} />
          <meshStandardMaterial color="#3b6df0" />
        </mesh>
        <TextPlane text="玉を出す" width={0.45} lineHeight={0.07} position={[0, 0, 0.051]} />
      </Clickable>
      <Clickable label="玉を消す" onClick={() => balls.clear()} position={[0.4, 1, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.2, 0.1]} />
          <meshStandardMaterial color="#7f1d1d" />
        </mesh>
        <TextPlane text="玉を消す" width={0.45} lineHeight={0.07} position={[0, 0, 0.051]} />
      </Clickable>
      {balls.items.map((b) => (
        <mesh key={b.id} position={[b.data.x, 0.15, b.data.z - 1.5]} castShadow>
          <sphereGeometry args={[0.15, 20, 14]} />
          <meshStandardMaterial color={b.data.color} />
        </mesh>
      ))}
    </group>
  )
}

export default function World() {
  return (
    <>
      <color attach="background" args={['#9fc4ff']} />
      <fog attach="fog" args={['#9fc4ff', 20, 60]} />
      <hemisphereLight args={['#ffffff', '#5b6475', 0.8]} />
      <directionalLight position={[5, 10, 4]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <SpawnPad position={[0, 0, 4]} yaw={0} />
      <Floor />
      <Lamp />
      <BallMaker />
      {/* つかんで投げられる箱 */}
      <Pickup id="box" label="箱" position={[1, 1, 1]}>
        <mesh castShadow>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshStandardMaterial color="#ff7eb6" />
        </mesh>
      </Pickup>
      {/* 座れる椅子（原点がお尻の位置、-Z が前） */}
      <group position={[2.5, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <RigidBody type="fixed">
          <mesh position={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.5, 0.44, 0.5]} />
            <meshStandardMaterial color="#6b4f3a" />
          </mesh>
        </RigidBody>
        <Chair id="chair-1" position={[0, 0.45, 0]} />
      </group>
      <MirrorSurface width={2} height={2.4} position={[0, 1.3, -4]} />
    </>
  )
}
