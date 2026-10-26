// 3D の画面: 描画・物理・XR・ワールド・プレイヤー・プラットフォームの機能
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { XR } from '@react-three/xr'
import { WorldRuntimeProvider, LAYERS } from '@tentenv/sdk'
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { ACESFilmicToneMapping, AgXToneMapping, HalfFloatType, NeutralToneMapping, NoToneMapping, PCFShadowMap, UnsignedByteType, type WebGLRenderer } from 'three'
import type { AvatarExtensions } from '@tentenv/protocol'
import { LocalPlayer } from '../player/LocalPlayer'
import { qualityProfile, useSettings } from '../state/settings'
import type { WorldEngine } from './engine'
import { InteractionSystem } from './interaction'
import type { LoadedWorld } from './loader'
import { PickupSystem } from './pickups'
import { LocalAvatar, RemotePlayers } from './players'
import { xrStore } from './xr'
import { PlatformFeatures } from '../features/PlatformFeatures'
import { MenuController, MenuHand, WorldMenu } from '../ui/menu/WorldMenu'
import { useMenu } from '../ui/menuBus'
import { input } from '../player/input'
import { perfStats } from '../features/perf'
import { PlacedPortals } from './PlacedPortals'

// VR のコントローラー・手は見た目を出さず（アバターの手で出す）、メニューを出している間だけレイ・指先で押せるようにする
xrStore.setController(MenuController)
xrStore.setHand(MenuHand)

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
    gl.xr.setFramebufferScaleFactor(Math.min(1.5, scale * (q === 'low' ? 0.8 : 1)))
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
  engine: WorldEngine
  world: LoadedWorld
  extensions: AvatarExtensions | null
  onWorldError: (e: Error) => void
}

export const WorldScene: React.FC<WorldSceneProps> = ({ engine, world, extensions, onWorldError }) => {
  const eye = useRef(1.6)
  const q = useSettings((s) => s.s.quality)
  const prof = qualityProfile(q)
  const hdr = world.manifest.render?.hdr
  const [WorldComponent] = useState(() => world.Component)
  const gravity = world.manifest.physics?.gravity ?? 9.81
  return (
    <Canvas
      shadows
      dpr={prof.dpr}
      gl={{ antialias: prof.antialias, powerPreference: 'high-performance', outputBufferType: hdr ? HalfFloatType : UnsignedByteType } as never}
      camera={{ fov: 75, near: 0.03, far: 1000, position: [0, 1.6, 0] }}
      onCreated={({ gl }) => {
        input.attach(gl.domElement)
        // メニュー（uikit）の中身のスクロールで切り抜くため
        gl.localClippingEnabled = true
        gl.domElement.addEventListener('click', () => {
          if (!engine.player.vr && engine.player.device === 'desktop' && !document.pointerLockElement && !useMenu.getState().open) input.requestLock()
        })
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <XR store={xrStore}>
        <RenderSettings world={world} />
        <ListenerSetup engine={engine} />
        <FallbackLights />
        <Suspense fallback={null}>
          <Physics gravity={[0, -gravity, 0]} timeStep={1 / 60} interpolate>
            <WorldRuntimeProvider value={engine.runtime}>
              <WorldErrorBoundary onError={onWorldError}>
                <Suspense fallback={null}>
                  <WorldComponent />
                </Suspense>
              </WorldErrorBoundary>
              <LocalPlayer engine={engine} avatarEye={() => eye.current} />
              <PickupSystem engine={engine} />
              <PlatformFeatures engine={engine} />
              <PlacedPortals engine={engine} />
            </WorldRuntimeProvider>
          </Physics>
        </Suspense>
        <LocalAvatar engine={engine} extensions={extensions} onEye={(e) => (eye.current = e)} />
        <RemotePlayers engine={engine} />
        <InteractionSystem engine={engine} />
        {/* メニュー（画面でも VR でも同じ uikit の板） */}
        <WorldMenu engine={engine} />
      </XR>
    </Canvas>
  )
}
