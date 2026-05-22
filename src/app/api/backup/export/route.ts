import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { createBackupPayload } from '@/lib/backup'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const backup = await createBackupPayload('manual')

    return NextResponse.json(backup)
  } catch (error) {
    console.error('Backup export error:', error)
    return NextResponse.json(
      { error: 'Failed to export backup' },
      { status: 500 }
    )
  }
}
