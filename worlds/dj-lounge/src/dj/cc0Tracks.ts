// Tricks & Traps「Free Rhythm Game Music Pack 1 / 2」（OpenGameArt、CC0 1.0）の曲。BPM は配布ページの値。
// firstBeat は 1 拍目の位置（秒）。WAV から求め、MP3 にしたときの遅れ（1105 サンプル = 25.1ms、ブラウザで実測）を足してある。
// key は自動判定（目安）
// 曲のファイルは public の直下に置く（ワールドのアセット URL でそのまま読める）
export const CC0_TRACKS = [
  { title: "Ascend", file: 'track-ascend.mp3', bpm: 130, firstBeat: 0.0750, key: { tonic: 0, minor: false }, album: 1 },
  { title: "Drama", file: 'track-drama.mp3', bpm: 130, firstBeat: 0.0800, key: { tonic: 0, minor: false }, album: 2 },
  { title: "The Lab", file: 'track-the-lab.mp3', bpm: 144, firstBeat: 0.0301, key: { tonic: 2, minor: false }, album: 1 },
  { title: "Vessel of Eternity", file: 'track-vessel-of-eternity.mp3', bpm: 150, firstBeat: 0.1349, key: { tonic: 5, minor: true }, album: 1 },
  { title: "Mental Corruption", file: 'track-mental-corruption.mp3', bpm: 150, firstBeat: 0.0351, key: { tonic: 4, minor: true }, album: 2 },
  { title: "Logic or Emotions", file: 'track-logic-or-emotions.mp3', bpm: 151, firstBeat: 0.2795, key: { tonic: 5, minor: true }, album: 2 },
  { title: "Bow For Me", file: 'track-bow-for-me.mp3', bpm: 157, firstBeat: 0.3394, key: { tonic: 5, minor: true }, album: 1 },
  { title: "Stomper", file: 'track-stomper.mp3', bpm: 160, firstBeat: 0.2296, key: { tonic: 8, minor: true }, album: 2 },
  { title: "Ripped Apart", file: 'track-ripped-apart.mp3', bpm: 174, firstBeat: 0.2845, key: { tonic: 2, minor: false }, album: 2 },
  { title: "Passing Timeline", file: 'track-passing-timeline.mp3', bpm: 176, firstBeat: 0.2845, key: { tonic: 0, minor: false }, album: 1 },
  { title: "Glory Days", file: 'track-glory-days.mp3', bpm: 184, firstBeat: 0.0301, key: { tonic: 2, minor: false }, album: 1 },
  { title: "Psychic", file: 'track-psychic.mp3', bpm: 190, firstBeat: 0.1698, key: { tonic: 0, minor: false }, album: 1 },
  { title: "Celebration and Fear", file: 'track-celebration-and-fear.mp3', bpm: 190, firstBeat: 0.0600, key: { tonic: 5, minor: true }, album: 2 },
  { title: "What's Cooking?", file: 'track-whats-cooking.mp3', bpm: 190, firstBeat: 0.0251, key: { tonic: 2, minor: false }, album: 2 },
  { title: "Zen Devils", file: 'track-zen-devils.mp3', bpm: 205, firstBeat: 0.2496, key: { tonic: 0, minor: false }, album: 2 },
] as const
