// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

async function checkRLS() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Checking RLS status for tables...\n');

  // Query to check RLS status
  const { data, error } = await supabase.rpc('check_rls_status');
  
  if (error) {
    console.log('Cannot run custom RPC. Checking tables manually...\n');
    
    // Test each important table
    const tables = [
      'users',
      'items', 
      'categories',
      'locations',
      'stock',
      'sales',
      'reservations',
      'clients',
      'exchange_rates',
      'banners',
      'collections',
      'faqs',
      'testimonials'
    ];

    for (const table of tables) {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`❌ ${table}: ERROR - ${error.message}`);
      } else {
        console.log(`${count > 0 ? '✓' : '⚠'} ${table}: ${count || 0} rows accessible`);
      }
    }
  } else {
    console.log(data);
  }
}

checkRLS();
