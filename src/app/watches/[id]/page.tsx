import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getLocationCatalogFilter } from '@/lib/locationCatalog'
import WatchDetailClient from './WatchDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

const CATALOG_TYPE = 'watches'
const LOCATION_CATALOG_FILTER = getLocationCatalogFilter(CATALOG_TYPE)

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  try {
    const item = await prisma.item.findFirst({
      where: {
        id,
        catalogType: CATALOG_TYPE,
        isPublic: true,
        is_combo: false,
        deletedAt: null,
      },
    })
    if (!item) return { title: 'Watch not found | NextX Watches' }
    return {
      title: `${item.name} | NextX Watches`,
      description: item.description ?? `Buy ${item.name} — luxury timepiece available in Suriname.`,
      openGraph: {
        title: `${item.name} | NextX Watches`,
        images: item.imageUrl ? [{ url: item.imageUrl, width: 1200, height: 1200 }] : [],
      },
      alternates: { canonical: `https://shop-nextx.com/watches/${id}` },
    }
  } catch {
    return { title: 'NextX Watches' }
  }
}

export default async function WatchDetailPage({ params }: PageProps) {
  const { id } = await params

  let item
  let related: typeof item[] = []
  let whatsappNumber = '5978555555'
  let activeExchangeRate: number | null = null

  try {
    const [resolvedItem, whatsappSetting, exchangeRate] = await Promise.all([
      prisma.item.findFirst({
        where: {
          id,
          catalogType: CATALOG_TYPE,
          isPublic: true,
          is_combo: false,
          deletedAt: null,
        },
        include: {
          category: true,
          stock: {
            where: {
              location: {
                is_active: true,
                catalogType: { in: LOCATION_CATALOG_FILTER },
              },
            },
          },
        },
      }),
      prisma.storeSetting.findUnique({ where: { key: 'whatsapp_number' } }),
      prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
    ])

    item = resolvedItem
    whatsappNumber = whatsappSetting?.value || whatsappNumber
    activeExchangeRate = exchangeRate?.usdToSrd ? Number(exchangeRate.usdToSrd) : null

    if (!item) notFound()

    const relatedBaseWhere = {
      catalogType: CATALOG_TYPE,
      isPublic: true,
      is_combo: false,
      deletedAt: null,
      id: { not: id },
    }

    related = await prisma.item.findMany({
      where: {
        ...relatedBaseWhere,
        ...(item.categoryId ? { categoryId: item.categoryId } : {}),
      },
      take: 4,
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        stock: {
          where: {
            location: {
              is_active: true,
              catalogType: { in: LOCATION_CATALOG_FILTER },
            },
          },
        },
      },
    })

    if (related.length < 4) {
      const relatedIds = new Set(related.map(relatedItem => relatedItem.id))
      const fallbackRelated = await prisma.item.findMany({
        where: {
          ...relatedBaseWhere,
          id: { notIn: [id, ...relatedIds] },
        },
        take: 4 - related.length,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          stock: {
            where: {
              location: {
                is_active: true,
                catalogType: { in: LOCATION_CATALOG_FILTER },
              },
            },
          },
        },
      })

      related = [...related, ...fallbackRelated]
    }
  } catch {
    notFound()
  }

  const totalStock = item.stock.reduce((s, st) => s + st.quantity, 0)

  const relatedMapped = related.map(r => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    imageUrl: r.imageUrl,
    sellingPriceUsd: r.sellingPriceUsd ? Number(r.sellingPriceUsd) : null,
    sellingPriceSrd: r.sellingPriceSrd ? Number(r.sellingPriceSrd) : null,
    stockCount: r.stock.reduce((s, st) => s + st.quantity, 0),
  }))

  const numericSrdPrice = item.sellingPriceSrd ? Number(item.sellingPriceSrd) : null
  const numericUsdPrice = item.sellingPriceUsd ? Number(item.sellingPriceUsd) : null
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    brand: item.brand ? { '@type': 'Brand', name: item.brand } : undefined,
    category: item.category?.name,
    image: item.imageUrl ? [item.imageUrl] : undefined,
    description: item.description ?? undefined,
    offers: {
      '@type': 'Offer',
      url: `https://shop-nextx.com/watches/${item.id}`,
      priceCurrency: numericSrdPrice != null ? 'SRD' : 'USD',
      price: numericSrdPrice ?? numericUsdPrice ?? undefined,
      availability: totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <WatchDetailClient
        item={{
          id: item.id,
          name: item.name,
          brand: item.brand,
          description: item.description,
          imageUrl: item.imageUrl,
          sellingPriceUsd: numericUsdPrice,
          sellingPriceSrd: numericSrdPrice,
          categoryName: item.category?.name,
          stockCount: totalStock,
        }}
        relatedItems={relatedMapped}
        whatsappNumber={whatsappNumber}
        initialExchangeRate={activeExchangeRate}
      />
    </>
  )
}
