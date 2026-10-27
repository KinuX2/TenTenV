import { copyFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'

const site = resolve(import.meta.dirname, '..')
await build({ root: site, base: '/TenTenV/' })
const dist = resolve(site, 'dist')
copyFileSync(resolve(dist, 'docs', 'index.html'), resolve(dist, 'index.html'))
writeFileSync(resolve(dist, '.nojekyll'), '')
