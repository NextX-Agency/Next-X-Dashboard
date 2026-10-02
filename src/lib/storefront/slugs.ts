import registryJson from '@/data/storefront-slugs.json'

export type ProductCatalog = 'audio' | 'watches'

type Registry = Record<string, { slug: string; catalog: ProductCatalog }>
const registry = registryJson as Registry

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '')
}

/**
 * Slug for one product. Published slugs are permanent: a product that is in the registry keeps its
 * slug even if it is renamed. Anything newer is derived from its name.
 */
export function productSlug(item: { id: string; name: string }): string {
  return registry[item.id]?.slug ?? (slugify(item.name) || item.id)
}

export function productPath(catalog: ProductCatalog, item: { id: string; name: string }): string {
  return `/${catalog}/${productSlug(item)}`
}

/**
 * Resolve a URL segment to a product. Accepts the slug (canonical) or the legacy UUID.
 * `redirectTo` is set whenever the request used anything other than the canonical slug.
 */
export function resolveProduct<T extends { id: string; name: string }>(
  segment: string,
  products: readonly T[]
): { product: T; canonicalSlug: string; isCanonical: boolean } | null {
  const wanted = decodeURIComponent(segment).toLowerCase()
  const byId = isUuid(wanted) ? products.find(p => p.id.toLowerCase() === wanted) : undefined
  const product = byId ?? products.find(p => productSlug(p) === wanted)
  if (!product) return null
  const canonicalSlug = productSlug(product)
  return { product, canonicalSlug, isCanonical: canonicalSlug === wanted }
}
