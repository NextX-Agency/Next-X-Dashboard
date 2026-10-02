import type { CatalogApiData } from '@/lib/catalogData'
import type { StoreCatalogKind, WireCatalog } from './wire'

/**
 * Map the Odoo wire catalogue onto the shape the existing storefront UI already consumes
 * (`CatalogApiData`). The UI therefore does not change when the data source does.
 */
export function wireToCatalogData(wire: WireCatalog, kind: StoreCatalogKind): CatalogApiData {
  const products = wire.products.filter(p => p.catalog === kind && !p.is_combo)
  const productIds = new Set(products.map(p => p.id))

  const items: CatalogApiData['items'] = products.map(p => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    description: p.description,
    categoryId: p.category_id,
    // Cost is deliberately not part of the public wire format.
    purchasePriceUsd: 0,
    sellingPriceSrd: p.price_srd,
    sellingPriceUsd: p.price_usd,
    imageUrl: p.image_url,
    isPublic: true,
    isCombo: false,
    allowCustomPrice: false,
    catalogType: kind,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))

  const stock: CatalogApiData['stock'] = wire.products
    .filter(p => productIds.has(p.id))
    .flatMap(p =>
      p.stock.map(s => ({
        id: `${p.id}:${s.location_id}`,
        itemId: p.id,
        locationId: s.location_id,
        quantity: Math.max(0, Math.floor(s.quantity)),
      }))
    )

  return {
    categories: wire.categories
      .filter(c => c.catalog === kind)
      .map(c => ({
        id: c.id,
        name: c.name,
        catalogType: kind,
        createdAt: wire.generated_at,
        updatedAt: wire.generated_at,
      })),
    items,
    combos: [],
    locations: wire.locations.map(l => ({
      id: l.id,
      name: l.name,
      address: l.address,
      isActive: true,
      catalogType: 'all',
    })),
    exchangeRate: wire.exchange_rate
      ? { id: 'odoo', usdToSrd: wire.exchange_rate.usd_to_srd, isActive: true }
      : null,
    banners: [],
    collections: [],
    settings: wire.settings,
    stock,
  }
}
