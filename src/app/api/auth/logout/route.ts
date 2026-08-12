import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, revokeSession } from '@/lib/sessions'

export async function POST(request: NextRequest) {
  try {
    await revokeSession(request)
  } catch (error) {
    console.error('Logout error:', error)
  }

  const response = NextResponse.json({ success: true })
  clearSessionCookie(response)
  return response
}
