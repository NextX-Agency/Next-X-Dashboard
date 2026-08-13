import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  // Not in T-03's file list, but it is the same hole: an unguarded endpoint
  // that writes commission rows, already listed in PROTECTED_API_PREFIXES and
  // therefore protected by nothing more than a cookie's existence (F-05, R10).
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const { saleId, sellerId, locationId, amount, categoryId } = await request.json()

    if (!saleId || !sellerId || !locationId || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('commissions')
      .insert({
        sale_id: saleId,
        seller_id: sellerId,
        location_id: locationId,
        category_id: categoryId || null,
        commission_amount: amount,
        paid: false
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      commission: data
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
