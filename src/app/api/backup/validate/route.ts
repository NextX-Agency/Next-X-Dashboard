import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { fetchBackupFromUrl, validateBackupPayload } from '@/lib/backup'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const body = await request.json() as { backup?: unknown; url?: string }

    if (!body.backup && !body.url) {
      return NextResponse.json(
        { error: 'Provide either a backup payload or a backup URL.' },
        { status: 400 }
      )
    }

    const backupSource = body.url
      ? await fetchBackupFromUrl(body.url)
      : body.backup

    const validation = validateBackupPayload(backupSource)

    return NextResponse.json(validation, {
      status: validation.valid ? 200 : 400,
    })
  } catch (error) {
    console.error('Backup validation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate backup' },
      { status: 500 }
    )
  }
}