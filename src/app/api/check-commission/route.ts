import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const commissionId = searchParams.get('id')

  if (!commissionId) {
    return NextResponse.json({ error: 'Commission ID required' }, { status: 400 })
  }

  try {
    // Get commission with related data
    const { data: commission, error: commissionError } = await supabase
      .from('commissions')
      .select('*, sales(*), locations(*), categories(*)')
      .eq('id', commissionId)
      .single()

    if (commissionError || !commission) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 })
    }

    // Get all sale items
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('*, items(*)')
      .eq('sale_id', commission.sale_id)

    // Get seller and rate info
    const { data: seller } = await supabase
      .from('sellers')
      .select('*')
      .eq('id', commission.seller_id)
      .single()

    const { data: rate } = await supabase
      .from('seller_category_rates')
      .select('*')
      .eq('seller_id', commission.seller_id)
      .eq('category_id', commission.category_id)
      .maybeSingle()

    // Filter items by category
    const categoryItems = saleItems?.filter(item => item.items?.category_id === commission.category_id) || []
    const categoryTotal = categoryItems.reduce((sum, item) => sum + item.subtotal, 0)
    const allItemsTotal = saleItems?.reduce((sum, item) => sum + item.subtotal, 0) || 0

    return NextResponse.json({
      commission: {
        id: commission.id,
        amount: commission.commission_amount,
        paid: commission.paid,
        category: commission.categories?.name
      },
      sale: {
        id: commission.sales?.id,
        total_amount: commission.sales?.total_amount,
        currency: commission.sales?.currency,
        created_at: commission.sales?.created_at
      },
      seller: {
        name: seller?.name,
        default_rate: seller?.commission_rate
      },
      rate: {
        commission_rate: rate?.commission_rate || 0,
        is_category_specific: !!rate
      },
      items: {
        all_items: saleItems?.map(item => ({
          name: item.items?.name,
          category: item.items?.category_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal
        })),
        category_items: categoryItems.map(item => ({
          name: item.items?.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal
        })),
        category_total: categoryTotal,
        all_items_total: allItemsTotal
      },
      calculation: {
        expected_if_using_category_total: categoryTotal * ((rate?.commission_rate || 0) / 100),
        expected_if_using_sale_total: (commission.sales?.total_amount || 0) * ((rate?.commission_rate || 0) / 100),
        current: commission.commission_amount
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
