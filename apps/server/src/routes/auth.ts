// /api/info と認証（Misskey MiAuth・Google・X・ログアウト）
import { PROTOCOL_VERSION, SDK_VERSION, type ServerInfo } from '@tentenv/protocol'
import type { App } from '../app'
import { bearer, createSession, deleteSession } from '../auth'
import { forbidden, readJson, Reply } from '../http'
import { finishMiAuth, startMiAuth } from '../misskey'
import { finishOAuth, oauthCallback, oauthEnabled, providerOf, startOAuth } from '../oauth'
import { meInfo } from '../views'
import { limitIp } from './util'
import { defaultHomeWorldId } from '../seed'
import { brandLogo } from '../files'

export const serverInfo = (app: App): ServerInfo => ({
  protocol: PROTOCOL_VERSION,
  name: app.config.name,
  description: app.config.description,
  branding: { siteName: app.config.branding.siteName, logoUrl: brandLogo(app.config.branding.logoFile) ? '/branding/logo' : null, logoLayout: app.config.branding.logoLayout },
  publicUrl: app.publicUrl,
  termsUrl: app.config.termsUrl,
  publicKey: app.keys.publicKey,
  serverId: app.keys.serverId,
  auth: { misskey: app.config.misskey.enabled, misskeyHosts: app.config.misskey.allowedHosts, google: oauthEnabled(app, 'google'), x: oauthEnabled(app, 'x') },
  limits: { ...app.config.limits },
  relay: app.config.relay,
  iceServers: app.config.iceServers,
  version: SDK_VERSION,
  defaultHomeWorldId: defaultHomeWorldId(app),
})

export const authRoutes = (app: App) => {
  const r = app.router

  r.get('/api/info', () => serverInfo(app))

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

  r.post('/api/auth/:provider/start', async (req) => {
    const p = providerOf(req.params.provider)
    limitIp(app, 'auth', req)
    const body = await readJson(req.raw, 4096)
    return startOAuth(app, p, body.callback)
  })

  r.get('/api/auth/:provider/callback', (req) => {
    const p = providerOf(req.params.provider)
    limitIp(app, 'auth', req)
    return oauthCallback(app, p, req.query)
  })

  r.post('/api/auth/:provider/finish', async (req) => {
    const p = providerOf(req.params.provider)
    limitIp(app, 'auth', req)
    const body = await readJson(req.raw, 4096)
    const user = await finishOAuth(app, p, body.session, app.fetchImpl)
    // まだ許可の画面から戻っていない
    if (!user) return new Reply(202, { pending: true })
    if (user.banned) throw forbidden('このアカウントは利用停止されています')
    return { token: createSession(app, user.id), me: meInfo(app, user) }
  })

  r.post('/api/auth/logout', (req) => {
    const t = bearer(req)
    if (t) deleteSession(app, t)
  })
}
