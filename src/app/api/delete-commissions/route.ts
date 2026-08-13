import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  // src/proxy.ts only checks that a session cookie exists — it never validates
  // it and applies no role check, so the guard has to be here (F-05, R10).
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const { commissionIds } = await request.json()

    if (!commissionIds || !Array.isArray(commissionIds)) {
      return NextResponse.json({ error: 'Commission IDs array required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('commissions')
      .delete()
      .in('id', commissionIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${commissionIds.length} commissions`
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
