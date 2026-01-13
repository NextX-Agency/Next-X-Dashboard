import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { BLOB_CONFIG, type BlobUploadResponse, type BlobErrorResponse } from '@/types/blob.types'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'

export async function POST(request: NextRequest): Promise<NextResponse<BlobUploadResponse | BlobErrorResponse>> {
  // Verify admin authentication
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) {
    return authResult as NextResponse<BlobErrorResponse>
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'uploads'

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB)
    const maxSize = BLOB_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size must be less than ${BLOB_CONFIG.MAX_FILE_SIZE_MB}MB` },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = BLOB_CONFIG.ALLOWED_TYPES as readonly string[]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed' },
        { status: 400 }
      )
    }

    // Upload to Vercel Blob
    const filename = `${folder}/${Date.now()}-${file.name}`
    const blob = await put(filename, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}

export const runtime = 'edge'
