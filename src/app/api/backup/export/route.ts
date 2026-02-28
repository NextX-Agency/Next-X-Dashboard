import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

// FK-safe export order: independent tables first, dependent tables after
const TABLE_ORDER = [
  'users',
  'categories',
  'expenseCategories',
  'budgetCategories',
  'blogCategories',
  'blogTags',
  'locations',
  'exchangeRates',
  'storeSettings',
  'sellers',
  'sellerCategoryRates',
  'clients',
  'items',
  'comboItems',
  'itemImages',
  'itemFeatures',
  'stock',
  'stockTransfers',
  'wallets',
  'goals',
  'purchaseOrders',
  'purchaseOrderItems',
  'reservations',
  'sales',
  'saleItems',
  'commissions',
  'expenses',
  'walletTransactions',
  'budgets',
  'blogPosts',
  'blogPostTags',
  'banners',
  'pages',
  'collections',
  'collectionItems',
  'reviews',
  'faqs',
  'testimonials',
  'subscribers',
  'activityLogs',
] as const

// Map Prisma model names to their findMany calls
async function exportAllTables() {
  const data: Record<string, unknown[]> = {}

  data.users = await prisma.user.findMany()
  data.categories = await prisma.category.findMany()
  data.expenseCategories = await prisma.expenseCategory.findMany()
  data.budgetCategories = await prisma.budgetCategory.findMany()
  data.blogCategories = await prisma.blogCategory.findMany()
  data.blogTags = await prisma.blogTag.findMany()
  data.locations = await prisma.location.findMany()
  data.exchangeRates = await prisma.exchangeRate.findMany()
  data.storeSettings = await prisma.storeSetting.findMany()
  data.sellers = await prisma.seller.findMany()
  data.sellerCategoryRates = await prisma.seller_category_rates.findMany()
  data.clients = await prisma.client.findMany()
  data.items = await prisma.item.findMany()
  data.comboItems = await prisma.combo_items.findMany()
  data.itemImages = await prisma.itemImage.findMany()
  data.itemFeatures = await prisma.itemFeature.findMany()
  data.stock = await prisma.stock.findMany()
  data.stockTransfers = await prisma.stockTransfer.findMany()
  data.wallets = await prisma.wallet.findMany()
  data.goals = await prisma.goal.findMany()
  data.purchaseOrders = await prisma.purchaseOrder.findMany()
  data.purchaseOrderItems = await prisma.purchaseOrderItem.findMany()
  data.reservations = await prisma.reservation.findMany()
  data.sales = await prisma.sale.findMany()
  data.saleItems = await prisma.saleItem.findMany()
  data.commissions = await prisma.commission.findMany()
  data.expenses = await prisma.expense.findMany()
  data.walletTransactions = await prisma.wallet_transactions.findMany()
  data.budgets = await prisma.budget.findMany()
  data.blogPosts = await prisma.blogPost.findMany()
  data.blogPostTags = await prisma.blogPostTag.findMany()
  data.banners = await prisma.banner.findMany()
  data.pages = await prisma.page.findMany()
  data.collections = await prisma.collection.findMany()
  data.collectionItems = await prisma.collectionItem.findMany()
  data.reviews = await prisma.review.findMany()
  data.faqs = await prisma.fAQ.findMany()
  data.testimonials = await prisma.testimonial.findMany()
  data.subscribers = await prisma.subscriber.findMany()
  data.activityLogs = await prisma.activityLog.findMany()

  return data
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const tables = await exportAllTables()

    // Build row counts summary
    const rowCounts: Record<string, number> = {}
    for (const key of TABLE_ORDER) {
      rowCounts[key] = tables[key]?.length ?? 0
    }

    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      tableOrder: TABLE_ORDER,
      rowCounts,
      tables,
    }

    return NextResponse.json(backup)
  } catch (error) {
    console.error('Backup export error:', error)
    return NextResponse.json(
      { error: 'Failed to export backup' },
      { status: 500 }
    )
  }
}
