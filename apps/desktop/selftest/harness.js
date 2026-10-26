// 自己テストの共通部分: 結果を集めて、メインプロセスが読む形（コンソールの 1 行）で報告する

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function createHarness(name) {
  const failures = []
  const notes = {}
  const t0 = performance.now()
  let reported = false
  const status = document.getElementById('status')
  const show = (s) => {
    if (status) status.textContent = s
  }
  const expect = (cond, label) => {
    if (!cond) failures.push(label)
    return !!cond
  }
  window.addEventListener('error', (e) => failures.push('page error: ' + e.message))
  window.addEventListener('unhandledrejection', (e) => failures.push('unhandled rejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)))
  const report = (extra = {}) => {
    if (reported) return
    reported = true
    const result = { name, ok: failures.length === 0, failures, seconds: +((performance.now() - t0) / 1000).toFixed(2), ...notes, ...extra }
    show(`${name}: ${result.ok ? 'PASS' : 'FAIL'}\n${failures.join('\n')}`)
    console.log('[TenTenV selftest] RESULT ' + JSON.stringify(result))
  }
  const fail = (err) => {
    failures.push('exception: ' + ((err && (err.stack || err.message)) || err))
    report()
  }
  return { expect, report, fail, notes, show }
}

/** 色が近いか（各成分の差が tol 以下） */
export const near = (a, b, tol) => Array.isArray(a) && a.length >= 3 && [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= tol)

/**
 * 入力の観察（クライアントの readXrInput と同じ読み方）
 * @returns 観察結果を書き込むオブジェクト
 */
export function createInputProbe() {
  const seen = {
    controllerFrames: 0,
    handFrames: 0,
    gripPoses: 0,
    rayPoses: 0,
    jointPoses: 0,
    fillPosesOk: 0,
    buttons: 0,
    axes: 0,
    mapping: null,
    profiles: [],
    triggerPressed: false,
    stickMoved: false,
    primaryPressed: false,
    pinchTip: null,
    bodyTrackerFrames: 0,
  }
  const sample = (frame, ref, session) => {
    // TenTenV の拡張: 体のトラッカー（疑似 HMD は腰・両足を出す）
    const ex = frame.__ttvExtra && frame.__ttvExtra(ref)
    if (ex && ex.trackers.length === 3 && ex.trackers.every((m) => m && m.length === 16)) seen.bodyTrackerFrames++
    for (const src of session.inputSources) {
      if (src.gripSpace && frame.getPose(src.gripSpace, ref)) seen.gripPoses++
      if (frame.getPose(src.targetRaySpace, ref)) seen.rayPoses++
      for (const p of src.profiles) if (!seen.profiles.includes(p)) seen.profiles.push(p)
      if (src.hand) {
        seen.handFrames++
        const tip = src.hand.get('index-finger-tip')
        const pose = tip && frame.getJointPose(tip, ref)
        if (pose && pose.radius > 0) seen.jointPoses++
        const out = new Float32Array(25 * 16)
        if (frame.fillPoses([...src.hand.values()], ref, out)) seen.fillPosesOk++
        continue
      }
      const gp = src.gamepad
      if (!gp) continue
      seen.controllerFrames++
      seen.mapping = gp.mapping
      seen.buttons = gp.buttons.length
      seen.axes = gp.axes.length
      if (gp.buttons[0].pressed) seen.triggerPressed = true
      if (gp.buttons[4].pressed) seen.primaryPressed = true
      if (Math.abs(gp.axes[2]) > 0.3 || Math.abs(gp.axes[3]) > 0.3) seen.stickMoved = true
    }
  }
  return { seen, sample }
}
