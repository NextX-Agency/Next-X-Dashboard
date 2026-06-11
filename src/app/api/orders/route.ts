import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  OrdersPageClient,
  OrdersPageDataPayload,
  OrdersPageItem,
  OrdersPageLocation,
  OrdersPageOrderAllocation,
  OrdersPageOrder,
  OrdersPageOrderItem,
  OrdersPageWallet,
} from '@/types/orders'

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNullableIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value)
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [orders, items, locations, wallets, clients] = await Promise.all([
      prisma.purchaseOrder.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletId: true,
          locationId: true,
          supplier_id: true,
          totalAmount: true,
          currency: true,
          exchange_rate: true,
          status: true,
          notes: true,
          expected_arrival: true,
          createdAt: true,
          updatedAt: true,
          wallet: {
            select: {
              id: true,
              personName: true,
              type: true,
              currency: true,
              balance: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
            },
          },
          clients: {
            select: {
              id: true,
              name: true,
            },
          },
          purchase_order_items: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              order_id: true,
              itemId: true,
              quantity: true,
              unit_cost: true,
              subtotal: true,
              quantity_received: true,
              item: {
                select: {
                  id: true,
                  name: true,
                  purchasePriceUsd: true,
                },
              },
              allocations: {
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  orderItemId: true,
                  locationId: true,
                  quantity: true,
                  quantity_received: true,
                  createdAt: true,
                  updatedAt: true,
                  location: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.item.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          purchasePriceUsd: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.location.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.wallet.findMany({
        select: {
          id: true,
          personName: true,
          type: true,
          currency: true,
          balance: true,
        },
        orderBy: { personName: 'asc' },
      }),
      prisma.client.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
    ])

    const data: OrdersPageDataPayload = {
      orders: orders.map<OrdersPageOrder>((order) => ({
        id: order.id,
        wallet_id: order.walletId,
        location_id: order.locationId,
        supplier_id: order.supplier_id,
        total_amount: toNumber(order.totalAmount),
        currency: order.currency,
        exchange_rate: toNullableNumber(order.exchange_rate),
        status: order.status,
        notes: order.notes,
        expected_arrival: toNullableIsoString(order.expected_arrival),
        created_at: toIsoString(order.createdAt),
        updated_at: toIsoString(order.updatedAt),
        wallets: order.wallet
          ? {
            id: order.wallet.id,
            person_name: order.wallet.personName,
            type: order.wallet.type,
            currency: order.wallet.currency,
            balance: toNumber(order.wallet.balance),
          }
          : null,
        locations: order.location
          ? {
            id: order.location.id,
            name: order.location.name,
          }
          : null,
        clients: order.clients
          ? {
            id: order.clients.id,
            name: order.clients.name,
          }
          : null,
        purchase_order_items: order.purchase_order_items.map<OrdersPageOrderItem>((item) => ({
          id: item.id,
          order_id: item.order_id,
          item_id: item.itemId,
          quantity: item.quantity,
          unit_cost: toNumber(item.unit_cost),
          subtotal: toNumber(item.subtotal),
          quantity_received: item.quantity_received,
          items: item.item
            ? {
              id: item.item.id,
              name: item.item.name,
              purchase_price_usd: toNumber(item.item.purchasePriceUsd),
            }
            : null,
          purchase_order_allocations: item.allocations.map<OrdersPageOrderAllocation>((allocation) => ({
            id: allocation.id,
            order_item_id: allocation.orderItemId,
            location_id: allocation.locationId,
            quantity: allocation.quantity,
            quantity_received: allocation.quantity_received,
            created_at: toIsoString(allocation.createdAt),
            updated_at: toIsoString(allocation.updatedAt),
            locations: allocation.location
              ? {
                id: allocation.location.id,
                name: allocation.location.name,
              }
              : null,
          })),
        })),
      })),
      items: items.map<OrdersPageItem>((item) => ({
        id: item.id,
        name: item.name,
        purchase_price_usd: toNumber(item.purchasePriceUsd),
      })),
      locations: locations.map<OrdersPageLocation>((location) => ({
        id: location.id,
        name: location.name,
      })),
      wallets: wallets.map<OrdersPageWallet>((wallet) => ({
        id: wallet.id,
        person_name: wallet.personName,
        type: wallet.type,
        currency: wallet.currency,
        balance: toNumber(wallet.balance),
      })),
      clients: clients.map<OrdersPageClient>((client) => ({
        id: client.id,
        name: client.name,
      })),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Orders route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
