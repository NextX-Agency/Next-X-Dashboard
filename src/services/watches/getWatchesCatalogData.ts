import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

async function loadWatchesCatalogData(): Promise<Record<string, unknown>> {
  const [
    items,
    locations,
    exchangeRate,
    settings,
    stock,
  ] = await Promise.all([
    prisma.item.findMany({
      where: { isPublic: true, is_combo: false, deletedAt: null, catalogType: 'watches' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.location.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } }),
    prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
    prisma.storeSetting.findMany(),
    prisma.stock.findMany(),
  ])

  const settingsMap: Record<string, string> = {}
  settings.forEach(setting => {
    settingsMap[setting.key] = setting.value
  })

  return {
    items,
    locations,
    exchangeRate,
    settings: settingsMap,
    stock,
  }
}

export const getWatchesCatalogData = unstable_cache(
  loadWatchesCatalogData,
  ['watches-catalog-data'],
  { revalidate: 120, tags: ['watches-catalog'] }
)
