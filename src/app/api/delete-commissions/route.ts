import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
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
