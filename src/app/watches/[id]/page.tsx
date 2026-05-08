import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import WatchDetailClient from './WatchDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  try {
    const item = await prisma.item.findUnique({ where: { id, catalogType: 'watches' } })
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

  try {
    item = await prisma.item.findUnique({
      where: { id, catalogType: 'watches' },
      include: { category: true, stock: true },
    })
    if (!item) notFound()

    related = await prisma.item.findMany({
      where: {
        catalogType: 'watches',
        isPublic: true,
        deletedAt: null,
        id: { not: id },
        ...(item.categoryId ? { categoryId: item.categoryId } : {}),
      },
      take: 4,
      orderBy: { createdAt: 'desc' },
      include: { stock: true },
    })
  } catch {
    notFound()
  }

  const totalStock = item.stock.reduce((s, st) => s + st.quantity, 0)

  const relatedMapped = related.map(r => ({
    id: r.id,
    name: r.name,
    imageUrl: r.imageUrl,
    sellingPriceUsd: r.sellingPriceUsd ? Number(r.sellingPriceUsd) : null,
    sellingPriceSrd: r.sellingPriceSrd ? Number(r.sellingPriceSrd) : null,
    stockCount: r.stock.reduce((s, st) => s + st.quantity, 0),
  }))

  return (
    <WatchDetailClient
      item={{
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        sellingPriceUsd: item.sellingPriceUsd ? Number(item.sellingPriceUsd) : null,
        sellingPriceSrd: item.sellingPriceSrd ? Number(item.sellingPriceSrd) : null,
        categoryName: item.category?.name,
        stockCount: totalStock,
      }}
      relatedItems={relatedMapped}
    />
  )
}
