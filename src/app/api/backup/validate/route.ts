import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { fetchBackupFromPathname, validateBackupPayload } from '@/lib/backup'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const body = await request.json() as { backup?: unknown; pathname?: string }

    if (!body.backup && !body.pathname) {
      return NextResponse.json(
        { error: 'Provide either a backup payload or a backup pathname.' },
        { status: 400 }
      )
    }

    const backupSource = body.pathname
      ? await fetchBackupFromPathname(body.pathname)
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
