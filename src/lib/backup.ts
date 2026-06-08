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

export type BackupTableName = typeof TABLE_ORDER[number]

export const TABLE_DB_NAMES: Record<BackupTableName, string> = {
  users: 'users',
  categories: 'categories',
  expenseCategories: 'expense_categories',
  budgetCategories: 'budget_categories',
  blogCategories: 'blog_categories',
  blogTags: 'blog_tags',
  locations: 'locations',
  exchangeRates: 'exchange_rates',
  storeSettings: 'store_settings',
  sellers: 'sellers',
  sellerCategoryRates: 'seller_category_rates',
  clients: 'clients',
  items: 'items',
  comboItems: 'combo_items',
  itemImages: 'item_images',
  itemFeatures: 'item_features',
  stock: 'stock',
  stockTransfers: 'stock_transfers',
  wallets: 'wallets',
  goals: 'goals',
  purchaseOrders: 'purchase_orders',
  purchaseOrderItems: 'purchase_order_items',
  reservations: 'reservations',
  sales: 'sales',
  saleItems: 'sale_items',
  commissions: 'commissions',
  expenses: 'expenses',
  walletTransactions: 'wallet_transactions',
  budgets: 'budgets',
  blogPosts: 'blog_posts',
  blogPostTags: 'blog_post_tags',
  banners: 'banners',
  pages: 'pages',
  collections: 'collections',
  collectionItems: 'collection_items',
  reviews: 'reviews',
  faqs: 'faqs',
  testimonials: 'testimonials',
  subscribers: 'subscribers',
  activityLogs: 'activity_logs',
}

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

export async function getExistingBackupTables(): Promise<Set<BackupTableName>> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `
  const existingDbTables = new Set(rows.map((row) => row.table_name))

  return new Set(
    TABLE_ORDER.filter((table) => existingDbTables.has(TABLE_DB_NAMES[table]))
  )
}

export async function getUntrackedPublicTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  const trackedDbTables = new Set(Object.values(TABLE_DB_NAMES))

  return rows
    .map((row) => row.table_name)
    .filter((tableName) => !trackedDbTables.has(tableName))
}

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
  const untrackedTables = await getUntrackedPublicTables()
  if (untrackedTables.length > 0) {
    throw new Error(`Backup coverage is incomplete. Add these public table(s) to the backup manifest before creating a backup: ${untrackedTables.join(', ')}`)
  }

  const existingTables = await getExistingBackupTables()

  const fetchTable = async (table: BackupTableName, fetcher: () => Promise<unknown[]>) => {
    data[table] = existingTables.has(table) ? await fetcher() : []
  }

  await fetchTable('users', () => prisma.user.findMany())
  await fetchTable('categories', () => prisma.category.findMany())
  await fetchTable('expenseCategories', () => prisma.expenseCategory.findMany())
  await fetchTable('budgetCategories', () => prisma.budgetCategory.findMany())
  await fetchTable('blogCategories', () => prisma.blogCategory.findMany())
  await fetchTable('blogTags', () => prisma.blogTag.findMany())
  await fetchTable('locations', () => prisma.location.findMany())
  await fetchTable('exchangeRates', () => prisma.exchangeRate.findMany())
  await fetchTable('storeSettings', () => prisma.storeSetting.findMany())
  await fetchTable('sellers', () => prisma.seller.findMany())
  await fetchTable('sellerCategoryRates', () => prisma.seller_category_rates.findMany())
  await fetchTable('clients', () => prisma.client.findMany())
  await fetchTable('items', () => prisma.item.findMany())
  await fetchTable('comboItems', () => prisma.combo_items.findMany())
  await fetchTable('itemImages', () => prisma.itemImage.findMany())
  await fetchTable('itemFeatures', () => prisma.itemFeature.findMany())
  await fetchTable('stock', () => prisma.stock.findMany())
  await fetchTable('stockTransfers', () => prisma.stockTransfer.findMany())
  await fetchTable('wallets', () => prisma.wallet.findMany())
  await fetchTable('goals', () => prisma.goal.findMany())
  await fetchTable('purchaseOrders', () => prisma.purchaseOrder.findMany())
  await fetchTable('purchaseOrderItems', () => prisma.purchaseOrderItem.findMany())
  await fetchTable('reservations', () => prisma.reservation.findMany())
  await fetchTable('sales', () => prisma.sale.findMany())
  await fetchTable('saleItems', () => prisma.saleItem.findMany())
  await fetchTable('commissions', () => prisma.commission.findMany())
  await fetchTable('expenses', () => prisma.expense.findMany())
  await fetchTable('walletTransactions', () => prisma.wallet_transactions.findMany())
  await fetchTable('budgets', () => prisma.budget.findMany())
  await fetchTable('blogPosts', () => prisma.blogPost.findMany())
  await fetchTable('blogPostTags', () => prisma.blogPostTag.findMany())
  await fetchTable('banners', () => prisma.banner.findMany())
  await fetchTable('pages', () => prisma.page.findMany())
  await fetchTable('collections', () => prisma.collection.findMany())
  await fetchTable('collectionItems', () => prisma.collectionItem.findMany())
  await fetchTable('reviews', () => prisma.review.findMany())
  await fetchTable('faqs', () => prisma.fAQ.findMany())
  await fetchTable('testimonials', () => prisma.testimonial.findMany())
  await fetchTable('subscribers', () => prisma.subscriber.findMany())
  await fetchTable('activityLogs', () => prisma.activityLog.findMany())

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
