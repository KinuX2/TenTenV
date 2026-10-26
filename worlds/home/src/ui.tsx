// 共通の部品: 箱・柱・ボタン・掲示板・インスタンス描画
import { useLayoutEffect, useRef } from 'react'
import { Euler, type BufferGeometry, type InstancedMesh, type Material, Matrix4, Quaternion, Vector3 } from 'three'
import { Clickable, TextPlane, useTextTexture } from '@tentenv/sdk'
import { geos, mats } from './materials'

export type V3 = [number, number, number]

interface ShapeProps {
  position?: V3
  rotation?: V3
  size: V3
  material: Material
  shadow?: boolean
}

/** 単位の箱を拡大して置く */
export const Box: React.FC<ShapeProps> = ({ position, rotation, size, material, shadow = true }) => (
  <mesh geometry={geos().box} material={material} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow />
)

/** 円柱（size = [直径, 高さ, 直径]） */
export const Cyl: React.FC<ShapeProps & { low?: boolean }> = ({ position, rotation, size, material, shadow = true, low }) => (
  <mesh geometry={low ? geos().cylLow : geos().cyl} material={material} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow />
)

export const Ball: React.FC<ShapeProps> = ({ position, rotation, size, material, shadow = true }) => (
  <mesh geometry={geos().sphere} material={material} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow />
)

// ---- ボタン ----

export interface ButtonProps {
  label: string
  /** 照準を合わせたときの説明（省略時は label） */
  hint?: string
  sub?: string
  position?: V3
  rotation?: V3
  width?: number
  active?: boolean
  color?: string
  onClick: () => void
}

/** 押せるボタン（台座＋文字）。active のときは色が変わる */
export const Button: React.FC<ButtonProps> = ({ label, hint, sub, position, rotation, width = 0.5, active = false, color = '#3b6df0', onClick }) => {
  const h = sub ? 0.17 : 0.13
  return (
    <group position={position} rotation={rotation}>
      <Clickable label={hint ?? label} onClick={onClick}>
        <mesh position={[0, 0, -0.02]} scale={[width, h, 0.04]} geometry={geos().box}>
          <meshStandardMaterial color={active ? color : '#2a2f3d'} emissive={active ? color : '#000000'} emissiveIntensity={active ? 0.35 : 0} roughness={0.5} />
        </mesh>
      </Clickable>
      <TextPlane text={label} width={width - 0.03} lineHeight={0.075} bold position={[0, sub ? 0.025 : 0, 0.002]} padding={0.005} />
      {sub && <TextPlane text={sub} width={width - 0.03} lineHeight={0.045} color="#c7d0e0" position={[0, -0.045, 0.002]} padding={0.002} />}
    </group>
  )
}

// ---- 掲示板 ----

export interface BoardProps {
  title: string
  sub?: string
  body: string
  width?: number
  position?: V3
  rotation?: V3
  /** 板の下端の高さ（脚の長さ） */
  base?: number
  lineHeight?: number
  accent?: string
  /** 脚を付ける */
  legs?: boolean
  children?: React.ReactNode
}

/** 立て看板。タイトルと本文（日本語）を出す。高さは本文の量から決まるので、上に向かって伸びる */
export const Board: React.FC<BoardProps> = ({ title, sub, body, width = 1.6, position, rotation, base = 0.9, lineHeight = 0.075, accent = '#3b6df0', legs = true, children }) => {
  const text = useTextTexture({ text: body, width: width - 0.08, lineHeight, color: '#e6ebf5', background: null, align: 'left', bold: false, padding: 0.02, maxLines: 40, radius: 0 })
  const head = sub ? 0.26 : 0.18
  const est = head + text.height + 0.04
  const top = base + est
  return (
    <group position={position} rotation={rotation}>
      {legs && (
        <>
          <Box position={[-width / 2 + 0.08, top / 2, -0.06]} size={[0.06, top, 0.05]} material={mats().woodDark} />
          <Box position={[width / 2 - 0.08, top / 2, -0.06]} size={[0.06, top, 0.05]} material={mats().woodDark} />
        </>
      )}
      <Box position={[0, base + est / 2, -0.02]} size={[width + 0.06, est + 0.06, 0.03]} material={mats().panel} shadow={false} />
      <mesh position={[0, top + 0.012, -0.003]} scale={[width + 0.06, 0.03, 1]}>
        <planeGeometry />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <TextPlane text={title} width={width - 0.08} lineHeight={0.11} bold align="left" position={[0, top - 0.085, 0.002]} padding={0.01} />
      {sub && <TextPlane text={sub} width={width - 0.08} lineHeight={0.055} color="#9fb3d6" align="left" position={[0, top - 0.18, 0.002]} padding={0.005} />}
      <mesh position={[0, top - head - text.height / 2, 0.002]}>
        <planeGeometry args={[width - 0.08, text.height]} />
        <meshBasicMaterial map={text.texture} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {children}
    </group>
  )
}

// ---- インスタンス描画 ----

export interface InstanceItem {
  p: V3
  r?: V3
  s?: V3 | number
}

/** 同じ形・同じ材質の物をまとめて 1 回で描く（木・植え込み・丘など） */
export const Instances: React.FC<{ geometry: BufferGeometry; material: Material; items: InstanceItem[]; castShadow?: boolean; receiveShadow?: boolean }> = ({ geometry, material, items, castShadow = true, receiveShadow = true }) => {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const s = new Vector3()
    const p = new Vector3()
    items.forEach((it, i) => {
      const sc = typeof it.s === 'number' ? [it.s, it.s, it.s] : (it.s ?? [1, 1, 1])
      q.setFromEuler(e.set(...(it.r ?? [0, 0, 0])))
      mat.compose(p.set(...it.p), q, s.set(sc[0], sc[1], sc[2]))
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} />
}
