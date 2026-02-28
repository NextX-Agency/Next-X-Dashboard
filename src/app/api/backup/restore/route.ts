import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activityLog'

// Reverse FK-safe order for deletion (dependent tables first)
const DELETE_ORDER = [
  'activityLogs',
  'subscribers',
  'testimonials',
  'faqs',
  'reviews',
  'collectionItems',
  'collections',
  'pages',
  'banners',
  'blogPostTags',
  'blogPosts',
  'budgets',
  'walletTransactions',
  'expenses',
  'commissions',
  'saleItems',
  'sales',
  'reservations',
  'purchaseOrderItems',
  'purchaseOrders',
  'goals',
  'wallets',
  'stockTransfers',
  'stock',
  'itemFeatures',
  'itemImages',
  'comboItems',
  'items',
  'clients',
  'sellerCategoryRates',
  'sellers',
  'storeSettings',
  'exchangeRates',
  'locations',
  'blogTags',
  'blogCategories',
  'budgetCategories',
  'expenseCategories',
  'categories',
  'users',
] as const

// FK-safe insert order (independent tables first)
const INSERT_ORDER = [
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

// Helper: convert date strings back to Date objects for Prisma
function parseDates(record: Record<string, unknown>): Record<string, unknown> {
  const dateFields = [
    'createdAt', 'updatedAt', 'created_at', 'updated_at',
    'lastLoginAt', 'last_login_at', 'setAt', 'set_at',
    'startDate', 'start_date', 'endDate', 'end_date',
    'deadline', 'publishedAt', 'published_at',
    'subscribedAt', 'subscribed_at',
    'expected_arrival',
  ]
  const result = { ...record }
  for (const field of dateFields) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = new Date(result[field] as string)
    }
  }
  return result
}

// Wipe all tables in FK-safe order
async function wipeAllTables() {
  // Use raw SQL for reliable cascade-free deletion in correct order
  await prisma.$executeRawUnsafe('DELETE FROM activity_logs')
  await prisma.$executeRawUnsafe('DELETE FROM subscribers')
  await prisma.$executeRawUnsafe('DELETE FROM testimonials')
  await prisma.$executeRawUnsafe('DELETE FROM faqs')
  await prisma.$executeRawUnsafe('DELETE FROM reviews')
  await prisma.$executeRawUnsafe('DELETE FROM collection_items')
  await prisma.$executeRawUnsafe('DELETE FROM collections')
  await prisma.$executeRawUnsafe('DELETE FROM pages')
  await prisma.$executeRawUnsafe('DELETE FROM banners')
  await prisma.$executeRawUnsafe('DELETE FROM blog_post_tags')
  await prisma.$executeRawUnsafe('DELETE FROM blog_posts')
  await prisma.$executeRawUnsafe('DELETE FROM budgets')
  await prisma.$executeRawUnsafe('DELETE FROM wallet_transactions')
  await prisma.$executeRawUnsafe('DELETE FROM expenses')
  await prisma.$executeRawUnsafe('DELETE FROM commissions')
  await prisma.$executeRawUnsafe('DELETE FROM sale_items')
  await prisma.$executeRawUnsafe('DELETE FROM sales')
  await prisma.$executeRawUnsafe('DELETE FROM reservations')
  await prisma.$executeRawUnsafe('DELETE FROM purchase_order_items')
  await prisma.$executeRawUnsafe('DELETE FROM purchase_orders')
  await prisma.$executeRawUnsafe('DELETE FROM goals')
  await prisma.$executeRawUnsafe('DELETE FROM wallets')
  await prisma.$executeRawUnsafe('DELETE FROM stock_transfers')
  await prisma.$executeRawUnsafe('DELETE FROM stock')
  await prisma.$executeRawUnsafe('DELETE FROM item_features')
  await prisma.$executeRawUnsafe('DELETE FROM item_images')
  await prisma.$executeRawUnsafe('DELETE FROM combo_items')
  await prisma.$executeRawUnsafe('DELETE FROM items')
  await prisma.$executeRawUnsafe('DELETE FROM clients')
  await prisma.$executeRawUnsafe('DELETE FROM seller_category_rates')
  await prisma.$executeRawUnsafe('DELETE FROM sellers')
  await prisma.$executeRawUnsafe('DELETE FROM store_settings')
  await prisma.$executeRawUnsafe('DELETE FROM exchange_rates')
  await prisma.$executeRawUnsafe('DELETE FROM locations')
  await prisma.$executeRawUnsafe('DELETE FROM blog_tags')
  await prisma.$executeRawUnsafe('DELETE FROM blog_categories')
  await prisma.$executeRawUnsafe('DELETE FROM budget_categories')
  await prisma.$executeRawUnsafe('DELETE FROM expense_categories')
  await prisma.$executeRawUnsafe('DELETE FROM categories')
  await prisma.$executeRawUnsafe('DELETE FROM users')
}

// Insert records for a given table using createMany
async function insertTable(tableName: string, records: Record<string, unknown>[]) {
  if (!records || records.length === 0) return 0

  const parsed = records.map(parseDates)

  switch (tableName) {
    case 'users':
      await prisma.user.createMany({ data: parsed as any })
      break
    case 'categories':
      await prisma.category.createMany({ data: parsed as any })
      break
    case 'expenseCategories':
      await prisma.expenseCategory.createMany({ data: parsed as any })
      break
    case 'budgetCategories':
      await prisma.budgetCategory.createMany({ data: parsed as any })
      break
    case 'blogCategories':
      await prisma.blogCategory.createMany({ data: parsed as any })
      break
    case 'blogTags':
      await prisma.blogTag.createMany({ data: parsed as any })
      break
    case 'locations':
      await prisma.location.createMany({ data: parsed as any })
      break
    case 'exchangeRates':
      await prisma.exchangeRate.createMany({ data: parsed as any })
      break
    case 'storeSettings':
      await prisma.storeSetting.createMany({ data: parsed as any })
      break
    case 'sellers':
      await prisma.seller.createMany({ data: parsed as any })
      break
    case 'sellerCategoryRates':
      await prisma.seller_category_rates.createMany({ data: parsed as any })
      break
    case 'clients':
      await prisma.client.createMany({ data: parsed as any })
      break
    case 'items':
      await prisma.item.createMany({ data: parsed as any })
      break
    case 'comboItems':
      await prisma.combo_items.createMany({ data: parsed as any })
      break
    case 'itemImages':
      await prisma.itemImage.createMany({ data: parsed as any })
      break
    case 'itemFeatures':
      await prisma.itemFeature.createMany({ data: parsed as any })
      break
    case 'stock':
      await prisma.stock.createMany({ data: parsed as any })
      break
    case 'stockTransfers':
      await prisma.stockTransfer.createMany({ data: parsed as any })
      break
    case 'wallets':
      await prisma.wallet.createMany({ data: parsed as any })
      break
    case 'goals':
      await prisma.goal.createMany({ data: parsed as any })
      break
    case 'purchaseOrders':
      await prisma.purchaseOrder.createMany({ data: parsed as any })
      break
    case 'purchaseOrderItems':
      await prisma.purchaseOrderItem.createMany({ data: parsed as any })
      break
    case 'reservations':
      await prisma.reservation.createMany({ data: parsed as any })
      break
    case 'sales':
      await prisma.sale.createMany({ data: parsed as any })
      break
    case 'saleItems':
      await prisma.saleItem.createMany({ data: parsed as any })
      break
    case 'commissions':
      await prisma.commission.createMany({ data: parsed as any })
      break
    case 'expenses':
      await prisma.expense.createMany({ data: parsed as any })
      break
    case 'walletTransactions':
      await prisma.wallet_transactions.createMany({ data: parsed as any })
      break
    case 'budgets':
      await prisma.budget.createMany({ data: parsed as any })
      break
    case 'blogPosts':
      await prisma.blogPost.createMany({ data: parsed as any })
      break
    case 'blogPostTags':
      await prisma.blogPostTag.createMany({ data: parsed as any })
      break
    case 'banners':
      await prisma.banner.createMany({ data: parsed as any })
      break
    case 'pages':
      await prisma.page.createMany({ data: parsed as any })
      break
    case 'collections':
      await prisma.collection.createMany({ data: parsed as any })
      break
    case 'collectionItems':
      await prisma.collectionItem.createMany({ data: parsed as any })
      break
    case 'reviews':
      await prisma.review.createMany({ data: parsed as any })
      break
    case 'faqs':
      await prisma.fAQ.createMany({ data: parsed as any })
      break
    case 'testimonials':
      await prisma.testimonial.createMany({ data: parsed as any })
      break
    case 'subscribers':
      await prisma.subscriber.createMany({ data: parsed as any })
      break
    case 'activityLogs':
      await prisma.activityLog.createMany({ data: parsed as any })
      break
  }

  return records.length
}

// Upsert records for a given table (merge mode)
async function upsertTable(tableName: string, records: Record<string, unknown>[]) {
  if (!records || records.length === 0) return 0

  let count = 0
  const parsed = records.map(parseDates)

  for (const record of parsed) {
    const id = record.id as string
    if (!id) continue

    try {
      switch (tableName) {
        case 'users':
          await prisma.user.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'categories':
          await prisma.category.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'expenseCategories':
          await prisma.expenseCategory.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'budgetCategories':
          await prisma.budgetCategory.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogCategories':
          await prisma.blogCategory.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogTags':
          await prisma.blogTag.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'locations':
          await prisma.location.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'exchangeRates':
          await prisma.exchangeRate.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'storeSettings':
          await prisma.storeSetting.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'sellers':
          await prisma.seller.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'sellerCategoryRates':
          await prisma.seller_category_rates.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'clients':
          await prisma.client.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'items':
          await prisma.item.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'comboItems':
          await prisma.combo_items.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'itemImages':
          await prisma.itemImage.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'itemFeatures':
          await prisma.itemFeature.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'stock':
          await prisma.stock.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'stockTransfers':
          await prisma.stockTransfer.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'wallets':
          await prisma.wallet.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'goals':
          await prisma.goal.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrders':
          await prisma.purchaseOrder.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrderItems':
          await prisma.purchaseOrderItem.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'reservations':
          await prisma.reservation.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'sales':
          await prisma.sale.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'saleItems':
          await prisma.saleItem.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'commissions':
          await prisma.commission.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'expenses':
          await prisma.expense.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'walletTransactions':
          await prisma.wallet_transactions.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'budgets':
          await prisma.budget.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogPosts':
          await prisma.blogPost.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogPostTags':
          await prisma.blogPostTag.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'banners':
          await prisma.banner.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'pages':
          await prisma.page.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'collections':
          await prisma.collection.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'collectionItems':
          await prisma.collectionItem.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'reviews':
          await prisma.review.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'faqs':
          await prisma.fAQ.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'testimonials':
          await prisma.testimonial.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'subscribers':
          await prisma.subscriber.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'activityLogs':
          await prisma.activityLog.upsert({ where: { id }, create: record as any, update: record as any })
          break
      }
      count++
    } catch (err) {
      console.error(`Upsert error for ${tableName} id=${id}:`, err)
    }
  }

  return count
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const body = await request.json()
    const { backup, mode } = body as { backup: any; mode: 'wipe' | 'merge' }

    if (!backup || !backup.tables || !backup.version) {
      return NextResponse.json(
        { error: 'Invalid backup data' },
        { status: 400 }
      )
    }

    if (!mode || !['wipe', 'merge'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Use "wipe" or "merge".' },
        { status: 400 }
      )
    }

    const results: Record<string, number> = {}
    const errors: string[] = []

    if (mode === 'wipe') {
      // Step 1: Delete all data in reverse FK order
      try {
        await wipeAllTables()
      } catch (err) {
        console.error('Wipe error:', err)
        return NextResponse.json(
          { error: 'Failed to wipe tables. Restore aborted.' },
          { status: 500 }
        )
      }

      // Step 2: Insert all data in FK-safe order
      for (const table of INSERT_ORDER) {
        try {
          const records = backup.tables[table]
          const count = await insertTable(table, records || [])
          results[table] = count
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push(`${table}: ${message}`)
          console.error(`Insert error for ${table}:`, err)
        }
      }
    } else {
      // Merge mode: upsert each table
      for (const table of INSERT_ORDER) {
        try {
          const records = backup.tables[table]
          const count = await upsertTable(table, records || [])
          results[table] = count
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push(`${table}: ${message}`)
          console.error(`Upsert error for ${table}:`, err)
        }
      }
    }

    await logActivity({
      action: 'update',
      entityType: 'settings',
      entityName: 'Database Restore',
      details: `Restored database (${mode} mode). Tables: ${Object.keys(results).length}, Errors: ${errors.length}`,
    })

    return NextResponse.json({
      success: errors.length === 0,
      mode,
      results,
      errors: errors.length > 0 ? errors : undefined,
      totalRows: Object.values(results).reduce((sum, n) => sum + n, 0),
    })
  } catch (error) {
    console.error('Backup restore error:', error)
    return NextResponse.json(
      { error: 'Failed to restore backup' },
      { status: 500 }
    )
  }
}
