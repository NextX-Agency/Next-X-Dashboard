import 'server-only'

import { unstable_cache } from 'next/cache'

import { getLocationCatalogFilter } from '@/lib/locationCatalog'
import { prisma } from '@/lib/prisma'
import { fetchCatalog } from '@/lib/storefront/odoo/client'
import { getStorefrontSource } from '@/services/storefront/source'

const CATALOG_TYPE = 'watches'
const LOCATION_CATALOG_FILTER = getLocationCatalogFilter(CATALOG_TYPE)

export interface WatchProduct {
  id: string
  name: string
  brand: string | null
  description: string | null
  imageUrl: string | null
  categoryId: string | null
  categoryName: string | null
  sellingPriceUsd: number | null
  sellingPriceSrd: number | null
  stockCount: number
  createdAt: string
}

export interface WatchProductData {
  products: WatchProduct[]
  whatsappNumber: string | null
  exchangeRate: number | null
}

const num = (v: unknown) => (v == null ? null : Number(v))

async function loadFromSupabase(): Promise<WatchProductData> {
  const [items, whatsapp, rate] = await Promise.all([
    prisma.item.findMany({
      where: { catalogType: CATALOG_TYPE, isPublic: true, is_combo: false, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        stock: { where: { location: { is_active: true, catalogType: { in: LOCATION_CATALOG_FILTER } } } },
      },
    }),
    prisma.storeSetting.findUnique({ where: { key: 'whatsapp_number' } }),
    prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
  ])

  return {
    products: items.map(i => ({
      id: i.id,
      name: i.name,
      brand: i.brand,
      description: i.description,
      imageUrl: i.imageUrl,
      categoryId: i.categoryId,
      categoryName: i.category?.name ?? null,
      sellingPriceUsd: num(i.sellingPriceUsd),
      sellingPriceSrd: num(i.sellingPriceSrd),
      stockCount: i.stock.reduce((sum, s) => sum + s.quantity, 0),
      createdAt: i.createdAt.toISOString(),
    })),
    whatsappNumber: whatsapp?.value ?? null,
    exchangeRate: rate?.usdToSrd ? Number(rate.usdToSrd) : null,
  }
}

async function loadFromOdoo(): Promise<WatchProductData> {
  const wire = await fetchCatalog()
  const categories = new Map(wire.categories.map(c => [c.id, c.name]))
  return {
    products: wire.products
      .filter(p => p.catalog === CATALOG_TYPE && !p.is_combo)
      .map(p => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        description: p.description,
        imageUrl: p.image_url,
        categoryId: p.category_id,
        categoryName: p.category_id ? categories.get(p.category_id) ?? null : null,
        sellingPriceUsd: p.price_usd,
        sellingPriceSrd: p.price_srd,
        stockCount: p.stock.reduce((sum, s) => sum + Math.max(0, Math.floor(s.quantity)), 0),
        createdAt: p.created_at,
      })),
    whatsappNumber: wire.settings.whatsapp_number ?? null,
    exchangeRate: wire.exchange_rate?.usd_to_srd ?? null,
  }
}

const SOURCE = getStorefrontSource()

export const getWatchProducts = unstable_cache(
  SOURCE === 'odoo' ? loadFromOdoo : loadFromSupabase,
  [`watch-products-${SOURCE}`],
  { revalidate: 60, tags: ['watches-catalog'] }
)
