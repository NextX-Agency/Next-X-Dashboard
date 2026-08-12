import { NextRequest, NextResponse } from 'next/server'
import { createBackupPayload, deletePrivateBackup, listPrivateBackups, saveBackupToBlob } from '@/lib/backup'

// Delete auto-backups older than 30 days
async function cleanupOldBackups() {
  const { blobs } = await listPrivateBackups('backups/auto-')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  let deleted = 0
  for (const blob of blobs) {
    if (blob.uploadedAt < thirtyDaysAgo) {
      await deletePrivateBackup(blob.pathname)
      deleted++
    }
  }

  return deleted
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET must be configured before automatic backups are enabled.' },
      { status: 503 },
    )
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
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
