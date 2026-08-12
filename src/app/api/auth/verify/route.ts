import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/apiAuth'

export async function POST(request: NextRequest) {
  const result = await verifyAuth(request)
  if (!result.authenticated || !result.user) {
    return NextResponse.json({ success: false, error: result.error || 'Invalid session' }, { status: 401 })
  }

  return NextResponse.json({ success: true, user: result.user })
}
