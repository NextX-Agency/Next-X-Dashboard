// Integration test of the nextx_storefront addon against a REAL Odoo (no mocks).
//   ODOO_STOREFRONT_URL=http://127.0.0.1:8099/nextx/store/v1 ODOO_STOREFRONT_SECRET=... node tests/integration/odoo-storefront.mjs
// Creates ONE test sales order (client_ref starts with "it-"); on a shared database cancel it afterwards.
import assert from 'node:assert/strict'

const base = process.env.ODOO_STOREFRONT_URL
const secret = process.env.ODOO_STOREFRONT_SECRET
if (!base || !secret) throw new Error('set ODOO_STOREFRONT_URL and ODOO_STOREFRONT_SECRET')

const call = (path, { method = 'GET', body, token = secret } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }))

let pass = 0
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('PASS', name) } catch (e) { console.log('FAIL', name, '\n    ', e.message.split('\n')[0]); process.exitCode = 1 }
}

await t('catalog rejects a missing secret (401)', async () => assert.equal((await call('/catalog', { token: '' })).status, 401))
await t('catalog rejects a wrong secret (401)', async () => assert.equal((await call('/catalog', { token: 'x'.repeat(40) })).status, 401))
await t('orders rejects a missing secret (401)', async () => assert.equal((await call('/orders', { method: 'POST', body: {}, token: '' })).status, 401))
await t('no generic RPC is exposed', async () => {
  for (const p of ['/call', '/execute', '/search_read', '/models']) assert.ok([404, 405].includes((await call(p)).status), p)
})

const cat = (await call('/catalog')).json
await t('catalog has products, locations, settings', async () => {
  assert.equal(cat.version, 1)
  assert.ok(cat.products.length > 0 && cat.locations.length > 0)
  assert.ok(cat.settings.store_name)
})
await t('every published product has id, price, image and stock rows for every location', async () => {
  for (const p of cat.products) {
    assert.ok(p.id && p.name && p.price_srd > 0 && p.image_url, p.name)
    assert.equal(p.stock.length, cat.locations.length, p.name)
  }
})
await t('public payload never contains cost, margin or partner data', async () => {
  const text = JSON.stringify(cat)
  for (const k of ['standard_price', 'cost', 'margin', 'partner', 'supplier', 'vendor']) assert.ok(!text.toLowerCase().includes(`"${k}`), k)
})

const free = p => p.stock.reduce((a, s) => a + s.quantity, 0)
const target = cat.products.find(p => free(p) >= 3)
assert.ok(target, 'need a product with at least 3 units in stock')

await t('availability: enough stock is ok, with a per-location breakdown', async () => {
  const r = (await call('/availability', { method: 'POST', body: { lines: [{ product_id: target.id, quantity: 2 }] } })).json
  assert.equal(r.ok, true)
  assert.equal(r.lines[0].available, free(target))
  assert.ok(r.lines[0].by_location.length > 0)
})
await t('availability: more than the stock is not ok, and an unknown product is not ok', async () => {
  const r = (await call('/availability', { method: 'POST', body: { lines: [{ product_id: target.id, quantity: 50 }, { product_id: 'does-not-exist', quantity: 1 }] } })).json
  assert.equal(r.ok, false)
  assert.equal(r.lines[0].ok, false)
  assert.equal(r.lines[1].ok, false)
})
await t('availability: malformed input is rejected (400)', async () => {
  for (const body of [{}, { lines: [] }, { lines: [{ product_id: target.id, quantity: 0 }] }, { lines: [{ product_id: target.id, quantity: 1.5 }] }, { lines: 'x' }])
    assert.equal((await call('/availability', { method: 'POST', body })).status, 400)
})

const ref = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const pickup = target.stock.find(s => s.quantity >= 1).location_id
const order = { client_ref: ref, customer: { name: 'TEST Integration', phone: '+597 8000000' }, pickup_location_id: pickup, note: 'TEST ORDER, ignore / cancel', lines: [{ product_id: target.id, quantity: 1 }] }
let created
await t('order: created, confirmed and named by Odoo', async () => {
  const r = await call('/orders', { method: 'POST', body: order })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.match(r.json.order_name, /^S\d+/)
  assert.equal(r.json.reused, false)
  created = r.json
})
await t('order: the same client_ref never creates a second order (idempotent)', async () => {
  const r = (await call('/orders', { method: 'POST', body: order })).json
  assert.equal(r.reused, true)
  assert.equal(r.order_id, created.order_id)
})
await t('order: stock is reserved immediately (free quantity dropped by 1)', async () => {
  const after = (await call('/catalog')).json.products.find(p => p.id === target.id)
  assert.equal(free(after), free(target) - 1)
})
await t('order: stock is reserved at the chosen pickup shop, not elsewhere', async () => {
  const after = (await call('/catalog')).json.products.find(p => p.id === target.id)
  const at = (prod, loc) => prod.stock.find(s => s.location_id === loc).quantity
  assert.equal(at(after, pickup), at(target, pickup) - 1)
  for (const l of cat.locations.filter(l => l.id !== pickup)) assert.equal(at(after, l.id), at(target, l.id), l.name)
})
await t('order: overselling is refused with 409 and the shortage', async () => {
  const r = await call('/orders', { method: 'POST', body: { ...order, client_ref: `${ref}-big`, lines: [{ product_id: target.id, quantity: 50 }] } })
  assert.equal(r.status, 409)
  assert.equal(r.json.error, 'unavailable')
})
await t('order: invalid customer is refused (400)', async () => {
  for (const customer of [{ name: 'x', phone: '+5978000000' }, { name: 'Valid Name', phone: '12' }, { name: 'Valid Name', phone: '+5978000000', email: 'not-an-email' }])
    assert.equal((await call('/orders', { method: 'POST', body: { ...order, client_ref: `${ref}-bad`, customer } })).status, 400)
})
await t('order: a bad idempotency key is refused (400)', async () => assert.equal((await call('/orders', { method: 'POST', body: { ...order, client_ref: 'short' } })).status, 400))

console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}  (test order: ${created?.order_name ?? 'none'})`)
