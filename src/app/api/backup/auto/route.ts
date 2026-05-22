import { NextRequest, NextResponse } from 'next/server'
import { del, list } from '@vercel/blob'
import { createBackupPayload, saveBackupToBlob } from '@/lib/backup'

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
    const backup = await createBackupPayload('auto')
    const savedBackup = await saveBackupToBlob(backup, { prefix: 'auto-backup' })

    // Cleanup old auto-backups (30-day retention)
    const deletedCount = await cleanupOldBackups()

    return NextResponse.json({
      success: true,
      url: savedBackup.url,
      pathname: savedBackup.pathname,
      size: savedBackup.size,
      totalRows: backup.totalRows,
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
