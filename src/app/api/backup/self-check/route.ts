import { del } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { createBackupPayload, fetchBackupFromUrl, saveBackupToBlob, validateBackupPayload } from '@/lib/backup'
import type { BackupSelfCheckResponse } from '@/types/backup'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  let temporaryBlobUrl: string | null = null
  let temporaryBlobPathname = ''

  try {
    const backup = await createBackupPayload('manual')
    const exportValidation = validateBackupPayload(backup)

    if (!exportValidation.valid || !exportValidation.backup) {
      return NextResponse.json(
        { error: 'Generated backup failed validation.', issues: exportValidation.issues },
        { status: 500 },
      )
    }

    const savedBackup = await saveBackupToBlob(exportValidation.backup, { prefix: 'self-check-backup' })
    temporaryBlobUrl = savedBackup.url
    temporaryBlobPathname = savedBackup.pathname

    const roundTripCandidate = await fetchBackupFromUrl(savedBackup.url)
    const roundTripValidation = validateBackupPayload(roundTripCandidate)

    if (!roundTripValidation.valid) {
      return NextResponse.json(
        { error: 'Round-trip backup validation failed.', issues: roundTripValidation.issues },
        { status: 500 },
      )
    }

    const response: BackupSelfCheckResponse = {
      success: true,
      checkedAt: new Date().toISOString(),
      totalRows: roundTripValidation.summary.totalRows,
      exportValidation: exportValidation.summary,
      roundTripValidation: roundTripValidation.summary,
      temporaryBlob: {
        pathname: temporaryBlobPathname,
        cleanedUp: false,
      },
    }

    if (temporaryBlobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(temporaryBlobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
      response.temporaryBlob.cleanedUp = true
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Backup self-check error:', error)

    if (temporaryBlobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(temporaryBlobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
      } catch (cleanupError) {
        console.error('Backup self-check cleanup error:', cleanupError)
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run backup self-check.' },
      { status: 500 },
    )
  }
}
