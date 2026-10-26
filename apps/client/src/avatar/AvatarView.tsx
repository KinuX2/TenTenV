// アバターを 1 体表示する（自分・他の人で共通）。読み込みに失敗したり重すぎたら標準アバター（Akane）にする
import { useFrame } from '@react-three/fiber'
import type { AvatarRef } from '@tentenv/protocol'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Object3D } from 'three'
import { BUNDLED_AVATARS, bundledAvatar } from './bundled'
import { FaceDriver } from './face'
import { AvatarPoser, type PoseInput } from './poser'
import type { AvatarModel } from './types'
import { AVATAR_LIMITS, loadVrmAvatar } from './vrm'
import type { VoiceLevel } from '../net/voice'

export interface AvatarFrame {
  pose: PoseInput
  expression: Record<string, number>
  voice: VoiceLevel
  /** 視線を向ける先（ワールド座標）。null なら正面 */
  look: [number, number, number] | null
}

export interface AvatarViewProps {
  avatar: AvatarRef | null
  local?: boolean
  /** 重さの制限を無視する（自分のアバター・「表示する」を選んだ相手） */
  ignoreLimits?: boolean
  /** 安全のため標準アバターで出す（[168]） */
  forceFallback?: boolean
  visible?: boolean
  frame: (dt: number) => AvatarFrame | null
  onModel?: (m: AvatarModel | null, info: { fallback: boolean; reason: string | null }) => void
  /** 骨を動かしたあと（名前表示の位置などに使う） */
  afterPose?: (m: AvatarModel) => void
}

const DEFAULT_BUNDLED = BUNDLED_AVATARS[0]
const isDefault = (a: AvatarRef) => a.kind === 'builtin' && (bundledAvatar(a.id) ?? DEFAULT_BUNDLED) === DEFAULT_BUNDLED

// VRM の衣装は読み込み直さずに切り替える
const keyOf = (a: AvatarRef | null, fb: boolean) => (fb || !a ? 'fallback' : a.kind === 'vrm' ? `vrm:${a.sha256}` : `builtin:${a.id}`)

export const AvatarView: React.FC<AvatarViewProps> = ({ avatar, local, ignoreLimits, forceFallback, visible = true, frame, onModel, afterPose }) => {
  const [model, setModel] = useState<AvatarModel | null>(null)
  const key = keyOf(avatar, !!forceFallback)
  const onModelRef = useRef(onModel)
  onModelRef.current = onModel
  useEffect(() => {
    let alive = true
    let made: AvatarModel | null = null
    const show = (m: AvatarModel, fallback: boolean, reason: string | null) => {
      if (local) m.setupFirstPerson()
      made = m
      setModel(m)
      onModelRef.current?.(m, { fallback, reason })
    }
    // 読み込めない・重すぎる・隠したアバターの代わりは、標準アバター（Akane）
    const fallback = (reason: string | null) => {
      loadVrmAvatar(DEFAULT_BUNDLED.url, DEFAULT_BUNDLED.sha256)
        .then((m) => {
          if (!alive) return m.dispose()
          show(m, !!avatar && !isDefault(avatar), reason)
        })
        .catch((e) => {
          console.warn('[avatar] 標準アバターを読み込めません', e)
          if (alive) onModelRef.current?.(null, { fallback: true, reason })
        })
    }
    const bundled = avatar?.kind === 'builtin' ? (bundledAvatar(avatar.id) ?? DEFAULT_BUNDLED) : null
    const src = avatar?.kind === 'vrm' ? { url: avatar.url, sha256: avatar.sha256 } : bundled ? { url: bundled.url, sha256: bundled.sha256 } : null
    if (!avatar || forceFallback || !src) fallback(forceFallback ? '非表示にしています' : null)
    else {
      loadVrmAvatar(src.url, src.sha256)
        .then((m) => {
          if (!alive) {
            m.dispose()
            return
          }
          const over = m.stats.triangles > AVATAR_LIMITS.triangles || m.stats.materials > AVATAR_LIMITS.materials || m.stats.bones > AVATAR_LIMITS.bones
          if (over && !ignoreLimits && !local) {
            m.dispose()
            fallback(`アバターが重すぎるため標準の姿で表示しています（${m.stats.triangles.toLocaleString()} ポリゴン）`)
            return
          }
          if (avatar.kind === 'vrm') for (const t of avatar.outfits ?? []) m.setNodeVisible(t.replace(/^[+-]/, ''), !t.startsWith('-'))
          show(m, false, null)
        })
        .catch((e) => {
          console.warn('[avatar] 読み込みに失敗', e)
          if (alive && !isDefault(avatar)) fallback(`アバターを読み込めません: ${e instanceof Error ? e.message : String(e)}`)
        })
    }
    return () => {
      alive = false
      made?.dispose()
      setModel(null)
      onModelRef.current?.(null, { fallback: false, reason: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, local, ignoreLimits])

  // 衣装の切り替え（VRM）
  const outfitKey = avatar?.kind === 'vrm' ? (avatar.outfits ?? []).join('|') : ''
  useEffect(() => {
    if (!model || model.kind !== 'vrm' || avatar?.kind !== 'vrm') return
    for (const t of avatar.outfits ?? []) model.setNodeVisible(t.replace(/^[+-]/, ''), !t.startsWith('-'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, outfitKey])

  const poser = useMemo(() => (model ? new AvatarPoser(model) : null), [model])
  const face = useMemo(() => (model ? new FaceDriver(model) : null), [model])
  const lookObj = useMemo(() => new Object3D(), [])
  useEffect(() => {
    if (model && face) (model as AvatarModel & { face?: FaceDriver }).face = face
  }, [model, face])

  useFrame((_, dt) => {
    if (!model || !poser || !face) return
    const f = frame(Math.min(dt, 0.1))
    model.root.visible = visible && !!f
    if (!f) return
    poser.update(f.pose, Math.min(dt, 0.1))
    if (f.look) {
      lookObj.position.set(...f.look)
      lookObj.updateMatrixWorld()
      model.lookAt(lookObj)
    } else model.lookAt(null)
    face.update(Math.min(dt, 0.1), f.expression, f.voice)
    afterPose?.(model)
  })

  return model ? <primitive object={model.root} /> : null
}
