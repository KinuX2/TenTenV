// OSC → WebSocket の中継（ブラウザで OSC のフェイストラッキングを使うため）
// ブラウザは UDP を受けられないので、PC で受けた OSC のパケットをそのまま ws://127.0.0.1:39570 へ流す
// （Windows 版は OSC を直接受けるので不要）
//
//   node scripts/osc-bridge.mjs [--port 9000] [--ws-port 39570] [--origin https://vr.example.com]
//
// --port    OSC を受ける UDP のポート（送り手の送り先に合わせる。アバターパラメーターは 9000、VMC は 39539 が多い）
// --origin  つないでよいページのオリジン（指定しなければどのページからでも）
import dgram from 'node:dgram'
import { WebSocketServer } from 'ws'

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const udpPort = Number(arg('port', 9000))
const wsPort = Number(arg('ws-port', 39570))
const origin = arg('origin', null)

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: wsPort,
  verifyClient: ({ origin: o }) => !origin || o === origin,
})
wss.on('connection', (ws, req) => console.log(`ページがつながりました（${req.headers.origin ?? '不明'}）`))

let count = 0
const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
udp.on('message', (msg) => {
  count++
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg)
})
udp.on('error', (e) => {
  console.error(`UDP ${udpPort} を開けません: ${e.message}`)
  process.exit(1)
})
udp.bind(udpPort, () => console.log(`OSC を UDP ${udpPort} で受け、ws://127.0.0.1:${wsPort} へ流します（Ctrl+C で終了）`))

setInterval(() => {
  if (count) console.log(`${count} パケット / 5 秒・つながっているページ ${wss.clients.size}`)
  count = 0
}, 5000)
