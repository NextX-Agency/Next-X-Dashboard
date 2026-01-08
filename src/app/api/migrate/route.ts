import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Add combo fields to reservations table
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE reservations 
        ADD COLUMN IF NOT EXISTS combo_id TEXT,
        ADD COLUMN IF NOT EXISTS combo_price DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2);
      `
    })

    if (error) {
      // If exec_sql doesn't exist, try direct query
      const { error: alterError } = await supabase
        .from('reservations')
        .select('combo_id')
        .limit(1)
      
      if (alterError && alterError.message.includes('column "combo_id" does not exist')) {
        return NextResponse.json({ 
          message: 'Migration needed but cannot be run from API. Please run manually.',
          sql: `
ALTER TABLE reservations 
ADD COLUMN combo_id TEXT,
ADD COLUMN combo_price DECIMAL(10, 2),
ADD COLUMN original_price DECIMAL(10, 2);

CREATE INDEX idx_reservations_combo ON reservations(combo_id) WHERE combo_id IS NOT NULL;
          `
        })
      }
    }

    return NextResponse.json({ success: true, message: 'Migration completed' })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
