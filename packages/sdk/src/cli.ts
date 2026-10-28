// ttv-world: ワールドのビルド・検査・パッケージ作成・アップロード・ローカル実行
//
//   ttv-world build              vite build のあと検査
//   ttv-world pack [-o out.ttvw] パッケージを作る
//   ttv-world check              コードの検査だけ
//   ttv-world upload --server <url> [--token <t>] [--world <id>]   親サーバーへ登録（--world で更新）
//   ttv-world dev [--port 5180] [--host 0.0.0.0] [--client http://localhost:5190]   変更を見張ってビルドし、クライアントで開く URL を出す
import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type RequestListener } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { scanCode } from './tools/scan'
import { packWorld } from './tools/pack'
import type { WorldProjectConfig } from './tools/manifest'

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name: string, def?: string) => {
  let i = args.indexOf(`--${name}`)
  if (i < 0 && name.length === 1) i = args.indexOf(`-${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const cwd = process.cwd()
const require = createRequire(join(cwd, 'package.json'))

const loadConfig = (): WorldProjectConfig => {
  const p = join(cwd, 'ttv-world.json')
  if (!existsSync(p)) {
    console.error('ttv-world.json がありません（ワールドのフォルダで実行してください）')
    process.exit(1)
  }
  return JSON.parse(readFileSync(p, 'utf8'))
}

const viteBin = () => {
  try {
    return join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
  } catch {
    console.error('vite が見つかりません。npm install を実行してください')
    process.exit(1)
  }
}

const runBuild = () => {
  const r = spawnSync(process.execPath, [viteBin(), 'build'], { stdio: 'inherit', cwd })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const report = (cfg: WorldProjectConfig) => {
  const dist = join(cwd, 'dist')
  const res = packWorld(dist, cfg)
  const mb = (res.totalBytes / 1024 / 1024).toFixed(1)
  console.log(`ファイル ${Object.keys(res.manifest.files).length} 個・合計 ${mb} MB`)
  if (res.findings.length) {
    console.error('\nコードの検査で問題が見つかりました（親サーバーは受け付けません）:')
    for (const f of res.findings) console.error(`  [${f.rule}] ${f.description}  ${f.file}:${f.line}\n      …${f.excerpt}…`)
    console.error('\n必要なものなら ttv-world.json の permissions.relaxedRules にルール名を書くと許可できます（ワールドの詳細画面で利用者に表示されます）')
    return { ...res, ok: false }
  }
  console.log('コードの検査: 問題なし')
  return { ...res, ok: true }
}

const main = async () => {
  switch (cmd) {
    case 'build': {
      runBuild()
      const r = report(loadConfig())
      process.exit(r.ok ? 0 : 1)
    }
    // eslint-disable-next-line no-fallthrough
    case 'check': {
      const cfg = loadConfig()
      const file = join(cwd, 'dist', 'world.js')
      if (!existsSync(file)) {
        console.error('dist/world.js がありません。先に build してください')
        process.exit(1)
      }
      const f = scanCode('world.js', readFileSync(file, 'utf8'), cfg.permissions?.relaxedRules ?? [])
      for (const x of f) console.error(`[${x.rule}] ${x.description} world.js:${x.line}`)
      console.log(f.length ? `${f.length} 件` : '問題なし')
      process.exit(f.length ? 1 : 0)
    }
    // eslint-disable-next-line no-fallthrough
    case 'pack': {
      const cfg = loadConfig()
      if (!args.includes('--no-build')) runBuild()
      const r = report(cfg)
      if (!r.ok) process.exit(1)
      const out = resolve(opt('o', `${(cfg.name || 'world').replace(/[^\w\-]+/g, '_')}.ttvw`)!)
      writeFileSync(out, r.zip)
      console.log(`作成しました: ${out}（${(r.zip.length / 1024 / 1024).toFixed(1)} MB）`)
      return
    }
    case 'upload': {
      const cfg = loadConfig()
      const server = opt('server')
      const token = opt('token', process.env.TTV_TOKEN)
      if (!server || !token) {
        console.error('使い方: ttv-world upload --server https://example.com --token <セッショントークン> [--world <ワールドID>]\n（トークンはクライアントの「設定 → 制作者向け」でコピーできます。環境変数 TTV_TOKEN でも可）')
        process.exit(1)
      }
      if (!args.includes('--no-build')) runBuild()
      const r = report(cfg)
      if (!r.ok) process.exit(1)
      const world = opt('world')
      const url = `${server.replace(/\/$/, '')}/api/worlds${world ? `/${world}` : ''}`
      const res = await fetch(url, { method: world ? 'PUT' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/zip' }, body: new Blob([new Uint8Array(r.zip)]) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error(`アップロードに失敗しました（${res.status}）: ${body.message ?? ''}`)
        process.exit(1)
      }
      console.log(`登録しました: ${body.name}（ID ${body.id}、版 ${body.version}）`)
      if (!world) console.log(`次からは --world ${body.id} を付けると同じワールドを更新できます`)
      return
    }
    case 'dev': {
      const port = Number(opt('port', '5180'))
      // 既定ではこの PC の中（127.0.0.1 と ::1）からだけ開ける。ほかの機器（Quest など）から試すときは --host 0.0.0.0
      const host = opt('host')
      const client = opt('client', 'http://localhost:5190')!
      const dist = join(cwd, 'dist')
      // 変更を見張ってビルドする
      const watcher = spawn(process.execPath, [viteBin(), 'build', '--watch'], { stdio: 'inherit', cwd })
      const types: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream' }
      const handler: RequestListener = (req, res) => {
        res.setHeader('access-control-allow-origin', '*')
        res.setHeader('cache-control', 'no-store')
        let path: string
        try {
          path = decodeURIComponent((req.url ?? '/').split('?')[0])
        } catch {
          // % の後ろが壊れている URL。例外で dev サーバーごと落ちないように 400 を返す
          res.statusCode = 400
          res.end()
          return
        }
        if (path === '/world.json') {
          // 開発中は毎回作り直す（ハッシュの検証も本番と同じにする）
          try {
            const r = packWorld(dist, loadConfig())
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(r.manifest))
            if (r.findings.length) console.warn(`[検査] ${r.findings.length} 件の問題があります（アップロードはできません）`)
          } catch (e) {
            res.statusCode = 503
            res.end(String(e))
          }
          return
        }
        // dist の外は読ませない（前方一致だと ../dist-foo/ のような名前の似たフォルダも通るので、相対パスで確かめる）
        const file = resolve(dist, `.${path}`)
        const rel = relative(dist, file)
        if (!rel || rel.startsWith('..') || isAbsolute(rel) || !existsSync(file) || statSync(file).isDirectory()) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('content-type', types[extname(file).toLowerCase()] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      }
      const base = `http://localhost:${port}/`
      let shown = false
      for (const h of host ? [host] : ['127.0.0.1', '::1']) {
        createServer(handler)
          .on('error', (e: Error) => {
            // IPv6 が使えない PC では ::1 で待てなくてもよい
            if (!host && h === '::1') return
            console.error(`${h}:${port} で待ち受けられません: ${e.message}`)
            process.exit(1)
          })
          .listen(port, h, () => {
            if (shown) return
            shown = true
            console.log(`\nワールドを配信しています: ${base}`)
            console.log(`クライアントで開く（ローカル・複数タブで多人数テスト）: ${client}/?devWorld=${encodeURIComponent(base)}\n`)
          })
      }
      process.on('SIGINT', () => {
        watcher.kill()
        process.exit(0)
      })
      return
    }
    default:
      console.log('使い方: ttv-world <build|check|pack|upload|dev> [オプション]')
      process.exit(cmd ? 1 : 0)
  }
}

void main()
