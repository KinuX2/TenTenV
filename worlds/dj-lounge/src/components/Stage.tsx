import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  type Group,
  type InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  type PointLight,
  ShaderMaterial,
  SRGBColorSpace,
  type SpotLight,
  Vector3,
} from 'three'
import { AL } from '../dj/audiolink'
import { BOOTH, ROOM } from './Club'

// ハードコアのライブハウスのステージ: DJ の後ろの大きな LED ビジョン、トラスに吊った
// ムービングライト・レーザー・ストロボ、LED のパー、壁の LED の柱。どれも AL（音の情報）で動く。
// ロゴや実在のイベントの名前は使わない
type V3 = [number, number, number]
const { w: RW, d: RD, h: RH } = ROOM

const metal = new MeshStandardMaterial({ color: '#bcbcbc', roughness: 0.35, metalness: 0.8 })
const black = new MeshStandardMaterial({ color: '#151515', roughness: 0.6, metalness: 0.3 })
const cableMat = new MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.5 })
const additive = (color: string, opacity: number) =>
  new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })

// 色の濃さを変えるための入れ物（毎フレーム作らない）
const tmpC = new Color()
const WHITE = new Color('#ffffff')

// ---------- LED ビジョン ----------
const LED = { w: 12.4, h: 3.8, y: 2.85, z: -RD / 2 + 0.06 }
const ledVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
const ledFrag = /* glsl */ `
uniform float uTime, uBeat, uBeatCount, uHit, uCalm, uMode, uEnergy, uFlash;
uniform vec4 uBands;
uniform vec3 uColA, uColB;
uniform sampler2D uAL, uTitle, uCard, uKanji;
uniform vec2 uRes;
varying vec2 vUv;
const float ASPECT = ${(LED.w / LED.h).toFixed(4)};
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float al(float row, float x){ return texture2D(uAL, vec2(clamp(x, 0.0, 1.0), (row + 0.5) / 8.0)).r; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float tri(vec2 q, float r){ return max(abs(q.x) * 0.866 + q.y * 0.5, -q.y) - r * 0.5; }

vec3 scene(vec2 uv, float mode){
  vec2 p = uv * 2.0 - 1.0; p.x *= ASPECT;
  float bt = uBeatCount + uBeat;
  float pulse = pow(1.0 - uBeat, 3.0);
  vec3 c = vec3(0.0);
  if (mode < 0.5) {
    // 斜めの帯（白と副の色）が拍ごとに入れ替わり、中央に大きな三角
    float s = (p.x + p.y * 0.9) * 1.4 - floor(bt) * 0.5 - pulse * 0.2;
    float k = floor(s);
    float f = fract(s);
    float on = step(0.5, f) * step(hash(vec2(k, floor(bt))), 0.7);
    vec3 band = mix(vec3(1.0), uColB, step(0.5, hash(vec2(k, 3.0))));
    c = mix(uColB * 0.08, band, on);
    vec2 q = rot(bt * 0.125 * 3.14159) * (p * 1.1);
    float d = tri(q, 0.9 + 0.5 * pulse * uBands.x);
    c = mix(c, vec3(0.0), smoothstep(0.02, -0.02, d) * 0.85);
    c += uColA * smoothstep(0.05, 0.0, abs(d)) * 2.0;
  } else if (mode < 1.5) {
    // スペクトル（中央から左右へ鏡写し）
    float x = abs(p.x) / ASPECT;
    float n = 48.0;
    float xi = floor(x * n) / n;
    float v = al(4.0, xi * 0.85 + 0.03);
    float y = uv.y;
    float bar = step(y, v * 0.95) * step(0.15, fract(x * n));
    float seg = step(0.25, fract(y * 24.0));
    c = mix(uColB, uColA, y) * bar * seg * 1.3;
    c += uColA * 0.15 * smoothstep(0.02, 0.0, abs(y - v * 0.95 - 0.02)) * step(0.15, fract(x * n));
    c += vec3(0.02, 0.0, 0.05);
  } else if (mode < 2.5) {
    // 四角のトンネル（拍で奥から手前へ）
    vec2 q = rot(bt * 0.1) * p;
    float r = max(abs(q.x), abs(q.y));
    float z = -log(max(r, 0.02)) * 2.5 + bt * 0.5;
    float ring = smoothstep(0.36, 0.46, abs(fract(z) - 0.5));
    float col = step(0.5, fract(floor(z) * 0.5));
    c = mix(uColA, uColB, col) * ring * smoothstep(0.0, 0.5, r) * (0.6 + uBands.x);
    c += vec3(1.0) * pulse * 0.25 * smoothstep(0.4, 0.0, r);
  } else if (mode < 3.5) {
    // 波形と 4 つの帯域の履歴
    float w = al(5.0, uv.x) - 0.5;
    float d = abs(uv.y - 0.5 - w * 0.9);
    c = uColA * smoothstep(0.012, 0.0, d) * 2.0 + uColA * smoothstep(0.08, 0.0, d) * 0.3;
    for (int k = 0; k < 4; k++) {
      float h = al(float(k), 1.0 - uv.x) * 0.22;
      float base = 0.04 + float(k) * 0.24;
      float dd = abs(uv.y - base - h);
      c += mix(uColB, vec3(1.0), float(k) / 4.0) * smoothstep(0.008, 0.0, dd) * 1.2;
    }
    vec2 g = abs(fract(uv * vec2(ASPECT * 6.0, 6.0)) - 0.5);
    c += vec3(0.05, 0.03, 0.1) * step(0.47, max(g.x, g.y));
  } else if (mode < 4.5) {
    // 曲名を大きく流す
    float yy = (uv.y - 0.3) / 0.4;
    vec3 bg = mix(uColB * 0.1, vec3(0.0), uv.y);
    float lines = step(0.92, fract(uv.y * 30.0 + bt * 0.5)) * step(0.5, hash(vec2(floor(uv.y * 30.0), floor(bt))));
    c = bg + uColB * lines * 0.6;
    if (yy > 0.0 && yy < 1.0) {
      float x = fract(uv.x * 0.6 - uTime * 0.12);
      vec4 t = texture2D(uTitle, vec2(x, yy));
      c = mix(c, mix(vec3(1.0), uColA, t.r * 0.0 + step(0.5, fract(uBeat * 2.0)) * 0.3), t.a);
    }
  } else if (mode < 5.5) {
    // マス目が拍ごとにランダムに光る
    vec2 g = vec2(uv.x * ASPECT, uv.y) * 6.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = hash(id + floor(bt));
    float on = step(1.0 - 0.25 - 0.4 * uBands.x, r);
    float shape = step(max(abs(f.x), abs(f.y)), 0.42);
    float tr = smoothstep(0.02, 0.0, tri(f * vec2(1.0, -1.0) * 2.2, 0.8));
    c = mix(uColA, uColB, step(0.5, hash(id))) * on * mix(shape, tr, step(0.6, r)) * (0.5 + pulse);
  } else if (mode < 6.5) {
    // 出演者の名前のカード（大きな白い文字。行ごとに横へずれるグリッチと、色ずれの影）
    float row = floor(uv.y * 36.0);
    float gl = step(0.86, hash(vec2(row, floor(uTime * 10.0)))) * (hash(vec2(row, 7.0)) - 0.5) * (0.15 + 0.4 * uBands.w);
    vec2 cs = vec2(ASPECT * 1.8, ASPECT * 1.8 / 3.2);
    vec2 q = (p + vec2(gl, 0.0)) / cs + 0.5;
    vec2 q2 = q + vec2(0.006 + 0.02 * pulse, 0.004);
    float a = texture2D(uCard, clamp(q, 0.0, 1.0)).a * step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
    float a2 = texture2D(uCard, clamp(q2, 0.0, 1.0)).a * step(0.0, q2.x) * step(q2.x, 1.0) * step(0.0, q2.y) * step(q2.y, 1.0);
    c = uColA * a2;
    c = mix(c, vec3(1.0), a);
    c += uColA * step(0.985, fract(uv.y * 3.0 + bt * 0.25)) * 0.8;
    c *= 0.85 + 0.15 * step(0.5, fract(uv.y * 90.0));
  } else if (mode < 7.5) {
    // 大きな漢字を拍ごとに 1 文字ずつ。中央の正方形は白と黒が拍で入れ替わり、左右は斜めの帯
    float idx = mod(uBeatCount, 4.0);
    vec2 q = p / 1.8 + 0.5;
    float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
    float a = texture2D(uKanji, vec2((clamp(q.x, 0.0, 1.0) + idx) / 4.0, q.y)).a * inside;
    float inv = mod(uBeatCount, 2.0);
    vec3 bgc = mix(vec3(1.0), vec3(0.0), inv);
    vec3 fg = mix(vec3(0.0), uColA, inv);
    vec3 block = mix(bgc, fg, a);
    float st = step(0.5, fract((p.x - p.y) * 1.5 - bt * 0.5));
    vec3 side = uColA * st * (0.4 + 0.6 * uBands.x);
    c = mix(side, block, inside);
  } else {
    // 矢印（＞＞＞）が左右から中央へ流れる
    float x = abs(p.x) * 1.2 + abs(p.y) * 0.9 + bt;
    float k = floor(x);
    float on = step(0.55, fract(x));
    c = mix(vec3(1.0), uColA, mod(k, 2.0)) * on * (0.4 + 0.6 * uBands.x) * step(abs(p.y), 0.8);
  }
  return c;
}

void main(){
  // LED の粒: 粒ごとに 1 色（ドット絵のように）
  vec2 grid = vUv * uRes;
  vec2 cell = floor(grid) + 0.5;
  // 切り替えの瞬間のグリッチ（行ごとに横へずらす）
  float gRow = floor(vUv.y * 40.0);
  float g = step(0.6, hash(vec2(gRow, floor(uTime * 24.0)))) * (hash(vec2(gRow, 3.0)) - 0.5) * uFlash * 0.5;
  vec3 c = scene(cell / uRes + vec2(g, 0.0), uMode);
  float dot = smoothstep(0.55, 0.3, length(fract(grid) - 0.5));
  c *= 0.45 + 0.75 * dot;
  // 拍のフラッシュ
  c += vec3(1.0) * uHit * 0.3 * (1.0 - uCalm);
  c += vec3(1.0) * uFlash * (1.0 - uCalm * 0.8);
  gl_FragColor = vec4(c * (0.35 + 0.65 * uEnergy), 1.0);
}`

// 出演者の名前のカード（このワールドの名前）と、漢字 4 文字。どちらも白い文字だけ（透明の地）
const textCanvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  draw(g)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
let card: CanvasTexture | null = null
const cardTex = () =>
  (card ??= textCanvas(2048, 640, (g) => {
    g.font = 'italic 900 330px "Arial Black", "Arial", sans-serif'
    g.fillText('DJ LOUNGE', 1024, 300)
    g.font = 'bold 64px "Arial", sans-serif'
    g.fillText('— LIVE SET —', 1024, 540)
    // 角ばった飾りの線
    g.fillRect(150, 470, 500, 10)
    g.fillRect(1398, 470, 500, 10)
  }))
let kanji: CanvasTexture | null = null
const kanjiTex = () =>
  (kanji ??= textCanvas(2048, 512, (g) => {
    g.font = '900 360px "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'
    ;['爆', '音', '狂', '騒'].forEach((ch, k) => g.fillText(ch, 256 + k * 512, 270))
  }))

const useTitleTexture = () => {
  const { canvas, ctx, tex } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 256
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    return { canvas, ctx: canvas.getContext('2d')!, tex }
  }, [])
  const last = useRef('?')
  useFrame(() => {
    const t = AL.title || 'DJ LOUNGE'
    if (t === last.current) return
    last.current = t
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    let size = 190
    const text = `${t.toUpperCase()}  ///  `
    ctx.font = `italic 900 ${size}px "Arial Black", "Arial", sans-serif`
    while (size > 60 && ctx.measureText(text).width > canvas.width) {
      size -= 6
      ctx.font = `italic 900 ${size}px "Arial Black", "Arial", sans-serif`
    }
    ctx.fillText(text, 0, canvas.height / 2)
    tex.needsUpdate = true
  })
  return tex
}

const LedWall: React.FC = () => {
  const title = useTitleTexture()
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: ledVert,
        fragmentShader: ledFrag,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uBeat: { value: 0 },
          uBeatCount: { value: 0 },
          uHit: { value: 0 },
          uCalm: { value: 0 },
          uMode: { value: 0 },
          uEnergy: { value: 0 },
          uFlash: { value: 0 },
          uBands: { value: [0, 0, 0, 0] },
          uColA: { value: new Color() },
          uColB: { value: new Color() },
          uAL: { value: AL.texture },
          uTitle: { value: title },
          uCard: { value: cardTex() },
          uKanji: { value: kanjiTex() },
          uRes: { value: [Math.round(LED.w * 26), Math.round(LED.h * 26)] },
        },
      }),
    [title]
  )
  const lastMode = useRef(-1)
  const flash = useRef(0)
  useFrame(({ clock }, dt) => {
    const u = mat.uniforms
    // 16 拍ごとに映像を切り替える（切り替えの瞬間に白く光らせる）
    const mode = ((AL.phrase % 9) + 9) % 9
    if (mode !== lastMode.current) {
      if (lastMode.current >= 0 && AL.playing) flash.current = 0.6
      lastMode.current = mode
    }
    flash.current = Math.max(0, flash.current - dt * 3)
    u.uTime.value = clock.elapsedTime
    u.uBeat.value = AL.beat
    u.uBeatCount.value = AL.beatCount
    u.uHit.value = AL.hit
    u.uCalm.value = AL.calm ? 1 : 0
    u.uMode.value = mode
    u.uFlash.value = flash.current
    u.uBands.value = AL.bands
    // ブレイクは暗めにする
    u.uEnergy.value = AL.brk ? 0.4 : 1
    u.uColA.value.copy(AL.colA)
    u.uColB.value.copy(AL.colB)
  })
  return (
    <group position={[0, LED.y, LED.z]}>
      {/* 黒い枠 */}
      <mesh position={[0, 0, -0.04]} material={black}>
        <boxGeometry args={[LED.w + 0.2, LED.h + 0.2, 0.06]} />
      </mesh>
      <mesh material={mat}>
        <planeGeometry args={[LED.w, LED.h]} />
      </mesh>
    </group>
  )
}

// ---------- 壁の LED の柱（帯域の履歴が壁に沿って流れる） ----------
const tubeFrag = /* glsl */ `
uniform sampler2D uAL;
uniform vec3 uColA, uColB;
uniform float uSide;
varying vec2 vUv;
float al(float row, float x){ return texture2D(uAL, vec2(clamp(x, 0.0, 1.0), (row + 0.5) / 8.0)).r; }
void main(){
  float n = 9.0;
  float fx = fract(vUv.x * n);
  float k = floor(vUv.x * n);
  // ステージに近い柱ほど新しい値（音が奥から客席へ流れていく）
  float idx = uSide > 0.5 ? k : n - 1.0 - k;
  float v = al(mod(idx, 2.0) < 0.5 ? 0.0 : 1.0, idx * 0.035) * 0.9 + al(3.0, idx * 0.035) * 0.1;
  float tube = smoothstep(0.5, 0.42, abs(fx - 0.5) * 6.0);
  float seg = step(0.2, fract(vUv.y * 30.0));
  float lit = step(abs(vUv.y - 0.5) * 2.0, v);
  vec3 c = mix(uColA, uColB, abs(vUv.y - 0.5) * 2.0) * lit * seg * 1.4;
  c += vec3(0.03, 0.02, 0.05);
  gl_FragColor = vec4(c * tube, 1.0);
}`
const WallTubes: React.FC = () => {
  const mat = useMemo(
    () =>
      [0, 1].map(
        (side) =>
          new ShaderMaterial({
            vertexShader: ledVert,
            fragmentShader: tubeFrag,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            uniforms: { uAL: { value: AL.texture }, uColA: { value: new Color() }, uColB: { value: new Color() }, uSide: { value: side } },
          })
      ),
    []
  )
  useFrame(() => {
    mat.forEach((m) => {
      m.uniforms.uColA.value.copy(AL.colA)
      m.uniforms.uColB.value.copy(AL.colB)
    })
  })
  // 奥（ステージ側）から客席の手前までの壁。情報画面とクレジットの看板を避ける
  const len = 7
  const zc = -RD / 2 + 1.2 + len / 2
  return (
    <group>
      <mesh material={mat[0]} position={[-RW / 2 + 0.02, 2.3, zc]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[len, 3.6]} />
      </mesh>
      <mesh material={mat[1]} position={[RW / 2 - 0.02, 2.3, zc]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[len, 3.6]} />
      </mesh>
    </group>
  )
}

// ---------- トラス（四角い鉄骨の梁）。from から to へ ----------
const Truss: React.FC<{ from: V3; to: V3; size?: number }> = ({ from, to, size = 0.29 }) => {
  const ref = useRef<InstancedMesh>(null)
  const { len, mid, quat, count } = useMemo(() => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const len = a.distanceTo(b)
    const o = new Object3D()
    o.position.copy(a.clone().add(b).multiplyScalar(0.5))
    o.lookAt(b)
    return { len, mid: o.position.clone(), quat: o.quaternion.clone(), count: Math.floor(len / size) * 4 }
  }, [from, to, size])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new Object3D()
    const n = count / 4
    const h = size / 2
    // 4 つの面に斜めの材をジグザグに入れる（ローカルの Z が梁の向き）
    const faces: [number, number, number, number][] = [
      [h, -h, h, h],
      [-h, -h, -h, h],
      [-h, h, h, h],
      [-h, -h, h, -h],
    ]
    let k = 0
    faces.forEach(([x1, y1, x2, y2]) => {
      for (let i = 0; i < n; i++) {
        const z0 = -len / 2 + i * size
        const flip = i % 2 === 0
        const p0 = new Vector3(flip ? x1 : x2, flip ? y1 : y2, z0)
        const p1 = new Vector3(flip ? x2 : x1, flip ? y2 : y1, z0 + size)
        const d = p1.clone().sub(p0)
        o.position.copy(p0.clone().add(p1).multiplyScalar(0.5))
        o.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize())
        o.scale.set(1, d.length(), 1)
        o.updateMatrix()
        m.setMatrixAt(k++, o.matrix)
      }
    })
    m.instanceMatrix.needsUpdate = true
  }, [count, len, size])
  const h = size / 2
  return (
    <group position={mid} quaternion={quat}>
      {[
        [h, h],
        [-h, h],
        [h, -h],
        [-h, -h],
      ].map(([x, y], k) => (
        <mesh key={k} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={metal}>
          <cylinderGeometry args={[0.024, 0.024, len, 8]} />
        </mesh>
      ))}
      <instancedMesh ref={ref} args={[undefined, metal, count]}>
        <cylinderGeometry args={[0.011, 0.011, 1, 6]} />
      </instancedMesh>
    </group>
  )
}

// ---------- ムービングライト（首を振って光の筋を動かす） ----------
const BEAM_LEN = 9
const MovingHead: React.FC<{ p: V3; k: number; n: number; facing: 1 | -1 }> = ({ p, k, n, facing }) => {
  const pan = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const beam = useMemo(() => additive('#ffffff', 0.1), [])
  const lens = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  useFrame(({ clock }) => {
    if (!pan.current || !tilt.current) return
    const t = clock.elapsedTime
    const bt = AL.beatCount + AL.beat
    const u = k / Math.max(1, n - 1) - 0.5
    let pa = 0
    let ti = 0.5
    let on = 1
    // 16 拍ごとに動きを変える
    switch (((AL.phrase % 4) + 4) % 4) {
      case 0: // 扇のように広げて上下にうねる
        pa = u * 1.2
        ti = 0.55 + 0.35 * Math.sin((bt * Math.PI) / 4 + k * 0.6)
        break
      case 1: // 隣どうしで交差する
        pa = (k % 2 ? 1 : -1) * 0.6 * Math.sin((bt * Math.PI) / 8)
        ti = 0.7
        break
      case 2: // それぞれ円を描く
        pa = Math.sin(t * 1.3 + k * 1.1) * 0.7
        ti = 0.6 + 0.35 * Math.cos(t * 1.1 + k * 0.9)
        break
      default: // 拍ごとに 1 台ずつ順に光る
        pa = u * 0.6
        ti = 0.85
        on = ((AL.beatCount % n) + n) % n === k || ((AL.beatCount + n / 2) % n) === k ? 1 : 0.15
    }
    // ブレイクはゆっくり、暗く、白に
    if (AL.brk) {
      pa = Math.sin(t * 0.3 + k) * 0.5
      ti = 0.5 + 0.2 * Math.sin(t * 0.25 + k * 0.7)
      on = 0.35
    }
    pan.current.rotation.y = pa
    tilt.current.rotation.x = -ti * facing
    const level = (0.25 + 0.75 * Math.max(AL.bands[k % 2 ? 1 : 0], AL.hit)) * on
    tmpC.copy(k % 2 ? AL.colB : AL.colA)
    if (AL.drop && AL.inPhrase >= 12 && !AL.calm) tmpC.lerp(WHITE, 0.6)
    if (AL.brk) tmpC.lerp(WHITE, 0.8)
    beam.color.copy(tmpC)
    beam.opacity = 0.03 + 0.14 * level
    lens.color.copy(tmpC).multiplyScalar(0.4 + level)
  })
  return (
    <group position={p}>
      {/* 本体（トラスから吊る） */}
      <mesh position={[0, -0.06, 0]} material={black}>
        <boxGeometry args={[0.32, 0.12, 0.26]} />
      </mesh>
      <group ref={pan} position={[0, -0.12, 0]}>
        <mesh position={[0.15, -0.14, 0]} material={black}>
          <boxGeometry args={[0.04, 0.28, 0.1]} />
        </mesh>
        <mesh position={[-0.15, -0.14, 0]} material={black}>
          <boxGeometry args={[0.04, 0.28, 0.1]} />
        </mesh>
        <group ref={tilt} position={[0, -0.22, 0]}>
          <mesh material={black}>
            <cylinderGeometry args={[0.11, 0.13, 0.3, 16]} />
          </mesh>
          <mesh position={[0, -0.151, 0]} rotation={[Math.PI / 2, 0, 0]} material={lens}>
            <circleGeometry args={[0.09, 20]} />
          </mesh>
          {/* 光の筋（円すいの頂点がレンズ） */}
          <mesh position={[0, -0.16 - BEAM_LEN / 2, 0]} material={beam}>
            <coneGeometry args={[BEAM_LEN * 0.07, BEAM_LEN, 20, 1, true]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// ---------- ストロボ（盛り上がりの拍で白く光る。フラッシュを弱める設定では光らない） ----------
const Strobes: React.FC<{ xs: number[]; y: number; z: number }> = ({ xs, y, z }) => {
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#202024', toneMapped: false }), [])
  const light = useRef<PointLight>(null)
  useFrame(({ clock }) => {
    // ビルドアップ（16 拍の後半）は 1 拍に 2 回、ドロップは拍の頭に光る。速くても 1 秒に 8 回まで
    const fast = AL.drop && AL.inPhrase >= 12
    const ph = fast ? (AL.beat * 2) % 1 : AL.beat
    const on = !AL.calm && AL.playing && (AL.drop || fast) && ph < 0.12 && AL.bpm < 260
    const v = on ? 1 : 0
    mat.color.setScalar(on ? 4 : 0.12)
    if (light.current) light.current.intensity = v * 30
    void clock
  })
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, y, z]}>
          <mesh material={black}>
            <boxGeometry args={[0.55, 0.16, 0.14]} />
          </mesh>
          <mesh position={[0, 0, 0.071]} material={mat}>
            <planeGeometry args={[0.5, 0.1]} />
          </mesh>
        </group>
      ))}
      <pointLight ref={light} position={[0, y - 0.3, z + 1]} color="#ffffff" intensity={0} distance={18} decay={1.2} />
    </group>
  )
}

// ---------- LED のパー（蜂の巣状に並んだ 19 個の LED） ----------
const parTex = (() => {
  let t: CanvasTexture | null = null
  return () => {
    if (t) return t
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, 256, 256)
    const r = 22
    const pts: [number, number][] = [[0, 0]]
    for (let ring = 1; ring <= 2; ring++) {
      const n = ring * 6
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        pts.push([Math.cos(a) * ring * 48, Math.sin(a) * ring * 48])
      }
    }
    pts.forEach(([x, y]) => {
      const gr = g.createRadialGradient(128 + x, 128 + y, 0, 128 + x, 128 + y, r)
      gr.addColorStop(0, '#ffffff')
      gr.addColorStop(0.6, '#d0d0d0')
      gr.addColorStop(1, '#202020')
      g.fillStyle = gr
      g.beginPath()
      g.arc(128 + x, 128 + y, r, 0, Math.PI * 2)
      g.fill()
    })
    t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }
})()
const glowTex = (() => {
  let t: CanvasTexture | null = null
  return () => {
    if (t) return t
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.25, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
    t = new CanvasTexture(c)
    return t
  }
})()
// p の位置から target のほうを向ける
const Par: React.FC<{ p: V3; target: V3; band: number; alt?: boolean; spot?: boolean }> = ({ p, target, band, alt = false, spot = false }) => {
  const g = useRef<Group>(null)
  const face = useMemo(() => new MeshBasicMaterial({ map: parTex(), toneMapped: false }), [])
  const glow = useMemo(() => new MeshBasicMaterial({ map: glowTex(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  const sl = useRef<SpotLight>(null)
  useEffect(() => {
    g.current?.lookAt(new Vector3(...target).add(new Vector3(...p).negate()).add(g.current.getWorldPosition(new Vector3())))
    if (sl.current) {
      sl.current.target.position.set(...target)
      sl.current.target.updateMatrixWorld()
    }
  }, [p, target])
  useFrame(() => {
    const level = 0.25 + 0.75 * Math.max(AL.bands[band], AL.hit * 0.8)
    tmpC.copy(alt ? AL.colB : AL.colA)
    face.color.copy(tmpC).multiplyScalar(0.3 + level * 1.2)
    glow.color.copy(tmpC)
    glow.opacity = 0.15 + 0.6 * level
    if (sl.current) {
      sl.current.color.copy(tmpC)
      sl.current.intensity = 20 + 45 * level
    }
  })
  return (
    <>
      <group ref={g} position={p}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={black}>
          <cylinderGeometry args={[0.17, 0.15, 0.3, 20]} />
        </mesh>
        <mesh position={[0, 0, 0.151]} material={face}>
          <circleGeometry args={[0.15, 24]} />
        </mesh>
        <mesh position={[0, 0, 0.16]} material={glow}>
          <planeGeometry args={[1.0, 1.0]} />
        </mesh>
        {/* 吊り金具 */}
        <mesh position={[0, 0.12, -0.05]} material={black}>
          <boxGeometry args={[0.36, 0.03, 0.03]} />
        </mesh>
      </group>
      {spot && <spotLight ref={sl} position={p} angle={0.55} penumbra={0.6} distance={18} decay={1.2} />}
    </>
  )
}

// ---------- DJ 台の上のケーブル ----------
const BoothDressing: React.FC = () => {
  const cables = useMemo(() => {
    let s = 7
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const top = BOOTH.tableH + 0.012
    const front = BOOTH.z + BOOTH.tableD / 2
    return Array.from({ length: 11 }, () => {
      const x0 = (r() - 0.5) * 1.6
      const x1 = x0 + (r() - 0.5) * 0.6
      const z0 = BOOTH.z + 0.18 + r() * 0.08
      const pts = [
        new Vector3(x0, top + 0.03, z0),
        new Vector3(x0 + (r() - 0.5) * 0.3, top, z0 + 0.08),
        new Vector3((x0 + x1) / 2 + (r() - 0.5) * 0.2, top, front - 0.06),
        new Vector3(x1, top - 0.02, front + 0.02),
        new Vector3(x1 + (r() - 0.5) * 0.1, top - 0.3 - r() * 0.3, front + 0.035),
        new Vector3(x1 + (r() - 0.5) * 0.2, 0.01, front + 0.15 + r() * 0.3),
      ]
      return { curve: new CatmullRomCurve3(pts), radius: 0.004 + r() * 0.005 }
    })
  }, [])
  return (
    <group>
      {cables.map((c, k) => (
        <mesh key={k} material={cableMat}>
          <tubeGeometry args={[c.curve, 48, c.radius, 6, false]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------- レーザー（細い線を扇形に出す） ----------
// kind: top = トラスから客席の上へ扇、floor = DJ 台の角の床から V 字に上へ、side = 横の壁から反対の壁へ（左右で交差して網になる）
type LaserKind = 'top' | 'floor' | 'side'
const LASERS = 18
const Lasers: React.FC<{ p: V3; r?: V3; kind: LaserKind; mirror?: 1 | -1 }> = ({ p, r = [0, 0, 0], kind, mirror = 1 }) => {
  const ref = useRef<InstancedMesh>(null)
  const mat = useMemo(() => additive('#30ff60', 0.7), [])
  const o = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const t = clock.elapsedTime
    const bt = AL.beatCount + AL.beat
    // 盛り上がっている所と、高音が強いときに出す。曲を止めているとき・ブレイクは出さない
    const loud = AL.playing && !AL.brk && (AL.drop || AL.bands[3] > 0.75)
    const show = kind === 'top' ? loud : kind === 'floor' ? loud && AL.phrase % 2 === 0 : loud && AL.drop && AL.phrase % 2 !== 0
    m.visible = show
    if (!show) return
    const style = ((AL.phrase % 3) + 3) % 3
    for (let i = 0; i < LASERS; i++) {
      const u = i / (LASERS - 1) - 0.5
      let yaw = u * 1.4
      let pitch = 0.18
      if (kind === 'floor') {
        // 床から V 字。拍で開いたり閉じたりする
        const open = 0.25 + 0.2 * Math.sin(bt * Math.PI * 0.5)
        yaw = mirror * (0.25 + u * open)
        pitch = -0.05 + 0.15 * Math.sin(t * 2 + u * 4)
      } else if (kind === 'side') {
        yaw = u * 1.5
        pitch = 0.18 + 0.06 * Math.sin(t * 1.7 + u * 6)
      } else if (style === 0) {
        yaw = u * (1.0 + 0.4 * Math.sin(t * 1.5))
        pitch = 0.12 + 0.1 * Math.sin(bt * Math.PI * 0.5)
      } else if (style === 1) {
        yaw = Math.sin(t * 2 + u * 3) * 0.7
        pitch = 0.1 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3 + i))
      } else {
        // 全部そろって左右に走査
        yaw = Math.sin(t * 2.2) * 0.8 + u * 0.15
        pitch = 0.2
      }
      o.position.set(0, 0, 0)
      o.rotation.set(pitch, yaw, 0, 'YXZ')
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    // 主の色と白を 8 拍ごとに入れ替える
    mat.color.copy(Math.floor(AL.beatCount / 8) % 2 ? AL.colA : AL.colB)
    mat.opacity = 0.35 + 0.5 * AL.bands[3]
  })
  return (
    <group position={p} rotation={r}>
      {/* 床のレーザーは本体を見せない（光だけ） */}
      {kind !== 'floor' && (
        <mesh material={black}>
          <boxGeometry args={[0.3, 0.14, 0.28]} />
        </mesh>
      )}
      <instancedMesh ref={ref} args={[undefined, mat, LASERS]} position={[0, -0.02, 0.15]}>
        {/* 長さ 14m の細い棒。原点から +Z へ伸びる */}
        <boxGeometry args={[0.01, 0.01, 14]} onUpdate={(g) => g.translate(0, 0, 7)} />
      </instancedMesh>
    </group>
  )
}

// ---------- ブラインダー（客席に向けた電球色の 2 灯。ドロップの頭と 16 拍の終わりに光る） ----------
const Blinders: React.FC<{ xs: number[]; y: number; z: number }> = ({ xs, y, z }) => {
  const lamp = useMemo(() => new MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }), [])
  const glow = useMemo(() => new MeshBasicMaterial({ map: glowTex(), color: '#ffcf8a', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  const v = useRef(0)
  useFrame((_, dt) => {
    const atDrop = AL.drop && AL.inPhrase === 0 && AL.beat < 0.25
    const ending = AL.drop && AL.inPhrase >= 14
    const target = atDrop ? 1 : ending ? (AL.beat < 0.5 ? 0.9 : 0.2) : 0
    v.current = target > v.current ? target : Math.max(0, v.current - dt * 2.5)
    const k = AL.calm ? Math.min(v.current, 0.25) : v.current
    lamp.color.setRGB(1, 0.85, 0.63).multiplyScalar(0.12 + k * 3)
    glow.opacity = k * 0.9
  })
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, y, z]}>
          <mesh material={black}>
            <boxGeometry args={[0.6, 0.3, 0.16]} />
          </mesh>
          {[-0.14, 0.14].map((dx) => (
            <group key={dx} position={[dx, 0, 0.081]}>
              <mesh material={lamp}>
                <circleGeometry args={[0.1, 20]} />
              </mesh>
              <mesh position={[0, 0, 0.01]} material={glow}>
                <planeGeometry args={[0.9, 0.9]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

// ---------- LED ビジョンの横の白いピクセルの柱（トラスの柱に付ける） ----------
const pixelFrag = /* glsl */ `
uniform float uBeat, uBeatCount, uDrop, uCalm, uTime;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float n = 28.0;
  float i = floor(vUv.y * n);
  float f = fract(vUv.y * n);
  float d = smoothstep(0.42, 0.3, length(vec2((vUv.x - 0.5) * 0.35, f - 0.5)));
  // ふだんは拍ごとに下から上へ走る。ドロップはランダムに瞬く（弱める設定ではゆっくり）
  float chase = smoothstep(0.25, 0.0, abs(fract(uBeat) - i / n));
  float sparkle = step(0.82, hash(vec2(i, floor(uTime * mix(16.0, 3.0, uCalm)))));
  float v = mix(chase, sparkle, uDrop);
  gl_FragColor = vec4(vec3(1.0) * (0.06 + v * 1.4) * d, 1.0);
}`
const PixelBar: React.FC<{ p: V3; h: number }> = ({ p, h }) => {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: ledVert,
        fragmentShader: pixelFrag,
        toneMapped: false,
        uniforms: { uBeat: { value: 0 }, uBeatCount: { value: 0 }, uDrop: { value: 0 }, uCalm: { value: 0 }, uTime: { value: 0 } },
      }),
    []
  )
  useFrame(({ clock }) => {
    const u = mat.uniforms
    u.uBeat.value = AL.beat
    u.uBeatCount.value = AL.beatCount
    u.uDrop.value = AL.drop ? 1 : 0
    u.uCalm.value = AL.calm ? 1 : 0
    u.uTime.value = clock.elapsedTime
  })
  return (
    <group position={p}>
      <mesh position={[0, 0, -0.03]} material={black}>
        <boxGeometry args={[0.14, h + 0.06, 0.05]} />
      </mesh>
      <mesh material={mat}>
        <planeGeometry args={[0.1, h]} />
      </mesh>
    </group>
  )
}

// ---------- ミラーボール（回る光の粒を壁・床・天井に映す。ブレイクでよく見える） ----------
const DOTS = 160
const MirrorBall: React.FC<{ p: V3 }> = ({ p }) => {
  const ref = useRef<InstancedMesh>(null)
  const ball = useRef<Group>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ map: glowTex(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }), [])
  const ballMat = useMemo(() => new MeshStandardMaterial({ color: '#d8d8d8', metalness: 0.55, roughness: 0.2, flatShading: true }), [])
  const dirs = useMemo(() => {
    let s = 11
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: DOTS }, () => {
      const y = r() * 1.6 - 0.9
      const a = r() * Math.PI * 2
      const q = Math.sqrt(1 - y * y)
      return new Vector3(Math.cos(a) * q, y, Math.sin(a) * q)
    })
  }, [])
  const o = useMemo(() => new Object3D(), [])
  const d = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const ang = clock.elapsedTime * 0.35
    if (ball.current) ball.current.rotation.y = ang
    mat.opacity = !AL.playing ? 0.5 : AL.brk ? 0.9 : AL.drop ? 0.15 : 0.35
    mat.color.copy(WHITE).lerp(AL.colA, 0.25)
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    dirs.forEach((v, k) => {
      d.set(v.x * c + v.z * sn, v.y, -v.x * sn + v.z * c)
      // 部屋の箱の内側のどこに当たるか
      const tx = d.x > 0 ? (RW / 2 - 0.02 - p[0]) / d.x : (-RW / 2 + 0.02 - p[0]) / d.x
      const ty = d.y > 0 ? (RH - 0.02 - p[1]) / d.y : (0.02 - p[1]) / d.y
      const tz = d.z > 0 ? (RD / 2 - 0.02 - p[2]) / d.z : (-RD / 2 + 0.02 - p[2]) / d.z
      const t = Math.min(tx, ty, tz)
      o.position.set(p[0] + d.x * t, p[1] + d.y * t, p[2] + d.z * t)
      if (t === tx) o.rotation.set(0, Math.PI / 2, 0)
      else if (t === ty) o.rotation.set(Math.PI / 2, 0, 0)
      else o.rotation.set(0, 0, 0)
      o.scale.setScalar(0.06 + t * 0.012)
      o.updateMatrix()
      m.setMatrixAt(k, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <mesh position={[p[0], (RH + p[1]) / 2 + 0.15, p[2]]} material={metal}>
        <cylinderGeometry args={[0.006, 0.006, RH - p[1] - 0.3, 6]} />
      </mesh>
      <group ref={ball} position={p}>
        <mesh material={ballMat}>
          <sphereGeometry args={[0.28, 22, 14]} />
        </mesh>
      </group>
      <instancedMesh ref={ref} args={[undefined, mat, DOTS]}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
    </group>
  )
}

// ---------- DJ 台の前面の LED パネル（名前のカードと曲名が流れる。アルミの枠） ----------
const boothFrag = /* glsl */ `
uniform float uBeat, uBeatCount, uTime, uBass, uCalm;
uniform vec3 uColA;
uniform sampler2D uCard, uTitle;
varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  float pulse = pow(1.0 - uBeat, 3.0);
  vec3 c = vec3(0.0);
  // 32 拍ごとに名前のカードと曲名を入れ替える
  float which = mod(floor(uBeatCount / 32.0), 2.0);
  if (which < 0.5) {
    vec2 q = vec2(uv.x, (uv.y - 0.5) * 1.15 + 0.5);
    c = mix(c, vec3(1.0), texture2D(uCard, q).a);
  } else {
    float a = texture2D(uTitle, vec2(fract(uv.x * 0.45 - uTime * 0.1), (uv.y - 0.2) / 0.6)).a * step(0.2, uv.y) * step(uv.y, 0.8);
    c = mix(c, vec3(1.0), a);
  }
  // 上下のライムの帯（低音で太くなる）
  float band = step(uv.y, 0.05 + 0.05 * uBass) + step(0.95 - 0.05 * uBass, uv.y);
  c = mix(c, uColA, min(band, 1.0));
  c += uColA * pulse * 0.15 * (1.0 - uCalm);
  vec2 grid = fract(vUv * vec2(240.0, 86.0)) - 0.5;
  c *= 0.5 + 0.7 * smoothstep(0.55, 0.3, length(grid));
  gl_FragColor = vec4(c, 1.0);
}`
const BoothFront: React.FC = () => {
  const title = useTitleTexture()
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: ledVert,
        fragmentShader: boothFrag,
        toneMapped: false,
        uniforms: {
          uBeat: { value: 0 },
          uBeatCount: { value: 0 },
          uTime: { value: 0 },
          uBass: { value: 0 },
          uCalm: { value: 0 },
          uColA: { value: new Color() },
          uCard: { value: cardTex() },
          uTitle: { value: title },
        },
      }),
    [title]
  )
  useFrame(({ clock }) => {
    const u = mat.uniforms
    u.uBeat.value = AL.beat
    u.uBeatCount.value = AL.beatCount
    u.uTime.value = clock.elapsedTime
    u.uBass.value = AL.bands[0]
    u.uCalm.value = AL.calm ? 1 : 0
    u.uColA.value.copy(AL.colA)
  })
  const w = BOOTH.tableW - 0.06
  const h = BOOTH.tableH - 0.1
  const z = BOOTH.z + BOOTH.tableD / 2 + 0.006
  return (
    <group position={[0, BOOTH.tableH / 2, z]}>
      <mesh material={mat}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {[h / 2 + 0.02, -h / 2 - 0.02].map((y) => (
        <mesh key={y} position={[0, y, 0.005]} material={metal}>
          <boxGeometry args={[w + 0.08, 0.04, 0.03]} />
        </mesh>
      ))}
      {[w / 2 + 0.02, -w / 2 - 0.02].map((x) => (
        <mesh key={x} position={[x, 0, 0.005]} material={metal}>
          <boxGeometry args={[0.04, h + 0.08, 0.03]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------- 全体 ----------
export const Stage: React.FC = () => {
  const trussY = RH - 0.45
  const frontZ = BOOTH.z - 1.4
  const midZ = 0.5
  const heads = [-5.2, -3.1, -1.05, 1.05, 3.1, 5.2]
  return (
    <group>
      <LedWall />
      <WallTubes />
      {/* ステージの上のトラスと左右の柱、客席の上のトラス */}
      <Truss from={[-RW / 2 + 0.4, trussY, frontZ]} to={[RW / 2 - 0.4, trussY, frontZ]} />
      <Truss from={[-RW / 2 + 0.4, 0, frontZ]} to={[-RW / 2 + 0.4, trussY - 0.15, frontZ]} />
      <Truss from={[RW / 2 - 0.4, 0, frontZ]} to={[RW / 2 - 0.4, trussY - 0.15, frontZ]} />
      <Truss from={[-RW / 2 + 0.4, trussY, midZ]} to={[RW / 2 - 0.4, trussY, midZ]} />
      {heads.map((x, k) => (
        <MovingHead key={x} p={[x, trussY - 0.15, frontZ]} k={k} n={heads.length} facing={1} />
      ))}
      {[-4.2, -1.4, 1.4, 4.2].map((x, k) => (
        <MovingHead key={`m${x}`} p={[x, trussY - 0.15, midZ]} k={k} n={4} facing={-1} />
      ))}
      <Lasers p={[0, trussY - 0.25, frontZ + 0.2]} kind="top" />
      {/* DJ 台の角の床から V 字に、横の壁から反対の壁へ */}
      <Lasers p={[-1.45, 0.08, BOOTH.z + 0.45]} r={[-1.05, 0, 0]} kind="floor" mirror={-1} />
      <Lasers p={[1.45, 0.08, BOOTH.z + 0.45]} r={[-1.05, 0, 0]} kind="floor" mirror={1} />
      <Lasers p={[-RW / 2 + 0.2, 3.9, -1.5]} r={[0, Math.PI / 2, 0]} kind="side" />
      <Lasers p={[RW / 2 - 0.2, 3.9, 1.5]} r={[0, -Math.PI / 2, 0]} kind="side" />
      <Blinders xs={[-5.3, -3.2, 0, 3.2, 5.3]} y={trussY - 0.02} z={frontZ + 0.3} />
      <PixelBar p={[-RW / 2 + 0.4, 2.15, frontZ + 0.2]} h={3.6} />
      <PixelBar p={[RW / 2 - 0.4, 2.15, frontZ + 0.2]} h={3.6} />
      <MirrorBall p={[0, RH - 0.75, 2.6]} />
      <BoothFront />
      <Strobes xs={[-4.15, -2.1, 2.1, 4.15]} y={trussY + 0.24} z={frontZ} />
      {/* LED のパー: ステージ上のトラスから DJ を照らす 2 台、LED ビジョンの下から客席へ 4 台、客席の上のトラスに 2 台 */}
      <Par p={[-0.8, trussY - 0.35, frontZ + 0.25]} target={[0, 1.4, BOOTH.z - 0.6]} band={0} spot />
      <Par p={[0.8, trussY - 0.35, frontZ + 0.25]} target={[0, 1.4, BOOTH.z - 0.6]} band={1} alt spot />
      {[-5.5, -3.5, 3.5, 5.5].map((x, k) => (
        <Par key={x} p={[x, 0.35, -RD / 2 + 0.5]} target={[x * 0.5, 3.5, 2]} band={k % 2} alt={k % 2 === 1} />
      ))}
      <Par p={[-3.2, trussY - 0.35, midZ - 0.2]} target={[-1, 0, BOOTH.z - 1]} band={2} spot />
      <Par p={[3.2, trussY - 0.35, midZ - 0.2]} target={[1, 0, BOOTH.z - 1]} band={2} alt spot />
      <BoothDressing />
    </group>
  )
}
