// 3D の画面: 描画・物理・XR・ワールド・プレイヤー・プラットフォームの機能
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { XR } from '@react-three/xr'
import { WorldRuntimeProvider, LAYERS } from '@tentenv/sdk'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ACESFilmicToneMapping, AdditiveBlending, AgXToneMapping, Color, HalfFloatType, NeutralToneMapping, NoToneMapping, PCFShadowMap, Quaternion, UnsignedByteType, Vector3, type Group, type WebGLRenderer } from 'three'
import type { AvatarExtensions } from '@tentenv/protocol'
import { LocalPlayer } from '../player/LocalPlayer'
import { qualityProfile, settings, useSettings } from '../state/settings'
import type { WorldEngine } from './engine'
import { InteractionSystem } from './interaction'
import type { LoadedWorld } from './loader'
import { PickupSystem } from './pickups'
import { LocalAvatar, RemotePlayers } from './players'
import { enterVR, isXRSupported, xrStore } from './xr'
import { PlatformFeatures } from '../features/PlatformFeatures'
import { MenuController, WorldMenu } from '../ui/menu/WorldMenu'
import { useMenu } from '../ui/menuBus'
import { input } from '../player/input'
import { perfStats } from '../features/perf'
import { PlacedPortals } from './PlacedPortals'

// 操作用コントローラーの見た目はアバターに任せ、メニュー表示中だけレイを有効にする
xrStore.setController(MenuController)

const AutoEnterVR: React.FC = () => {
  const attempted = useRef(false)
  useEffect(() => {
    if (attempted.current || !settings().autoEnterVR || !navigator.xr) return
    // VR の機器がない PC のブラウザでは試さない（失敗して警告が出るだけなので）
    let alive = true
    void isXRSupported().then((ok) => {
      if (!ok || !alive || attempted.current || !settings().autoEnterVR || xrStore.getState().session) return
      attempted.current = true
      void enterVR()
    })
    return () => {
      alive = false
    }
  }, [])
  return null
}

const TONE = { aces: ACESFilmicToneMapping, agx: AgXToneMapping, neutral: NeutralToneMapping, none: NoToneMapping }

class WorldErrorBoundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: Error) {
    this.props.onError(e)
  }
  render() {
    return this.state.failed ? <FallbackFloor /> : this.props.children
  }
}

/** ワールドが壊れていたときの床 */
const FallbackFloor = () => (
  <>
    <ambientLight intensity={0.6} />
    <directionalLight position={[3, 6, 2]} intensity={1.2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#2b3040" />
    </mesh>
    <gridHelper args={[40, 40, '#4b5563', '#374151']} />
  </>
)

/** 描画の設定を変えたら反映する */
const RenderSettings: React.FC<{ world: LoadedWorld }> = ({ world }) => {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const setDpr = useThree((s) => s.setDpr)
  const q = useSettings((s) => s.s.quality)
  const scale = useSettings((s) => s.s.renderScale)
  const shadows = useSettings((s) => s.s.shadows)
  useEffect(() => {
    setDpr(qualityProfile(q).dpr * scale)
    gl.shadowMap.enabled = shadows
    gl.shadowMap.type = PCFShadowMap
    if (!gl.xr.isPresenting) gl.xr.setFramebufferScaleFactor(Math.min(1.5, scale * (q === 'low' ? 0.8 : 1)))
  }, [gl, q, scale, shadows, setDpr])
  useEffect(() => {
    const r = world.manifest.render
    gl.toneMapping = TONE[r?.toneMapping ?? 'aces']
    gl.toneMappingExposure = r?.exposure ?? 1
  }, [gl, world])
  useEffect(() => {
    // メインのカメラ: 一人称の物とアバターを映し、三人称だけの物（自分の頭）は映さない
    camera.layers.enable(LAYERS.AVATAR)
    camera.layers.enable(LAYERS.FIRST_PERSON_ONLY)
    camera.layers.enable(LAYERS.NO_MIRROR)
    camera.layers.disable(LAYERS.THIRD_PERSON_ONLY)
  }, [camera])
  useFrame(() => perfStats.sample(gl as WebGLRenderer))
  return null
}

/** ワールドに照明がまったくないときだけ、アバターが見えるよう控えめな照明を足す */
const FallbackLights: React.FC = () => {
  const scene = useThree((s) => s.scene)
  const [need, setNeed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => {
      let lights = 0
      scene.traverse((o) => {
        if ((o as { isLight?: boolean }).isLight && !o.userData.ttvFallback) lights++
      })
      setNeed(lights === 0 && !scene.environment)
    }, 2500)
    return () => clearTimeout(t)
  }, [scene])
  if (!need) return null
  return (
    <>
      <hemisphereLight args={['#dfe8ff', '#30343f', 0.9]} userData={{ ttvFallback: true }} />
      <directionalLight position={[4, 8, 3]} intensity={1.1} userData={{ ttvFallback: true }} />
    </>
  )
}

/** ワールドの音量 */
const ListenerSetup: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const camera = useThree((s) => s.camera)
  const master = useSettings((s) => s.s.masterVolume)
  useEffect(() => {
    camera.add(engine.listener)
    return () => {
      camera.remove(engine.listener)
    }
  }, [camera, engine])
  useEffect(() => {
    engine.listener.setMasterVolume(master)
  }, [engine, master])
  return null
}

export interface WorldSceneProps {
  engine: WorldEngine | null
  world: LoadedWorld | null
  extensions: AvatarExtensions | null
  onWorldError: (e: Error) => void
  onLoadingCancel: () => void
}

const loadingPosition = new Vector3()
const loadingRotation = new Quaternion()
const loadingOffset = new Vector3(0, 0, -1.3)
const rotatedLoadingOffset = new Vector3()

/** VR と画面モードで共通の、黒地に多色の粒が漂うロード画面。 */
const WorldLoadingView: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const group = useRef<Group>(null)
  const cloud = useRef<Group>(null)
  const yWasDown = useRef(false)
  const { gl, camera } = useThree()
  const particles = useMemo(() => {
    const count = 9000
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    let seed = 0x51a7c8e3
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000)
    const top = new Color()
    const bottom = new Color()
    for (let i = 0; i < count;) {
      const x = (random() * 2 - 1) * 1.38
      const y = 0.88 - Math.pow(random(), 1.3) * 1.78
      const edge = (x / 1.38) ** 2 + ((y - 0.08) / 0.94) ** 2
      if (edge > 1 && random() < Math.min(1, (edge - 1) * 4)) continue
      const j = i * 3
      positions[j] = x
      positions[j + 1] = y
      positions[j + 2] = (random() - 0.5) * 0.24
      const hueNoise = (random() - 0.5) * 0.04
      const u = (x / 1.38 + 1) / 2
      const brightness = 0.11 + Math.pow(random(), 3) * 0.37
      top.setHSL((0.67 - 0.66 * u + hueNoise + 1) % 1, 0.9, brightness)
      bottom.setHSL(0.78 + 0.11 * u + hueNoise, 0.88, brightness)
      bottom.lerp(top, Math.max(0, Math.min(1, (y + 0.3) / 0.82)))
      colors[j] = bottom.r
      colors[j + 1] = bottom.g
      colors[j + 2] = bottom.b
      i++
    }
    return { positions, colors }
  }, [])
  useFrame(({ clock }) => {
    let yDown = false
    for (const source of gl.xr.getSession()?.inputSources ?? []) {
      if (source.handedness === 'left' && source.gamepad?.buttons[5]?.pressed) yDown = true
    }
    if (yDown && !yWasDown.current) onCancel()
    yWasDown.current = yDown
    if (!group.current) return
    const view = gl.xr.isPresenting ? gl.xr.getCamera() : camera
    view.getWorldPosition(loadingPosition)
    view.getWorldQuaternion(loadingRotation)
    group.current.position.copy(loadingPosition).add(rotatedLoadingOffset.copy(loadingOffset).applyQuaternion(loadingRotation))
    group.current.quaternion.copy(loadingRotation)
    if (cloud.current) {
      cloud.current.rotation.z = Math.sin(clock.elapsedTime * 0.16) * 0.025
      cloud.current.rotation.y = Math.sin(clock.elapsedTime * 0.12) * 0.035
    }
  })
  return (
    <>
      <color attach="background" args={['#000000']} />
      <group ref={group}>
        <group ref={cloud}>
          <points frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
              <bufferAttribute attach="attributes-color" args={[particles.colors, 3]} />
            </bufferGeometry>
            <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </points>
        </group>
      </group>
    </>
  )
}

const WorldContents: React.FC<{ engine: WorldEngine; world: LoadedWorld; extensions: AvatarExtensions | null; onWorldError: (e: Error) => void }> = ({ engine, world, extensions, onWorldError }) => {
  const eye = useRef(1.6)
  const WorldComponent = world.Component
  const gravity = world.manifest.physics?.gravity ?? 9.81
  return (
    <>
      <RenderSettings world={world} />
      <ListenerSetup engine={engine} />
      <FallbackLights />
      <Physics gravity={[0, -gravity, 0]} timeStep={1 / 60} interpolate>
        <WorldRuntimeProvider value={engine.runtime}>
          <WorldErrorBoundary onError={onWorldError}>
            <WorldComponent />
          </WorldErrorBoundary>
          <LocalPlayer engine={engine} avatarEye={() => eye.current} />
          <PickupSystem engine={engine} />
          <PlatformFeatures engine={engine} />
          <PlacedPortals engine={engine} />
        </WorldRuntimeProvider>
      </Physics>
      <LocalAvatar engine={engine} extensions={extensions} onEye={(e) => (eye.current = e)} />
      <RemotePlayers engine={engine} />
      <InteractionSystem engine={engine} />
      <WorldMenu engine={engine} />
    </>
  )
}

export const WorldScene: React.FC<WorldSceneProps> = ({ engine, world, extensions, onWorldError, onLoadingCancel }) => {
  const q = useSettings((s) => s.s.quality)
  const prof = qualityProfile(q)
  const firstHdr = useRef(world?.manifest.render?.hdr ?? false)
  const engineRef = useRef(engine)
  engineRef.current = engine
  return (
    <Canvas
      shadows
      dpr={prof.dpr}
      gl={{ antialias: prof.antialias, powerPreference: 'high-performance', outputBufferType: firstHdr.current ? HalfFloatType : UnsignedByteType } as never}
      camera={{ fov: 75, near: 0.03, far: 1000, position: [0, 1.6, 0] }}
      onCreated={({ gl }) => {
        input.attach(gl.domElement)
        // メニュー（uikit）の中身のスクロールで切り抜くため
        gl.localClippingEnabled = true
        gl.domElement.addEventListener('click', () => {
          const active = engineRef.current
          if (active && !active.player.vr && active.player.device === 'desktop' && !document.pointerLockElement && !useMenu.getState().open) input.requestLock()
        })
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <XR store={xrStore}>
        <AutoEnterVR />
        {engine && world ? (
          <Suspense fallback={<WorldLoadingView onCancel={onLoadingCancel} />}>
            <WorldContents key={engine.ctx.instance.id} engine={engine} world={world} extensions={extensions} onWorldError={onWorldError} />
          </Suspense>
        ) : <WorldLoadingView onCancel={onLoadingCancel} />}
      </XR>
    </Canvas>
  )
}
