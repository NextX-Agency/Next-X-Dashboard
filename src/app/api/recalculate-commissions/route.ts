import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST() {
  try {
    console.log('Starting commission recalculation...')

    // Get all commissions with their related data
    const { data: commissions, error: commissionsError } = await supabase
      .from('commissions')
      .select('*, sales(*)')
      .order('created_at', { ascending: false })

    if (commissionsError) {
      return NextResponse.json({ error: commissionsError.message }, { status: 500 })
    }

    const updates: any[] = []

    for (const commission of commissions || []) {
      if (!commission.sale_id || !commission.seller_id) continue

      // Get the commission rate for this seller and category
      const { data: rateData } = await supabase
        .from('seller_category_rates')
        .select('commission_rate')
        .eq('seller_id', commission.seller_id)
        .eq('category_id', commission.category_id)
        .maybeSingle()

      const rate = rateData?.commission_rate || 0

      if (rate === 0) continue

      // Get all sale items for this sale
      const { data: saleItems, error: saleItemsError } = await supabase
        .from('sale_items')
        .select('*, items(category_id)')
        .eq('sale_id', commission.sale_id)

      if (saleItemsError) continue

      // Filter items by category if commission has a category
      const relevantItems = commission.category_id
        ? saleItems?.filter(item => item.items?.category_id === commission.category_id) || []
        : saleItems || []

      if (relevantItems.length === 0) continue

      // Calculate the total for this category from sale items
      const categoryTotal = relevantItems.reduce((sum, item) => sum + item.subtotal, 0)
      
      // Get all sale items to calculate total and proportion
      const allItems = saleItems || []
      const saleItemsTotal = allItems.reduce((sum, item) => sum + item.subtotal, 0)
      
      // If sale items total doesn't match the sale total, use proportional calculation
      // This handles cases where sale_items were incorrectly stored (e.g., combo items)
      const saleTotal = commission.sales?.total_amount || saleItemsTotal
      let correctCommission = 0
      
      if (Math.abs(saleItemsTotal - saleTotal) > 0.01 && saleItemsTotal > 0) {
        // Sale items don't match sale total - use proportional calculation
        const proportion = categoryTotal / saleItemsTotal
        correctCommission = saleTotal * proportion * (rate / 100)
      } else {
        // Sale items match - use direct calculation
        correctCommission = categoryTotal * (rate / 100)
      }

      const roundedCorrectCommission = Math.round(correctCommission * 100) / 100

      if (Math.abs(commission.commission_amount - roundedCorrectCommission) > 0.01) {
        updates.push({
          id: commission.id,
          saleId: commission.sale_id,
          oldAmount: commission.commission_amount,
          newAmount: roundedCorrectCommission,
          rate: rate,
          categoryId: commission.category_id,
          saleTotal: commission.sales?.total_amount,
          categoryTotal: categoryTotal,
          saleItemsTotal: saleItemsTotal
        })

        // Update the commission
        await supabase
          .from('commissions')
          .update({ commission_amount: roundedCorrectCommission })
          .eq('id', commission.id)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recalculated ${updates.length} commissions`,
      updates
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
