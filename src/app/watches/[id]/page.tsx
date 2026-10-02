import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { absoluteUrl } from '@/lib/storefront/site'
import { breadcrumbJsonLd, jsonLd, metaDescription, productJsonLd } from '@/lib/storefront/seo'
import { resolveProduct } from '@/lib/storefront/slugs'
import { getWatchProducts, type WatchProductData } from '@/services/watches/getWatchProducts'
import WatchDetailClient from './WatchDetailClient'

interface PageProps {
  // The segment is the product slug. Legacy UUID URLs are still accepted and redirected.
  params: Promise<{ id: string }>
}

export const revalidate = 60

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  try {
    const { products } = await getWatchProducts()
    const match = resolveProduct(id, products)
    if (!match) return { title: 'Watch not found | NextX Watches', robots: { index: false, follow: false } }

    const { product, canonicalSlug } = match
    const path = `/watches/${canonicalSlug}`
    const title = `${product.name} | NextX Watches`
    const description = metaDescription(
      product.description,
      `${product.name} bij NextX Watches in Suriname. Ophalen in de winkel of bestellen via WhatsApp.`
    )
    return {
      title: { absolute: title },
      description,
      alternates: { canonical: absoluteUrl(path) },
      openGraph: {
        title,
        description,
        type: 'website',
        url: absoluteUrl(path),
        images: product.imageUrl ? [{ url: product.imageUrl, width: 1200, height: 1200, alt: product.name }] : [],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: product.imageUrl ? [product.imageUrl] : [],
      },
    }
  } catch {
    return { title: 'NextX Watches' }
  }
}

export default async function WatchDetailPage({ params }: PageProps) {
  const { id } = await params

  let data: WatchProductData
  try {
    data = await getWatchProducts()
  } catch {
    notFound()
  }

  const match = resolveProduct(id, data.products)
  if (!match) notFound()
  // One canonical URL per product: UUIDs and stale slugs 301 to the slug.
  if (!match.isCanonical) permanentRedirect(`/watches/${match.canonicalSlug}`)

  const { product: item } = match

  // Same category first, then newest, up to four.
  const others = data.products.filter(p => p.id !== item.id)
  const related = [
    ...others.filter(p => item.categoryId && p.categoryId === item.categoryId),
    ...others.filter(p => !(item.categoryId && p.categoryId === item.categoryId)),
  ].slice(0, 4)

  const relatedMapped = related.map(r => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    imageUrl: r.imageUrl,
    sellingPriceUsd: r.sellingPriceUsd,
    sellingPriceSrd: r.sellingPriceSrd,
    stockCount: r.stockCount,
  }))

  const blocks = [
    jsonLd(
      productJsonLd({
        catalog: 'watches',
        slug: match.canonicalSlug,
        name: item.name,
        brand: item.brand,
        description: item.description,
        imageUrl: item.imageUrl,
        categoryName: item.categoryName,
        priceSrd: item.sellingPriceSrd,
        priceUsd: item.sellingPriceUsd,
        inStock: item.stockCount > 0,
      })
    ),
    jsonLd(
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Watches', path: '/watches' },
        { name: item.name },
      ])
    ),
  ]

  return (
    <>
      {blocks.map((block, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: block }} />
      ))}
      <WatchDetailClient
        item={{
          id: item.id,
          name: item.name,
          brand: item.brand,
          description: item.description,
          imageUrl: item.imageUrl,
          sellingPriceUsd: item.sellingPriceUsd,
          sellingPriceSrd: item.sellingPriceSrd,
          categoryName: item.categoryName ?? undefined,
          stockCount: item.stockCount,
        }}
        relatedItems={relatedMapped}
        whatsappNumber={data.whatsappNumber || '5978555555'}
        initialExchangeRate={data.exchangeRate}
      />
    </>
  )
}
