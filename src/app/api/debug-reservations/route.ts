import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('*, clients(*), locations(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10)
    
    return NextResponse.json({ reservations })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
