// ユーザー操作の瞬間に鳴らす短い UI 音。外部ファイルを読み込まず、必要になったときだけ生成する。
let context: AudioContext | null = null

export const playUiClick = () => {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume().catch(() => {})
    const at = context.currentTime
    const tone = context.createOscillator()
    const volume = context.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(660, at)
    tone.frequency.exponentialRampToValueAtTime(390, at + 0.055)
    volume.gain.setValueAtTime(0.027, at)
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.075)
    tone.connect(volume)
    volume.connect(context.destination)
    tone.start(at)
    tone.stop(at + 0.08)
    tone.onended = () => {
      tone.disconnect()
      volume.disconnect()
    }
  } catch {
    // 音声出力を利用できない環境でも操作は続けられる。
  }
}
