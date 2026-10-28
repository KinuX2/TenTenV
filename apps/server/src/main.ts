// 親サーバーの起動（npm start）
import './quiet'
import { App } from './app'
import { loadConfig } from './config'
import { logger } from './logger'

const config = loadConfig()
const app = new App(config)
const { port } = await app.listen(config.port)
logger.info('server.started', { name: config.name, port, publicUrl: app.publicUrl, dataDir: config.dataDir, serverId: app.keys.serverId })

let closing = false
const shutdown = async () => {
  if (closing) return
  closing = true
  logger.info('server.shutdown.signal_received')
  try {
    await app.close()
    process.exit(0)
  } catch (error) {
    logger.error('server.shutdown.failed', error)
    process.exit(1)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', reason)
})
process.on('uncaughtException', (error) => {
  logger.error('process.uncaught_exception', error)
  process.exit(1)
})
