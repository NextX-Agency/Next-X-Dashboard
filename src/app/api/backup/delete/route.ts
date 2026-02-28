import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json(
        { error: 'No backup URL provided' },
        { status: 400 }
      )
    }

    await del(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    await logActivity({
      action: 'delete',
      entityType: 'settings',
      entityName: 'Database Backup',
      details: `Backup deleted: ${url}`,
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
