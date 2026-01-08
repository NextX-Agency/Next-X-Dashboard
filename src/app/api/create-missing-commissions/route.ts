import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { saleId } = await request.json()

    if (!saleId) {
      return NextResponse.json({ error: 'Sale ID required' }, { status: 400 })
    }

    // Get the sale
    const { data: sale } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .single()

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    // Get all sale items
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('*, items(category_id)')
      .eq('sale_id', saleId)

    // Get seller for this location
    const { data: sellers } = await supabase
      .from('sellers')
      .select('*')
      .eq('location_id', sale.location_id)

    if (!sellers || sellers.length === 0) {
      return NextResponse.json({ error: 'No seller found for this location' }, { status: 404 })
    }

    const seller = sellers[0]

    // Get existing commissions for this sale
    const { data: existingCommissions } = await supabase
      .from('commissions')
      .select('*')
      .eq('sale_id', saleId)
      .eq('seller_id', seller.id)

    // Group items by category
    const itemsByCategory = new Map<string, typeof saleItems>()
    for (const item of saleItems || []) {
      const categoryId = item.items?.category_id || 'uncategorized'
      if (!itemsByCategory.has(categoryId)) {
        itemsByCategory.set(categoryId, [])
      }
      itemsByCategory.get(categoryId)!.push(item)
    }

    const created: any[] = []
    const skipped: any[] = []

    // Create missing commissions
    for (const [categoryId, categoryItems] of itemsByCategory) {
      // Check if commission already exists for this category
      const existingCommission = existingCommissions?.find(c => c.category_id === categoryId)
      
      if (existingCommission) {
        skipped.push({ categoryId, reason: 'Already exists', commissionId: existingCommission.id })
        continue
      }

      // Get category-specific rate
      const { data: categoryRate } = await supabase
        .from('seller_category_rates')
        .select('commission_rate')
        .eq('seller_id', seller.id)
        .eq('category_id', categoryId)
        .maybeSingle()

      if (!categoryRate) {
        skipped.push({ categoryId, reason: 'No commission rate set' })
        continue
      }

      const rate = categoryRate.commission_rate

      // Calculate commission for this category
      const categoryTotal = categoryItems.reduce((sum, item) => sum + item.subtotal, 0)
      const commissionAmount = categoryTotal * (rate / 100)

      // Create the commission
      const { data: newCommission, error } = await supabase
        .from('commissions')
        .insert({
          seller_id: seller.id,
          location_id: sale.location_id,
          category_id: categoryId,
          sale_id: saleId,
          commission_amount: commissionAmount,
          paid: false
        })
        .select()
        .single()

      if (error) {
        skipped.push({ categoryId, reason: error.message })
      } else {
        created.push({
          categoryId,
          rate,
          categoryTotal,
          commissionAmount,
          commissionId: newCommission.id
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${created.length} missing commissions`,
      created,
      skipped
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
