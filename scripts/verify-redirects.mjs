// Verifies the legacy product URL map against a running deployment:
//   node scripts/verify-redirects.mjs <baseUrl> [shareUrl]
// Every legacy URL must answer exactly one 301 straight to its slug URL, and that URL must be 200.
import { readFileSync } from 'node:fs'
const [base, share] = process.argv.slice(2)
if (!base) throw new Error('usage: verify-redirects.mjs <baseUrl> [vercelShareUrl]')
const map = JSON.parse(readFileSync(new URL('../src/data/legacy-product-redirects.json', import.meta.url), 'utf8'))

let cookie = ''
if (share) {
  const r = await fetch(share, { redirect: 'manual' })
  cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
}
const get = (path) => fetch(new URL(path, base), { redirect: 'manual', headers: cookie ? { cookie } : {} })

let bad = 0
for (const { source, destination } of map) {
  const r = await get(source)
  const loc = r.headers.get('location')
  const target = loc ? new URL(loc, base).pathname : null
  const final = target ? await get(target) : null
  const ok = r.status === 301 && target === destination && final?.status === 200
  if (!ok) { bad++; console.log('FAIL', source, '->', r.status, loc, 'dest', final?.status) }
}
console.log(`${map.length - bad}/${map.length} legacy URLs: one 301 hop to a 200 slug page`)
process.exit(bad ? 1 : 0)
