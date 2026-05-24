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
  ReportPurchaseOrder,
  ReportPurchaseOrderItem,
  ReportReservation,
  ReportSale,
  ReportSaleItem,
  ReportsDataPayload,
  ReportSeller,
  ReportStock,
  ReportWallet,
  ReportWalletTransaction,
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
  brand: string | null
  catalogType: string
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
    brand: item.brand,
    catalog_type: item.catalogType,
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
    const [sales, items, stocks, locations, expenses, commissions, wallets, walletTransactions, reservations, comboItems, sellers, categories, purchaseOrders] = await Promise.all([
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
          brand: true,
          catalogType: true,
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
      prisma.wallet_transactions.findMany({
        select: {
          id: true,
          wallet_id: true,
          sale_id: true,
          type: true,
          amount: true,
          balance_before: true,
          balance_after: true,
          description: true,
          created_at: true,
          expense_id: true,
          currency: true,
          reference_type: true,
          reference_id: true,
        },
        orderBy: { created_at: 'desc' },
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
              brand: true,
              catalogType: true,
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
      prisma.purchaseOrder.findMany({
        select: {
          id: true,
          walletId: true,
          locationId: true,
          totalAmount: true,
          currency: true,
          exchange_rate: true,
          status: true,
          createdAt: true,
          purchase_order_items: {
            select: {
              id: true,
              order_id: true,
              itemId: true,
              quantity: true,
              unit_cost: true,
              subtotal: true,
              quantity_received: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
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
      walletTransactions: walletTransactions.map<ReportWalletTransaction>((transaction) => ({
        id: transaction.id,
        wallet_id: transaction.wallet_id,
        sale_id: transaction.sale_id,
        type: transaction.type,
        amount: toNumber(transaction.amount),
        balance_before: toNumber(transaction.balance_before),
        balance_after: toNumber(transaction.balance_after),
        description: transaction.description,
        created_at: toIsoString(transaction.created_at),
        expense_id: transaction.expense_id,
        currency: transaction.currency,
        reference_type: transaction.reference_type,
        reference_id: transaction.reference_id,
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
      purchaseOrders: purchaseOrders.map<ReportPurchaseOrder>((order) => ({
        id: order.id,
        wallet_id: order.walletId,
        location_id: order.locationId,
        total_amount: toNumber(order.totalAmount),
        currency: order.currency,
        exchange_rate: order.exchange_rate == null ? null : toNumber(order.exchange_rate),
        status: order.status,
        created_at: toIsoString(order.createdAt),
        purchase_order_items: order.purchase_order_items.map<ReportPurchaseOrderItem>((item) => ({
          id: item.id,
          order_id: item.order_id,
          item_id: item.itemId,
          quantity: item.quantity,
          unit_cost: toNumber(item.unit_cost),
          subtotal: toNumber(item.subtotal),
          quantity_received: item.quantity_received,
          created_at: toIsoString(item.createdAt),
        })),
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