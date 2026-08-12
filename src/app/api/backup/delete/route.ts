import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { writeActivityLog } from '@/lib/serverActivityLog'
import { deletePrivateBackup } from '@/lib/backup'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const { pathname } = await request.json()

    if (!pathname) {
      return NextResponse.json(
        { error: 'No backup pathname provided' },
        { status: 400 }
      )
    }

    await deletePrivateBackup(pathname)

    await writeActivityLog({
      action: 'delete',
      entityType: 'settings',
      entityName: 'Database Backup',
      details: `Backup deleted: ${pathname}`,
      user: authResult,
      request,
      source: 'server',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Backup delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete backup' },
      { status: 500 }
    )
  }
}
