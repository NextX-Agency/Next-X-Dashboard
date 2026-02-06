// Diagnostic script to identify profit calculation issues
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function diagnose() {
  console.log('🔍 PROFIT CALCULATION DIAGNOSTIC\n')
  console.log('=' .repeat(80))

  // 1. Check for NULL exchange rates
  console.log('\n📊 1. CHECKING SALES WITH MISSING EXCHANGE RATES\n')
  const { data: nullRateSales, error: e1 } = await supabase
    .from('sales')
    .select('id, created_at, currency, total_amount, exchange_rate')
    .is('exchange_rate', null)
    .limit(10)

  if (nullRateSales && nullRateSales.length > 0) {
    console.log(`⚠️  Found ${nullRateSales.length} sales with NULL exchange_rate:`)
    nullRateSales.forEach(s => {
      console.log(`   - ${s.id.slice(0, 8)}... | ${s.created_at.slice(0, 10)} | ${s.currency} ${s.total_amount}`)
    })
  } else {
    console.log('✅ All sales have exchange rates')
  }

  // 2. Get current month sales summary
  console.log('\n📊 2. FEBRUARY 2026 SALES SUMMARY\n')
  const { data: febSales, error: e2 } = await supabase
    .from('sales')
    .select(`
      id, created_at, currency, total_amount, exchange_rate,
      sale_items (
        item_id, quantity, unit_price, subtotal
      )
    `)
    .gte('created_at', '2026-02-01T00:00:00')
    .lte('created_at', '2026-02-05T23:59:59')
    .order('created_at', { ascending: false })

  if (febSales) {
    const totalRevenue = febSales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0)
    console.log(`   Total Sales: ${febSales.length}`)
    console.log(`   Total Revenue (mixed currency): ${totalRevenue.toFixed(2)}`)
    
    // Show first 3 sales in detail
    console.log('\n   Recent Sales Details:')
    febSales.slice(0, 3).forEach((sale, i) => {
      console.log(`   \n   Sale ${i + 1}: ${sale.id.slice(0, 8)}...`)
      console.log(`      Date: ${sale.created_at}`)
      console.log(`      Total: ${sale.currency} ${sale.total_amount}`)
      console.log(`      Exchange Rate: ${sale.exchange_rate || 'NULL ⚠️'}`)
      console.log(`      Items: ${sale.sale_items?.length || 0}`)
    })
  }

  // 3. Check item costs
  console.log('\n\n📊 3. ITEM COST ANALYSIS\n')
  const { data: items, error: e3 } = await supabase
    .from('items')
    .select('id, name, purchase_price_usd, selling_price_srd, selling_price_usd, is_combo')
    .limit(10)

  if (items) {
    console.log('   Sample Items:')
    items.forEach(item => {
      console.log(`   - ${item.name}`)
      console.log(`     Cost: $${item.purchase_price_usd || 'NULL'} | Sell: SRD ${item.selling_price_srd || 'NULL'} / $${item.selling_price_usd || 'NULL'}`)
    })
  }

  // 4. Check Business Expense category
  console.log('\n\n📊 4. EXPENSE CATEGORIES & AMOUNTS\n')
  const { data: expenseCats, error: e4 } = await supabase
    .from('expense_categories')
    .select('id, name')

  const { data: febExpenses, error: e5 } = await supabase
    .from('expenses')
    .select(`
      id, amount, currency, description, created_at,
      expense_categories (name)
    `)
    .gte('created_at', '2026-02-01T00:00:00')
    .lte('created_at', '2026-02-05T23:59:59')

  if (expenseCats) {
    console.log('   Available Categories:')
    expenseCats.forEach(cat => console.log(`   - ${cat.name}`))
  }

  if (febExpenses && febExpenses.length > 0) {
    console.log(`\n   February Expenses (${febExpenses.length} total):`)
    const categoryTotals = {}
    febExpenses.forEach(exp => {
      const catName = exp.expense_categories?.name || 'Uncategorized'
      if (!categoryTotals[catName]) categoryTotals[catName] = { count: 0, total: 0 }
      categoryTotals[catName].count++
      categoryTotals[catName].total += parseFloat(exp.amount)
    })
    
    Object.entries(categoryTotals).forEach(([cat, data]) => {
      console.log(`   - ${cat}: ${data.count} expenses, Total: ${data.total.toFixed(2)}`)
    })
  }

  // 5. Check commissions (DETAILED)
  console.log('\n\n📊 5. COMMISSIONS ANALYSIS (DETAILED)\n')
  const { data: febCommissions, error: e6 } = await supabase
    .from('commissions')
    .select('id, sale_id, commission_amount, created_at, paid')
    .gte('created_at', '2026-02-01T00:00:00')
    .lte('created_at', '2026-02-05T23:59:59')

  if (febCommissions && febCommissions.length > 0) {
    const totalComm = febCommissions.reduce((sum, c) => sum + parseFloat(c.commission_amount), 0)
    console.log(`   Total Commissions: ${febCommissions.length}`)
    console.log(`   Total Amount: $${totalComm.toFixed(2)}`)
    console.log(`   If converted from SRD: $${(totalComm / 40).toFixed(2)} USD`)
    console.log('\n   Commission Details:')
    febCommissions.forEach((c, i) => {
      console.log(`   ${i + 1}. Sale ID: ${c.sale_id ? c.sale_id.slice(0, 8) + '...' : 'NULL'} | Amount: $${c.commission_amount} (or SRD ${c.commission_amount} = $${(parseFloat(c.commission_amount) / 40).toFixed(2)})`)
    })
    
    // CHECK: Are these commissions for Feb sales?
    console.log('\n   ⚠️  CHECKING: Do these commissions match February sales?')
    const febSaleIds = febSales.map(s => s.id)
    const matchedComm = febCommissions.filter(c => c.sale_id && febSaleIds.includes(c.sale_id))
    const unmatchedComm = febCommissions.filter(c => !c.sale_id || !febSaleIds.includes(c.sale_id))
    
    console.log(`   ✓ Matched to Feb sales: ${matchedComm.length} commissions`)
    console.log(`   ✗ NOT matched to Feb sales: ${unmatchedComm.length} commissions`)
    
    // Check commission percentages
    console.log('\n   📈 COMMISSION RATE CHECK:')
    for (const comm of matchedComm) {
      const sale = febSales.find(s => s.id === comm.sale_id)
      if (sale) {
        const saleRevUSD = sale.currency === 'USD' ? sale.total_amount : sale.total_amount / 40
        const commUSD = parseFloat(comm.commission_amount)
        const commSRD = parseFloat(comm.commission_amount) / 40
        const pctIfUSD = ((commUSD / saleRevUSD) * 100).toFixed(1)
        const pctIfSRD = ((commSRD / saleRevUSD) * 100).toFixed(1)
        console.log(`      Sale ${comm.sale_id.slice(0, 8)}... ($${saleRevUSD.toFixed(2)})`)
        console.log(`        If comm is USD $${commUSD}: ${pctIfUSD}% rate ${pctIfUSD > 100 ? '🔴 IMPOSSIBLE!' : ''}`)
        console.log(`        If comm is SRD: $${commSRD.toFixed(2)} = ${pctIfSRD}% rate ${pctIfSRD < 30 ? '✓ Reasonable' : ''}`)
      }
    }
  } else {
    console.log('   No commissions found for February')
  }

  // 6. Manual calculation example
  console.log('\n\n📊 6. MANUAL PROFIT CALCULATION (First Sale)\n')
  if (febSales && febSales.length > 0 && febSales[0].sale_items) {
    const sale = febSales[0]
    console.log(`   Sale: ${sale.id.slice(0, 8)}...`)
    console.log(`   Revenue: ${sale.currency} ${sale.total_amount}`)
    console.log(`   Exchange Rate: ${sale.exchange_rate || 'Using current rate (45?)'}`)
    
    let totalCost = 0
    let totalRevUSD = 0
    const rate = sale.exchange_rate || 45
    
    for (const si of sale.sale_items) {
      const { data: item } = await supabase
        .from('items')
        .select('name, purchase_price_usd')
        .eq('id', si.item_id)
        .single()
      
      if (item) {
        const cost = parseFloat(item.purchase_price_usd || 0) * si.quantity
        const revenue = sale.currency === 'USD' ? si.subtotal : si.subtotal / rate
        totalCost += cost
        totalRevUSD += revenue
        
        console.log(`   - ${item.name}: Qty ${si.quantity}`)
        console.log(`     Revenue: $${revenue.toFixed(2)} | Cost: $${cost.toFixed(2)} | Profit: $${(revenue - cost).toFixed(2)}`)
      }
    }
    
    console.log(`\n   TOTAL:`)
    console.log(`   Revenue (USD): $${totalRevUSD.toFixed(2)}`)
    console.log(`   Cost (USD): $${totalCost.toFixed(2)}`)
    console.log(`   Gross Profit: $${(totalRevUSD - totalCost).toFixed(2)}`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ Diagnostic complete\n')
}

diagnose().catch(console.error)
