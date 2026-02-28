import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const body = await request.json()

    if (!body || !body.tables || !body.version) {
      return NextResponse.json(
        { error: 'Invalid backup data' },
        { status: 400 }
      )
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backups/backup-${timestamp}.json`
    const content = JSON.stringify(body)

    const blob = await put(filename, content, {
      access: 'public',
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    await logActivity({
      action: 'create',
      entityType: 'settings',
      entityName: 'Database Backup',
      details: `Manual backup created: ${filename} (${(content.length / 1024).toFixed(1)} KB)`,
    })

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      size: content.length,
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Backup save error:', error)
    return NextResponse.json(
      { error: 'Failed to save backup' },
      { status: 500 }
    )
  }
}
