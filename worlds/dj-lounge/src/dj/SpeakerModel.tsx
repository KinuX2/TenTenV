import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, DoubleSide, ExtrudeGeometry, type Group, MeshStandardMaterial, RepeatWrapping, Shape, SRGBColorSpace } from 'three'
import { AL } from './audiolink'

// PA スピーカーの見た目: 18 インチのサブウーファー 2 台の上に、12 インチ＋ホーンのトップ（台形の箱）。
// 前面はパンチングメタルのグリル（穴から振動板が見える）。振動板は帯域の強さで前後する。
// 実在の製品やロゴは写さない。原点は床、正面は +Z

// ---------- 材質（テクスチャはその場で描く） ----------
const canvasTex = (size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, color = true) => {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  if (color) t.colorSpace = SRGBColorSpace
  return t
}
let mats: ReturnType<typeof makeMats> | null = null
const makeMats = () => {
  // 箱の塗装（ポリウレア塗装のザラザラ）
  const speckle = canvasTex(256, (g, s) => {
    g.fillStyle = '#1d1d1d'
    g.fillRect(0, 0, s, s)
    for (let k = 0; k < 9000; k++) {
      const v = 18 + Math.random() * 30
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5)
    }
  })
  speckle.repeat.set(3, 3)
  // グリル: 丸い穴を千鳥に並べる（透明の所が穴）
  const grille = canvasTex(
    128,
    (g, s) => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, s, s)
      g.globalCompositeOperation = 'destination-out'
      const n = 8
      const step = s / n
      for (let y = 0; y <= n; y++) {
        for (let x = 0; x <= n; x++) {
          g.beginPath()
          g.arc(x * step + (y % 2 ? step / 2 : 0), y * step, step * 0.36, 0, Math.PI * 2)
          g.fill()
        }
      }
    },
    false
  )
  // 振動板（紙のコーンの放射状のすじ）
  const paper = canvasTex(256, (g, s) => {
    g.fillStyle = '#121212'
    g.fillRect(0, 0, s, s)
    for (let k = 0; k < 80; k++) {
      g.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`
      g.beginPath()
      g.moveTo((k / 80) * s, 0)
      g.lineTo((k / 80) * s, s)
      g.stroke()
    }
  })
  return {
    cab: new MeshStandardMaterial({ color: '#ffffff', map: speckle, roughness: 0.92, metalness: 0.05 }),
    grille: (rx: number, ry: number) => {
      const t = grille.clone()
      t.repeat.set(rx, ry)
      t.needsUpdate = true
      return new MeshStandardMaterial({ color: '#2b2b2b', alphaMap: t, alphaTest: 0.5, roughness: 0.45, metalness: 0.7, side: DoubleSide })
    },
    frame: new MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.4, metalness: 0.8 }),
    steel: new MeshStandardMaterial({ color: '#8a8a8a', roughness: 0.3, metalness: 0.9 }),
    cone: new MeshStandardMaterial({ color: '#ffffff', map: paper, roughness: 0.95, side: DoubleSide }),
    rubber: new MeshStandardMaterial({ color: '#0c0c0c', roughness: 0.75 }),
    hole: new MeshStandardMaterial({ color: '#040404', roughness: 1 }),
    horn: new MeshStandardMaterial({ color: '#151515', roughness: 0.6, side: DoubleSide }),
    jack: new MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.5, metalness: 0.6 }),
    jackBlue: new MeshStandardMaterial({ color: '#2a4a8a', roughness: 0.5 }),
  }
}
const M = () => (mats ??= makeMats())

// ---------- ユニット（フレーム・エッジ・コーン・センターキャップ） ----------
const Driver: React.FC<{ r: number; z: number; drive: () => number; travel: number }> = ({ r, z, drive, travel }) => {
  const moving = useRef<Group>(null)
  useFrame(() => {
    if (moving.current) moving.current.position.z = drive() * travel
  })
  const m = M()
  return (
    <group position={[0, 0, z]}>
      {/* 金属のフレームとねじ */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.frame}>
        <cylinderGeometry args={[r + 0.03, r + 0.03, 0.012, 40, 1, true]} />
      </mesh>
      <mesh material={m.frame}>
        <ringGeometry args={[r * 0.98, r + 0.03, 40]} />
      </mesh>
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8
        return (
          <mesh key={k} position={[Math.cos(a) * (r + 0.015), Math.sin(a) * (r + 0.015), 0.006]} rotation={[Math.PI / 2, 0, 0]} material={m.steel}>
            <cylinderGeometry args={[0.006, 0.006, 0.006, 8]} />
          </mesh>
        )
      })}
      <group ref={moving}>
        {/* ロールエッジ */}
        <mesh material={m.rubber} scale={[1, 1, 0.6]}>
          <torusGeometry args={[r * 0.9, r * 0.07, 8, 40]} />
        </mesh>
        {/* コーン（奥へ向かってすぼまる） */}
        <mesh position={[0, 0, -r * 0.14]} rotation={[-Math.PI / 2, 0, 0]} material={m.cone}>
          <cylinderGeometry args={[r * 0.84, r * 0.3, r * 0.28, 40, 1, true]} />
        </mesh>
        {/* センターキャップ */}
        <mesh position={[0, 0, -r * 0.28]} scale={[1, 1, 0.45]} material={m.rubber}>
          <sphereGeometry args={[r * 0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
    </group>
  )
}

// ---------- 箱の小物 ----------
const Corners: React.FC<{ w: number; h: number; d: number }> = ({ w, h, d }) => {
  const m = M()
  const s = 0.05
  return (
    <>
      {[-1, 1].flatMap((x) =>
        [-1, 1].flatMap((y) =>
          [-1, 1].map((z) => (
            <mesh key={`${x}${y}${z}`} position={[(x * (w - s)) / 2 + x * 0.004, (y * (h - s)) / 2 + y * 0.004, (z * (d - s)) / 2 + z * 0.004]} material={m.steel}>
              <boxGeometry args={[s, s, s]} />
            </mesh>
          ))
        )
      )}
    </>
  )
}
// 側面の取っ手（くぼみと金属のバー）
const Handle: React.FC<{ x: number; y: number; side: 1 | -1 }> = ({ x, y, side }) => {
  const m = M()
  return (
    <group position={[x, y, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
      <mesh position={[0, 0, -0.012]} material={m.hole}>
        <planeGeometry args={[0.2, 0.09]} />
      </mesh>
      <mesh position={[0, 0, -0.004]} material={m.frame}>
        <ringGeometry args={[0.06, 0.075, 4, 1, Math.PI / 4]} />
      </mesh>
      <mesh position={[0, 0.005, 0.0]} rotation={[0, 0, Math.PI / 2]} material={m.steel}>
        <cylinderGeometry args={[0.009, 0.009, 0.16, 8]} />
      </mesh>
    </group>
  )
}
// 背面の端子板（スピコン 2 個）
const JackPlate: React.FC<{ y: number; z: number }> = ({ y, z }) => {
  const m = M()
  return (
    <group position={[0, y, z]} rotation={[0, Math.PI, 0]}>
      <mesh material={m.frame}>
        <boxGeometry args={[0.14, 0.2, 0.006]} />
      </mesh>
      {[0.045, -0.045].map((yy) => (
        <group key={yy} position={[0, yy, 0.008]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={m.jack}>
            <cylinderGeometry args={[0.024, 0.024, 0.012, 20]} />
          </mesh>
          <mesh position={[0, 0, 0.007]} material={m.jackBlue}>
            <circleGeometry args={[0.016, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 前面の縁（箱の本体は少し奥で終わり、その前に 4 辺の縁を立ててユニットを奥に収める）
const RECESS = 0.08
const Lip: React.FC<{ w: number; h: number; z: number }> = ({ w, h, z }) => {
  const m = M()
  const t = 0.035
  return (
    <group position={[0, 0, z - RECESS / 2]}>
      <mesh position={[0, h / 2 - t / 2, 0]} material={m.cab}>
        <boxGeometry args={[w, t, RECESS]} />
      </mesh>
      <mesh position={[0, -h / 2 + t / 2, 0]} material={m.cab}>
        <boxGeometry args={[w, t, RECESS]} />
      </mesh>
      <mesh position={[w / 2 - t / 2, 0, 0]} material={m.cab}>
        <boxGeometry args={[t, h, RECESS]} />
      </mesh>
      <mesh position={[-w / 2 + t / 2, 0, 0]} material={m.cab}>
        <boxGeometry args={[t, h, RECESS]} />
      </mesh>
    </group>
  )
}

// ---------- サブウーファー（18 インチ、下にバスレフのポート 2 本） ----------
const SUB = { w: 0.78, h: 0.6, d: 0.74 }
const Sub: React.FC<{ y: number }> = ({ y }) => {
  const m = M()
  const grille = useMemo(() => m.grille(14, 11), [m])
  const { w, h, d } = SUB
  const fz = d / 2
  return (
    <group position={[0, y + h / 2, 0]}>
      {/* 本体（前面は RECESS だけ奥）と前の縁 */}
      <RoundedBox args={[w, h, d - RECESS]} position={[0, 0, -RECESS / 2]} radius={0.018} smoothness={3} material={m.cab} />
      <Lip w={w} h={h} z={fz} />
      {/* バッフル（ユニットを取り付ける奥の板） */}
      <mesh position={[0, 0, fz - RECESS + 0.001]} material={m.hole}>
        <planeGeometry args={[w - 0.06, h - 0.06]} />
      </mesh>
      {/* ユニット（少し上寄り） */}
      <group position={[0, 0.05, 0]}>
        <Driver r={0.2} z={fz - RECESS + 0.065} drive={() => AL.bands[0] * AL.bands[0]} travel={0.02} />
      </group>
      {/* バスレフのポート */}
      {[-0.25, 0.25].map((x) => (
        <group key={x} position={[x, -0.2, fz - RECESS + 0.003]}>
          <mesh position={[0, 0, 0.002]} material={m.rubber}>
            <planeGeometry args={[0.18, 0.08]} />
          </mesh>
          <mesh position={[0, 0, 0.001]} material={m.hole} scale={[0.85, 0.6, 1]}>
            <planeGeometry args={[0.18, 0.08]} />
          </mesh>
        </group>
      ))}
      {/* グリル（枠の内側） */}
      <mesh position={[0, 0, fz + 0.002]} material={grille}>
        <planeGeometry args={[w - 0.05, h - 0.05]} />
      </mesh>
      {/* 側面の取っ手、角の金具、背面の端子 */}
      <Handle x={-w / 2 - 0.001} y={0.08} side={-1} />
      <Handle x={w / 2 + 0.001} y={0.08} side={1} />
      <Corners w={w} h={h} d={d} />
      <JackPlate y={0} z={-d / 2 - 0.004} />
    </group>
  )
}

// ---------- トップ（12 インチ＋ホーン。上から見ると台形の箱、少し下を向ける） ----------
const TOP = { w: 0.46, h: 0.7, d: 0.42, back: 0.62 }
const useTopGeometry = () =>
  useMemo(() => {
    const { w, d, back } = TOP
    // 上から見た形（x, z）。前が広く後ろが狭い
    const s = new Shape()
    const f = d / 2 - RECESS
    s.moveTo(-w / 2, f)
    s.lineTo(w / 2, f)
    s.lineTo((w * back) / 2, -d / 2)
    s.lineTo((-w * back) / 2, -d / 2)
    s.closePath()
    const g = new ExtrudeGeometry(s, { depth: TOP.h, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 })
    // 押し出しの向き（+Z）を上（+Y）にする。形の y が奥行きになる
    g.rotateX(-Math.PI / 2)
    g.translate(0, -TOP.h / 2, 0)
    g.scale(1, 1, -1)
    g.computeVertexNormals()
    return g
  }, [])
const Top: React.FC<{ y: number }> = ({ y }) => {
  const m = M()
  const geom = useTopGeometry()
  const grille = useMemo(() => m.grille(9, 13), [m])
  const { w, h, d } = TOP
  const fz = d / 2 + 0.012
  return (
    <group position={[0, y + h / 2, 0]} rotation={[-0.06, 0, 0]}>
      <mesh geometry={geom} material={m.cab} />
      <Lip w={w + 0.024} h={h + 0.024} z={fz} />
      <mesh position={[0, 0, fz - RECESS + 0.001]} material={m.hole}>
        <planeGeometry args={[w - 0.04, h - 0.04]} />
      </mesh>
      {/* 下に 12 インチ、上にホーン（横に広い四角いラッパ） */}
      <group position={[0, -0.13, 0]}>
        <Driver r={0.14} z={fz - RECESS + 0.05} drive={() => AL.bands[1]} travel={0.008} />
      </group>
      <group position={[0, 0.2, fz - RECESS + 0.125]}>
        <mesh rotation={[Math.PI / 2, Math.PI / 4, 0]} scale={[1.55, 1, 0.75]} position={[0, 0, -0.06]} material={m.horn}>
          <cylinderGeometry args={[0.025, 0.2, 0.12, 4, 1, true]} />
        </mesh>
        <mesh position={[0, 0, -0.115]} material={m.hole}>
          <circleGeometry args={[0.03, 16]} />
        </mesh>
      </group>
      <mesh position={[0, 0, fz + 0.002]} material={grille}>
        <planeGeometry args={[w - 0.04, h - 0.04]} />
      </mesh>
      {/* 吊り下げ用のレール（側面の上下） */}
      {[-1, 1].map((sx) =>
        [h / 2 - 0.06, -h / 2 + 0.06].map((yy) => (
          <mesh key={`${sx}${yy}`} position={[sx * ((w * (1 + TOP.back)) / 4 + 0.012), yy, 0]} rotation={[0, sx * Math.atan2((w * (1 - TOP.back)) / 2, d), 0]} material={m.steel}>
            <boxGeometry args={[0.012, 0.025, d * 0.9]} />
          </mesh>
        ))
      )}
      <JackPlate y={-0.1} z={-d / 2 - 0.016} />
    </group>
  )
}

// ---------- ケーブル（背面の端子から床へ） ----------
const Cable: React.FC<{ from: [number, number, number] }> = ({ from }) => {
  const m = M()
  const len = from[1]
  return (
    <group position={[from[0], 0, from[2] - 0.05]}>
      <mesh position={[0, len / 2, 0]} material={m.rubber}>
        <cylinderGeometry args={[0.009, 0.009, len, 8]} />
      </mesh>
      <mesh position={[0, 0.012, -0.25]} rotation={[Math.PI / 2, 0, 0]} material={m.rubber}>
        <cylinderGeometry args={[0.009, 0.009, 0.5, 8]} />
      </mesh>
    </group>
  )
}

export const SPEAKER_HEIGHT = SUB.h * 2 + 0.03 + TOP.h
export const SpeakerModel: React.FC = () => {
  const m = M()
  return (
    <group>
      {/* ゴムの足 */}
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}${z}`} position={[x * (SUB.w / 2 - 0.08), 0.01, z * (SUB.d / 2 - 0.08)]} material={m.rubber}>
            <cylinderGeometry args={[0.035, 0.04, 0.02, 12]} />
          </mesh>
        ))
      )}
      <Sub y={0.02} />
      <Sub y={0.02 + SUB.h} />
      {/* サブとトップの間の滑り止めの板 */}
      <mesh position={[0, 0.02 + SUB.h * 2 + 0.005, 0]} material={m.rubber}>
        <boxGeometry args={[TOP.w * 0.9, 0.01, TOP.d * 0.8]} />
      </mesh>
      <Top y={0.03 + SUB.h * 2} />
      <Cable from={[0, 0.02 + SUB.h / 2, -SUB.d / 2]} />
      <Cable from={[0.04, 0.02 + SUB.h * 1.5, -SUB.d / 2]} />
    </group>
  )
}
