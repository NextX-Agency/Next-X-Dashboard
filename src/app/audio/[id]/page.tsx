import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  normalizeCatalogData,
  type CatalogApiData,
} from '@/lib/catalogData'
import { getCatalogPageData } from '@/services/catalog/getCatalogPageData'

import ProductDetailClient, { type ProductDetailInitialData } from './ProductDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export const revalidate = 60

async function getNormalizedCatalogData() {
  const rawData = await getCatalogPageData()
  const serializedData = JSON.parse(JSON.stringify(rawData)) as CatalogApiData
  return normalizeCatalogData(serializedData)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params

  try {
    const data = await getNormalizedCatalogData()
    const product = [...data.items, ...data.combos]
      .find(candidate => (candidate as { id?: string }).id === id) as {
        name?: string
        description?: string | null
        image_url?: string | null
      } | undefined

    if (!product) {
      return { title: 'Product niet gevonden | NextX Suriname' }
    }

    const title = `${product.name} | NextX Audio`
    const description = product.description || `${product.name} – verkrijgbaar bij NextX Suriname.`

    return {
      title,
      description,
      alternates: { canonical: `/audio/${id}` },
      openGraph: {
        title,
        description,
        type: 'website',
        images: product.image_url
          ? [{ url: product.image_url, width: 1200, height: 1200, alt: product.name }]
          : [],
      },
    }
  } catch {
    return { title: 'NextX Audio' }
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params
  let initialData: ProductDetailInitialData | null = null

  try {
    const data = await getNormalizedCatalogData()
    const products = [...data.items, ...data.combos] as ProductDetailInitialData['product'][]
    const product = products.find(candidate => candidate.id === id)

    if (product) {
      const categories = data.categories as ProductDetailInitialData['categories']
      const category = categories.find(candidate => candidate.id === product.category_id) || null

      initialData = {
          product,
          category,
          categories,
          locations: data.locations as ProductDetailInitialData['locations'],
          stock: data.stock as ProductDetailInitialData['stock'],
          settings: data.settings,
          exchangeRate: data.exchangeRate as ProductDetailInitialData['exchangeRate'],
      }
    }
  } catch (error) {
    console.error('Failed to load audio product detail on the server:', error)
  }

  if (!initialData) notFound()

  return <ProductDetailClient initialData={initialData} />
}
