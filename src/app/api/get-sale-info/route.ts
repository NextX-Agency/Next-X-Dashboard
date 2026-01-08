import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const saleId = searchParams.get('saleId')

  if (!saleId) {
    return NextResponse.json({ error: 'Sale ID required' }, { status: 400 })
  }

  try {
    const { data: sale } = await supabase
      .from('sales')
      .select('*, locations(*)')
      .eq('id', saleId)
      .single()

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    const { data: sellers } = await supabase
      .from('sellers')
      .select('*')
      .eq('location_id', sale.location_id)

    return NextResponse.json({
      sale: {
        id: sale.id,
        total_amount: sale.total_amount,
        location_id: sale.location_id,
        location_name: sale.locations?.name
      },
      seller: sellers && sellers.length > 0 ? sellers[0] : null
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
