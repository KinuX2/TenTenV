/** ブラウザテストに、Misskey で取得済みのログイントークンを渡す。 */
const used = new Map()

export const prepareTestLogin = async (context, name, target, serverOverride) => {
  const url = new URL(target)
  const server = (url.searchParams.get('server') ?? serverOverride ?? process.env.E2E_SERVER ?? (url.port === '5190' ? `${url.protocol}//${url.hostname}:8787` : url.origin)).replace(/\/+$/, '')
  const key = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const token = process.env[`TTV_E2E_TOKEN_${key}`] ?? process.env.TTV_E2E_TOKEN
  if (!token) throw new Error(`ログイントークンが必要です: TTV_E2E_TOKEN_${key}（または TTV_E2E_TOKEN）`)
  const previous = used.get(token)
  if (previous && previous !== name) throw new Error(`${name} には ${previous} と別のログイントークンを指定してください`)
  used.set(token, name)
  await context.addInitScript(({ clientOrigin, server, token }) => {
    if (location.origin !== clientOrigin) return
    localStorage.setItem('ttv.servers.v1', JSON.stringify([{ url: server, name: server, token, lastUsed: Date.now() }]))
  }, { clientOrigin: url.origin, server, token })
}
