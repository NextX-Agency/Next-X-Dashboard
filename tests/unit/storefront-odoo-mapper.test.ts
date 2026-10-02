import { describe, expect, it } from 'vitest'
import { wireToCatalogData } from '@/lib/storefront/odoo/mapper'
import type { WireCatalog } from '@/lib/storefront/odoo/wire'

const wire: WireCatalog = {
  version: 1,
  generated_at: '2026-10-02T00:00:00Z',
  settings: { whatsapp_number: '5970000000' },
  exchange_rate: { usd_to_srd: 38, set_at: '2026-10-01T00:00:00Z' },
  categories: [
    { id: 'c1', name: 'In-Ear Monitor', catalog: 'audio' },
    { id: 'c2', name: 'Curren', catalog: 'watches' },
  ],
  locations: [
    { id: 'l1', name: 'Alkmaar', address: null },
    { id: 'l2', name: 'Blauwgrond', address: 'x' },
  ],
  products: [
    { id: 'p1', odoo_id: 1, name: 'KZ EDX Pro', brand: null, description: 'd', category_id: 'c1', catalog: 'audio', price_srd: 500, price_usd: 13.16, image_url: 'https://o/1', is_combo: false, created_at: 'a', updated_at: 'b', stock: [{ location_id: 'l1', quantity: 3 }, { location_id: 'l2', quantity: -1 }] },
    { id: 'p2', odoo_id: 2, name: 'Watch', brand: 'Curren', description: null, category_id: 'c2', catalog: 'watches', price_srd: 1000, price_usd: null, image_url: null, is_combo: false, created_at: 'a', updated_at: 'b', stock: [] },
    { id: 'p3', odoo_id: 3, name: 'Bundle', brand: null, description: null, category_id: null, catalog: 'audio', price_srd: 1, price_usd: 1, image_url: null, is_combo: true, created_at: 'a', updated_at: 'b', stock: [] },
  ],
}

describe('wireToCatalogData', () => {
  const audio = wireToCatalogData(wire, 'audio')

  it('keeps only the requested catalogue and drops combos', () => {
    expect(audio.items.map(i => i.id)).toEqual(['p1'])
    expect(audio.categories.map(c => c.id)).toEqual(['c1'])
  })
  it('never exposes cost and always flags items public', () => {
    expect(audio.items[0].purchasePriceUsd).toBe(0)
    expect(audio.items[0].isPublic).toBe(true)
  })
  it('clamps negative free stock to zero', () => {
    expect(audio.stock.map(s => s.quantity)).toEqual([3, 0])
  })
  it('carries settings and exchange rate through', () => {
    expect(audio.settings.whatsapp_number).toBe('5970000000')
    expect(audio.exchangeRate?.usdToSrd).toBe(38)
  })
})
