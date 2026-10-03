import { absoluteUrl } from './site'
import type { ProductCatalog } from './slugs'

/** Serialise JSON-LD for a <script> tag. `<` is escaped so product text can never close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** One-line meta description of a sensible length, never empty. */
export function metaDescription(text: string | null | undefined, fallback: string): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  const source = clean.length >= 40 ? clean : fallback
  if (source.length <= 158) return source
  const cut = source.slice(0, 157)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 100 ? cut.lastIndexOf(' ') : 157)}…`
}

export interface ProductSeoInput {
  catalog: ProductCatalog
  slug: string
  name: string
  brand?: string | null
  description?: string | null
  imageUrl?: string | null
  categoryName?: string | null
  // Prisma returns Decimal columns as strings, Odoo as numbers: accept both.
  priceSrd?: number | string | null
  priceUsd?: number | string | null
  inStock: boolean
}

const toNumber = (v: number | string | null | undefined): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const money = (n: number) => n.toFixed(2)

/**
 * Product + Offer structured data. Price is stated in SRD, the shop's base currency, and does not
 * depend on the visitor's currency toggle, so what Google indexes matches what the shop charges.
 */
export function productJsonLd(p: ProductSeoInput) {
  const srd = toNumber(p.priceSrd)
  const usd = toNumber(p.priceUsd)
  const useSrd = srd != null && srd > 0
  const price = useSrd ? srd : usd
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(p.description ? { description: p.description.replace(/\s+/g, ' ').trim() } : {}),
    ...(p.imageUrl ? { image: [p.imageUrl] } : {}),
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.categoryName ? { category: p.categoryName } : {}),
    url: absoluteUrl(`/${p.catalog}/${p.slug}`),
    ...(price != null && price > 0
      ? {
          offers: {
            '@type': 'Offer',
            url: absoluteUrl(`/${p.catalog}/${p.slug}`),
            priceCurrency: useSrd ? 'SRD' : 'USD',
            price: money(price),
            availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: 'NextX', url: absoluteUrl('/') },
            areaServed: { '@type': 'Country', name: 'Suriname' },
          },
        }
      : {}),
  }
}

export function breadcrumbJsonLd(crumbs: Array<{ name: string; path?: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.path ? { item: absoluteUrl(c.path) } : {}),
    })),
  }
}
