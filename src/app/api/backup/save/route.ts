import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { saveBackupToBlob, validateBackupPayload } from '@/lib/backup'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const body = await request.json()
    const validation = validateBackupPayload(body)

    if (!validation.valid || !validation.backup) {
      return NextResponse.json(
        { error: 'Invalid backup data', issues: validation.issues, warnings: validation.warnings },
        { status: 400 }
      )
    }

    const savedBackup = await saveBackupToBlob(validation.backup)

    await logActivity({
      action: 'create',
      entityType: 'settings',
      entityName: 'Database Backup',
      details: `Manual backup created: ${savedBackup.pathname} (${(savedBackup.size / 1024).toFixed(1)} KB, ${validation.backup.totalRows} rows)`,
    })

    return NextResponse.json({
      ...savedBackup,
      warnings: validation.warnings,
    })
  } catch (error) {
    console.error('Backup save error:', error)
    return NextResponse.json(
      { error: 'Failed to save backup' },
      { status: 500 }
    )
  }
}
