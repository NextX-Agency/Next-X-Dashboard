#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkCombosAndExpenses() {
  console.log('🔍 CHECKING COMBO SALES & OPERATING COSTS\n')
  console.log('================================================================================\n')

  // First check: Are there any combo items?
  const { data: allItems, error: itemsErr } = await supabase
    .from('items')
    .select('id, name, is_combo, purchase_price_usd, selling_price_srd, selling_price_usd')

  if (itemsErr) {
    console.error('Error fetching items:', itemsErr)
    return
  }

  const comboItems = allItems.filter(i => i.is_combo)
  console.log('📦 COMBO ITEMS IN DATABASE:\n')
  console.log(`   Total items: ${allItems.length}`)
  console.log(`   Combo items (is_combo=true): ${comboItems.length}\n`)
  
  if (comboItems.length > 0) {
    comboItems.forEach(combo => {
      console.log(`   - ${combo.name}`)
      console.log(`     Price: SRD ${combo.selling_price_srd} / USD ${combo.selling_price_usd}`)
      console.log(`     Cost: USD ${combo.purchase_price_usd || 'NULL'}`)
      console.log('')
    })
  } else {
    console.log('   ⚠️  NO COMBO ITEMS FOUND! You need to mark items as combos in the database.')
  }

  // Check February sales for combo data
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('id, created_at, total_amount, currency, sale_items(item_id, quantity, subtotal)')
    .gte('created_at', '2026-02-01')
    .lte('created_at', '2026-02-05T23:59:59')
    .order('created_at', { ascending: false })

  if (salesErr) {
    console.error('Error fetching sales:', salesErr)
    return
  }

  console.log('\n\n📊 FEBRUARY SALES (Feb 1-5, 2026):\n')
  
  let totalCombosSold = 0
  sales.forEach(s => {
    console.log(`   ${s.created_at.slice(0, 19).replace('T', ' ')}`)
    console.log(`      Amount: ${s.currency} ${s.total_amount}`)
    
    // Check if this sale has combo items
    const comboItemsInSale = s.sale_items?.filter(si => {
      const item = allItems.find(i => i.id === si.item_id)
      return item?.is_combo
    }) || []
    
    if (comboItemsInSale.length > 0) {
      comboItemsInSale.forEach(si => {
        const item = allItems.find(i => i.id === si.item_id)
        console.log(`      ✨ COMBO: ${si.quantity}x ${item?.name} (${s.currency} ${si.subtotal})`)
        totalCombosSold += si.quantity
      })
    }
    console.log('')
  })

  console.log(`\n   Total sales: ${sales.length}`)
  console.log(`   🎯 Total combos sold: ${totalCombosSold}`)

  // Check if there are sales TODAY (Feb 5)
  const todaySales = sales.filter(s => s.created_at.startsWith('2026-02-05'))
  console.log(`   \n   📅 Sales TODAY (Feb 5): ${todaySales.length}`)
  let todayCombos = 0
  todaySales.forEach(s => {
    const comboCount = s.sale_items?.reduce((count, si) => {
      const item = allItems.find(i => i.id === si.item_id)
      return count + (item?.is_combo ? si.quantity : 0)
    }, 0) || 0
    todayCombos += comboCount
    console.log(`      - ${s.currency} ${s.total_amount} | ${comboCount} combos`)
  })
  console.log(`   📦 Combos sold today: ${todayCombos}`)


  // Check expenses
  const { data: expenses, error: expErr } = await supabase
    .from('expenses')
    .select('*, expense_categories(name)')
    .gte('created_at', '2026-02-01')
    .lte('created_at', '2026-02-05T23:59:59')
    .order('created_at', { ascending: false })

  if (expErr) {
    console.error('Error fetching expenses:', expErr)
    return
  }

  console.log('\n\n📊 FEBRUARY EXPENSES:\n')
  let totalExpSRD = 0
  let totalExpUSD = 0
  const byCategory = {}

  expenses.forEach(e => {
    const catName = e.expense_categories?.name || 'No Category'
    if (!byCategory[catName]) {
      byCategory[catName] = { count: 0, amountSRD: 0, amountUSD: 0 }
    }
    byCategory[catName].count++
    
    if (e.currency === 'SRD') {
      byCategory[catName].amountSRD += e.amount
      totalExpSRD += e.amount
    } else {
      byCategory[catName].amountUSD += e.amount
      totalExpUSD += e.amount
    }

    console.log(`   ${e.created_at.slice(0, 10)} | ${catName}`)
    console.log(`      ${e.currency} ${e.amount} - "${e.description}"`)
  })

  console.log('\n\n📊 EXPENSES BY CATEGORY:\n')
  Object.entries(byCategory).forEach(([cat, data]) => {
    console.log(`   ${cat}:`)
    if (data.amountSRD > 0) console.log(`      SRD ${data.amountSRD.toFixed(2)} (= $${(data.amountSRD / 40).toFixed(2)} USD)`)
    if (data.amountUSD > 0) console.log(`      USD ${data.amountUSD.toFixed(2)}`)
    console.log(`      Total in USD: $${(data.amountSRD / 40 + data.amountUSD).toFixed(2)}`)
    console.log('')
  })

  console.log(`\n   Total expenses: ${expenses.length}`)
  console.log(`   Total in SRD: ${totalExpSRD} (= $${(totalExpSRD / 40).toFixed(2)} USD)`)
  console.log(`   Total in USD: $${totalExpUSD.toFixed(2)}`)
  console.log(`   GRAND TOTAL: $${(totalExpSRD / 40 + totalExpUSD).toFixed(2)} USD`)

  // Check what categories are excluded
  console.log('\n\n⚠️  OPERATING COSTS ANALYSIS:\n')
  const businessExp = byCategory['Business Expense']
  if (businessExp) {
    console.log('   "Business Expense" category (EXCLUDED from operating costs):')
    console.log(`      Total: $${(businessExp.amountSRD / 40 + businessExp.amountUSD).toFixed(2)} USD`)
  }

  const operatingCosts = Object.entries(byCategory)
    .filter(([cat]) => cat !== 'Business Expense')
    .reduce((sum, [_, data]) => sum + (data.amountSRD / 40 + data.amountUSD), 0)

  console.log(`\n   Operating Costs (excludes "Business Expense"):`)
  console.log(`      $${operatingCosts.toFixed(2)} USD`)

  console.log('\n================================================================================')
  console.log('✅ Check complete\n')
}

checkCombosAndExpenses().catch(console.error)
