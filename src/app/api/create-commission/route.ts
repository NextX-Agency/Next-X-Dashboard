import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
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
