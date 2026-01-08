import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    // Create admin client with service role key to run DDL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Try to add columns using raw SQL query
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE reservations 
        ADD COLUMN IF NOT EXISTS combo_id TEXT,
        ADD COLUMN IF NOT EXISTS combo_price DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2);
        
        CREATE INDEX IF NOT EXISTS idx_reservations_combo ON reservations(combo_id) WHERE combo_id IS NOT NULL;
      `
    })

    if (error) {
      return NextResponse.json({ 
        error: error.message,
        hint: 'Migration may need to be run directly on the database',
        sql: `
ALTER TABLE reservations 
ADD COLUMN combo_id TEXT,
ADD COLUMN combo_price DECIMAL(10, 2),
ADD COLUMN original_price DECIMAL(10, 2);

CREATE INDEX idx_reservations_combo ON reservations(combo_id) WHERE combo_id IS NOT NULL;
        `
      }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Migration completed', data })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ 
      error: String(error),
      sql: `
ALTER TABLE reservations 
ADD COLUMN combo_id TEXT,
ADD COLUMN combo_price DECIMAL(10, 2),
ADD COLUMN original_price DECIMAL(10, 2);

CREATE INDEX idx_reservations_combo ON reservations(combo_id) WHERE combo_id IS NOT NULL;
      `
    }, { status: 500 })
  }
}
