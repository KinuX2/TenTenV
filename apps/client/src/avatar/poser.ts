// アバターの姿勢づくり（[18][19][20][21][205]）
// 頭と両手（VR）・移動の速さ・姿勢の状態から、全身の骨の向きを決める
// - 上半身: 頭の位置へ背骨を曲げ、しゃがむと腰が下がる
// - 腕: 2 本の骨の IK（ひじは下・後ろへ逃がす）。PC では歩きに合わせて振る
// - 脚: 足を地面に置いたまま IK で曲げ、腰が離れたら一歩ずつ踏み直す。歩くと足を交互に運ぶ
// - 指: 曲がり具合（0〜1）を各関節へ
import { Euler, MathUtils, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { SleepPose } from '@tentenv/protocol'
import type { AvatarModel, BoneName } from './types'

export interface PoseInput {
  /** 足元（ワールド） */
  root: Vector3
  yaw: number
  vr: boolean
  head: { p: Vector3; q: Quaternion } | null
  left: { p: Vector3; q: Quaternion } | null
  right: { p: Vector3; q: Quaternion } | null
  /** PC の視点の上下（ラジアン、上が +） */
  pitch: number
  fingers: number[] | null
  trackers: { hips: { p: Vector3; q: Quaternion }; left: { p: Vector3; q: Quaternion }; right: { p: Vector3; q: Quaternion } } | null
  speed: number
  moveX: number
  moveZ: number
  grounded: boolean
  crouch: boolean
  prone: boolean
  sitting: boolean
  sleep: SleepPose
  scale: number
}

const _v1 = new Vector3()
const _v2 = new Vector3()
const _v3 = new Vector3()
const _v4 = new Vector3()
const _q1 = new Quaternion()
const _q2 = new Quaternion()
const _q3 = new Quaternion()
const _m = new Matrix4()
const UP = new Vector3(0, 1, 0)
const FLIP_Y = new Quaternion().setFromAxisAngle(UP, Math.PI)

const worldPos = (o: Object3D, out: Vector3) => out.setFromMatrixPosition(o.matrixWorld)
const worldQuat = (o: Object3D, out: Quaternion) => {
  o.matrixWorld.decompose(_v4, out, _v3)
  return out
}

/** 骨の向きを、ワールドで見て from 方向から to 方向へ回す */
const rotateToward = (bone: Object3D, from: Vector3, to: Vector3, weight = 1) => {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return
  _q1.setFromUnitVectors(_v1.copy(from).normalize(), _v2.copy(to).normalize())
  if (weight < 1) _q1.slerp(_q2.identity(), 1 - weight)
  worldQuat(bone, _q2)
  _q2.premultiply(_q1)
  setWorldQuat(bone, _q2)
}
/** 骨のワールドでの向きを決める（親の向きを打ち消してローカルへ） */
const setWorldQuat = (bone: Object3D, q: Quaternion) => {
  const parent = bone.parent
  if (parent) {
    worldQuat(parent, _q3)
    bone.quaternion.copy(_q3.invert().multiply(q))
  } else bone.quaternion.copy(q)
  bone.updateMatrixWorld(true)
}

/**
 * 2 本の骨の IK。a（付け根）→ b（ひじ・ひざ）→ c（手首・足首）を、c が target に来るよう曲げる
 * pole は曲がる向き（ひじ・ひざが向く方向、ワールド）
 */
const solveTwoBone = (a: Object3D, b: Object3D, c: Object3D, target: Vector3, pole: Vector3) => {
  const A = worldPos(a, new Vector3())
  const B = worldPos(b, new Vector3())
  const C = worldPos(c, new Vector3())
  const lab = A.distanceTo(B)
  const lbc = B.distanceTo(C)
  if (lab < 1e-5 || lbc < 1e-5) return
  const toT = target.clone().sub(A)
  const dist = MathUtils.clamp(toT.length(), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4)
  const dir = toT.lengthSq() > 1e-10 ? toT.normalize() : new Vector3(0, -1, 0)
  // ひじの向き: pole から dir に垂直な成分
  const pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)))
  if (pd.lengthSq() < 1e-8) pd.copy(new Vector3(0, 0, 1).cross(dir))
  pd.normalize()
  const cosA = MathUtils.clamp((lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist), -1, 1)
  const sinA = Math.sqrt(1 - cosA * cosA)
  const Bt = A.clone().addScaledVector(dir, lab * cosA).addScaledVector(pd, lab * sinA)
  rotateToward(a, B.clone().sub(A), Bt.clone().sub(A))
  const B2 = worldPos(b, new Vector3())
  const C2 = worldPos(c, new Vector3())
  const T = A.clone().addScaledVector(dir, dist)
  rotateToward(b, C2.sub(B2), T.sub(B2))
}

// コントローラーの握り（grip）の向きから手の骨の向きへの変換（正規化された骨）
// 左手: 指（骨の +X）がコントローラーの -Z、手の甲（+Y）が -X、親指側（+Z）が +Y
const GRIP_TO_HAND = {
  left: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0))),
  right: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0))),
}
/** 握りの中心から手首までのずれ（握りの座標） */
const GRIP_TO_WRIST = new Vector3(0, -0.01, 0.075)

interface FootState {
  planted: Vector3
  from: Vector3
  to: Vector3
  t: number
  stepping: boolean
}

export class AvatarPoser {
  private phase = 0
  private feet: Record<'left' | 'right', FootState> = {
    left: { planted: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, stepping: false },
    right: { planted: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, stepping: false },
  }
  private initFeet = false
  private lastYaw = 0
  private crouchAmt = 0
  private airAmt = 0
  private headSmooth = new Quaternion()
  private sitAmt = 0

  constructor(private model: AvatarModel) {}

  /**
   * VRM 0.x は 180° 回して前を向かせているので、正規化された骨の座標は体の座標と前後・左右が逆。
   * 体の座標で考えたローカルの回転・位置を、骨の座標に直す
   */
  private lq(q: Quaternion) {
    if (this.model.flipped) q.set(-q.x, q.y, -q.z, q.w)
    return q
  }
  private lqo(bone: Object3D | undefined, e: Euler) {
    if (bone) this.lq(bone.quaternion.setFromEuler(e))
  }
  /** ワールドでの向き（VRM 1.0 の骨の向きで考えたもの）を、この骨の向きに直す */
  private wq(q: Quaternion) {
    if (this.model.flipped) q.multiply(FLIP_Y)
    return q
  }
  private lp(v: Vector3) {
    if (this.model.flipped) v.set(-v.x, v.y, -v.z)
    return v
  }

  private bone(n: BoneName) {
    return this.model.bones[n]
  }

  private resetBones() {
    for (const b of Object.values(this.model.bones)) b?.quaternion.identity()
    const hips = this.bone('hips')
    const r = this.model.rest.hips
    if (hips && r) this.lp(hips.position.set(r[0], r[1], r[2]).sub(this.parentRestOffset(hips)))
  }
  /** 腰の骨の親が root でない（VRM の場合）ときのずれ */
  private parentRestOffset(hips: Object3D) {
    const p = hips.parent
    if (!p || p === this.model.root) return _v4.set(0, 0, 0)
    // 正規化された骨の親は原点に置かれているので、ずれは 0 とみなす
    return _v4.set(0, 0, 0)
  }

  private lastRoot = new Vector3()

  update(inp: PoseInput, dt: number) {
    const m = this.model
    const root = m.root
    const s = inp.scale
    // テレポートなどで大きく動いたら、足を置き直す（踏み出しの途中で止まらないように）
    if (this.lastRoot.distanceToSquared(inp.root) > 1) this.initFeet = false
    this.lastRoot.copy(inp.root)
    root.position.copy(inp.root)
    root.rotation.set(0, inp.yaw + Math.PI, 0)
    root.scale.setScalar(s)
    this.resetBones()
    root.updateMatrixWorld(true)

    const rest = m.rest
    const hips = this.bone('hips')
    if (!hips || !rest.hips || !rest.head) {
      m.update(dt)
      return
    }
    const restHipsY = rest.hips[1]
    const restHeadY = rest.head[1]
    const rootQ = _q1.setFromEuler(new Euler(0, inp.yaw + Math.PI, 0)).clone()
    const toLocal = (p: Vector3) => p.clone().sub(inp.root).applyQuaternion(rootQ.clone().invert()).divideScalar(s)
    const toWorld = (p: Vector3) => p.clone().multiplyScalar(s).applyQuaternion(rootQ).add(inp.root)
    const forward = new Vector3(0, 0, 1).applyQuaternion(rootQ)

    // ---------------- 腰の位置 ----------------
    const sleeping = inp.sleep !== SleepPose.None
    this.sitAmt = MathUtils.damp(this.sitAmt, inp.sitting ? 1 : 0, 12, dt)
    this.airAmt = MathUtils.damp(this.airAmt, inp.grounded || inp.sitting ? 0 : 1, 10, dt)
    let headLocal: Vector3 | null = null
    if (inp.vr && inp.head) {
      headLocal = toLocal(inp.head.p)
      // 頭の骨は目より少し下・後ろ
      const eo = new Vector3(...m.eyeOffset).applyQuaternion(rootQ.clone().invert().multiply(inp.head.q))
      headLocal.sub(eo.multiplyScalar(1))
    }
    const targetCrouch = inp.prone ? 1 : inp.crouch ? 0.55 : 0
    this.crouchAmt = MathUtils.damp(this.crouchAmt, targetCrouch, 8, dt)
    if (sleeping) {
      this.applySleep(inp, toLocal)
      m.update(dt)
      return
    }
    if (headLocal && !inp.sitting) {
      // VR: 頭の高さから腰の高さを決める（しゃがむと下がる）
      const drop = Math.max(0, restHeadY - headLocal.y)
      const hy = Math.max(restHipsY * 0.3, restHipsY - drop * 0.95)
      // 前かがみ: 頭が前に出ているぶん、腰は少し後ろ
      const lean = MathUtils.clamp(drop / restHeadY, 0, 0.6)
      this.lp(hips.position.set(headLocal.x * (1 - lean), hy, headLocal.z - (rest.head[2] - rest.hips[2]) - lean * 0.18))
    } else if (inp.sitting) {
      this.lp(hips.position.set(0, 0.0 + restHipsY * 0.0 + 0.08, 0))
    } else {
      // PC・スマホ: しゃがむ・伏せる・ジャンプ
      const bob = inp.speed > 0.2 && inp.grounded ? Math.abs(Math.sin(this.phase)) * 0.025 * Math.min(1, inp.speed / 3) : 0
      const crouchY = restHipsY * (1 - 0.45 * this.crouchAmt) - (inp.prone ? restHipsY * 0.35 * this.crouchAmt : 0)
      this.lp(hips.position.set(0, crouchY - bob + 0.02 * this.airAmt, inp.prone ? -0.25 * this.crouchAmt : 0))
    }
    if (inp.trackers) {
      // 腰のトラッカーがあればそれに合わせる（[20]）
      const hp = toLocal(inp.trackers.hips.p)
      this.lp(hips.position.copy(hp))
      const hq = rootQ.clone().invert().multiply(inp.trackers.hips.q)
      this.lq(hips.quaternion.copy(hq))
    }
    if (inp.prone && !inp.vr) {
      // 伏せ: 体を前へ倒す
      this.lq(hips.quaternion.setFromEuler(new Euler(MathUtils.degToRad(80) * this.crouchAmt, 0, 0)))
    }
    root.updateMatrixWorld(true)

    // ---------------- 背骨と頭 ----------------
    const spineBones = (['spine', 'chest', 'upperChest', 'neck'] as BoneName[]).map((n) => this.bone(n)).filter((b): b is Object3D => !!b)
    const headBone = this.bone('head')!
    if (headLocal && headBone) {
      // 首の付け根から頭へのベクトルを、目標の頭の位置へ向ける（背骨に分けて曲げる）
      const weights = [0.25, 0.3, 0.3, 0.15]
      for (let i = 0; i < spineBones.length; i++) {
        const b = spineBones[i]
        const from = worldPos(headBone, new Vector3()).sub(worldPos(b, new Vector3()))
        const to = toWorld(headLocal).sub(worldPos(b, new Vector3()))
        rotateToward(b, from, to, weights[i] ?? 0.2)
      }
      // 頭の向きはそのまま（体の向きを打ち消す）
      const hq = inp.head!.q.clone()
      this.headSmooth.slerp(hq, 1 - Math.exp(-dt * 40))
      setWorldQuat(headBone, this.wq(this.headSmooth.copy(hq).multiply(new Quaternion().setFromAxisAngle(UP, Math.PI)).clone()))
    } else if (headBone) {
      // PC: 上下の視線を首と頭に分ける。左右は体の向き
      const pitch = MathUtils.clamp(inp.pitch, -1.2, 1.2)
      const neck = this.bone('neck')
      const chest = this.bone('chest')
      if (chest) this.lq(chest.quaternion.setFromEuler(new Euler(-pitch * 0.15 + 0.05 * this.crouchAmt, 0, 0)))
      if (neck) this.lq(neck.quaternion.setFromEuler(new Euler(-pitch * 0.35, 0, 0)))
      this.lq(headBone.quaternion.setFromEuler(new Euler(-pitch * 0.5, 0, 0)))
      if (inp.prone && !inp.vr) headBone.quaternion.multiply(this.lq(new Quaternion().setFromEuler(new Euler(-1.1 * this.crouchAmt, 0, 0))))
      root.updateMatrixWorld(true)
    }
    root.updateMatrixWorld(true)

    // ---------------- 腕 ----------------
    for (const side of ['left', 'right'] as const) {
      const S = (n: string) => `${side}${n}` as BoneName
      const ua = this.bone(S('UpperArm'))
      const la = this.bone(S('LowerArm'))
      const hand = this.bone(S('Hand'))
      if (!ua || !la || !hand) continue
      const sx = side === 'left' ? 1 : -1
      const tgt = side === 'left' ? inp.left : inp.right
      if (inp.vr && tgt) {
        const wrist = tgt.p.clone().add(GRIP_TO_WRIST.clone().multiplyScalar(s).applyQuaternion(tgt.q))
        // ひじは下と後ろ・外側へ
        const pole = new Vector3(sx * 0.6, -1, -0.5).applyQuaternion(rootQ).normalize()
        const shoulder = this.bone(S('Shoulder'))
        if (shoulder) {
          // 手を高く上げたら肩も少し上げる
          const up = toLocal(wrist).y - (rest[S('UpperArm')]?.[1] ?? 1.4)
          this.lq(shoulder.quaternion.setFromEuler(new Euler(0, 0, sx * MathUtils.clamp(up * 0.5, 0, 0.35))))
          shoulder.updateMatrixWorld(true)
        }
        solveTwoBone(ua, la, hand, wrist, pole)
        setWorldQuat(hand, this.wq(tgt.q.clone().multiply(GRIP_TO_HAND[side])))
      } else {
        // 腕を下ろして、歩くと前後に振る
        const swing = inp.speed > 0.2 ? Math.sin(this.phase + (side === 'left' ? Math.PI : 0)) * MathUtils.clamp(inp.speed / 3, 0, 1) * 0.5 : 0
        const idle = Math.sin(performance.now() / 1400 + (side === 'left' ? 0 : 1)) * 0.02
        this.lq(ua.quaternion.setFromEuler(new Euler(swing * 0.9, -swing * 0.2 * sx, sx * (-1.25 + idle) + (inp.sitting ? sx * 0.15 : 0))))
        this.lq(la.quaternion.setFromEuler(new Euler(0, sx * (-0.25 - Math.max(0, swing) * 0.5 - (inp.sitting ? 0.9 : 0)), 0)))
        this.lq(hand.quaternion.setFromEuler(new Euler(0, 0, sx * 0.1)))
        if (tgt && !inp.vr) {
          // PC で物をつかんでいるとき: 右手をその位置へ
          root.updateMatrixWorld(true)
          solveTwoBone(ua, la, hand, tgt.p, new Vector3(sx * 0.6, -1, -0.5).applyQuaternion(rootQ).normalize())
        }
      }
      root.updateMatrixWorld(true)
    }

    // ---------------- 脚 ----------------
    if (inp.sitting) this.applySit()
    else this.applyLegs(inp, dt, toWorld, toLocal, forward)

    // ---------------- 指 ----------------
    this.applyFingers(inp.fingers)
    this.lastYaw = inp.yaw
    m.update(dt)
  }

  private applySit() {
    const a = this.sitAmt
    for (const side of ['left', 'right'] as const) {
      const sx = side === 'left' ? 1 : -1
      const ul = this.bone(`${side}UpperLeg` as BoneName)
      const ll = this.bone(`${side}LowerLeg` as BoneName)
      const ft = this.bone(`${side}Foot` as BoneName)
      this.lqo(ul, new Euler(-Math.PI / 2 * a, 0, sx * 0.06))
      this.lqo(ll, new Euler(Math.PI / 2 * a, 0, 0))
      this.lqo(ft, new Euler(0, 0, 0))
    }
    this.initFeet = false
  }

  private applyLegs(inp: PoseInput, dt: number, toWorld: (p: Vector3) => Vector3, toLocal: (p: Vector3) => Vector3, forward: Vector3) {
    const rest = this.model.rest
    const moving = inp.speed > 0.25 && inp.grounded
    const s = inp.scale
    const legLen = (rest.leftUpperLeg?.[1] ?? 0.9) - (rest.leftFoot?.[1] ?? 0.1)
    if (moving) this.phase += dt * (Math.min(inp.speed, 6) / Math.max(0.3, legLen * s)) * 2.1
    const yawChange = Math.abs(MathUtils.euclideanModulo(inp.yaw - this.lastYaw + Math.PI, Math.PI * 2) - Math.PI)
    for (const side of ['left', 'right'] as const) {
      const S = (n: string) => `${side}${n}` as BoneName
      const ul = this.bone(S('UpperLeg'))
      const ll = this.bone(S('LowerLeg'))
      const ft = this.bone(S('Foot'))
      if (!ul || !ll || !ft) continue
      const sx = side === 'left' ? 1 : -1
      const footRest = rest[S('Foot')]
      const hipsBone = this.bone('hips')!
      // 腰の真下・少し外側が足の置き場所
      const hipLocal = toLocal(worldPos(hipsBone, new Vector3()))
      const home = new Vector3(hipLocal.x + sx * Math.abs(footRest?.[0] ?? 0.09), footRest?.[1] ?? 0.08, hipLocal.z + 0.02)
      const homeW = toWorld(home)
      const f = this.feet[side]
      let target: Vector3
      if (inp.trackers) {
        target = (side === 'left' ? inp.trackers.left.p : inp.trackers.right.p).clone()
        this.initFeet = false
      } else if (!inp.grounded) {
        // 空中: 少し曲げて下げる
        target = toWorld(home.clone().add(new Vector3(0, 0.12 + (side === 'left' ? 0.04 : 0), 0.08)))
        this.initFeet = false
      } else if (moving) {
        // 歩く: 足を交互に前後へ運び、前へ出す間は上げる
        const ph = this.phase + (side === 'left' ? 0 : Math.PI)
        const stride = MathUtils.clamp(inp.speed * 0.13, 0.12, 0.42)
        const dir = new Vector3(inp.moveX, 0, -inp.moveZ)
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1)
        dir.normalize()
        const off = dir.multiplyScalar(Math.sin(ph) * stride)
        const lift = Math.max(0, Math.cos(ph)) * 0.09 * Math.min(1, inp.speed / 2)
        target = toWorld(home.clone().add(new Vector3(off.x, lift, off.z)))
        f.planted.copy(target).setY(homeW.y - (home.y - (footRest?.[1] ?? 0.08)) * s)
        f.t = 1
        f.stepping = false
        this.initFeet = true
      } else {
        // 立ち止まる: 足は地面に置いたまま。腰から離れたり体が回ったら踏み直す
        if (!this.initFeet) {
          f.planted.copy(homeW)
          f.t = 1
        }
        const other = this.feet[side === 'left' ? 'right' : 'left']
        const far = f.planted.distanceTo(homeW) > 0.22 * s || yawChange > 0.6
        if (!f.stepping && far && !other.stepping) {
          f.stepping = true
          f.t = 0
          f.from.copy(f.planted)
          f.to.copy(homeW)
        }
        if (f.stepping) {
          f.t = Math.min(1, f.t + dt * 4.5)
          const e = f.t * f.t * (3 - 2 * f.t)
          f.planted.lerpVectors(f.from, f.to, e)
          f.planted.y = f.to.y + Math.sin(f.t * Math.PI) * 0.06 * s
          if (f.t >= 1) f.stepping = false
        }
        target = f.planted.clone()
      }
      // ひざは前へ（体の向き）
      const pole = forward.clone().add(new Vector3(0, 0.1, 0)).normalize()
      solveTwoBone(ul, ll, ft, target, pole)
      // 足首は地面と平行に
      const fq = new Quaternion().setFromEuler(new Euler(0, inp.yaw + Math.PI, 0))
      setWorldQuat(ft, this.wq(fq.clone()))
    }
    if (!moving && inp.grounded && !inp.trackers) this.initFeet = true
  }

  private applyFingers(curls: number[] | null) {
    const c = curls ?? [0.25, 0.35, 0.4, 0.45, 0.5, 0.25, 0.35, 0.4, 0.45, 0.5]
    const names = ['Thumb', 'Index', 'Middle', 'Ring', 'Little']
    for (const [si, side] of (['left', 'right'] as const).entries()) {
      const sx = side === 'left' ? 1 : -1
      for (let f = 0; f < 5; f++) {
        const k = MathUtils.clamp(c[si * 5 + f] ?? 0, 0, 1)
        const segs = f === 0 ? ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'] : [`${names[f]}Proximal`, `${names[f]}Intermediate`, `${names[f]}Distal`]
        for (let j = 0; j < 3; j++) {
          const b = this.bone(`${side}${segs[j]}` as BoneName)
          if (!b) continue
          if (f === 0) {
            // 親指: 手のひらの方へ寄せて曲げる
            this.lq(b.quaternion.setFromEuler(new Euler(0, sx * k * (j === 0 ? 0.5 : 0.6), sx * -k * 0.3)))
          } else {
            // 指: 手のひら（-Y）の方へ曲げる。左手は Z 軸の負、右手は正
            const ang = k * (j === 0 ? 1.25 : j === 1 ? 1.5 : 1.1)
            this.lq(b.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -sx * ang))
          }
        }
      }
    }
  }

  /** 寝るポーズ（[205]）: 仰向け・うつ伏せ・横向き・リラックス */
  private applySleep(inp: PoseInput, toLocal: (p: Vector3) => Vector3) {
    const hips = this.bone('hips')!
    const rest = this.model.rest
    const restHipsY = rest.hips![1]
    const e = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z))
    let body: Quaternion
    let height = 0.12
    switch (inp.sleep) {
      case SleepPose.Supine:
        body = e(-Math.PI / 2, 0, 0)
        break
      case SleepPose.Prone:
        body = e(Math.PI / 2, 0, 0)
        height = 0.1
        break
      case SleepPose.Left:
        body = e(-Math.PI / 2, 0, 0).premultiply(e(0, 0, Math.PI / 2))
        height = 0.18
        break
      case SleepPose.Right:
        body = e(-Math.PI / 2, 0, 0).premultiply(e(0, 0, -Math.PI / 2))
        height = 0.18
        break
      default:
        // リラックス: 半分起こして足を伸ばす
        body = e(-1.05, 0, 0)
        height = 0.15
    }
    this.lq(hips.quaternion.copy(body))
    // 頭が足元より前（体の向き）に来るよう、腰を後ろへずらす
    const torso = rest.head![1] - restHipsY
    const pos = new Vector3(0, height, -torso * 0.5)
    if (inp.vr && inp.head) {
      // VR: 頭の位置に頭が来るよう、体ごとずらす
      const hl = toLocal(inp.head.p)
      const headFromHips = new Vector3(0, torso, 0).applyQuaternion(body)
      pos.set(hl.x - headFromHips.x, Math.max(0.06, hl.y - headFromHips.y - 0.08), hl.z - headFromHips.z)
    }
    this.lp(hips.position.copy(pos))
    const relaxed = inp.sleep === SleepPose.Relax
    for (const side of ['left', 'right'] as const) {
      const sx = side === 'left' ? 1 : -1
      const b = (n: string) => this.bone(`${side}${n}` as BoneName)
      const side1 = inp.sleep === SleepPose.Left || inp.sleep === SleepPose.Right
      this.lqo(b('UpperLeg'), new Euler(side1 ? -0.5 : relaxed ? -0.2 : -0.05, 0, sx * 0.08))
      this.lqo(b('LowerLeg'), new Euler(side1 ? 0.8 : relaxed ? 0.15 : 0.05, 0, 0))
      this.lqo(b('UpperArm'), new Euler(side1 ? -0.6 : 0, 0, sx * (relaxed ? -1.2 : inp.sleep === SleepPose.Supine ? -1.35 : -1.1)))
      this.lqo(b('LowerArm'), new Euler(0, sx * (side1 ? -1.2 : -0.3), 0))
    }
    const head = this.bone('head')
    if (head) {
      if (inp.vr && inp.head) {
        this.model.root.updateMatrixWorld(true)
        setWorldQuat(head, this.wq(inp.head.q.clone().multiply(new Quaternion().setFromAxisAngle(UP, Math.PI))))
      } else this.lq(head.quaternion.setFromEuler(new Euler(inp.sleep === SleepPose.Supine ? 0.15 : 0, inp.sleep === SleepPose.Prone ? 0.9 : 0, 0)))
    }
    this.applyFingers([0.4, 0.5, 0.55, 0.6, 0.65, 0.4, 0.5, 0.55, 0.6, 0.65])
    this.initFeet = false
    void _m
  }
}

// ---------------- 指から手の形（ジェスチャー）へ（[204]） ----------------

export type Gesture = 'neutral' | 'fist' | 'open' | 'point' | 'victory' | 'rocknroll' | 'gun' | 'thumbsup'

/** 親指・人差し指・中指・薬指・小指の曲がり（0〜1）から手の形を判定する */
export const classifyGesture = (c: number[]): Gesture => {
  const [t, i, m, r, l] = c
  const bent = (x: number) => x >= 0.6
  const straight = (x: number) => x <= 0.35
  if (straight(t) && bent(i) && bent(m) && bent(r) && bent(l)) return 'thumbsup'
  if (bent(i) && bent(m) && bent(r) && bent(l)) return 'fist'
  if (straight(i) && straight(m) && straight(r) && straight(l)) return 'open'
  if (straight(i) && straight(m) && bent(r) && bent(l)) return 'victory'
  if (straight(i) && bent(m) && bent(r) && straight(l)) return 'rocknroll'
  if (straight(t) && straight(i) && bent(m) && bent(r) && bent(l)) return 'gun'
  if (straight(i) && bent(m) && bent(r) && bent(l)) return 'point'
  return 'neutral'
}

/** 手の形の見本（PC・スマホでジェスチャーを選んだときの指） */
export const GESTURE_CURLS: Record<Gesture, number[]> = {
  neutral: [0.25, 0.3, 0.35, 0.4, 0.45],
  fist: [0.8, 1, 1, 1, 1],
  open: [0, 0, 0, 0, 0],
  point: [0.8, 0, 1, 1, 1],
  victory: [0.8, 0, 0, 1, 1],
  rocknroll: [0.8, 0, 1, 1, 0],
  gun: [0, 0, 1, 1, 1],
  thumbsup: [0, 1, 1, 1, 1],
}
