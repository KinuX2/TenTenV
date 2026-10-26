// 中央の広場: 噴水（近づくと全員の画面で噴き上がる）、共有時計で回る彫刻、街灯、入口のアーチ
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import { type Group, IcosahedronGeometry, type InstancedMesh, Matrix4, MeshStandardMaterial, type Mesh } from 'three'
import { TextPlane, TriggerZone, useNetClock, useSyncedState, useSyncedTicker } from '@tentenv/sdk'
import { makeWaterBuffer, usePositionalSound } from './audio'
import { geos, mats } from './materials'
import { Box, Button, Cyl, Instances, type InstanceItem } from './ui'

export const PLAZA_R = 8
/** 出現位置（広場の南） */
export const SPAWN_Z = 13.5

/** 広場の床と、各エリアへの小道 */
export const PlazaFloor: React.FC = () => {
  const m = mats()
  // [角度, 長さ]: 広場の縁から外へ延ばす
  const paths: [number, number][] = [
    [Math.PI / 2, 10], // 南: 出現位置
    [-Math.PI / 2, 5], // 北: シアター
    [Math.PI, 8], // 西: 鏡
    [0, 1.2], // 東: ポータル
    [Math.PI / 4, 7.5], // 南東: 持てる物
    [(3 * Math.PI) / 4, 7.5], // 南西: ラウンジ
    [(-3 * Math.PI) / 4, 7.5], // 北西: 小屋
  ]
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={m.plaza} receiveShadow>
        <circleGeometry args={[PLAZA_R, 64]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} material={m.stoneDark} receiveShadow>
        <ringGeometry args={[PLAZA_R, PLAZA_R + 0.35, 64]} />
      </mesh>
      {paths.map(([a, len], i) => {
        const r = PLAZA_R + len / 2 - 0.2
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, -a + Math.PI / 2]} position={[Math.cos(a) * r, 0.018, Math.sin(a) * r]} material={m.path} receiveShadow>
            <planeGeometry args={[2.4, len + 0.4]} />
          </mesh>
        )
      })}
    </>
  )
}

// ---- 噴水 ----

const DROPS = 240

/** 水しぶき（インスタンス描画）。burst が 1 のとき高く噴き上がる */
const Spray: React.FC<{ burst: () => number }> = ({ burst }) => {
  const ref = useRef<InstancedMesh>(null)
  const geo = useMemo(() => new IcosahedronGeometry(0.028, 0), [])
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#cfeeff', emissive: '#5fb6e8', emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.85 }), [])
  const seeds = useMemo(() => Array.from({ length: DROPS }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), ph: (i * 0.618) % 1, sp: 0.75 + ((i * 7) % 10) / 40 })), [])
  const level = useRef(0)
  const mtx = useMemo(() => new Matrix4(), [])
  useFrame(({ clock }, dt) => {
    const g = ref.current
    if (!g) return
    const goal = burst()
    level.current += (goal - level.current) * Math.min(1, dt * 2.5)
    const L = level.current
    const t = clock.elapsedTime
    // 中央の噴き出し（高さ 1.5m → 噴き上げ時 4.2m）と、外向きの弧
    const v0 = 4.2 + L * 3.8
    const life = (2 * v0) / 9.81
    for (let i = 0; i < DROPS; i++) {
      const s = seeds[i]
      const u = (t / life + s.ph) % 1
      const tt = u * life
      const out = (i % 3 === 0 ? 0.25 : 0.55 + L * 0.5) * s.sp
      const r = out * tt
      const y = 1.45 + v0 * s.sp * tt - 0.5 * 9.81 * tt * tt
      const sc = y < 0.38 ? 0 : 0.7 + (1 - u) * 0.6
      mtx.makeScale(sc, sc * 2.2, sc).setPosition(Math.cos(s.a) * r, Math.max(0.38, y), Math.sin(s.a) * r)
      g.setMatrixAt(i, mtx)
    }
    g.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, DROPS]} frustumCulled={false} />
}

/** 共有時計の角度で回る彫刻。全員の画面で同じ向きになる */
const ClockSculpture: React.FC = () => {
  const clock = useNetClock()
  const r1 = useRef<Mesh>(null)
  const r2 = useRef<Mesh>(null)
  const r3 = useRef<Mesh>(null)
  const orb = useRef<Group>(null)
  useFrame(() => {
    const s = clock.now() / 1000
    // 周期: 外側 60 秒・中 20 秒・内側 8 秒（秒針・分針のように同じ位相で回る）
    if (r1.current) r1.current.rotation.set(Math.PI / 2, 0, ((s % 60) / 60) * Math.PI * 2)
    if (r2.current) r2.current.rotation.set(((s % 20) / 20) * Math.PI * 2, Math.PI / 4, 0)
    if (r3.current) r3.current.rotation.set(0, ((s % 8) / 8) * Math.PI * 2, Math.PI / 3)
    if (orb.current) orb.current.position.y = Math.sin(((s % 6) / 6) * Math.PI * 2) * 0.08
  })
  const m = mats()
  return (
    <group position={[0, 3.3, 0]}>
      <mesh ref={r1} material={m.brass} castShadow>
        <torusGeometry args={[0.95, 0.045, 10, 64]} />
      </mesh>
      <mesh ref={r2} material={m.glowBlue}>
        <torusGeometry args={[0.72, 0.03, 8, 56]} />
      </mesh>
      <mesh ref={r3} material={m.brass} castShadow>
        <torusGeometry args={[0.5, 0.035, 8, 48]} />
      </mesh>
      <group ref={orb}>
        <mesh material={m.glowBlue} scale={0.36} geometry={geos().ico} />
      </group>
    </group>
  )
}

/** 共有時計の表示（1 秒ごと） */
const ClockPlaque: React.FC = () => {
  const tick = useSyncedTicker(1000)
  const clock = useNetClock()
  const d = new Date(tick * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return (
    <group position={[0, 0, 2.95]}>
      <Box position={[0, 0.45, -0.05]} size={[1.25, 0.9, 0.12]} material={mats().marble} />
      <TextPlane text={`${hh}:${mm}:${ss}`} width={1.1} lineHeight={0.2} bold background="#1d2433" radius={0.04} position={[0, 0.66, 0.012]} />
      <TextPlane
        text={`共有時計 Shared clock\n上の彫刻はこの時計で回っています${clock.synced ? '' : '（同期中…）'}`}
        width={1.12}
        lineHeight={0.06}
        color="#ffffff"
        background="#1d2433d9"
        radius={0.03}
        position={[0, 0.34, 0.012]}
        padding={0.02}
      />
    </group>
  )
}

/** 噴水。誰かが縁に近づくと、全員の画面で 8 秒間高く噴き上がる */
export const Fountain: React.FC = () => {
  const m = mats()
  const clock = useNetClock()
  const [until, setUntil] = useSyncedState('fountain:until', 0)
  const untilRef = useRef(until)
  untilRef.current = until
  const water = useRef<Mesh>(null)
  const sound = usePositionalSound({ make: (c) => makeWaterBuffer(c), loop: true, volume: 0.12, refDistance: 2.5, maxDistance: 22 })
  const burst = () => (clock.now() < untilRef.current ? 1 : 0)
  useFrame(({ clock: c }) => {
    if (water.current) water.current.position.y = 0.4 + Math.sin(c.elapsedTime * 1.3) * 0.006
    sound.audio.setVolume(0.12 + burst() * 0.18)
  })
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.3, 2.65]} position={[0, 0.3, 0]} />
        <CylinderCollider args={[1.2, 0.35]} position={[0, 1.2, 0]} />
      </RigidBody>
      {/* 外側の壁と縁 */}
      <mesh material={m.marble} position={[0, 0.24, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.62, 2.7, 0.48, 48, 1, true]} />
      </mesh>
      <mesh material={m.marble} position={[0, 0.48, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[2.55, 0.14, 10, 64]} />
      </mesh>
      <mesh ref={water} material={m.water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
        <circleGeometry args={[2.5, 48]} />
      </mesh>
      <mesh material={m.stoneDark} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <circleGeometry args={[2.5, 32]} />
      </mesh>
      {/* 中央の柱と受け皿 */}
      <Cyl position={[0, 0.8, 0]} size={[0.42, 1.6, 0.42]} material={m.marble} />
      <mesh material={m.marble} position={[0, 1.38, 0]} castShadow>
        <cylinderGeometry args={[0.95, 0.35, 0.22, 32]} />
      </mesh>
      <mesh material={m.water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.48, 0]}>
        <circleGeometry args={[0.85, 32]} />
      </mesh>
      <Spray burst={burst} />
      <primitive object={sound.audio} position={[0, 1, 0]} />
      <ClockSculpture />
      <ClockPlaque />
      <TriggerZone
        position={[0, 1, 0]}
        size={[8.6, 2.4, 8.6]}
        onEnter={() => {
          if (clock.now() > untilRef.current - 3000) setUntil(clock.now() + 8000)
        }}
      />
    </group>
  )
}

// ---- 街灯 ----

/** 広場のまわりの街灯（夜に光る。形はインスタンス描画で 3 回にまとめる） */
export const LampPosts: React.FC = () => {
  const m = mats()
  const g = geos()
  const { posts, heads, bulbs } = useMemo(() => {
    const posts: InstanceItem[] = []
    const heads: InstanceItem[] = []
    const bulbs: InstanceItem[] = []
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4
      const x = Math.cos(a) * (PLAZA_R + 0.9)
      const z = Math.sin(a) * (PLAZA_R + 0.9)
      posts.push({ p: [x, 1.5, z], s: [0.12, 3, 0.12] })
      heads.push({ p: [x, 3.12, z], s: [0.42, 0.1, 0.42] })
      bulbs.push({ p: [x, 2.9, z], s: [0.3, 0.36, 0.3] })
    }
    return { posts, heads, bulbs }
  }, [])
  return (
    <>
      <Instances geometry={g.cylLow} material={m.metal} items={posts} />
      <Instances geometry={g.cylLow} material={m.metal} items={heads} />
      <Instances geometry={g.sphere} material={m.bulb} items={bulbs} castShadow={false} />
      <RigidBody type="fixed" colliders={false}>
        {posts.map((p, i) => (
          <CylinderCollider key={i} args={[1.5, 0.1]} position={p.p} />
        ))}
      </RigidBody>
    </>
  )
}

// ---- 入口のアーチ ----

/** 出現位置の前のアーチ。左の柱に昼・夜のスイッチ */
export const WelcomeArch: React.FC = () => {
  const m = mats()
  const [night, setNight] = useSyncedState('night', false)
  return (
    <group position={[0, 0, 8.9]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.28, 1.9, 0.28]} position={[-2.7, 1.9, 0]} />
        <CuboidCollider args={[0.28, 1.9, 0.28]} position={[2.7, 1.9, 0]} />
      </RigidBody>
      <Box position={[-2.7, 1.9, 0]} size={[0.56, 3.8, 0.56]} material={m.marble} />
      <Box position={[2.7, 1.9, 0]} size={[0.56, 3.8, 0.56]} material={m.marble} />
      <Box position={[0, 4.0, 0]} size={[6.2, 0.5, 0.7]} material={m.roofTeal} />
      <Box position={[0, 3.62, 0]} size={[5.0, 0.26, 0.5]} material={m.marble} />
      <TextPlane text="ようこそ  TenTenV ホームへ" width={4.6} lineHeight={0.3} bold color="#ffffff" position={[0, 4.02, 0.36]} padding={0.01} />
      <TextPlane text="Welcome home — 噴水に近づいてみてください" width={4.6} lineHeight={0.12} color="#2f3a4d" position={[0, 3.62, 0.255]} padding={0.005} />
      <TextPlane text="ようこそ  TenTenV ホームへ" width={4.6} lineHeight={0.3} bold color="#ffffff" position={[0, 4.02, -0.36]} rotation={[0, Math.PI, 0]} padding={0.01} />
      {/* 昼・夜のスイッチ（全員の空が切り替わる） */}
      <group position={[-2.7, 1.25, 0.29]}>
        <Box position={[0, 0, -0.01]} size={[0.5, 0.5, 0.02]} material={m.panel} shadow={false} />
        <TextPlane text="空 Sky" width={0.44} lineHeight={0.06} position={[0, 0.17, 0.002]} padding={0.002} />
        <Button label={night ? '夜' : '昼'} sub={night ? 'Night' : 'Day'} hint={night ? '昼にする（全員）' : '夜にする（全員）'} width={0.4} active={night} color="#6a5cff" position={[0, -0.02, 0.03]} onClick={() => setNight(!night)} />
        <TextPlane text="全員の空が変わります" width={0.46} lineHeight={0.04} color="#c7d0e0" position={[0, -0.18, 0.002]} padding={0.002} />
      </group>
    </group>
  )
}
