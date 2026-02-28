import { NextRequest, NextResponse } from 'next/server'
import { put, list, del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'

// This endpoint is triggered by Vercel Cron
// Configure schedule in vercel.json: "0 2 * * *" (daily at 2 AM UTC)
// Protected by CRON_SECRET environment variable

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

// Delete auto-backups older than 30 days
async function cleanupOldBackups() {
  const { blobs } = await list({
    prefix: 'backups/auto-',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  let deleted = 0
  for (const blob of blobs) {
    if (blob.uploadedAt < thirtyDaysAgo) {
      await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN })
      deleted++
    }
  }

  return deleted
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Export all data
    const tables = await exportAllTables()

    const rowCounts: Record<string, number> = {}
    for (const [key, value] of Object.entries(tables)) {
      rowCounts[key] = (value as unknown[]).length
    }

    const backup = {
      version: 1,
      createdAt: new Date().toISOString(),
      type: 'auto',
      rowCounts,
      tables,
    }

    // Save to Vercel Blob
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backups/auto-backup-${timestamp}.json`
    const content = JSON.stringify(backup)

    const blob = await put(filename, content, {
      access: 'public',
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    // Cleanup old auto-backups (30-day retention)
    const deletedCount = await cleanupOldBackups()

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      size: content.length,
      totalRows: Object.values(rowCounts).reduce((sum, n) => sum + n, 0),
      oldBackupsDeleted: deletedCount,
    })
  } catch (error) {
    console.error('Auto backup error:', error)
    return NextResponse.json(
      { error: 'Failed to create auto backup' },
      { status: 500 }
    )
  }
}
