import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'
import {
  createBackupPayload,
  DELETE_ORDER,
  fetchBackupFromPathname,
  getExistingBackupTables,
  INSERT_ORDER,
  saveBackupToBlob,
  TABLE_DB_NAMES,
  validateBackupPayload,
  type BackupTableName,
} from '@/lib/backup'
import { WIPE_RESTORE_CONFIRMATION } from '@/types/backup'

// Every write in a restore runs on the caller's transaction client, never on
// the `prisma` singleton. A restore is all-or-nothing: the wipe and all ~45
// table inserts share one transaction so that a failure at any point rolls the
// database back to exactly where it started.
type RestoreClient = Prisma.TransactionClient

// A full restore moves tens of thousands of rows and comfortably exceeds
// Prisma's 5s interactive-transaction default.
const RESTORE_TRANSACTION_TIMEOUT_MS = 120000

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
//
// This runs inside the caller's transaction. It must NOT open one of its own:
// the wipe and every subsequent insert have to share a single transaction, or a
// failure partway leaves the database emptied with nothing to roll back to.
async function wipeAllTables(tx: RestoreClient, existingTables: ReadonlySet<BackupTableName>) {
  // The append-only ledger allows this scoped maintenance path only during
  // an explicit administrator-approved wipe restore.
  await tx.$executeRawUnsafe("SELECT set_config('app.finance_ledger_maintenance', 'on', true)")
  const sessionTable = await tx.$queryRawUnsafe<Array<{ exists: boolean }>>(
    "SELECT to_regclass('public.app_sessions') IS NOT NULL AS exists",
  )
  // Sessions are deliberately not restored, so revoke every live session
  // before restoring users. This prevents an old browser token surviving a
  // recovery operation.
  if (sessionTable[0]?.exists) {
    await tx.$executeRawUnsafe('DELETE FROM public.app_sessions')
  }
  for (const table of DELETE_ORDER) {
    if (!existingTables.has(table)) continue
    await tx.$executeRawUnsafe(`DELETE FROM ${quoteIdentifier(TABLE_DB_NAMES[table])}`)
  }
  // set_config(..., true) is transaction-local, and the transaction now covers
  // the whole restore. Close the maintenance window as soon as the deletes are
  // done so the ledger is append-only again for the insert phase.
  await tx.$executeRawUnsafe("SELECT set_config('app.finance_ledger_maintenance', 'off', true)")
}

// Insert records for a given table using createMany
async function insertTable(tx: RestoreClient, tableName: string, records: Record<string, unknown>[], hasLedgerSnapshot: boolean) {
  if (!records || records.length === 0) return 0

  const parsed = records.map(parseDates)

  switch (tableName) {
    case 'users':
      await tx.user.createMany({ data: parsed as any })
      break
    case 'categories':
      await tx.category.createMany({ data: parsed as any })
      break
    case 'expenseCategories':
      await tx.expenseCategory.createMany({ data: parsed as any })
      break
    case 'budgetCategories':
      await tx.budgetCategory.createMany({ data: parsed as any })
      break
    case 'blogCategories':
      await tx.blogCategory.createMany({ data: parsed as any })
      break
    case 'blogTags':
      await tx.blogTag.createMany({ data: parsed as any })
      break
    case 'locations':
      await tx.location.createMany({ data: parsed as any })
      break
    case 'userLocationAccess':
      await tx.userLocationAccess.createMany({ data: parsed as any })
      break
    case 'exchangeRates':
      await tx.exchangeRate.createMany({ data: parsed as any })
      break
    case 'storeSettings':
      await tx.storeSetting.createMany({ data: parsed as any })
      break
    case 'sellers':
      await tx.seller.createMany({ data: parsed as any })
      break
    case 'sellerCategoryRates':
      await tx.seller_category_rates.createMany({ data: parsed as any })
      break
    case 'clients':
      await tx.client.createMany({ data: parsed as any })
      break
    case 'items':
      await tx.item.createMany({ data: parsed as any })
      break
    case 'comboItems':
      await tx.combo_items.createMany({ data: parsed as any })
      break
    case 'itemImages':
      await tx.itemImage.createMany({ data: parsed as any })
      break
    case 'itemFeatures':
      await tx.itemFeature.createMany({ data: parsed as any })
      break
    case 'stock':
      await tx.stock.createMany({ data: parsed as any })
      break
    case 'stockTransfers':
      await tx.stockTransfer.createMany({ data: parsed as any })
      break
    case 'wallets':
      await tx.wallet.createMany({ data: parsed as any })
      break
    case 'walletReconciliations':
      await tx.walletReconciliation.createMany({ data: parsed as any })
      break
    case 'goals':
      await tx.goal.createMany({ data: parsed as any })
      break
    case 'financeObligations':
      await tx.financeObligation.createMany({ data: parsed as any })
      break
    case 'purchaseOrders':
      await tx.purchaseOrder.createMany({ data: parsed as any })
      break
    case 'purchaseOrderItems':
      await tx.purchaseOrderItem.createMany({ data: parsed as any })
      break
    case 'purchaseOrderAllocations':
      await tx.purchaseOrderAllocation.createMany({ data: parsed as any })
      break
    case 'reservations':
      await tx.reservation.createMany({ data: parsed as any })
      break
    case 'sales':
      await tx.sale.createMany({ data: parsed as any })
      break
    case 'saleItems':
      await tx.saleItem.createMany({ data: parsed as any })
      break
    case 'commissions':
      await tx.commission.createMany({ data: parsed as any })
      break
    case 'expenses':
      await tx.expense.createMany({ data: parsed as any })
      break
    case 'walletTransactions':
      if (hasLedgerSnapshot) {
        // The backup carries its own ledger rows, so suppress the capture
        // trigger while these insert and restore the snapshot verbatim.
        // The flag is transaction-local and the transaction now spans the whole
        // restore, so it must be cleared again immediately afterwards —
        // otherwise every later wallet transaction silently skips the ledger.
        await tx.$executeRawUnsafe("SELECT set_config('app.finance_ledger_recorded', 'on', true)")
        try {
          await tx.wallet_transactions.createMany({ data: parsed as any })
        } finally {
          await tx.$executeRawUnsafe("SELECT set_config('app.finance_ledger_recorded', 'off', true)")
        }
      } else {
        // A legacy backup has no ledger payload. Let the database trigger
        // derive a trace entry for every restored wallet transaction.
        await tx.wallet_transactions.createMany({ data: parsed as any })
      }
      break
    case 'financeLedgerEntries':
      await tx.financeLedgerEntry.createMany({ data: parsed as any })
      break
    case 'userNotifications':
      await tx.userNotification.createMany({ data: parsed as any })
      break
    case 'budgets':
      await tx.budget.createMany({ data: parsed as any })
      break
    case 'blogPosts':
      await tx.blogPost.createMany({ data: parsed as any })
      break
    case 'blogPostTags':
      await tx.blogPostTag.createMany({ data: parsed as any })
      break
    case 'banners':
      await tx.banner.createMany({ data: parsed as any })
      break
    case 'pages':
      await tx.page.createMany({ data: parsed as any })
      break
    case 'collections':
      await tx.collection.createMany({ data: parsed as any })
      break
    case 'collectionItems':
      await tx.collectionItem.createMany({ data: parsed as any })
      break
    case 'reviews':
      await tx.review.createMany({ data: parsed as any })
      break
    case 'faqs':
      await tx.fAQ.createMany({ data: parsed as any })
      break
    case 'testimonials':
      await tx.testimonial.createMany({ data: parsed as any })
      break
    case 'subscribers':
      await tx.subscriber.createMany({ data: parsed as any })
      break
    case 'siteAnalyticsEvents':
      await tx.siteAnalyticsEvent.createMany({ data: parsed as any })
      break
    case 'activityLogs':
      await tx.activityLog.createMany({ data: parsed as any })
      break
  }

  return records.length
}

// Upsert records for a given table (merge mode)
async function upsertTable(tx: RestoreClient, tableName: string, records: Record<string, unknown>[], hasLedgerSnapshot: boolean) {
  if (!records || records.length === 0) return 0

  let count = 0
  const parsed = records.map(parseDates)

  if (tableName === 'userLocationAccess') {
    for (const record of parsed) {
      const userId = record.userId as string
      const locationId = record.locationId as string
      if (!userId || !locationId) continue
      await tx.userLocationAccess.upsert({
        where: { userId_locationId: { userId, locationId } },
        create: record as any,
        update: record as any,
      })
      count++
    }
    return count
  }

  if (tableName === 'financeLedgerEntries') {
    // Ledger rows are immutable; merge adds missing history but never rewrites
    // an existing audit record.
    const result = await tx.financeLedgerEntry.createMany({ data: parsed as any, skipDuplicates: true })
    return result.count
  }

  for (const record of parsed) {
    const id = record.id as string
    if (!id) continue

    // No try/catch around the upsert. A swallowed failure here used to leave
    // the row missing while the restore still reported success; now it aborts
    // the shared transaction and the database is left untouched (R8).
    {
      switch (tableName) {
        case 'users':
          await tx.user.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'categories':
          await tx.category.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'expenseCategories':
          await tx.expenseCategory.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'budgetCategories':
          await tx.budgetCategory.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogCategories':
          await tx.blogCategory.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogTags':
          await tx.blogTag.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'locations':
          await tx.location.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'exchangeRates':
          await tx.exchangeRate.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'storeSettings':
          await tx.storeSetting.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'sellers':
          await tx.seller.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'sellerCategoryRates':
          await tx.seller_category_rates.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'clients':
          await tx.client.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'items':
          await tx.item.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'comboItems':
          await tx.combo_items.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'itemImages':
          await tx.itemImage.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'itemFeatures':
          await tx.itemFeature.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'stock':
          await tx.stock.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'stockTransfers':
          await tx.stockTransfer.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'wallets':
          await tx.wallet.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'walletReconciliations':
          await tx.walletReconciliation.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'goals':
          await tx.goal.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'financeObligations':
          await tx.financeObligation.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrders':
          await tx.purchaseOrder.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrderItems':
          await tx.purchaseOrderItem.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'purchaseOrderAllocations':
          await tx.purchaseOrderAllocation.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'reservations':
          await tx.reservation.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'sales':
          await tx.sale.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'saleItems':
          await tx.saleItem.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'commissions':
          await tx.commission.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'expenses':
          await tx.expense.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'walletTransactions':
          if (hasLedgerSnapshot) {
            // See insertTable: suppress the capture trigger for this row only,
            // then clear the flag so it cannot leak into the rest of the
            // restore transaction.
            await tx.$executeRawUnsafe("SELECT set_config('app.finance_ledger_recorded', 'on', true)")
            try {
              await tx.wallet_transactions.upsert({ where: { id }, create: record as any, update: record as any })
            } finally {
              await tx.$executeRawUnsafe("SELECT set_config('app.finance_ledger_recorded', 'off', true)")
            }
          } else {
            await tx.wallet_transactions.upsert({ where: { id }, create: record as any, update: record as any })
          }
          break
        case 'userNotifications':
          await tx.userNotification.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'budgets':
          await tx.budget.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogPosts':
          await tx.blogPost.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'blogPostTags':
          await tx.blogPostTag.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'banners':
          await tx.banner.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'pages':
          await tx.page.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'collections':
          await tx.collection.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'collectionItems':
          await tx.collectionItem.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'reviews':
          await tx.review.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'faqs':
          await tx.fAQ.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'testimonials':
          await tx.testimonial.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'subscribers':
          await tx.subscriber.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'siteAnalyticsEvents':
          await tx.siteAnalyticsEvent.upsert({ where: { id }, create: record as any, update: record as any })
          break
        case 'activityLogs':
          await tx.activityLog.upsert({ where: { id }, create: record as any, update: record as any })
          break
      }
      count++
    }
  }

  return count
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const body = await request.json()
    const { backup, mode, pathname, confirmationText } = body as {
      backup?: unknown
      mode: 'wipe' | 'merge'
      pathname?: string
      confirmationText?: string
    }

    if (!mode || !['wipe', 'merge'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Use "wipe" or "merge".' },
        { status: 400 }
      )
    }

    if (!backup && !pathname) {
      return NextResponse.json(
        { error: 'Provide either backup data or a backup pathname.' },
        { status: 400 }
      )
    }

    if (mode === 'wipe' && confirmationText !== WIPE_RESTORE_CONFIRMATION) {
      return NextResponse.json(
        { error: `Type "${WIPE_RESTORE_CONFIRMATION}" to confirm a wipe restore.` },
        { status: 400 }
      )
    }

    const backupSource = pathname ? await fetchBackupFromPathname(pathname) : backup
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

    const existingTables = await getExistingBackupTables()
    const backupTables = validation.backup.tables
    const hasLedgerSnapshot = (backupTables.financeLedgerEntries?.length ?? 0) > 0

    // One transaction for the whole restore. The wipe and every insert live
    // inside it, so any failure — a bad payload, a constraint violation, a
    // dropped connection — rolls back to the pre-restore state instead of
    // leaving the database wiped and half-populated (F-33).
    let results: Record<string, number>

    try {
      results = await prisma.$transaction(async (tx) => {
        const tableCounts: Record<string, number> = {}

        if (mode === 'wipe') {
          await wipeAllTables(tx, existingTables)
        }

        for (const table of INSERT_ORDER) {
          const records = Array.isArray(backupTables[table])
            ? backupTables[table] as Record<string, unknown>[]
            : []

          if (!existingTables.has(table)) {
            tableCounts[table] = 0
            if (records.length > 0) {
              // Silently dropping these rows would report a successful restore
              // that quietly lost data. Abort instead — nothing is committed.
              throw new Error(
                `${table}: table "${TABLE_DB_NAMES[table]}" does not exist in this database. Apply the matching migration before restoring these rows.`,
              )
            }
            continue
          }

          tableCounts[table] = mode === 'wipe'
            ? await insertTable(tx, table, records, hasLedgerSnapshot)
            : await upsertTable(tx, table, records, hasLedgerSnapshot)
        }

        // The activity log is a leg of the same transaction, so the record of
        // the restore commits with it or not at all.
        await writeActivityLog({
          action: 'update',
          entityType: 'settings',
          entityName: 'Database Restore',
          details: `Restored database (${mode} mode). Tables: ${Object.keys(tableCounts).length}, Safety snapshot: ${safetyBackup.pathname}`,
          user: authResult,
          request,
          source: 'server',
          client: tx,
        })

        return tableCounts
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: RESTORE_TRANSACTION_TIMEOUT_MS,
        maxWait: RESTORE_TRANSACTION_TIMEOUT_MS,
      })
    } catch (restoreError) {
      const message = restoreError instanceof Error ? restoreError.message : String(restoreError)
      console.error('Restore error (transaction rolled back):', restoreError)
      return NextResponse.json(
        {
          error: `Restore failed and was rolled back. The database is unchanged. Cause: ${message}`,
          detail: message,
          validation: validation.summary,
          safetyBackup: {
            url: safetyBackup.url,
            pathname: safetyBackup.pathname,
            createdAt: safetyBackup.createdAt,
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      mode,
      results,
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
