import { describe, expect, it } from 'vitest'
import registry from '@/data/storefront-slugs.json'
import legacy from '@/data/legacy-product-redirects.json'
import { isUuid, productSlug, resolveProduct, slugify } from '@/lib/storefront/slugs'

describe('slugify', () => {
  it('produces readable ASCII slugs', () => {
    expect(slugify('KZ AS16 Pro X')).toBe('kz-as16-pro-x')
    expect(slugify("CURREN 8023 Men's Sport Military Watch – All Black")).toBe('curren-8023-mens-sport-military-watch-all-black')
    expect(slugify('ESSAGER AUX(3.5mm) to Type-C DAC')).toBe('essager-aux-3-5mm-to-type-c-dac')
    expect(slugify('Café Ünïcode & Co')).toBe('cafe-unicode-co')
  })
})

describe('slug registry', () => {
  const entries = Object.entries(registry)

  it('covers every active product with a unique slug per catalogue', () => {
    expect(entries.length).toBe(39)
    const seen = new Set(entries.map(([, v]) => `${v.catalog}/${v.slug}`))
    expect(seen.size).toBe(entries.length)
  })

  it('keeps a published slug when the product is renamed', () => {
    const [id, v] = entries[0]
    expect(productSlug({ id, name: 'Totally Different Name' })).toBe(v.slug)
  })

  it('derives a slug for a product that is not in the registry yet', () => {
    expect(productSlug({ id: 'new-1', name: 'KZ Sparrow' })).toBe('kz-sparrow')
  })
})

describe('resolveProduct', () => {
  const [id, v] = Object.entries(registry)[0]
  const products = [
    { id, name: 'whatever' },
    { id: 'x', name: 'Other' },
  ]

  it('serves the canonical slug as-is', () => {
    expect(resolveProduct(v.slug, products)).toMatchObject({ canonicalSlug: v.slug, isCanonical: true })
  })
  it('flags a legacy UUID for a 301 to the slug', () => {
    expect(isUuid(id)).toBe(true)
    expect(resolveProduct(id, products)).toMatchObject({ canonicalSlug: v.slug, isCanonical: false })
  })
  it('returns null for unknown products', () => {
    expect(resolveProduct('nope', products)).toBeNull()
  })
})

describe('legacy redirect map', () => {
  it('sends every legacy URL in one hop to a slug that exists', () => {
    const slugs = new Set(Object.values(registry).map(v => `/${v.catalog}/${v.slug}`))
    expect(legacy.length).toBe(68)
    for (const r of legacy) {
      expect(slugs.has(r.destination)).toBe(true)
      expect(r.permanent).toBe(true)
    }
  })
})
