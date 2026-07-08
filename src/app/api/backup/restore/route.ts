import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'
import {
  createBackupPayload,
  DELETE_ORDER,
  fetchBackupFromUrl,
  getExistingBackupTables,
  INSERT_ORDER,
  saveBackupToBlob,
  TABLE_DB_NAMES,
  validateBackupPayload,
  type BackupTableName,
} from '@/lib/backup'
import { WIPE_RESTORE_CONFIRMATION } from '@/types/backup'

// Helper: convert date strings back to Date objects for Prisma
function parseDates(record: Record<string, unknown>): Record<string, unknown> {
  const dateFields = [
    'createdAt', 'updatedAt', 'created_at', 'updated_at',
    'lastLoginAt', 'last_login_at', 'setAt', 'set_at',
    'startDate', 'start_date', 'endDate', 'end_date',
    'deadline', 'publishedAt', 'published_at',
    'dueDate', 'due_date', 'issuedAt', 'issued_at',
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

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

// Wipe all present tables in FK-safe order.
async function wipeAllTables(existingTables: ReadonlySet<BackupTableName>) {
  for (const table of DELETE_ORDER) {
    if (!existingTables.has(table)) continue
    await prisma.$executeRawUnsafe(`DELETE FROM ${quoteIdentifier(TABLE_DB_NAMES[table])}`)
  }
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
    case 'financeObligations':
      await prisma.financeObligation.createMany({ data: parsed as any })
      break
    case 'purchaseOrders':
      await prisma.purchaseOrder.createMany({ data: parsed as any })
      break
    case 'purchaseOrderItems':
      await prisma.purchaseOrderItem.createMany({ data: parsed as any })
      break
    case 'purchaseOrderAllocations':
      await prisma.purchaseOrderAllocation.createMany({ data: parsed as any })
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
    case 'siteAnalyticsEvents':
      await prisma.siteAnalyticsEvent.createMany({ data: parsed as any })
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
        case 'financeObligations':
          await prisma.financeObligation.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrders':
          await prisma.purchaseOrder.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrderItems':
          await prisma.purchaseOrderItem.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrderAllocations':
          await prisma.purchaseOrderAllocation.upsert({ where: { id }, create: record as any, update: record as any })
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
        case 'siteAnalyticsEvents':
          await prisma.siteAnalyticsEvent.upsert({ where: { id }, create: record as any, update: record as any })
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
    const { backup, mode, url, confirmationText } = body as {
      backup?: unknown
      mode: 'wipe' | 'merge'
      url?: string
      confirmationText?: string
    }

    if (!mode || !['wipe', 'merge'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Use "wipe" or "merge".' },
        { status: 400 }
      )
    }

    if (!backup && !url) {
      return NextResponse.json(
        { error: 'Provide either backup data or a backup URL.' },
        { status: 400 }
      )
    }

    if (mode === 'wipe' && confirmationText !== WIPE_RESTORE_CONFIRMATION) {
      return NextResponse.json(
        { error: `Type "${WIPE_RESTORE_CONFIRMATION}" to confirm a wipe restore.` },
        { status: 400 }
      )
    }

    const backupSource = url ? await fetchBackupFromUrl(url) : backup
    const validation = validateBackupPayload(backupSource)

    if (!validation.valid || !validation.backup) {
      return NextResponse.json(
        {
          error: 'Backup validation failed. Restore aborted.',
          issues: validation.issues,
          warnings: validation.warnings,
          validation: validation.summary,
        },
        { status: 400 }
      )
    }

    let safetyBackup: Awaited<ReturnType<typeof saveBackupToBlob>>

    try {
      const snapshot = await createBackupPayload('pre-restore')
      safetyBackup = await saveBackupToBlob(snapshot, { prefix: 'pre-restore-backup' })
    } catch (snapshotError) {
      console.error('Pre-restore snapshot error:', snapshotError)
      return NextResponse.json(
        { error: 'Failed to create a pre-restore safety snapshot. Restore aborted.' },
        { status: 500 }
      )
    }

    const results: Record<string, number> = {}
    const errors: string[] = []
    const existingTables = await getExistingBackupTables()

    if (mode === 'wipe') {
      // Step 1: Delete all data in reverse FK order
      try {
        await wipeAllTables(existingTables)
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
          const records = Array.isArray(validation.backup.tables[table])
            ? validation.backup.tables[table] as Record<string, unknown>[]
            : []

          if (!existingTables.has(table)) {
            results[table] = 0
            if (records.length > 0) {
              errors.push(`${table}: table "${TABLE_DB_NAMES[table]}" does not exist in this database. Apply the matching migration before restoring these rows.`)
            }
            continue
          }

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
          const records = Array.isArray(validation.backup.tables[table])
            ? validation.backup.tables[table] as Record<string, unknown>[]
            : []

          if (!existingTables.has(table)) {
            results[table] = 0
            if (records.length > 0) {
              errors.push(`${table}: table "${TABLE_DB_NAMES[table]}" does not exist in this database. Apply the matching migration before restoring these rows.`)
            }
            continue
          }

          const count = await upsertTable(table, records || [])
          results[table] = count
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push(`${table}: ${message}`)
          console.error(`Upsert error for ${table}:`, err)
        }
      }
    }

    await writeActivityLog({
      action: 'update',
      entityType: 'settings',
      entityName: 'Database Restore',
      details: `Restored database (${mode} mode). Tables: ${Object.keys(results).length}, Errors: ${errors.length}, Safety snapshot: ${safetyBackup.pathname}`,
      user: authResult,
      request,
      source: 'server',
    })

    return NextResponse.json({
      success: errors.length === 0,
      mode,
      results,
      errors: errors.length > 0 ? errors : undefined,
      totalRows: Object.values(results).reduce((sum, n) => sum + n, 0),
      validation: validation.summary,
      safetyBackup: {
        url: safetyBackup.url,
        pathname: safetyBackup.pathname,
        createdAt: safetyBackup.createdAt,
      },
    })
  } catch (error) {
    console.error('Backup restore error:', error)
    return NextResponse.json(
      { error: 'Failed to restore backup' },
      { status: 500 }
    )
  }
}
