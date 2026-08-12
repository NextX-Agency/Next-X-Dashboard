import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/apiAuth'
import { getAccessibleLocationIds, requireLocationAccess } from '@/lib/locationAccess'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'
import type { StockPageDataPayload, StockPageItem, StockPageLocation, StockPageRow } from '@/types/stock'
import { getLocationCatalogFilter, type PublicCatalogType } from '@/lib/locationCatalog'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function parseQuantity(value: unknown) {
  const quantity = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantity must be a whole number greater than zero.')
  return quantity
}

function parseId(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`)
  return value
}

export async function GET(request: NextRequest) {
  const user = await requireRole(request, ['admin', 'seller'])
  if (user instanceof NextResponse) return user

  try {
    const catalogType: PublicCatalogType = request.nextUrl.searchParams.get('catalogType') === 'watches' ? 'watches' : 'audio'
    const locationCatalogFilter = getLocationCatalogFilter(catalogType)
    const data = await prisma.$transaction(async (tx) => {
      const accessibleLocationIds = await getAccessibleLocationIds(tx, user)
      const locationScope = accessibleLocationIds === null ? {} : { id: { in: accessibleLocationIds } }
      const locationWhere = { ...locationScope, catalogType: { in: locationCatalogFilter } }

      const [items, locations, stocks] = await Promise.all([
        tx.item.findMany({
          where: { deletedAt: null, is_combo: false, catalogType },
          select: {
            id: true, name: true, brand: true, imageUrl: true, is_combo: true,
            deletedAt: true, catalogType: true, sellingPriceSrd: true, sellingPriceUsd: true,
          },
          orderBy: { name: 'asc' },
        }),
        tx.location.findMany({
          where: locationWhere,
          select: { id: true, name: true, catalogType: true },
          orderBy: { name: 'asc' },
        }),
        tx.stock.findMany({
          where: {
            item: { is: { deletedAt: null, is_combo: false, catalogType } },
            location: { is: locationWhere },
          },
          select: {
            id: true, itemId: true, locationId: true, quantity: true, createdAt: true, updatedAt: true,
            item: {
              select: {
                id: true, name: true, brand: true, imageUrl: true, is_combo: true,
                deletedAt: true, catalogType: true, sellingPriceSrd: true, sellingPriceUsd: true,
              },
            },
            location: { select: { id: true, name: true, catalogType: true } },
          },
          orderBy: { quantity: 'desc' },
        }),
      ])

      return {
        items: items.map<StockPageItem>((item) => ({
          id: item.id, name: item.name, brand: item.brand, image_url: item.imageUrl,
          is_combo: item.is_combo, deleted_at: item.deletedAt ? toIsoString(item.deletedAt) : null,
          catalog_type: item.catalogType,
          selling_price_srd: item.sellingPriceSrd === null ? null : Number(item.sellingPriceSrd),
          selling_price_usd: item.sellingPriceUsd === null ? null : Number(item.sellingPriceUsd),
        })),
        locations: locations.map<StockPageLocation>((location) => ({
          id: location.id, name: location.name, catalog_type: location.catalogType,
        })),
        stocks: stocks.map<StockPageRow>((stock) => ({
          id: stock.id, item_id: stock.itemId, location_id: stock.locationId, quantity: stock.quantity,
          created_at: toIsoString(stock.createdAt), updated_at: toIsoString(stock.updatedAt),
          items: stock.item ? {
            id: stock.item.id, name: stock.item.name, brand: stock.item.brand, image_url: stock.item.imageUrl,
            is_combo: stock.item.is_combo, deleted_at: stock.item.deletedAt ? toIsoString(stock.item.deletedAt) : null,
            catalog_type: stock.item.catalogType,
            selling_price_srd: stock.item.sellingPriceSrd === null ? null : Number(stock.item.sellingPriceSrd),
            selling_price_usd: stock.item.sellingPriceUsd === null ? null : Number(stock.item.sellingPriceUsd),
          } : null,
          locations: stock.location ? { id: stock.location.id, name: stock.location.name, catalog_type: stock.location.catalogType } : null,
        })),
      } satisfies StockPageDataPayload
    })

    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Stock route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await requireRole(request, ['admin', 'seller'])
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const action = body.action
    const itemId = parseId(body.itemId, 'itemId')
    const quantity = parseQuantity(body.quantity)

    await prisma.$transaction(async (tx) => {
      if (action === 'add') {
        const locationId = parseId(body.locationId, 'locationId')
        await requireLocationAccess(tx, user, locationId)
        const item = await tx.item.findFirst({ where: { id: itemId, deletedAt: null, is_combo: false }, select: { name: true } })
        if (!item) throw new Error('Product not found.')

        await tx.stock.upsert({
          where: { itemId_locationId: { itemId, locationId } },
          create: { itemId, locationId, quantity },
          update: { quantity: { increment: quantity } },
        })
        await writeActivityLog({
          action: 'create', entityType: 'stock', entityId: itemId, entityName: item.name,
          details: `Added ${quantity} units to location ${locationId}`,
          user, request, source: 'stock-api', client: tx,
        })
        return
      }

      if (action === 'remove') {
        const locationId = parseId(body.locationId, 'locationId')
        await requireLocationAccess(tx, user, locationId)
        const stock = await tx.stock.findUnique({
          where: { itemId_locationId: { itemId, locationId } },
          include: { item: { select: { name: true } } },
        })
        if (!stock) throw new Error('Stock record not found.')
        if (stock.quantity < quantity) throw new Error('Cannot remove more stock than is available.')

        await tx.stock.update({ where: { id: stock.id }, data: { quantity: { decrement: quantity } } })
        await writeActivityLog({
          action: 'update', entityType: 'stock', entityId: stock.id, entityName: stock.item.name,
          details: `Removed ${quantity} units from location ${stock.locationId}`,
          user, request, source: 'stock-api', client: tx,
        })
        return
      }

      if (action === 'transfer') {
        const fromLocationId = parseId(body.fromLocationId, 'fromLocationId')
        const toLocationId = parseId(body.toLocationId, 'toLocationId')
        if (fromLocationId === toLocationId) throw new Error('Choose two different locations for a transfer.')
        await Promise.all([
          requireLocationAccess(tx, user, fromLocationId),
          requireLocationAccess(tx, user, toLocationId),
        ])
        const fromStock = await tx.stock.findUnique({
          where: { itemId_locationId: { itemId, locationId: fromLocationId } },
          include: { item: { select: { name: true } } },
        })
        if (!fromStock || fromStock.quantity < quantity) throw new Error('Insufficient stock at the source location.')

        await tx.stock.update({ where: { id: fromStock.id }, data: { quantity: { decrement: quantity } } })
        await tx.stock.upsert({
          where: { itemId_locationId: { itemId, locationId: toLocationId } },
          create: { itemId, locationId: toLocationId, quantity },
          update: { quantity: { increment: quantity } },
        })
        await tx.stockTransfer.create({ data: { itemId, fromLocationId, toLocationId, quantity } })
        await writeActivityLog({
          action: 'transfer', entityType: 'stock', entityId: itemId, entityName: fromStock.item.name,
          details: `Transferred ${quantity} units from ${fromLocationId} to ${toLocationId}`,
          user, request, source: 'stock-api', client: tx,
        })
        return
      }

      throw new Error('Unknown stock action.')
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update stock.' }, { status: 400 })
  }
}
