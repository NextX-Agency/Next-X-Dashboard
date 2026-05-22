import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { fetchBackupFromUrl, validateBackupPayload } from '@/lib/backup'

function getSafeFilename(pathname: string | null, createdAt: string) {
  if (pathname) {
    const filename = pathname.split('/').pop()
    if (filename) return filename
  }

  return `nextx-backup-${createdAt.replace(/[:.]/g, '-')}.json`
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const url = request.nextUrl.searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { error: 'Backup URL is required.' },
        { status: 400 }
      )
    }

    const backupSource = await fetchBackupFromUrl(url)
    const validation = validateBackupPayload(backupSource)

    if (!validation.valid || !validation.backup) {
      return NextResponse.json(
        { error: 'Backup file failed validation.', issues: validation.issues, warnings: validation.warnings },
        { status: 400 }
      )
    }

    const pathname = request.nextUrl.searchParams.get('pathname')
    const filename = getSafeFilename(pathname, validation.backup.createdAt)

    return new NextResponse(JSON.stringify(validation.backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Backup download error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download backup' },
      { status: 500 }
    )
  }
}