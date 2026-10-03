import { describe, expect, it } from 'vitest'
import { parseLines, parseOrder } from '@/lib/storefront/order'
import { rateLimit } from '@/lib/storefront/rateLimit'

const good = {
  client_ref: 'a1b2c3d4-e5f6-7890',
  customer: { name: 'Ramona Lachman', phone: '+597 8123456' },
  lines: [{ product_id: 'abc', quantity: 2 }],
}

describe('parseLines', () => {
  it('merges duplicate products and caps quantity', () => {
    expect(parseLines([{ product_id: 'a', quantity: 30 }, { product_id: 'a', quantity: 40 }])).toEqual([{ product_id: 'a', quantity: 50 }])
  })
  it.each([[null], [[]], ['x'], [[{ product_id: 'a', quantity: 0 }]], [[{ product_id: 'a', quantity: 1.5 }]], [[{ product_id: '', quantity: 1 }]], [[{ quantity: 1 }]]])(
    'rejects %j',
    raw => expect(parseLines(raw)).toBeNull()
  )
  it('rejects more than 20 lines', () => {
    expect(parseLines(Array.from({ length: 21 }, (_, i) => ({ product_id: `p${i}`, quantity: 1 })))).toBeNull()
  })
})

describe('parseOrder', () => {
  it('accepts a valid order and trims control characters', () => {
    const r = parseOrder({ ...good, customer: { name: '  Ramona\u0000 Lachman ', phone: '+597 8123456' }, note: 'Ophaaldatum: Vandaag\n\u0007' })
    expect(r).toMatchObject({ ok: true })
    if ('order' in r) {
      expect(r.order.customer.name).toBe('Ramona  Lachman')
      expect(r.order.note).not.toMatch(/[\u0000-\u001f]/)
    }
  })
  it.each([
    ['short name', { ...good, customer: { name: 'x', phone: '+5978123456' } }],
    ['short phone', { ...good, customer: { name: 'Valid Name', phone: '123' } }],
    ['bad email', { ...good, customer: { ...good.customer, email: 'nope' } }],
    ['bad ref', { ...good, client_ref: 'short' }],
    ['no lines', { ...good, lines: [] }],
    ['not an object', null],
  ])('rejects %s with a friendly message', (_name, body) => {
    const r = parseOrder(body)
    expect('message' in r && r.message.length > 5).toBe(true)
  })
  it('does not pass unknown fields (price, discount, cost) through to Odoo', () => {
    const r = parseOrder({ ...good, lines: [{ product_id: 'abc', quantity: 1, price: 1, discount: 99 }], total: 1 })
    expect(JSON.stringify(r)).not.toMatch(/discount|"price"|total/)
  })
})

describe('rateLimit', () => {
  it('allows up to the maximum inside the window, then blocks', () => {
    const key = `t-${Math.random()}`
    expect([1, 2, 3].map(() => rateLimit(key, 3, 60_000))).toEqual([true, true, true])
    expect(rateLimit(key, 3, 60_000)).toBe(false)
  })
  it('keeps keys independent', () => {
    expect(rateLimit(`a-${Math.random()}`, 1, 1000)).toBe(true)
    expect(rateLimit(`b-${Math.random()}`, 1, 1000)).toBe(true)
  })
})
