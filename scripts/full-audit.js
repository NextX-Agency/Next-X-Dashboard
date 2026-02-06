#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function fullAudit() {
  console.log('🔍 FULL DATABASE AUDIT - FEBRUARY 2026\n')
  console.log('=' .repeat(80))

  // 1. Check ALL expenses (not just Feb 1-5, check full month)
  const { data: allExpenses } = await supabase
    .from('expenses')
    .select('*, expense_categories(name)')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')
    .order('created_at', { ascending: false })

  console.log('\n📊 ALL FEBRUARY EXPENSES:\n')
  let totalExpSRD = 0, totalExpUSD = 0
  allExpenses.forEach(e => {
    const cat = e.expense_categories?.name || 'No Category'
    console.log(`   ${e.created_at.slice(0, 10)} | ${cat}`)
    console.log(`      ${e.currency} ${e.amount} - "${e.description}"`)
    if (e.currency === 'SRD') totalExpSRD += e.amount
    else totalExpUSD += e.amount
  })
  console.log(`\n   Total: SRD ${totalExpSRD} + USD ${totalExpUSD} = $${(totalExpSRD/40 + totalExpUSD).toFixed(2)} USD`)
  console.log(`   In SRD: ${totalExpSRD + totalExpUSD * 40}`)

  // 2. Check commissions
  const { data: commissions } = await supabase
    .from('commissions')
    .select('*')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')

  console.log('\n\n📊 COMMISSIONS:\n')
  let totalComm = 0
  commissions.forEach(c => {
    console.log(`   ${c.created_at.slice(0, 10)} | ${c.commission_amount} | Sale: ${c.sale_id?.slice(0, 8)}`)
    totalComm += parseFloat(c.commission_amount)
  })
  console.log(`\n   Total: ${totalComm} (stored as ${totalComm > 100 ? 'SRD' : 'USD'}?)`)
  console.log(`   If SRD → USD: $${(totalComm / 40).toFixed(2)}`)

  // 3. Check for combos in sales
  const { data: sales } = await supabase
    .from('sales')
    .select('*, sale_items(*, items(name, is_combo, purchase_price_usd))')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')

  console.log('\n\n📊 SALES WITH ITEM DETAILS:\n')
  sales.forEach(s => {
    console.log(`\n   ${s.created_at.slice(0, 10)} | ${s.currency} ${s.total_amount}`)
    s.sale_items.forEach(si => {
      const marker = si.items.is_combo ? '✨ COMBO' : '  '
      console.log(`      ${marker} ${si.quantity}x ${si.items.name} @ ${s.currency} ${si.unit_price} = ${si.subtotal}`)
    })
  })

  // 4. Check expense categories
  const { data: expCats } = await supabase
    .from('expense_categories')
    .select('*')

  console.log('\n\n📊 EXPENSE CATEGORIES:\n')
  expCats.forEach(cat => {
    console.log(`   - ${cat.name} (ID: ${cat.id})`)
  })

  console.log('\n' + '=' .repeat(80))
  console.log('✅ Audit complete\n')
}

fullAudit().catch(console.error)
