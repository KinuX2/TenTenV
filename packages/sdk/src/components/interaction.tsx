import { useFrame, type ThreeElements } from '@react-three/fiber'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Box3, type Group, Vector3, type Vector3Tuple } from 'three'
import { usePlayers, useSyncedState } from '../hooks'
import { useRuntime, type ClickSpec, type PickupHandle, type PickupSpec, type PlayerInfo, type SeatHandle, type SeatSpec } from '../runtime'

type GroupProps = ThreeElements['group']

// ---------- Clickable ----------

export interface ClickableProps extends Omit<GroupProps, 'onClick'> {
  /** 照準を合わせたときに出す説明 */
  label?: string
  enabled?: boolean
  reach?: number
  onClick: ClickSpec['onClick']
  onHover?: ClickSpec['onHover']
}

/**
 * 中の物を押せるようにする。PC はクリック、スマホはタップ、VR はレイ＋トリガーか指で触れる
 */
export const Clickable: React.FC<ClickableProps> = ({ label, enabled = true, reach, onClick, onHover, children, ...rest }) => {
  const rt = useRuntime()
  const ref = useRef<Group>(null)
  const spec = useRef<ClickSpec>({ onClick })
  spec.current = { label, enabled, reach, onClick, onHover }
  useEffect(() => {
    if (!ref.current) return
    return rt.interact(ref.current, () => spec.current)
  }, [rt])
  return (
    <group ref={ref} {...rest}>
      {children}
    </group>
  )
}

// ---------- Pickup ----------

export interface PickupProps extends Omit<GroupProps, 'id'> {
  /** ワールドの中で一意な ID（同期に使う） */
  id: string
  label?: string
  physics?: boolean
  orientation?: 'keep' | 'grip'
  throwable?: boolean
  onGrab?: (by: PlayerInfo) => void
  onDrop?: (by: PlayerInfo) => void
  onUse?: (by: PlayerInfo) => void
}

/**
 * つかめる物。つかんでいる人の手に付いて動き、その位置は全員に同期される。
 * physics を付けると、離したときに落ちたり投げたりできる
 */
export const Pickup = forwardRef<PickupHandle, PickupProps>(function Pickup(
  { id, label, physics = true, orientation = 'keep', throwable = true, onGrab, onDrop, onUse, children, ...rest },
  handleRef,
) {
  const rt = useRuntime()
  const ref = useRef<Group>(null)
  const spec = useRef<PickupSpec>({ id, physics, orientation, throwable })
  spec.current = { id, label, physics, orientation, throwable, onGrab, onDrop, onUse }
  const handle = useRef<(PickupHandle & { dispose: () => void }) | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const h = rt.pickup(ref.current, () => spec.current)
    handle.current = h
    return () => {
      h.dispose()
      handle.current = null
    }
  }, [rt, id])
  useImperativeHandle(handleRef, () => ({
    holder: () => handle.current?.holder() ?? null,
    drop: () => handle.current?.drop(),
    reset: (p, q) => handle.current?.reset(p, q),
  }))
  return (
    <group ref={ref} {...rest}>
      {children}
    </group>
  )
})

// ---------- Chair ----------

export interface ChairProps extends Omit<GroupProps, 'id'> {
  id: string
  label?: string
  exit?: SeatSpec['exit']
  onInput?: SeatSpec['onInput']
  onEnter?: SeatSpec['onEnter']
  onLeave?: SeatSpec['onLeave']
  /** 押して座れるようにする当たり判定を自動で付ける（既定: 0.5m の立方体） */
  hitSize?: Vector3Tuple | null
}

/**
 * 座れる場所。group の原点がお尻の位置、-Z が前。押すと座り、ジャンプか移動で立つ
 */
export const Chair = forwardRef<SeatHandle, ChairProps>(function Chair({ id, label = '座る', exit, onInput, onEnter, onLeave, hitSize = [0.5, 0.5, 0.5], children, ...rest }, handleRef) {
  const rt = useRuntime()
  const ref = useRef<Group>(null)
  const spec = useRef<SeatSpec>({ id })
  spec.current = { id, label, exit, onInput, onEnter, onLeave }
  const handle = useRef<(SeatHandle & { dispose: () => void }) | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const h = rt.seat(ref.current, () => spec.current)
    handle.current = h
    return () => {
      h.dispose()
      handle.current = null
    }
  }, [rt, id])
  useImperativeHandle(handleRef, () => ({
    occupant: () => handle.current?.occupant() ?? null,
    sit: () => handle.current?.sit(),
    stand: () => handle.current?.stand(),
  }))
  return (
    <group ref={ref} {...rest}>
      {hitSize && (
        <Clickable label={label} onClick={() => handle.current?.sit()}>
          <mesh position={[0, hitSize[1] / 2 - 0.1, 0]} visible={false}>
            <boxGeometry args={hitSize} />
            <meshBasicMaterial />
          </mesh>
        </Clickable>
      )}
      {children}
    </group>
  )
})

// ---------- SpawnPad ----------

export interface SpawnPadProps {
  position?: Vector3Tuple
  /** 向き（度） */
  yaw?: number
}

/** 入ってきた人が現れる位置 */
export const SpawnPad: React.FC<SpawnPadProps> = ({ position = [0, 0, 0], yaw = 0 }) => {
  const rt = useRuntime()
  const ref = useRef<Group>(null)
  const [p0, p1, p2] = position
  useEffect(() => {
    const g = ref.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    const w = new Vector3()
    g.getWorldPosition(w)
    return rt.setSpawn([w.x, w.y, w.z], (yaw * Math.PI) / 180)
  }, [rt, p0, p1, p2, yaw])
  return <group ref={ref} position={position} />
}

// ---------- TriggerZone ----------

export interface TriggerZoneProps {
  /** 箱の中心と大きさ（ワールド座標ではなく、置いた場所のローカル座標） */
  position?: Vector3Tuple
  size: Vector3Tuple
  /** 自分が入った・出た */
  onEnter?: () => void
  onLeave?: () => void
  /** 誰かが入っている間の人数の変化（全員分を各端末で判定） */
  onCount?: (count: number) => void
  debug?: boolean
}

/** 見えない箱。プレイヤーが入ったり出たりしたときに呼ばれる */
export const TriggerZone: React.FC<TriggerZoneProps> = ({ position = [0, 0, 0], size, onEnter, onLeave, onCount, debug }) => {
  const ref = useRef<Group>(null)
  const players = usePlayers()
  const inside = useRef(false)
  const count = useRef(0)
  const box = useRef(new Box3())
  const v = useRef(new Vector3())
  const cb = useRef({ onEnter, onLeave, onCount })
  cb.current = { onEnter, onLeave, onCount }
  useFrame(() => {
    const g = ref.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    box.current.setFromCenterAndSize(new Vector3(), new Vector3(...size)).applyMatrix4(g.matrixWorld)
    let n = 0
    for (const p of players.all) {
      const pose = players.getPose(p.peerId)
      if (!pose) continue
      v.current.set(pose.position[0], pose.position[1] + 0.5, pose.position[2])
      const hit = box.current.containsPoint(v.current)
      if (hit) n++
      if (p.isLocal && hit !== inside.current) {
        inside.current = hit
        if (hit) cb.current.onEnter?.()
        else cb.current.onLeave?.()
      }
    }
    if (n !== count.current) {
      count.current = n
      cb.current.onCount?.(n)
    }
  })
  return (
    <group ref={ref} position={position}>
      {debug && (
        <mesh>
          <boxGeometry args={size} />
          <meshBasicMaterial color="#44ff88" wireframe />
        </mesh>
      )}
    </group>
  )
}

// ---------- FaceCamera ----------

/** 中の物をいつもカメラのほうへ向ける（Y 軸だけ回す・全部回す） */
export const FaceCamera: React.FC<GroupProps & { mode?: 'y' | 'full' }> = ({ mode = 'y', children, ...rest }) => {
  const ref = useRef<Group>(null)
  const tmp = useRef(new Vector3())
  useFrame(({ camera }) => {
    const g = ref.current
    if (!g) return
    camera.getWorldPosition(tmp.current)
    if (mode === 'full') {
      g.lookAt(tmp.current)
      return
    }
    const w = new Vector3()
    g.getWorldPosition(w)
    const yaw = Math.atan2(tmp.current.x - w.x, tmp.current.z - w.z)
    const parentYaw = g.parent ? getWorldYaw(g.parent) : 0
    g.rotation.set(0, yaw - parentYaw, 0)
  })
  return (
    <group ref={ref} {...rest}>
      {children}
    </group>
  )
}
const getWorldYaw = (o: { getWorldDirection: (v: Vector3) => Vector3 }) => {
  const d = o.getWorldDirection(new Vector3())
  return Math.atan2(d.x, d.z)
}

/** 押すと切り替わるスイッチ（全員で同期）。ドアや照明に使う */
export const useSyncedToggle = (key: string, initial = false) => {
  const [on, setOn] = useSyncedState(key, initial)
  return [on, () => setOn((v) => !v)] as const
}
