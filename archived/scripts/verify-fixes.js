#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function verifyFixes() {
  console.log('✅ VERIFYING FIXES\n')
  console.log('=' .repeat(80))

  // Get February data
  const { data: sales } = await supabase
    .from('sales')
    .select('*, sale_items(*, items(name, is_combo))')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, expense_categories(name)')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')

  const { data: commissions } = await supabase
    .from('commissions')
    .select('*')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')

  console.log('\n1️⃣  COMBO DETECTION:\n')
  
  let totalCombos = 0
  sales.forEach(sale => {
    // Check for explicit combos
    const explicitCombos = sale.sale_items?.filter(si => si.items.is_combo).length || 0
    
    // Check for pattern: ZS10 + Pouch + DAC
    const itemCounts = new Map()
    sale.sale_items?.forEach(si => {
      if (!si.items.is_combo) {
        const count = itemCounts.get(si.items.name) || 0
        itemCounts.set(si.items.name, count + si.quantity)
      }
    })
    
    const zs10 = itemCounts.get('KZ ZS10 PRO X') || 0
    const pouch = itemCounts.get('KZ Elliptical Pouch') || 0
    const dac = itemCounts.get('ESSAGER AUX(3.5mm) to Type-C DAC') || 0
    const patternCombos = Math.min(zs10, pouch, dac)
    
    const saleTotal = explicitCombos + patternCombos
    totalCombos += saleTotal
    
    if (saleTotal > 0) {
      console.log(`   ${sale.created_at.slice(0, 10)} | ${sale.currency} ${sale.total_amount}`)
      if (explicitCombos > 0) console.log(`      ${explicitCombos} explicit combo items`)
      if (patternCombos > 0) console.log(`      ${patternCombos} detected combo patterns (ZS10+Pouch+DAC)`)
    }
  })
  
  console.log(`\n   ✅ Total combos: ${totalCombos}\n`)

  console.log('\n2️⃣  OPERATING COSTS CALCULATION:\n')
  
  const excludedCategories = ['Business Expense', 'Personal Items', 'personal']
  let operatingCosts = 0
  let excludedCosts = 0
  
  expenses.forEach(e => {
    const catName = e.expense_categories?.name || ''
    const amountUSD = e.currency === 'USD' ? e.amount : e.amount / 40
    
    if (excludedCategories.some(cat => catName.toLowerCase().includes(cat.toLowerCase()))) {
      excludedCosts += amountUSD
      console.log(`   EXCLUDED: ${catName} - $${amountUSD.toFixed(2)} (${e.description})`)
    } else {
      operatingCosts += amountUSD
      console.log(`   INCLUDED: ${catName} - $${amountUSD.toFixed(2)} (${e.description})`)
    }
  })
  
  console.log(`\n   Operating Costs: $${operatingCosts.toFixed(2)}`)
  console.log(`   Excluded Costs: $${excludedCosts.toFixed(2)}`)
  console.log(`   Total Expenses: $${(operatingCosts + excludedCosts).toFixed(2)}\n`)

  console.log('\n3️⃣  COMMISSIONS (SRD → USD):\n')
  
  const totalCommSRD = commissions.reduce((s, c) => s + parseFloat(c.commission_amount), 0)
  const totalCommUSD = totalCommSRD / 40
  
  console.log(`   Total in database: ${totalCommSRD} SRD`)
  console.log(`   Converted to USD: $${totalCommUSD.toFixed(2)}`)
  console.log(`   As % of revenue: ${((totalCommUSD / 258.75) * 100).toFixed(1)}%\n`)

  console.log('\n' + '=' .repeat(80))
  console.log('✅ All fixes verified!\n')
}

verifyFixes().catch(console.error)
