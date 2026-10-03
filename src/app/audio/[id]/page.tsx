import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import {
  normalizeCatalogData,
  type CatalogApiData,
} from '@/lib/catalogData'
import { absoluteUrl } from '@/lib/storefront/site'
import { breadcrumbJsonLd, jsonLd, metaDescription, productJsonLd } from '@/lib/storefront/seo'
import { resolveProduct } from '@/lib/storefront/slugs'
import { getCatalogPageData } from '@/services/catalog/getCatalogPageData'

import ProductDetailClient, { type ProductDetailInitialData } from './ProductDetailClient'

interface PageProps {
  // The segment is the product slug. Legacy UUID URLs are still accepted and redirected.
  params: Promise<{ id: string }>
}

export const revalidate = 60

type ServerProduct = {
  id: string
  name: string
  brand?: string | null
  description?: string | null
  image_url?: string | null
  category_id?: string | null
  selling_price_srd?: number | null
  selling_price_usd?: number | null
}

async function getNormalizedCatalogData() {
  const rawData = await getCatalogPageData()
  const serializedData = JSON.parse(JSON.stringify(rawData)) as CatalogApiData
  return normalizeCatalogData(serializedData)
}

function findProduct(data: Awaited<ReturnType<typeof getNormalizedCatalogData>>, segment: string) {
  const products = [...data.items, ...data.combos] as ServerProduct[]
  return resolveProduct(segment, products)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params

  try {
    const data = await getNormalizedCatalogData()
    const match = findProduct(data, id)

    if (!match) {
      return { title: 'Product niet gevonden', robots: { index: false, follow: false } }
    }

    const { product, canonicalSlug } = match
    const path = `/audio/${canonicalSlug}`
    // The audio layout sets an absolute title, which resets the root template, so the brand is added here.
    const title = `${product.name} kopen in Suriname | NextX`
    const description = metaDescription(
      product.description,
      `${product.name} bij NextX Suriname. Ophalen in de winkel of bestellen via WhatsApp.`
    )

    return {
      title: { absolute: title },
      description,
      alternates: { canonical: absoluteUrl(path) },
      openGraph: {
        title: product.name,
        description,
        type: 'website',
        url: absoluteUrl(path),
        images: product.image_url
          ? [{ url: product.image_url, width: 1200, height: 1200, alt: product.name }]
          : [],
      },
      twitter: {
        card: 'summary_large_image',
        title: product.name,
        description,
        images: product.image_url ? [product.image_url] : [],
      },
    }
  } catch {
    return { title: 'NextX Audio' }
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params
  let initialData: ProductDetailInitialData | null = null
  let jsonLdBlocks: string[] = []

  try {
    const data = await getNormalizedCatalogData()
    const match = findProduct(data, id)

    if (match) {
      // One canonical URL per product: UUIDs and stale slugs 301 to the slug.
      if (!match.isCanonical) permanentRedirect(`/audio/${match.canonicalSlug}`)

      const product = match.product as unknown as ProductDetailInitialData['product'] & ServerProduct
      const categories = data.categories as ProductDetailInitialData['categories']
      const category = categories.find(candidate => candidate.id === product.category_id) || null
      const stock = data.stock as ProductDetailInitialData['stock']
      const units = (stock as Array<{ item_id: string; quantity: number }>)
        .filter(s => s.item_id === product.id)
        .reduce((sum, s) => sum + Math.max(0, s.quantity), 0)

      initialData = {
        product,
        category,
        categories,
        locations: data.locations as ProductDetailInitialData['locations'],
        stock,
        settings: data.settings,
        exchangeRate: data.exchangeRate as ProductDetailInitialData['exchangeRate'],
      }

      jsonLdBlocks = [
        jsonLd(
          productJsonLd({
            catalog: 'audio',
            slug: match.canonicalSlug,
            name: product.name,
            brand: product.brand,
            description: product.description,
            imageUrl: product.image_url,
            categoryName: category?.name,
            priceSrd: product.selling_price_srd,
            priceUsd: product.selling_price_usd,
            inStock: units > 0,
          })
        ),
        jsonLd(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Audio', path: '/audio' },
            { name: product.name },
          ])
        ),
      ]
    }
  } catch (error) {
    // permanentRedirect throws a control-flow error that must reach Next.
    if (error && typeof error === 'object' && 'digest' in error) throw error
    console.error('Failed to load audio product detail on the server:', error)
  }

  if (!initialData) notFound()

  return (
    <>
      {jsonLdBlocks.map((block, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: block }} />
      ))}
      <ProductDetailClient initialData={initialData} />
    </>
  )
}
