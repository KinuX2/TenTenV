// 自作のアイコン（絵文字は使わない）。24×24 の線画で、色は currentColor
// 3D の中（VR メニュー・名前表示）では iconTexture で画像にして使う

const P: Record<string, string> = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.8 13.6c2.4-.2 4.2 1.2 4.7 4.4"/>',
  user: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c.8-4.2 3.5-6.5 7-6.5s6.2 2.3 7 6.5"/>',
  avatar: '<circle cx="12" cy="5" r="2.6"/><path d="M12 8.5v6.5M7 10.5l5 1.5 5-1.5M9.5 21l2.5-6 2.5 6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  profile: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9.5" cy="11" r="2.4"/><path d="M5.8 17c.6-2 2-3 3.7-3s3.1 1 3.7 3M14.5 10h3.5M14.5 13.5h3.5"/>',
  tool: '<path d="M14.5 4.5a4 4 0 0 0 4.8 5.3l-8.8 8.8a2 2 0 0 1-2.9-2.9l8.8-8.8a4 4 0 0 0-1.9-2.4z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-5h4v5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M4 4l16 16"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  speakerOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  vr: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v6a2.5 2.5 0 0 1-2.5 2.5h-3.2l-1.6-2.4a2 2 0 0 0-3.4 0L8.7 17H5.5A2.5 2.5 0 0 1 3 14.5z"/><circle cx="8" cy="11.5" r="1.6"/><circle cx="16" cy="11.5" r="1.6"/>',
  pen: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><circle cx="12" cy="13" r="3.6"/>',
  selfie: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.2"/><circle cx="12" cy="10" r="2.2"/><path d="M9 15.5c.6-1.3 1.7-2 3-2s2.4.7 3 2M11 5h2"/>',
  drone: '<rect x="9" y="10" width="6" height="4.5" rx="1.2"/><path d="M9 11 5.5 8M15 11l3.5-3M9 13.5 5.5 16.5M15 13.5l3.5 3"/><path d="M2.5 7.5h6M15.5 7.5h6M2.5 17h6M15.5 17h6"/>',
  shutter: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
  mirror: '<ellipse cx="12" cy="10" rx="6" ry="7.5"/><path d="M12 17.5V21M8.5 21h7M9.5 7.5l2-2M10 11l4-4"/>',
  landscape: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  chat: '<path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5z"/>',
  warning: '<path d="M12 3.8 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 16.8v.2"/>',
  upload: '<path d="M12 16V4.5M7 9l5-5 5 5M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  download: '<path d="M12 4v11.5M7 11l5 5 5-5M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.6 6.7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  respawn: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  leave: '<path d="M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  shirt: '<path d="M8.5 4 4 6.5l1.8 4 2.2-.9V20h8V9.6l2.2.9 1.8-4L15.5 4a3.5 3.5 0 0 1-7 0z"/>',
  toggle: '<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2-5.2-1.8 5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5"/><circle cx="7" cy="11" r="1.8"/>',
  stand: '<circle cx="12" cy="4.8" r="2.2"/><path d="M12 7.5v7M8 10h8M9.5 21l2.5-6.5 2.5 6.5"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.6-2.2L3.7 15a1.5 1.5 0 0 1 2.3-1.9L8 15"/>',
  bug: '<rect x="7.5" y="8" width="9" height="11" rx="4.5"/><path d="M12 8v11M9 6l1 2M15 6l-1 2M4 11.5h3.5M16.5 11.5H20M4 16h3.5M16.5 16H20"/>',
  backspace: '<path d="M8.5 5.5H19a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H8.5L3 12z"/><path d="M11 9.5l5 5M16 9.5l-5 5"/>',
  door: '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M4 21h16"/><circle cx="14.5" cy="12.5" r="1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  emote: '<circle cx="12" cy="4.8" r="2.2"/><path d="M12 7.5 10.5 13l3 3-1 5M10.5 13 6 15M12.5 9.5l5-3M13.5 16l4.5 1.5"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.1M9 10h.1M12 10h.1M15 10h.1M18 10h.1M6 13h.1M18 13h.1M8.5 14.5h7"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/>',
  code: '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  server: '<rect x="4" y="4" width="16" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="16" height="6.5" rx="1.5"/><path d="M7.5 7.3h.1M7.5 16.8h.1M11 7.3h5.5M11 16.8h5.5"/>',
  windows: '<path d="M3.5 5.8 10.5 4.8v6.7h-7zM12.5 4.5l8-1.2v8.2h-8zM3.5 13.5h7v6.7l-7-1zM12.5 13.5h8v8.2l-8-1.2z"/>',
  browser: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18M6.5 6.8h.1M9 6.8h.1"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.2"/><path d="M11 18h2"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  github: '<path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.3 5.6-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.3 2.6 5.3 3 5.3 3a4.3 4.3 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.9 5.6 5.6 6a3 3 0 0 0-.8 2.3V21"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2 2M14.5 8.5l1.5 1.5"/>',
  layers: '<path d="M12 3.5 21 8.5l-9 5-9-5zM3 13l9 5 9-5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 15.8a4.8 4.8 0 0 1 6.4 0M12 19.2h.1"/>',
}

export type IconName = keyof typeof P

export const svgString = (name: string, color: string, stroke = 1.8, size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? P.dot}</svg>`

export const Icon: React.FC<{ name: IconName | string; size?: number; stroke?: number; className?: string; title?: string; style?: React.CSSProperties }> = ({ name, size = 20, stroke = 1.8, className, title, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ flex: 'none', ...style }}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
    dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + (P[name] ?? P.dot) }}
  />
)

// ---------- 表情のアイコン（顔の線画） ----------

const FACE_BASE = '<circle cx="12" cy="12" r="9"/>'
const FACES: Record<string, string> = {
  auto: FACE_BASE + '<path d="M8.5 10h.1M15.5 10h.1M8.5 14.5h7"/>',
  happy: FACE_BASE + '<path d="M7.5 10.5c.6-1.2 2-1.2 2.6 0M13.9 10.5c.6-1.2 2-1.2 2.6 0M8 14c1 2 2.4 3 4 3s3-1 4-3"/>',
  angry: FACE_BASE + '<path d="M7.5 8.5l3 1.5M16.5 8.5l-3 1.5M9 11.5h.1M15 11.5h.1M8.5 16.5c1-1.3 2.1-2 3.5-2s2.5.7 3.5 2"/>',
  sad: FACE_BASE + '<path d="M7.5 9.5l2.5-1M16.5 9.5l-2.5-1M9 11.8h.1M15 11.8h.1M8.5 17c1-1.5 2.1-2.2 3.5-2.2s2.5.7 3.5 2.2"/>',
  relaxed: FACE_BASE + '<path d="M7.5 11c.8.6 1.8.6 2.6 0M13.9 11c.8.6 1.8.6 2.6 0M9.5 15c1.6 1 3.4 1 5 0"/>',
  surprised: FACE_BASE + '<circle cx="9" cy="10" r="1.1"/><circle cx="15" cy="10" r="1.1"/><circle cx="12" cy="15.5" r="2"/>',
  blink: FACE_BASE + '<path d="M7.5 10.5h2.6M13.9 10.5h2.6M9.5 15h5"/>',
}
/** 表情のアイコンの SVG（3D のテクスチャ用） */
export const faceSvg = (face: string, color: string, size = 128) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${FACES[face] ?? FACES.auto}</svg>`
export const FaceIcon: React.FC<{ face: string; size?: number }> = ({ face, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: FACES[face] ?? FACES.auto }} />
)

// ---------- 手の形のアイコン（指の本数で表す） ----------

/** 手の甲と、伸ばした指（親指・人差し指・中指・薬指・小指）を線で描く */
const handSvg = (ext: [boolean, boolean, boolean, boolean, boolean]) => {
  const fingers = [
    { x: 6.5, len: 4.5, angle: -45 },
    { x: 9.3, len: 6.5, angle: -8 },
    { x: 12, len: 7, angle: 0 },
    { x: 14.7, len: 6.3, angle: 8 },
    { x: 17.2, len: 5, angle: 16 },
  ]
  let s = '<path d="M7 13.5v3.5a4.5 4.5 0 0 0 4.5 4.5h1a4.5 4.5 0 0 0 4.5-4.5v-4H7z"/>'
  fingers.forEach((f, i) => {
    const base = i === 0 ? { x: 7.2, y: 15.5 } : { x: f.x, y: 12.5 }
    const len = ext[i] ? f.len : 1.6
    const a = ((f.angle - 90) * Math.PI) / 180
    const x2 = base.x + Math.cos(a) * len
    const y2 = base.y + Math.sin(a) * len
    s += `<path d="M${base.x.toFixed(1)} ${base.y.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`
  })
  return s
}
const HANDS: Record<string, [boolean, boolean, boolean, boolean, boolean]> = {
  neutral: [true, true, true, true, true],
  fist: [false, false, false, false, false],
  open: [true, true, true, true, true],
  point: [false, true, false, false, false],
  victory: [false, true, true, false, false],
  rocknroll: [false, true, false, false, true],
  gun: [true, true, false, false, false],
  thumbsup: [true, false, false, false, false],
}
/** 手の形のアイコンの SVG（3D のテクスチャ用） */
export const handSvgString = (gesture: string, color: string, size = 128) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${handSvg(HANDS[gesture] ?? HANDS.neutral)}</svg>`
export const HandIcon: React.FC<{ gesture: string; size?: number }> = ({ gesture, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: handSvg(HANDS[gesture] ?? HANDS.neutral) }} />
)

// ---------- 頭上のリアクション（色つきの自作の図柄） ----------

export const REACTION_ART: Record<string, { label: string; labelEn: string; svg: string }> = {
  heart: { label: 'ハート', labelEn: 'Heart', svg: '<path d="M32 54S10 41 10 25a11 11 0 0 1 22-4 11 11 0 0 1 22 4c0 16-22 29-22 29z" fill="#ff5a8a" stroke="#fff" stroke-width="3"/>' },
  star: { label: '星', labelEn: 'Star', svg: '<path d="M32 7l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 24l16-2z" fill="#ffd040" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>' },
  sparkle: { label: 'キラキラ', labelEn: 'Sparkle', svg: '<path d="M26 8l4 13 13 4-13 4-4 13-4-13-13-4 13-4zM46 34l2.5 7 7 2.5-7 2.5L46 53l-2.5-7-7-2.5 7-2.5z" fill="#8ecbff" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' },
  smile: { label: 'にっこり', labelEn: 'Smile', svg: '<circle cx="32" cy="32" r="23" fill="#ffcf4a" stroke="#fff" stroke-width="3"/><path d="M22 27c1.5-3 5-3 6.5 0M35.5 27c1.5-3 5-3 6.5 0M21 37c3 6 7 9 11 9s8-3 11-9" fill="none" stroke="#5a3a10" stroke-width="3.2" stroke-linecap="round"/>' },
  laugh: { label: '大笑い', labelEn: 'Laugh', svg: '<circle cx="32" cy="32" r="23" fill="#ffcf4a" stroke="#fff" stroke-width="3"/><path d="M21 26l6 3-6 3M43 26l-6 3 6 3" fill="none" stroke="#5a3a10" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 37h26c-2 8-7 12-13 12s-11-4-13-12z" fill="#7a2a2a" stroke="#5a3a10" stroke-width="2.5" stroke-linejoin="round"/>' },
  wow: { label: 'びっくり', labelEn: 'Wow', svg: '<circle cx="32" cy="32" r="23" fill="#ffcf4a" stroke="#fff" stroke-width="3"/><circle cx="24" cy="27" r="3.2" fill="#5a3a10"/><circle cx="40" cy="27" r="3.2" fill="#5a3a10"/><ellipse cx="32" cy="42" rx="5" ry="6.5" fill="#7a2a2a"/>' },
  sad: { label: 'しょんぼり', labelEn: 'Sad', svg: '<circle cx="32" cy="32" r="23" fill="#9cc4ff" stroke="#fff" stroke-width="3"/><circle cx="24" cy="28" r="2.8" fill="#24345a"/><circle cx="40" cy="28" r="2.8" fill="#24345a"/><path d="M23 45c3-4 6-6 9-6s6 2 9 6" fill="none" stroke="#24345a" stroke-width="3.2" stroke-linecap="round"/><path d="M19 33c0 4 4 4 4 0l-2-5z" fill="#5ab0ff"/>' },
  angry: { label: 'ぷんぷん', labelEn: 'Angry', svg: '<circle cx="32" cy="32" r="23" fill="#ff7a5a" stroke="#fff" stroke-width="3"/><path d="M19 23l9 4M45 23l-9 4" stroke="#4a1a10" stroke-width="3.2" stroke-linecap="round"/><circle cx="25" cy="30.5" r="2.6" fill="#4a1a10"/><circle cx="39" cy="30.5" r="2.6" fill="#4a1a10"/><path d="M23 45c3-3 6-4 9-4s6 1 9 4" fill="none" stroke="#4a1a10" stroke-width="3.2" stroke-linecap="round"/>' },
  sleepy: { label: 'ねむい', labelEn: 'Sleepy', svg: '<path d="M14 18h14L14 34h14M34 34h10L34 46h10M46 10h8l-8 9h8" fill="none" stroke="#b8a6ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' },
  music: { label: '音符', labelEn: 'Music', svg: '<path d="M24 46V16l24-5v28" fill="none" stroke="#7be495" stroke-width="4" stroke-linejoin="round"/><ellipse cx="19" cy="46" rx="6" ry="5" fill="#7be495"/><ellipse cx="43" cy="40" rx="6" ry="5" fill="#7be495"/>' },
  flower: { label: '花', labelEn: 'Flower', svg: '<g fill="#ff9ccf" stroke="#fff" stroke-width="2.5"><circle cx="32" cy="17" r="9"/><circle cx="46" cy="28" r="9"/><circle cx="41" cy="45" r="9"/><circle cx="23" cy="45" r="9"/><circle cx="18" cy="28" r="9"/></g><circle cx="32" cy="32" r="7" fill="#ffd040" stroke="#fff" stroke-width="2.5"/>' },
  flame: { label: 'ほのお', labelEn: 'Flame', svg: '<path d="M32 6c3 10 16 16 16 30a16 16 0 0 1-32 0c0-8 5-12 7-17 2 5 4 7 6 8 1-9 3-15 3-21z" fill="#ff7a3a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M32 33c2 4 7 7 7 12a7 7 0 0 1-14 0c0-4 4-7 7-12z" fill="#ffd040"/>' },
  party: { label: 'おめでとう', labelEn: 'Party', svg: '<path d="M10 54l10-30 20 20z" fill="#b18cff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M34 22c4-6 10-6 12-12M40 30c6-2 10 2 16-2M30 16c0-4 2-7 0-10" fill="none" stroke="#ffd040" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="14" r="3" fill="#ff5a8a"/><circle cx="54" cy="40" r="3" fill="#5ac8fa"/><circle cx="24" cy="10" r="3" fill="#7be495"/>' },
  like: { label: 'いいね', labelEn: 'Like', svg: '<circle cx="32" cy="32" r="23" fill="#5b8cff" stroke="#fff" stroke-width="3"/><path d="M20 33l8 8 16-17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' },
  question: { label: 'はてな', labelEn: 'Question', svg: '<path d="M22 22a10 10 0 1 1 15 8.5c-3 2-5 3.5-5 7.5" fill="none" stroke="#5ac8fa" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="50" r="4" fill="#5ac8fa"/>' },
  exclaim: { label: 'びっくりマーク', labelEn: 'Exclaim', svg: '<path d="M32 10v28" stroke="#ff5a5a" stroke-width="8" stroke-linecap="round"/><circle cx="32" cy="51" r="5" fill="#ff5a5a"/>' },
}
export const REACTION_IDS = Object.keys(REACTION_ART)

export const reactionSvg = (id: string, size = 128) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${REACTION_ART[id]?.svg ?? ''}</svg>`

export const ReactionIcon: React.FC<{ id: string; size?: number }> = ({ id, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden dangerouslySetInnerHTML={{ __html: REACTION_ART[id]?.svg ?? '' }} />
)

