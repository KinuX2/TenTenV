// 空・光・地面・木・外周の生け垣。昼と夜は全員で同期する（useSyncedState('night')）
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferGeometry, Color, type DirectionalLight, Float32BufferAttribute, type Fog, type HemisphereLight, Mesh, PMREMGenerator, type PointsMaterial, Scene, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { useSyncedState } from '@tentenv/sdk'
import { geos, mats, rng } from './materials'
import { Instances, type InstanceItem } from './ui'

/** 外周の生け垣の半径（ここから外へは出られない） */
export const BOUND_R = 26

// 空の色（sRGB の値をそのまま出す）
const DAY = { top: [0.36, 0.6, 0.92], horizon: [0.8, 0.89, 0.96], bottom: [0.62, 0.72, 0.62], fog: '#cfe2f2', sun: [1, 0.95, 0.8] }
const NIGHT = { top: [0.02, 0.03, 0.09], horizon: [0.1, 0.13, 0.24], bottom: [0.04, 0.05, 0.08], fog: '#1a2138', sun: [0.75, 0.82, 1] }

const skyShader = () =>
  new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Vector3(...DAY.top) },
      horizon: { value: new Vector3(...DAY.horizon) },
      bottom: { value: new Vector3(...DAY.bottom) },
      sunDir: { value: new Vector3(0.45, 0.55, -0.7).normalize() },
      sunCol: { value: new Vector3(...DAY.sun) },
      sunSize: { value: 0.9995 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, clamp(-h * 4.0, 0.0, 1.0));
        float s = dot(d, sunDir);
        c += sunCol * (smoothstep(sunSize, sunSize + 0.0003, s) * 1.2 + pow(max(s, 0.0), 24.0) * 0.25 + pow(max(s, 0.0), 4.0) * 0.08);
        gl_FragColor = vec4(c, 1.0);
      }`,
  })

/** 空の色から作る環境マップ（金属や光沢のある物の映り込み）。昼と夜の 2 枚を最初に 1 回だけ作る */
const makeEnv = (pm: PMREMGenerator, p: typeof DAY, sunDir: Vector3) => {
  const sc = new Scene()
  const mat = skyShader()
  mat.uniforms.top.value.set(...(p.top as [number, number, number]))
  mat.uniforms.horizon.value.set(...(p.horizon as [number, number, number]))
  mat.uniforms.bottom.value.set(...(p.bottom as [number, number, number]))
  mat.uniforms.sunCol.value.set(...(p.sun as [number, number, number]))
  mat.uniforms.sunDir.value.copy(sunDir)
  mat.uniforms.sunSize.value = 0.995
  const geo = new SphereGeometry(1, 32, 16)
  const mesh = new Mesh(geo, mat)
  mesh.scale.setScalar(50)
  sc.add(mesh)
  const rt = pm.fromScene(sc, 0.04)
  geo.dispose()
  mat.dispose()
  return rt
}

const lerp3 = (a: number[], b: number[], t: number, out: Vector3) => out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)

/** 星（夜だけ見える） */
const makeStars = () => {
  const r = rng(99)
  const pos: number[] = []
  for (let i = 0; i < 500; i++) {
    const y = 0.08 + r() * 0.92
    const a = r() * Math.PI * 2
    const rr = Math.sqrt(1 - y * y)
    pos.push(Math.cos(a) * rr * 300, y * 300, Math.sin(a) * rr * 300)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return g
}

/** 空と光。night の切り替えはなめらかに変える */
export const SkyAndLights: React.FC = () => {
  const [night] = useSyncedState('night', false)
  const sky = useMemo(skyShader, [])
  const stars = useMemo(makeStars, [])
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const starMat = useRef<PointsMaterial>(null)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const t = useRef(night ? 1 : 0)
  const fogDay = useMemo(() => new Color(DAY.fog), [])
  const fogNight = useMemo(() => new Color(NIGHT.fog), [])
  const sunDay = useMemo(() => new Vector3(0.45, 0.55, -0.7).normalize(), [])
  const moon = useMemo(() => new Vector3(-0.5, 0.45, -0.6).normalize(), [])
  const envs = useMemo(() => {
    const pm = new PMREMGenerator(gl)
    const r = { day: makeEnv(pm, DAY, sunDay), night: makeEnv(pm, NIGHT, moon) }
    pm.dispose()
    return r
  }, [gl, sunDay, moon])
  useEffect(() => {
    scene.environment = envs.day.texture
    return () => {
      scene.environment = null
      envs.day.dispose()
      envs.night.dispose()
    }
  }, [scene, envs])
  useFrame((_, dt) => {
    const goal = night ? 1 : 0
    const prev = t.current
    t.current += Math.sign(goal - t.current) * Math.min(Math.abs(goal - t.current), dt * 0.6)
    const k = t.current
    if (prev === k && k !== 0 && k !== 1) return
    const u = sky.uniforms
    lerp3(DAY.top, NIGHT.top, k, u.top.value)
    lerp3(DAY.horizon, NIGHT.horizon, k, u.horizon.value)
    lerp3(DAY.bottom, NIGHT.bottom, k, u.bottom.value)
    lerp3(DAY.sun, NIGHT.sun, k, u.sunCol.value)
    u.sunDir.value.copy(k < 0.5 ? sunDay : moon)
    u.sunSize.value = k < 0.5 ? 0.9995 : 0.99975
    const f = scene.fog as Fog | null
    if (f) f.color.copy(fogDay).lerp(fogNight, k)
    if (sun.current) {
      sun.current.intensity = 2.6 * (1 - k) + 0.35 * k
      sun.current.color.setRGB(1, 0.96 - 0.1 * k, 0.88 + 0.12 * k)
      const d = k < 0.5 ? sunDay : moon
      sun.current.position.set(d.x * 30, d.y * 30, d.z * 30)
    }
    if (hemi.current) hemi.current.intensity = 0.75 * (1 - k) + 0.3 * k
    scene.environment = k < 0.5 ? envs.day.texture : envs.night.texture
    scene.environmentIntensity = 0.55 * (1 - k) + 0.4 * k
    if (starMat.current) starMat.current.opacity = Math.max(0, k * 1.2 - 0.2)
    // 電球（街灯・ランプ）は夜に光る
    mats().bulb.emissiveIntensity = k * 3
  })
  return (
    <>
      <fog attach="fog" args={[DAY.fog, 35, 140]} />
      <mesh material={sky} scale={400} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <points geometry={stars} frustumCulled={false}>
        <pointsMaterial ref={starMat} color="#ffffff" size={1.6} sizeAttenuation={false} transparent opacity={0} fog={false} depthWrite={false} blending={AdditiveBlending} />
      </points>
      <hemisphereLight ref={hemi} args={['#dcebff', '#6b7a55', 0.75]} />
      <directionalLight
        ref={sun}
        position={[13.5, 16.5, -21]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
    </>
  )
}

/** 地面・遠くの丘・木・植え込み・外周の生け垣 */
export const Terrain: React.FC = () => {
  const m = mats()
  const g = geos()
  const { trunks, crowns, crownsDark, hills, hedge, bushes } = useMemo(() => {
    const r = rng(42)
    const trunks: InstanceItem[] = []
    const crowns: InstanceItem[] = []
    const crownsDark: InstanceItem[] = []
    const tree = (x: number, z: number, s: number) => {
      trunks.push({ p: [x, 1.1 * s, z], s: [0.32 * s, 2.2 * s, 0.32 * s] })
      ;(r() > 0.5 ? crowns : crownsDark).push({ p: [x, 2.9 * s, z], s: [2.6 * s, 2.4 * s, 2.6 * s], r: [0, r() * 6, 0] })
      crowns.push({ p: [x + 0.3 * s, 3.9 * s, z - 0.2 * s], s: [1.7 * s, 1.6 * s, 1.7 * s], r: [0, r() * 6, 0] })
    }
    // 生け垣の内側の木（広場の邪魔にならない場所だけ）
    const inner: [number, number][] = [
      [14, -14], [16, -10], [-19, 6], [-18, -6], [5, 19], [-5, 20], [16, 16], [-16, 17], [22, 10], [9.5, -20.5], [-9.5, -20.5], [21, -12],
    ]
    for (const [x, z] of inner) tree(x, z, 0.9 + r() * 0.35)
    // 外周の外の木
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + r() * 0.1
      const d = BOUND_R + 3 + r() * 14
      tree(Math.cos(a) * d, Math.sin(a) * d, 1 + r() * 0.6)
    }
    // 遠くの丘
    const hills: InstanceItem[] = []
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + r() * 0.2
      const d = 95 + r() * 40
      const w = 40 + r() * 40
      hills.push({ p: [Math.cos(a) * d, -4, Math.sin(a) * d], s: [w, 12 + r() * 22, w * 0.8], r: [0, r() * 3, 0] })
    }
    // 外周の生け垣
    const hedge: InstanceItem[] = []
    const N = 64
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      hedge.push({ p: [Math.cos(a) * BOUND_R, 0.6, Math.sin(a) * BOUND_R], s: [1.1, 1.2, ((Math.PI * 2 * BOUND_R) / N) * 1.08], r: [0, -a, 0] })
    }
    // 広場のまわりの植え込み
    const bushes: InstanceItem[] = []
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2
      // 小道（東西南北と斜め）をよける
      const f = (a / (Math.PI / 4)) % 1
      const nearPath = Math.min(f, 1 - f) * (Math.PI / 4) < 0.2
      if (nearPath) continue
      bushes.push({ p: [Math.cos(a) * 9.2, 0.35, Math.sin(a) * 9.2], s: [0.9 + r() * 0.4, 0.7 + r() * 0.3, 0.9 + r() * 0.4], r: [0, r() * 6, 0] })
    }
    return { trunks, crowns, crownsDark, hills, hedge, bushes }
  }, [])
  return (
    <>
      {/* 地面（当たり判定は大きな箱） */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[90, 0.5, 90]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={m.grass} receiveShadow>
        <circleGeometry args={[180, 48]} />
      </mesh>
      <Instances geometry={g.ico} material={m.hill} items={hills} castShadow={false} receiveShadow={false} />
      <Instances geometry={g.cylLow} material={m.trunk} items={trunks} />
      <Instances geometry={g.ico} material={m.leaf} items={crowns} />
      <Instances geometry={g.ico} material={m.leafDark} items={crownsDark} />
      <Instances geometry={g.box} material={m.hedge} items={hedge} />
      <Instances geometry={g.ico} material={m.leafDark} items={bushes} />
      {/* 外周の当たり判定（少し高めの見えない壁） */}
      <RigidBody type="fixed" colliders={false}>
        {Array.from({ length: 32 }, (_, i) => {
          const a = (i / 32) * Math.PI * 2
          return <CuboidCollider key={i} args={[0.6, 2, (Math.PI * BOUND_R) / 32 + 0.2]} position={[Math.cos(a) * BOUND_R, 2, Math.sin(a) * BOUND_R]} rotation={[0, -a, 0]} />
        })}
        {/* 木の幹 */}
        {trunks
          .filter((t) => Math.hypot(t.p[0], t.p[2]) < BOUND_R)
          .map((t, i) => (
            <CylinderCollider key={`t${i}`} args={[1.2, 0.25]} position={[t.p[0], 1.2, t.p[2]]} />
          ))}
      </RigidBody>
    </>
  )
}
