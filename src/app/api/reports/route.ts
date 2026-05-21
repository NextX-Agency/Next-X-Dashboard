import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  ReportCategory,
  ReportComboItem,
  ReportCommission,
  ReportExpense,
  ReportItem,
  ReportLocation,
  ReportReservation,
  ReportSale,
  ReportSaleItem,
  ReportsDataPayload,
  ReportSeller,
  ReportStock,
  ReportWallet,
} from '@/types/reports'

function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value)
}

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function mapItem(item: {
  id: string
  name: string
  categoryId: string | null
  purchasePriceUsd: unknown
  sellingPriceSrd: unknown
  sellingPriceUsd: unknown
  is_combo: boolean | null
  deletedAt: Date | null
}): ReportItem {
  return {
    id: item.id,
    name: item.name,
    category_id: item.categoryId,
    purchase_price_usd: toNumber(item.purchasePriceUsd),
    selling_price_srd: item.sellingPriceSrd == null ? null : toNumber(item.sellingPriceSrd),
    selling_price_usd: item.sellingPriceUsd == null ? null : toNumber(item.sellingPriceUsd),
    is_combo: item.is_combo,
    deleted_at: item.deletedAt ? toIsoString(item.deletedAt) : null,
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [sales, items, stocks, locations, expenses, commissions, wallets, reservations, comboItems, sellers, categories] = await Promise.all([
      prisma.sale.findMany({
        select: {
          id: true,
          locationId: true,
          sellerId: true,
          wallet_id: true,
          currency: true,
          exchangeRate: true,
          totalAmount: true,
          paymentMethod: true,
          notes: true,
          createdAt: true,
          saleItems: {
            select: {
              id: true,
              saleId: true,
              itemId: true,
              quantity: true,
              unitPrice: true,
              subtotal: true,
              is_custom_price: true,
              original_price: true,
              discount_reason: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.item.findMany({
        select: {
          id: true,
          name: true,
          categoryId: true,
          purchasePriceUsd: true,
          sellingPriceSrd: true,
          sellingPriceUsd: true,
          is_combo: true,
          deletedAt: true,
        },
      }),
      prisma.stock.findMany({
        select: {
          id: true,
          itemId: true,
          locationId: true,
          quantity: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.location.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.expense.findMany({
        select: {
          id: true,
          categoryId: true,
          walletId: true,
          location_id: true,
          amount: true,
          currency: true,
          description: true,
          createdAt: true,
          category: {
            select: {
              id: true,
              name: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.commission.findMany({
        select: {
          id: true,
          sellerId: true,
          saleId: true,
          commissionAmount: true,
          paid: true,
          createdAt: true,
          location_id: true,
          category_id: true,
          sale: {
            select: { currency: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.wallet.findMany({
        select: {
          id: true,
          personName: true,
          type: true,
          currency: true,
          balance: true,
          location_id: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.reservation.findMany({
        select: {
          id: true,
          clientId: true,
          itemId: true,
          locationId: true,
          quantity: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          combo_id: true,
          combo_price: true,
          original_price: true,
          item: {
            select: {
              id: true,
              name: true,
              categoryId: true,
              purchasePriceUsd: true,
              sellingPriceSrd: true,
              sellingPriceUsd: true,
              is_combo: true,
              deletedAt: true,
            },
          },
          client: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.combo_items.findMany({
        select: {
          id: true,
          combo_id: true,
          item_id: true,
          quantity: true,
          created_at: true,
        },
      }),
      prisma.seller.findMany({
        select: {
          id: true,
          name: true,
          commissionRate: true,
          location_id: true,
        },
      }),
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
    ])

    const data: ReportsDataPayload = {
      sales: sales.map<ReportSale>((sale) => ({
        id: sale.id,
        location_id: sale.locationId,
        seller_id: sale.sellerId,
        wallet_id: sale.wallet_id,
        currency: sale.currency,
        exchange_rate: sale.exchangeRate == null ? null : toNumber(sale.exchangeRate),
        total_amount: toNumber(sale.totalAmount),
        payment_method: sale.paymentMethod,
        notes: sale.notes,
        created_at: toIsoString(sale.createdAt),
        sale_items: sale.saleItems.map<ReportSaleItem>((saleItem) => ({
          id: saleItem.id,
          sale_id: saleItem.saleId,
          item_id: saleItem.itemId,
          quantity: saleItem.quantity,
          unit_price: toNumber(saleItem.unitPrice),
          subtotal: toNumber(saleItem.subtotal),
          is_custom_price: saleItem.is_custom_price ?? false,
          original_price: saleItem.original_price == null ? null : toNumber(saleItem.original_price),
          discount_reason: saleItem.discount_reason,
          created_at: toIsoString(saleItem.createdAt),
        })),
      })),
      items: items.map(mapItem),
      stocks: stocks.map<ReportStock>((stock) => ({
        id: stock.id,
        item_id: stock.itemId,
        location_id: stock.locationId,
        quantity: stock.quantity,
        created_at: toIsoString(stock.createdAt),
        updated_at: toIsoString(stock.updatedAt),
      })),
      locations: locations.map<ReportLocation>((location) => ({
        id: location.id,
        name: location.name,
      })),
      expenses: expenses.map<ReportExpense>((expense) => ({
        id: expense.id,
        category_id: expense.categoryId,
        wallet_id: expense.walletId,
        location_id: expense.location_id,
        amount: toNumber(expense.amount),
        currency: expense.currency,
        description: expense.description,
        created_at: toIsoString(expense.createdAt),
        expense_categories: expense.category
          ? {
            id: expense.category.id,
            name: expense.category.name,
            created_at: toIsoString(expense.category.createdAt),
          }
          : null,
      })),
      commissions: commissions.map<ReportCommission>((commission) => ({
        id: commission.id,
        seller_id: commission.sellerId,
        sale_id: commission.saleId,
        commission_amount: toNumber(commission.commissionAmount),
        paid: commission.paid,
        created_at: toIsoString(commission.createdAt),
        location_id: commission.location_id,
        category_id: commission.category_id,
        sales: commission.sale ? { currency: commission.sale.currency } : null,
      })),
      wallets: wallets.map<ReportWallet>((wallet) => ({
        id: wallet.id,
        person_name: wallet.personName,
        type: wallet.type,
        currency: wallet.currency,
        balance: toNumber(wallet.balance),
        location_id: wallet.location_id,
        created_at: toIsoString(wallet.createdAt),
        updated_at: toIsoString(wallet.updatedAt),
      })),
      reservations: reservations.map<ReportReservation>((reservation) => ({
        id: reservation.id,
        client_id: reservation.clientId,
        item_id: reservation.itemId,
        location_id: reservation.locationId,
        quantity: reservation.quantity,
        status: reservation.status,
        notes: reservation.notes,
        created_at: toIsoString(reservation.createdAt),
        updated_at: toIsoString(reservation.updatedAt),
        combo_id: reservation.combo_id,
        combo_price: reservation.combo_price == null ? null : toNumber(reservation.combo_price),
        original_price: reservation.original_price == null ? null : toNumber(reservation.original_price),
        items: reservation.item ? mapItem(reservation.item) : null,
        clients: reservation.client ? { name: reservation.client.name } : null,
      })),
      comboItems: comboItems.map<ReportComboItem>((comboItem) => ({
        id: comboItem.id,
        combo_id: comboItem.combo_id,
        item_id: comboItem.item_id,
        quantity: comboItem.quantity,
        created_at: toIsoString(comboItem.created_at),
      })),
      sellers: sellers.map<ReportSeller>((seller) => ({
        id: seller.id,
        name: seller.name,
        commission_rate: toNumber(seller.commissionRate),
        location_id: seller.location_id,
      })),
      categories: categories.map<ReportCategory>((category) => ({
        id: category.id,
        name: category.name,
        created_at: toIsoString(category.createdAt),
      })),
    }

    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Reports route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}