import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'

export async function POST(request: NextRequest) {
  // Not in T-03's file list, but it is the same hole: an unguarded endpoint
  // that writes commission rows, already listed in PROTECTED_API_PREFIXES and
  // therefore protected by nothing more than a cookie's existence (F-05, R10).
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  return NextResponse.json({ error: 'Manual commission creation is disabled. Commissions are derived from posted sales in the serialized sales route.' }, { status: 410 })
}
