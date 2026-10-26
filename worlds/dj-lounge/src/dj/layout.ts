// DJ コントローラーの配置（DDJ-400 と同じ並び）。ローカル座標: x 右、z 手前（DJ 側）、y 上。単位 m
// 実物（482 × 272 mm）の約 1.6 倍。VR のレイでも押しやすい大きさ
export const W = 0.76
export const D = 0.44
export const BODY_H = 0.045
export const TOP = BODY_H

export const deckX = (i: 0 | 1) => (i === 0 ? -0.235 : 0.235)
// デッキの外側の向き（デッキ 1 は左、デッキ 2 は右）
export const outer = (i: 0 | 1) => (i === 0 ? -1 : 1)

export const L = {
  fxRowZ: -0.19,
  loopRowZ: -0.145,
  loopX: [-0.095, -0.055, -0.015, 0.035, 0.07],
  jog: { z: -0.03, r: 0.075 },
  sync: { dx: 0.112, z: 0.035 },
  // ジョグの内側の列: MASTER TEMPO・KEY ▲▼・KEY SYNC（BEAT SYNC の上）
  key: { mtZ: -0.1, upZ: -0.068, downZ: -0.038, syncZ: -0.004 },
  tempo: { dx: 0.112, z0: -0.1, z1: 0.035 },
  left: { dx: -0.098, shiftZ: 0.085, cueZ: 0.125, playZ: 0.168 },
  modeZ: 0.085,
  padsZ: [0.125, 0.168],
  padX: (k: number) => -0.045 + k * 0.047,
  pad: { w: 0.04, d: 0.034 },
  mixer: {
    loadZ: -0.19,
    loadX: 0.06,
    trimZ: -0.145,
    eqZ: [-0.105, -0.07, -0.035],
    cfxZ: 0,
    knobX: 0.055,
    meterX: 0.018,
    meterZ0: -0.125,
    meterZ1: -0.005,
    faderZ0: 0.03,
    faderZ1: 0.13,
    xfZ: 0.178,
    xfX: 0.062,
  },
  fx: { beatL: 0.13, beatR: 0.165, select: 0.21, ch: 0.255, level: 0.305, on: 0.35 },
}
