import { describe, expect, it } from 'vitest'
import { breadcrumbJsonLd, jsonLd, metaDescription, productJsonLd } from '@/lib/storefront/seo'

describe('jsonLd', () => {
  it('cannot be broken out of a script tag', () => {
    expect(jsonLd({ d: '</script><script>alert(1)</script>' })).not.toContain('</script>')
  })
})

describe('metaDescription', () => {
  const fallback = 'fallback text that is long enough to be used as a description ok'
  it('falls back when the text is missing or tiny', () => {
    expect(metaDescription(null, fallback)).toContain('fallback')
    expect(metaDescription('short', fallback)).toContain('fallback')
  })
  it('cuts at a word boundary under 160 characters', () => {
    const out = metaDescription('word '.repeat(80), 'x')
    expect(out.length).toBeLessThanOrEqual(160)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('productJsonLd', () => {
  const base = { catalog: 'audio' as const, slug: 'kz-as16-pro-x', name: 'KZ AS16 Pro X', inStock: true }
  it('states price in SRD with an absolute URL, independent of visitor currency', () => {
    const ld = productJsonLd({ ...base, priceSrd: 3000, priceUsd: 79, brand: 'KZ' }) as any
    expect(ld.offers.priceCurrency).toBe('SRD')
    expect(ld.offers.price).toBe('3000.00')
    expect(ld.offers.url).toMatch(/^https:\/\/.+\/audio\/kz-as16-pro-x$/)
    expect(ld.offers.availability).toBe('https://schema.org/InStock')
    expect(ld.brand.name).toBe('KZ')
  })
  it('reports out of stock and omits offers without a price', () => {
    expect((productJsonLd({ ...base, priceSrd: 100, inStock: false }) as any).offers.availability).toBe('https://schema.org/OutOfStock')
    expect((productJsonLd({ ...base }) as any).offers).toBeUndefined()
  })
})

describe('breadcrumbJsonLd', () => {
  it('numbers items and leaves the current page without a link', () => {
    const ld = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Audio', path: '/audio' }, { name: 'KZ' }]) as any
    expect(ld.itemListElement.map((i: any) => i.position)).toEqual([1, 2, 3])
    expect(ld.itemListElement[2].item).toBeUndefined()
  })
})
