import { put } from '@vercel/blob'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { BACKUP_VERSION, type BackupBlobSaveResult, type BackupKind, type BackupPayload, type BackupValidationResult } from '@/types/backup'

export const TABLE_ORDER = [
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

export const DELETE_ORDER = [
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

export const INSERT_ORDER = [...TABLE_ORDER] as const

function buildRowCounts(tables: Record<string, unknown[]>): Record<string, number> {
  const rowCounts: Record<string, number> = {}

  for (const table of TABLE_ORDER) {
    rowCounts[table] = Array.isArray(tables[table]) ? tables[table].length : 0
  }

  return rowCounts
}

function buildBackupId(input: { createdAt: string; type: string; tables: Record<string, unknown[]> }) {
  return `legacy-${createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 12)}`
}

export function computeBackupChecksum(backup: Omit<BackupPayload, 'checksum'>): string {
  return createHash('sha256').update(JSON.stringify(backup)).digest('hex')
}

export async function exportAllTables(): Promise<Record<string, unknown[]>> {
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

export function buildBackupPayload(tables: Record<string, unknown[]>, options?: { backupId?: string; createdAt?: string; type?: BackupKind | string }): BackupPayload {
  const createdAt = options?.createdAt ?? new Date().toISOString()
  const type = options?.type ?? 'manual'
  const rowCounts = buildRowCounts(tables)
  const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)
  const basePayload: Omit<BackupPayload, 'checksum'> = {
    version: BACKUP_VERSION,
    backupId: options?.backupId ?? randomUUID(),
    createdAt,
    type,
    tableOrder: [...TABLE_ORDER],
    rowCounts,
    totalRows,
    tables,
  }

  return {
    ...basePayload,
    checksum: computeBackupChecksum(basePayload),
  }
}

export async function createBackupPayload(type: BackupKind | string = 'manual'): Promise<BackupPayload> {
  const tables = await exportAllTables()
  return buildBackupPayload(tables, { type })
}

export function validateBackupPayload(candidate: unknown): BackupValidationResult {
  const issues: string[] = []
  const warnings: string[] = []

  if (!candidate || typeof candidate !== 'object') {
    return {
      valid: false,
      issues: ['Backup payload is missing or invalid.'],
      warnings,
      summary: {
        backupId: 'unknown',
        createdAt: '',
        type: 'unknown',
        version: 0,
        totalRows: 0,
        tableCount: 0,
        hasChecksum: false,
        checksumMatches: false,
        missingTables: [...TABLE_ORDER],
        extraTables: [],
      },
    }
  }

  const rawBackup = candidate as Record<string, unknown>
  const rawTables = rawBackup.tables

  if (!rawTables || typeof rawTables !== 'object' || Array.isArray(rawTables)) {
    issues.push('Backup does not contain a valid tables object.')
  }

  const tables: Record<string, unknown[]> = {}
  const rawTableObject = rawTables && typeof rawTables === 'object' && !Array.isArray(rawTables)
    ? rawTables as Record<string, unknown>
    : {}

  for (const [tableName, value] of Object.entries(rawTableObject)) {
    if (!Array.isArray(value)) {
      issues.push(`Table "${tableName}" is not an array.`)
      continue
    }

    tables[tableName] = value
  }

  const missingTables = TABLE_ORDER.filter((table) => !(table in tables))
  const extraTables = Object.keys(tables).filter((table) => !TABLE_ORDER.includes(table as typeof TABLE_ORDER[number]))

  if (missingTables.length > 0) {
    warnings.push(`Backup is missing ${missingTables.length} known table payload(s). Missing tables will restore as empty.`)
  }

  if (extraTables.length > 0) {
    warnings.push(`Backup contains ${extraTables.length} unrecognized table payload(s). They will be preserved in the file but ignored by restore.`)
  }

  for (const table of TABLE_ORDER) {
    if (!(table in tables)) {
      tables[table] = []
    }
  }

  const createdAt = typeof rawBackup.createdAt === 'string' && !Number.isNaN(Date.parse(rawBackup.createdAt))
    ? rawBackup.createdAt
    : ''
  if (!createdAt) {
    issues.push('Backup has an invalid createdAt timestamp.')
  }

  const version = typeof rawBackup.version === 'number' ? rawBackup.version : 0
  if (!version) {
    issues.push('Backup is missing a valid version number.')
  } else if (version > BACKUP_VERSION) {
    warnings.push(`Backup version ${version} is newer than this app version ${BACKUP_VERSION}.`)
  } else if (version < BACKUP_VERSION) {
    warnings.push(`Backup version ${version} will be normalized to version ${BACKUP_VERSION} during restore.`)
  }

  const rowCounts = buildRowCounts(tables)
  if (rawBackup.rowCounts && typeof rawBackup.rowCounts === 'object' && !Array.isArray(rawBackup.rowCounts)) {
    const providedRowCounts = rawBackup.rowCounts as Record<string, unknown>
    for (const table of TABLE_ORDER) {
      const providedCount = providedRowCounts[table]
      if (typeof providedCount === 'number' && providedCount !== rowCounts[table]) {
        warnings.push(`Row count mismatch detected for ${table}. Expected ${rowCounts[table]}, file declares ${providedCount}.`)
      }
    }
  }

  const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)
  const backupId = typeof rawBackup.backupId === 'string' && rawBackup.backupId.trim().length > 0
    ? rawBackup.backupId
    : buildBackupId({
        createdAt: createdAt || new Date(0).toISOString(),
        type: typeof rawBackup.type === 'string' ? rawBackup.type : 'unknown',
        tables,
      })

  if (typeof rawBackup.backupId !== 'string') {
    warnings.push('Backup has no backupId. A compatibility id will be generated for restore operations.')
  }

  const normalizedWithoutChecksum: Omit<BackupPayload, 'checksum'> = {
    version: BACKUP_VERSION,
    backupId,
    createdAt,
    type: typeof rawBackup.type === 'string' ? rawBackup.type : 'unknown',
    tableOrder: [...TABLE_ORDER],
    rowCounts,
    totalRows,
    tables,
  }

  const computedChecksum = computeBackupChecksum(normalizedWithoutChecksum)
  const providedChecksum = typeof rawBackup.checksum === 'string' ? rawBackup.checksum : null
  const checksumMatches = !providedChecksum || providedChecksum === computedChecksum

  if (!providedChecksum) {
    warnings.push('Backup has no checksum. Integrity verification will rely on structural validation only.')
  }

  if (providedChecksum && !checksumMatches) {
    issues.push('Backup checksum does not match the file contents.')
  }

  const normalizedBackup: BackupPayload = {
    ...normalizedWithoutChecksum,
    checksum: computedChecksum,
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    summary: {
      backupId,
      createdAt,
      type: normalizedBackup.type,
      version,
      totalRows,
      tableCount: TABLE_ORDER.length,
      hasChecksum: Boolean(providedChecksum),
      checksumMatches,
      missingTables,
      extraTables,
    },
    backup: issues.length === 0 ? normalizedBackup : undefined,
  }
}

export function isAllowedBackupUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'https:'
      && (parsedUrl.hostname.endsWith('.public.blob.vercel-storage.com') || parsedUrl.hostname.endsWith('.blob.vercel-storage.com'))
  } catch {
    return false
  }
}

export async function fetchBackupFromUrl(url: string): Promise<unknown> {
  if (!isAllowedBackupUrl(url)) {
    throw new Error('Invalid backup URL. Only Vercel Blob backup files are supported.')
  }

  const response = await fetch(url, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Unable to fetch backup file (${response.status}).`)
  }

  return response.json()
}

function getFilenamePrefix(type: string) {
  if (type === 'auto') return 'auto-backup'
  if (type === 'pre-restore') return 'pre-restore-backup'
  return 'backup'
}

export async function saveBackupToBlob(backup: BackupPayload, options?: { prefix?: string }): Promise<BackupBlobSaveResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN

  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured.')
  }

  const timestamp = backup.createdAt.replace(/[:.]/g, '-')
  const filename = `backups/${options?.prefix ?? getFilenamePrefix(backup.type)}-${timestamp}-${backup.backupId.slice(0, 8)}.json`
  const content = JSON.stringify(backup)

  const blob = await put(filename, content, {
    access: 'public',
    contentType: 'application/json',
    token,
  })

  return {
    success: true,
    url: blob.url,
    pathname: blob.pathname,
    size: content.length,
    createdAt: backup.createdAt,
  }
}