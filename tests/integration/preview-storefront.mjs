// Storefront API tests THROUGH a deployed Preview (Vercel -> server layer -> Odoo), no mocks.
//   node tests/integration/preview-storefront.mjs <previewBase> [vercelShareUrl]
// Creates ONE test order (customer "TEST Preview API"); cancel it afterwards. Kept inside the order rate limit (5 per 10 min).
import assert from 'node:assert/strict'
const [base, share] = process.argv.slice(2)
let cookie = ''
if (share) cookie = ((await fetch(share, { redirect: 'manual' })).headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }))
let pass = 0
const t = async (n, f) => { try { await f(); pass++; console.log('PASS', n) } catch (e) { console.log('FAIL', n, '\n   ', e.message.split('\n')[0]); process.exitCode = 1 } }
const pid = '3f794fb4-b718-4fb0-af2f-54facfb11d95' // KZ AS16 Pro X
await t('availability: in stock', async () => { const r = await post('/api/store/availability', { lines: [{ product_id: pid, quantity: 1 }] }); assert.equal(r.s, 200); assert.equal(r.j.ok, true); assert.ok(r.j.lines[0].by_location.length > 0) })
await t('availability: too many / unknown product are not ok', async () => { const r = await post('/api/store/availability', { lines: [{ product_id: pid, quantity: 50 }, { product_id: 'nope', quantity: 1 }] }); assert.equal(r.j.ok, false); assert.equal(r.j.lines[1].ok, false) })
await t('availability: malformed is 400', async () => assert.equal((await post('/api/store/availability', { lines: [] })).s, 400))
const ref = `pv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const order = { client_ref: ref, customer: { name: 'TEST Preview API', phone: '+597 8000001' }, pickup_location_id: '7f16628b-ade4-49c6-97d5-f143b093e933', note: 'TEST ORDER, cancel', lines: [{ product_id: pid, quantity: 1 }] }
let first
await t('order: created in Odoo', async () => { const r = await post('/api/store/orders', order); assert.equal(r.s, 200); assert.equal(r.j.ok, true); assert.match(r.j.order_name, /^S\d+/); first = r.j })
await t('order: same key returns the same order (idempotent)', async () => { const r = await post('/api/store/orders', order); assert.equal(r.j.reused, true); assert.equal(r.j.order_name, first.order_name) })
await t('order: overselling is refused with 409', async () => { const r = await post('/api/store/orders', { ...order, client_ref: ref + '-big', lines: [{ product_id: pid, quantity: 50 }] }); assert.equal(r.s, 409); assert.equal(r.j.error, 'unavailable') })
console.log(`\n${pass}/6 passed (test order ${first?.order_name})`)
