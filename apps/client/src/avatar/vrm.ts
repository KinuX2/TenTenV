// VRM（0.x / 1.0）の読み込み。正規化された骨・表情・視線・揺れもの・一人称の設定を共通の形にする
import { VRMLoaderPlugin, VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere, VRMUtils, type VRM, type VRMSpringBoneColliderGroup } from '@pixiv/three-vrm'
import { Box3, Mesh, Object3D, Vector3, type Material, type SkinnedMesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { LAYERS } from '@tentenv/sdk'
import { fetchVerified } from '../world/assetCache'
import { BONES, type AvatarModel, type BoneName } from './types'

const loader = new GLTFLoader()
loader.register((parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }))

/** 重すぎるアバターの目安（これを超えると、相手には標準アバターで出す） */
export const AVATAR_LIMITS = { triangles: 150000, materials: 64, bones: 600, bytes: 100 * 1024 * 1024 }

export const parseVrm = async (buf: ArrayBuffer): Promise<VRM> => {
  const gltf = await loader.parseAsync(buf, '')
  const vrm = gltf.userData.vrm as VRM | undefined
  if (!vrm) throw new Error('VRM ではありません')
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.rotateVRM0(vrm)
  return vrm
}

export const loadVrmAvatar = async (url: string, sha256: string | undefined, onProgress?: (r: number) => void): Promise<AvatarModel> => {
  const buf = await fetchVerified(url, sha256, onProgress)
  if (buf.byteLength > AVATAR_LIMITS.bytes) throw new Error('アバターのファイルが大きすぎます')
  return wrapVrm(await parseVrm(buf))
}

export const wrapVrm = (vrm: VRM): AvatarModel => {
  const root = new Object3D()
  root.name = 'TTV_VrmAvatar'
  root.add(vrm.scene)
  const bones: Partial<Record<BoneName, Object3D>> = {}
  for (const name of BONES) {
    const n = vrm.humanoid.getNormalizedBoneNode(name as never)
    if (n) bones[name] = n
  }
  vrm.scene.updateMatrixWorld(true)
  const rest: Partial<Record<BoneName, [number, number, number]>> = {}
  const v = new Vector3()
  for (const [name, b] of Object.entries(bones) as [BoneName, Object3D][]) {
    b.getWorldPosition(v)
    rest[name] = [v.x, v.y, v.z]
  }
  // 目の位置: 視線の設定があればそれ、なければ目の骨、それもなければ頭の少し前
  const head = bones.head
  const eyeOffset: [number, number, number] = [0, 0.06, 0.08]
  const lo = vrm.lookAt?.offsetFromHeadBone
  if (lo) eyeOffset.splice(0, 3, lo.x, lo.y, lo.z)
  else if (bones.leftEye && bones.rightEye && head) {
    const a = new Vector3(...rest.leftEye!).add(new Vector3(...rest.rightEye!)).multiplyScalar(0.5)
    const h = new Vector3(...rest.head!)
    eyeOffset.splice(0, 3, a.x - h.x, a.y - h.y, a.z - h.z)
  }
  const headY = rest.head?.[1] ?? 1.4
  const box = new Box3().setFromObject(vrm.scene)
  const eyeHeight = headY + eyeOffset[1]

  // 鏡にも映るよう、アバターの物はアバターのレイヤーへ
  let triangles = 0
  const mats = new Set<Material>()
  vrm.scene.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh) {
      m.layers.set(LAYERS.AVATAR)
      m.castShadow = true
      m.frustumCulled = false
      const g = m.geometry
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3
      ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x))
    }
  })
  let boneCount = 0
  vrm.scene.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) boneCount = Math.max(boneCount, (o as SkinnedMesh).skeleton.bones.length)
  })

  const exprNames = vrm.expressionManager?.expressions.map((e) => e.expressionName) ?? []
  let lookTarget: Object3D | null = null
  if (vrm.lookAt) vrm.lookAt.autoUpdate = true
  const extra: { collider: VRMSpringBoneCollider; group: VRMSpringBoneColliderGroup }[] = []

  return {
    root,
    bones,
    rest,
    eyeHeight,
    height: Math.max(box.max.y, headY + 0.15),
    eyeOffset,
    expressions: exprNames,
    setExpression: (name, weight) => vrm.expressionManager?.setValue(name, weight),
    lookAt: (target) => {
      lookTarget = target
      if (vrm.lookAt) vrm.lookAt.target = target ?? undefined
    },
    setNodeVisible: (name, visible) => {
      const n = vrm.scene.getObjectByName(name)
      if (n) n.visible = visible
    },
    setupFirstPerson: () => {
      vrm.firstPerson?.setup({ firstPersonOnlyLayer: LAYERS.FIRST_PERSON_ONLY, thirdPersonOnlyLayer: LAYERS.THIRD_PERSON_ONLY })
      // 一人称の設定がないモデル: 頭の骨に付いたメッシュを三人称だけにする
      if (!vrm.firstPerson || vrm.firstPerson.meshAnnotations.length === 0) {
        head?.traverse((o) => {
          if ((o as Mesh).isMesh) o.layers.set(LAYERS.THIRD_PERSON_ONLY)
        })
      }
      // 一人称だけのメッシュ（頭を消した体）もアバターとして描く
      vrm.scene.traverse((o) => {
        if ((o as Mesh).isMesh && o.layers.isEnabled(0)) o.layers.enable(LAYERS.AVATAR)
      })
    },
    update: (dt) => {
      void lookTarget
      vrm.update(dt)
    },
    setExtraColliders: (spheres) => {
      const sb = vrm.springBoneManager
      if (!sb) return
      // 前回の分を外す
      for (const e of extra) {
        for (const j of sb.joints) j.colliderGroups = j.colliderGroups.filter((g) => g !== e.group)
        e.collider.removeFromParent()
      }
      extra.length = 0
      for (const s of spheres) {
        const collider = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeSphere({ radius: s.radius, offset: new Vector3() }))
        s.obj.add(collider)
        const group: VRMSpringBoneColliderGroup = { colliders: [collider], name: 'ttv-extra' }
        for (const j of sb.joints) j.colliderGroups = [...j.colliderGroups, group]
        extra.push({ collider, group })
      }
    },
    dispose: () => {
      for (const e of extra) e.collider.removeFromParent()
      VRMUtils.deepDispose(vrm.scene)
    },
    kind: 'vrm',
    meta: (vrm.meta as unknown as Record<string, unknown>) ?? null,
    stats: { triangles: Math.round(triangles), materials: mats.size, bones: boneCount },
    flipped: vrm.meta?.metaVersion === '0',
  }
}

/** VRM の利用条件（[31] 詳細表示用） */
export const describeMeta = (meta: Record<string, unknown> | null) => {
  if (!meta) return null
  const m = meta as Record<string, unknown>
  const v = (k: string) => (m[k] === undefined || m[k] === null ? null : String(m[k]))
  return {
    name: v('name') ?? v('title'),
    authors: Array.isArray(m.authors) ? (m.authors as string[]).join(', ') : v('author'),
    version: v('version'),
    avatarPermission: v('avatarPermission') ?? v('allowedUserName'),
    commercial: v('commercialUsage') ?? v('commercialUssageName'),
    modification: v('modification'),
    redistribution: v('allowRedistribution'),
    violent: v('allowExcessivelyViolentUsage') ?? v('violentUssageName'),
    sexual: v('allowExcessivelySexualUsage') ?? v('sexualUssageName'),
    license: v('licenseUrl') ?? v('licenseName'),
    credit: v('creditNotation'),
  }
}
