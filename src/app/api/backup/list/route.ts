import { NextRequest, NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const { blobs } = await list({
      prefix: 'backups/',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    // Sort by uploadedAt descending (newest first)
    const sorted = blobs
      .map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        size: blob.size,
        uploadedAt: blob.uploadedAt.toISOString(),
      }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

    return NextResponse.json({ backups: sorted })
  } catch (error) {
    console.error('Backup list error:', error)
    return NextResponse.json(
      { error: 'Failed to list backups' },
      { status: 500 }
    )
  }
}
