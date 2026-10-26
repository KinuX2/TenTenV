// /api/info と認証（ゲスト・Misskey MiAuth・ログアウト）
import { PROTOCOL_VERSION, SDK_VERSION, type ServerInfo } from '@tentenv/protocol'
import type { App } from '../app'
import { bearer, checkDisplayName, createSession, createUser, deleteSession } from '../auth'
import { forbidden, readJson } from '../http'
import { finishMiAuth, startMiAuth } from '../misskey'
import { newId } from '../social'
import { meInfo } from '../views'
import { limitIp } from './util'
import { defaultHomeWorldId } from '../seed'

export const serverInfo = (app: App): ServerInfo => ({
  protocol: PROTOCOL_VERSION,
  name: app.config.name,
  description: app.config.description,
  termsUrl: app.config.termsUrl,
  publicKey: app.keys.publicKey,
  serverId: app.keys.serverId,
  auth: { guest: app.config.allowGuest, misskey: app.config.misskey.enabled, misskeyHosts: app.config.misskey.allowedHosts },
  limits: { ...app.config.limits },
  relay: app.config.relay,
  iceServers: app.config.iceServers,
  version: SDK_VERSION,
  defaultHomeWorldId: defaultHomeWorldId(app),
})

export const authRoutes = (app: App) => {
  const r = app.router

  r.get('/api/info', () => serverInfo(app))

  r.post('/api/auth/guest', async (req) => {
    if (!app.config.allowGuest) throw forbidden('このサーバーではゲストログインを使えません')
    limitIp(app, 'auth', req)
    const body = await readJson(req.raw, 4096)
    const displayName = checkDisplayName(body.displayName)
    const user = createUser(app, { handle: `guest:${newId(8)}`, displayName, iconUrl: null, isGuest: true })
    return { token: createSession(app, user.id), me: meInfo(app, user) }
  })

  r.post('/api/auth/misskey/start', async (req) => {
    limitIp(app, 'auth', req)
    const body = await readJson(req.raw, 4096)
    return startMiAuth(app, body.host, body.callback)
  })

  r.post('/api/auth/misskey/finish', async (req) => {
    limitIp(app, 'auth', req)
    const body = await readJson(req.raw, 4096)
    const user = await finishMiAuth(app, body.session, app.fetchImpl)
    if (user.banned) throw forbidden('このアカウントは利用停止されています')
    return { token: createSession(app, user.id), me: meInfo(app, user) }
  })

  r.post('/api/auth/logout', (req) => {
    const t = bearer(req)
    if (t) deleteSession(app, t)
  })
}
