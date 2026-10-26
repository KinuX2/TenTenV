// 親サーバーの起動（npm start）
import './quiet'
import { App } from './app'
import { loadConfig } from './config'

const config = loadConfig()
const app = new App(config)
const { port } = await app.listen(config.port)
console.log(`TenTenV 親サーバー「${config.name}」を起動しました: http://localhost:${port}`)
console.log(`公開 URL: ${app.publicUrl}  データ: ${config.dataDir}  serverId: ${app.keys.serverId}`)

let closing = false
const shutdown = async () => {
  if (closing) return
  closing = true
  console.log('終了します…')
  await app.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
