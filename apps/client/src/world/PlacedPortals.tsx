import { PortalGate, TextPlane, LAYERS } from '@tentenv/sdk'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { DoubleSide, Group, Raycaster, Vector2, Vector3 } from 'three'
import { L } from '../i18n'
import { xrInput } from '../player/xrInput'
import { settings, useSettings } from '../state/settings'
import { useApp } from '../state/app'
import { useNet } from '../state/net'
import { pendingClick, pendingTap } from './interaction'
import { useMenu } from '../ui/menuBus'
import type { WorldEngine } from './engine'
import { usePortalPlacement, type PortalTarget } from './portalState'

const PREFIX = 'sys:portal:'
const LIFETIME = 30_000
const MAX_PER_USER = 3

export interface PlacedPortalData extends PortalTarget {
  owner: string
  ownerName: string
  ownerUserId: string
  p: [number, number, number]
  yaw: number
  createdAt: number
  expiresAt: number
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const isPortal = (v: unknown): v is PlacedPortalData => {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<PlacedPortalData>
  return typeof p.owner === 'string' && typeof p.ownerName === 'string' && typeof p.ownerUserId === 'string' && typeof p.locked === 'boolean' &&
    typeof p.worldId === 'string' && typeof p.instanceId === 'string' &&
    typeof p.worldName === 'string' && typeof p.access === 'string' &&
    Array.isArray(p.p) && p.p.length === 3 && p.p.every(finite) &&
    finite(p.yaw) && finite(p.createdAt) && finite(p.expiresAt)
}

export const placePortal = (engine: WorldEngine, target: PortalTarget, p: [number, number, number], yaw: number) => {
  const session = engine.session
  const mine = session.keys(`${PREFIX}${session.selfId}:`).map((key) => [key, session.get(key)] as const)
    .filter(([, value]) => isPortal(value))
    .sort((a, b) => (a[1] as PlacedPortalData).createdAt - (b[1] as PlacedPortalData).createdAt)
  for (const [key] of mine.slice(0, Math.max(0, mine.length - MAX_PER_USER + 1))) session.set(key, null)
  const now = Date.now()
  const id = Math.random().toString(36).slice(2, 10)
  const ownerName = useApp.getState().me?.displayName ?? 'Player'
  const ownerUserId = useApp.getState().me?.id ?? ''
  session.set(`${PREFIX}${session.selfId}:${id}`, {
    ...target, owner: session.selfId, ownerName, ownerUserId, p, yaw, createdAt: now, expiresAt: now + LIFETIME,
  } satisfies PlacedPortalData)
}

/** Session state also reaches users who join after a portal was placed. */
export const PlacedPortals: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const session = engine.session
  const portalPrompt = useSettings((state) => state.s.portalPrompt)
  const friends = useNet((state) => state.friends)
  const myUserId = useApp((state) => state.me?.id)
  const subscribe = (cb: () => void) => session.subscribeAll((key) => key.startsWith(PREFIX) && cb())
  const snapshot = () => session.keys(PREFIX).map((key) => `${key}:${JSON.stringify(session.get(key))}`).join('|')
  useSyncExternalStore(subscribe, snapshot, snapshot)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const portals = session.keys(PREFIX).map((key) => [key, session.get(key)] as const)
    .filter((entry): entry is readonly [string, PlacedPortalData] => isPortal(entry[1]))
  useEffect(() => session.on('sys.portal-enter', (payload) => {
    const key = (payload as { key?: unknown })?.key
    if (typeof key !== 'string' || !key.startsWith(`${PREFIX}${session.selfId}:`)) return
    const value = session.get(key)
    if (isPortal(value) && value.expiresAt > Date.now()) session.set(key, { ...value, expiresAt: Date.now() + LIFETIME })
  }), [session])
  useEffect(() => {
    for (const [key, portal] of portals) {
      if (portal.expiresAt <= now && (portal.owner === session.selfId || !session.isPresent(portal.owner))) session.set(key, null)
    }
  }, [now, portals, session])
  return <>
    {portals.filter(([, p]) => p.expiresAt > now && (!p.locked || p.ownerUserId === myUserId || friends.some((friend) => friend.id === p.ownerUserId))).map(([key, p]) => (
      <PortalGate
        key={key}
        worldId={p.worldId}
        instanceId={p.instanceId}
        position={p.p}
        rotation={[0, p.yaw, 0]}
        confirm={portalPrompt}
        title={p.worldName}
        detail={`${p.locked ? 'LOCKED · ' : ''}${p.ownerName} · ${p.access} · ${Math.ceil((p.expiresAt - now) / 1000)}s`}
        onTravel={() => session.emit('sys.portal-enter', { key }, p.owner)}
      />
    ))}
    <PortalPlacement engine={engine} />
  </>
}

const PortalPlacement: React.FC<{ engine: WorldEngine }> = ({ engine }) => {
  const target = usePortalPlacement((state) => state.target)
  const menuOpen = useMenu((state) => state.open)
  const marker = useRef<Group>(null)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const ray = useMemo(() => new Raycaster(), [])
  const p = useRef(new Vector3())
  const yaw = useRef(0)
  const [valid, setValid] = useState(false)
  useEffect(() => () => usePortalPlacement.getState().cancel(), [])
  useEffect(() => { if (menuOpen) usePortalPlacement.getState().cancel() }, [menuOpen])
  useFrame(() => {
    if (!target) return
    const vr = engine.player.vr
    const hand = xrInput[settings().dominantHand]
    const origin = vr && hand.connected ? hand.rayP : camera.getWorldPosition(new Vector3())
    const direction = vr && hand.connected ? hand.rayDir : camera.getWorldDirection(new Vector3())
    const tap = pendingTap.value
    if (!vr && tap) ray.setFromCamera(new Vector2(tap.x, tap.y), camera)
    else ray.set(origin, direction)
    ray.layers.set(LAYERS.DEFAULT)
    ray.far = 8
    const hit = ray.intersectObjects(scene.children, true).find((h) => {
      if (!h.face || h.object.name.startsWith('portal-')) return false
      const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld)
      return normal.y > 0.85 && h.distance >= 1.5
    })
    const candidate = hit?.point ?? origin.clone().addScaledVector(direction, 3)
    const distance = candidate.distanceTo(engine.player.position)
    const nearSpawn = engine.spawns.some((spawn) => Math.hypot(spawn.position[0] - candidate.x, spawn.position[2] - candidate.z) < 2)
    const okay = !!hit && distance <= 8 && !nearSpawn
    p.current.copy(candidate)
    yaw.current = engine.player.yaw
    if (marker.current) {
      marker.current.position.copy(candidate)
      marker.current.rotation.y = yaw.current
    }
    if (valid !== okay) setValid(okay)
    usePortalPlacement.getState().update(okay, okay ? '' : nearSpawn ? L('出現地点の近くには置けません', 'Too close to a spawn point') : L('平らな床を狙ってください', 'Aim at a flat floor'))
    const confirm = vr ? (xrInput.left.triggerDown || xrInput.right.triggerDown) : pendingClick.value || !!tap
    if (!vr) {
      pendingClick.value = false
      pendingTap.value = null
    }
    if (!confirm) return
    if (!okay) return
    placePortal(engine, target, [candidate.x, candidate.y, candidate.z], yaw.current)
    usePortalPlacement.getState().cancel()
    useApp.getState().toast(L('ポータルを設置しました', 'Portal placed'))
  })
  if (!target) return null
  return <group ref={marker} name="portal-preview">
    <TextPlane text={valid ? target.worldName : L('ここには置けません', 'Cannot place here')} width={2} lineHeight={0.11} position={[0, 2.5, 0]} background={valid ? '#062442dd' : '#521723dd'} />
    <mesh name="portal-preview-body" position={[0, 1.15, 0]} scale={[0.78, 1.08, 1]}>
      <circleGeometry args={[1, 48]} />
      <meshBasicMaterial color={valid ? '#38d9ee' : '#ff5262'} transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
    </mesh>
    <mesh name="portal-preview-ring" position={[0, 1.15, 0.01]} scale={[0.78, 1.08, 1]}>
      <torusGeometry args={[1, 0.04, 8, 48]} />
      <meshBasicMaterial color={valid ? '#62f4ff' : '#ff5262'} transparent opacity={0.9} depthWrite={false} />
    </mesh>
    <mesh name="portal-preview-base" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[0.65, 0.75, 48]} />
      <meshBasicMaterial color={valid ? '#62f4ff' : '#ff5262'} transparent opacity={0.7} side={DoubleSide} depthWrite={false} />
    </mesh>
  </group>
}
