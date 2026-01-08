import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const { clientName, locationName, comboPrice } = await request.json()

    // Find the reservations for this client/location that are pending
    const { data: reservations } = await supabase
      .from('reservations')
      .select('*, clients(*), locations(*)')
      .eq('status', 'pending')
    
    if (!reservations) {
      return NextResponse.json({ error: 'No reservations found' }, { status: 404 })
    }

    // Find the group matching the client and location
    const matchingReservations = reservations.filter(
      r => r.clients?.name === clientName && r.locations?.name === locationName
    )

    if (matchingReservations.length === 0) {
      return NextResponse.json({ error: 'No matching reservations found' }, { status: 404 })
    }

    // Generate a combo_id for this group
    const comboId = `combo-${Date.now()}`
    
    // Calculate original price from all items
    let originalPrice = 0
    for (const res of matchingReservations) {
      const { data: item } = await supabase
        .from('items')
        .select('selling_price_srd')
        .eq('id', res.item_id)
        .single()
      
      if (item) {
        originalPrice += (item.selling_price_srd || 0) * res.quantity
      }
    }

    // Update the first reservation with combo price
    await supabase
      .from('reservations')
      .update({
        combo_id: comboId,
        combo_price: comboPrice,
        original_price: originalPrice
      })
      .eq('id', matchingReservations[0].id)

    // Update the rest with just combo_id
    for (let i = 1; i < matchingReservations.length; i++) {
      await supabase
        .from('reservations')
        .update({
          combo_id: comboId
        })
        .eq('id', matchingReservations[i].id)
    }

    return NextResponse.json({ 
      success: true, 
      updated: matchingReservations.length,
      comboId,
      originalPrice,
      comboPrice
    })
  } catch (error) {
    console.error('Error fixing combo price:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
