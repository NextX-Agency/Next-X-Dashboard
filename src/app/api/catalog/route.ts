import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// API route to get catalog data - bypasses RLS by using Prisma
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'

    const result: Record<string, unknown> = {}

    // Fetch based on type parameter
    if (type === 'all' || type === 'categories') {
      result.categories = await prisma.category.findMany({
        orderBy: { name: 'asc' }
      })
    }

    if (type === 'all' || type === 'items') {
      result.items = await prisma.item.findMany({
        where: { 
          isPublic: true,
          is_combo: false
        },
        orderBy: { createdAt: 'desc' }
      })
    }

    if (type === 'all' || type === 'combos') {
      const combos = await prisma.item.findMany({
        where: { 
          isPublic: true,
          is_combo: true
        },
        orderBy: { createdAt: 'desc' }
      })

      // Load combo items with child items
      const comboIds = combos.map(c => c.id)
      if (comboIds.length > 0) {
        const comboItemsData = await prisma.combo_items.findMany({
          where: { combo_id: { in: comboIds } }
        })

        const childItemIds = comboItemsData.map(ci => ci.item_id)
        const childItems = await prisma.item.findMany({
          where: { id: { in: childItemIds } }
        })

        // Map child items to combo items
        const comboItemsWithChildren = comboItemsData.map(ci => ({
          ...ci,
          child_item: childItems.find(item => item.id === ci.item_id),
          child_item_id: ci.item_id
        }))

        // Add combo_items to each combo
        result.combos = combos.map(combo => ({
          ...combo,
          combo_items: comboItemsWithChildren.filter(ci => ci.combo_id === combo.id)
        }))
      } else {
        result.combos = []
      }
    }

    if (type === 'all' || type === 'locations') {
      result.locations = await prisma.location.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' }
      })
    }

    if (type === 'all' || type === 'exchangeRate') {
      result.exchangeRate = await prisma.exchangeRate.findFirst({
        where: { isActive: true },
        orderBy: { setAt: 'desc' }
      })
    }

    if (type === 'all' || type === 'banners') {
      result.banners = await prisma.banner.findMany({
        where: { isActive: true },
        orderBy: { position: 'asc' }
      })
    }

    if (type === 'all' || type === 'collections') {
      const collections = await prisma.collection.findMany({
        where: { 
          isActive: true,
          isFeatured: true
        },
        orderBy: { createdAt: 'desc' }
      })

      // Load collection items
      const collectionIds = collections.map(c => c.id)
      if (collectionIds.length > 0) {
        const collectionItems = await prisma.collectionItem.findMany({
          where: { collectionId: { in: collectionIds } }
        })

        const itemIds = collectionItems.map(ci => ci.itemId)
        const items = await prisma.item.findMany({
          where: { id: { in: itemIds } }
        })

        // Map items to collection items
        const collectionItemsWithItems = collectionItems.map(ci => ({
          ...ci,
          items: items.find(item => item.id === ci.itemId)
        }))

        result.collections = collections.map(collection => ({
          ...collection,
          collection_items: collectionItemsWithItems.filter(ci => ci.collectionId === collection.id)
        }))
      } else {
        result.collections = []
      }
    }

    if (type === 'all' || type === 'settings') {
      const settings = await prisma.storeSetting.findMany()
      // Convert array to object
      const settingsObj: Record<string, string> = {}
      settings.forEach(s => {
        settingsObj[s.key] = s.value
      })
      result.settings = settingsObj
    }

    if (type === 'all' || type === 'stock') {
      result.stock = await prisma.stock.findMany()
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Catalog API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch catalog data' },
      { status: 500 }
    )
  }
}
