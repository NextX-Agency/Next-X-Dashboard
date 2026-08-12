import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/apiAuth'
import { getAccessibleLocationIds } from '@/lib/locationAccess'

function asNumber(value: unknown) {
  return Number(value ?? 0)
}

export async function GET(request: NextRequest) {
  const user = await requireRole(request, ['admin', 'seller'])
  if (user instanceof NextResponse) return user

  try {
    const data = await prisma.$transaction(async (tx) => {
      const locationIds = await getAccessibleLocationIds(tx, user)
      const locationFilter = locationIds === null ? {} : { id: { in: locationIds } }

      const locations = await tx.location.findMany({
        where: { ...locationFilter, is_active: true },
        select: {
          id: true,
          name: true,
          catalogType: true,
          wallets: {
            select: {
              id: true,
              type: true,
              currency: true,
              purpose: true,
              balance: true,
              updatedAt: true,
            },
            orderBy: [{ currency: 'asc' }, { type: 'asc' }],
          },
          stock: {
            select: {
              quantity: true,
              item: {
                select: {
                  id: true,
                  name: true,
                  sellingPriceSrd: true,
                  sellingPriceUsd: true,
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      const walletIds = locations.flatMap((location) => location.wallets.map((wallet) => wallet.id))
      const [reconciliations, notifications] = await Promise.all([
        walletIds.length
          ? tx.walletReconciliation.findMany({
              where: { walletId: { in: walletIds } },
              select: { walletId: true, reconciledAt: true },
              orderBy: { reconciledAt: 'desc' },
            })
          : Promise.resolve([]),
        tx.userNotification.findMany({
          where: { userId: user.id, resolvedAt: null },
          select: {
            id: true,
            walletId: true,
            locationId: true,
            notificationType: true,
            title: true,
            body: true,
            createdAt: true,
            readAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      const lastReconciledAt = new Map<string, string>()
      reconciliations.forEach((reconciliation) => {
        if (!lastReconciledAt.has(reconciliation.walletId)) {
          lastReconciledAt.set(reconciliation.walletId, reconciliation.reconciledAt.toISOString())
        }
      })

      const products = new Map<string, {
        id: string
        name: string
        sellingPriceSrd: number | null
        sellingPriceUsd: number | null
        availability: Array<{ locationId: string; quantity: number }>
      }>()
      locations.forEach((location) => {
        location.stock.forEach((stock) => {
          if (!stock.item) return
          const product = products.get(stock.item.id) ?? {
            id: stock.item.id,
            name: stock.item.name,
            sellingPriceSrd: stock.item.sellingPriceSrd === null ? null : asNumber(stock.item.sellingPriceSrd),
            sellingPriceUsd: stock.item.sellingPriceUsd === null ? null : asNumber(stock.item.sellingPriceUsd),
            availability: [],
          }
          product.availability.push({ locationId: location.id, quantity: stock.quantity })
          products.set(product.id, product)
        })
      })

      return {
        locations: locations.map((location) => ({
          id: location.id,
          name: location.name,
          catalogType: location.catalogType,
          stockQuantity: location.stock.reduce((sum, stock) => sum + stock.quantity, 0),
          wallets: location.wallets.map((wallet) => ({
            id: wallet.id,
            type: wallet.type,
            currency: wallet.currency,
            purpose: wallet.purpose,
            balance: asNumber(wallet.balance),
            lastActivityAt: wallet.updatedAt.toISOString(),
            lastReconciledAt: lastReconciledAt.get(wallet.id) ?? null,
          })),
        })),
        notifications: notifications.map((notification) => ({
          ...notification,
          createdAt: notification.createdAt.toISOString(),
          readAt: notification.readAt?.toISOString() ?? null,
        })),
        products: Array.from(products.values()).sort((left, right) => left.name.localeCompare(right.name)),
      }
    })

    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Seller portal error:', error)
    return NextResponse.json({ error: 'Unable to load seller workspace.' }, { status: 500 })
  }
}
