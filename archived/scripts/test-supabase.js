// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

async function testSupabaseConnection() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('✗ Missing Supabase environment variables');
    process.exit(1);
  }

  console.log('Supabase URL:', supabaseUrl);
  console.log('Testing Supabase connection...\n');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test 1: Query users table
    console.log('--- Testing Users Table ---');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, role, password_hash, is_active')
      .limit(5);

    if (usersError) {
      console.error('✗ Error fetching users:', usersError.message);
      console.error('  Code:', usersError.code);
      console.error('  Details:', usersError.details);
      console.error('  Hint:', usersError.hint);
    } else {
      console.log('✓ Users fetched:', users?.length || 0);
      users?.forEach(u => {
        console.log(`  - ${u.email} (${u.role}) - Active: ${u.is_active}`);
        console.log(`    Password hash: ${u.password_hash?.substring(0, 20)}...`);
      });
    }

    // Test 2: Query locations
    console.log('\n--- Testing Locations Table ---');
    const { data: locations, error: locationsError } = await supabase
      .from('locations')
      .select('*')
      .limit(5);

    if (locationsError) {
      console.error('✗ Error fetching locations:', locationsError.message);
    } else {
      console.log('✓ Locations fetched:', locations?.length || 0);
      locations?.forEach(l => console.log(`  - ${l.name}`));
    }

    // Test 3: Query items
    console.log('\n--- Testing Items Table ---');
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id, name, is_public, selling_price_usd')
      .limit(5);

    if (itemsError) {
      console.error('✗ Error fetching items:', itemsError.message);
    } else {
      console.log('✓ Items fetched:', items?.length || 0);
      items?.forEach(i => console.log(`  - ${i.name} (Public: ${i.is_public})`));
    }

    // Test 4: Query categories
    console.log('\n--- Testing Categories Table ---');
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .limit(5);

    if (categoriesError) {
      console.error('✗ Error fetching categories:', categoriesError.message);
    } else {
      console.log('✓ Categories fetched:', categories?.length || 0);
      categories?.forEach(c => console.log(`  - ${c.name}`));
    }

    // Test 5: Simulate login query
    console.log('\n--- Testing Login Query ---');
    const testEmail = 'admin@nextx.com';
    const { data: loginUser, error: loginError } = await supabase
      .from('users')
      .select('id, email, name, role, password_hash, is_active')
      .eq('email', testEmail.toLowerCase())
      .single();

    if (loginError) {
      console.error('✗ Login query failed:', loginError.message);
    } else {
      console.log('✓ Login query successful for:', loginUser?.email);
      console.log('  Password hash stored:', loginUser?.password_hash);
      console.log('  Is active:', loginUser?.is_active);
    }

  } catch (error) {
    console.error('✗ Unexpected error:', error.message);
  }

  console.log('\n--- Test Complete ---');
}

testSupabaseConnection();
