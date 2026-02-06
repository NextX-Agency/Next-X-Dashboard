#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function testNewLogic() {
  console.log('🧪 TESTING NEW COMBO DETECTION LOGIC\n')
  console.log('=' .repeat(80))

  // Get February sales
  const { data: sales } = await supabase
    .from('sales')
    .select('*, sale_items(*, items(name, is_combo))')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')

  const { data: items } = await supabase.from('items').select('*')

  console.log('\n📊 TESTING FEBRUARY 2026:\n')
  
  let totalCombos = 0
  const comboTypes = new Map()

  sales.forEach(sale => {
    console.log(`\n${sale.created_at.slice(0, 10)} | ${sale.currency} ${sale.total_amount}`)
    
    // Check explicit combos
    sale.sale_items?.forEach(si => {
      if (si.items.is_combo) {
        console.log(`   ✨ Explicit combo: ${si.quantity}x ${si.items.name}`)
        totalCombos += si.quantity
      }
    })

    // Pattern detection
    if (sale.sale_items && sale.sale_items.length >= 3) {
      const itemCounts = new Map()
      
      sale.sale_items.forEach(si => {
        if (!si.items.is_combo) {
          const existing = itemCounts.get(si.items.name)
          if (existing) {
            existing.quantity += si.quantity
          } else {
            itemCounts.set(si.items.name, { quantity: si.quantity })
          }
        }
      })
      
      // Find KZ IEMs
      const kzIEMs = Array.from(itemCounts.entries()).filter(([name]) => 
        name.startsWith('KZ ') && 
        !name.includes('Pouch') && 
        !name.includes('Cable') &&
        !name.includes('Verlengkabel') &&
        !name.includes('DEAL')
      )
      
      const pouchCount = itemCounts.get('KZ Elliptical Pouch')?.quantity || 0
      const dacCount = itemCounts.get('ESSAGER AUX(3.5mm) to Type-C DAC')?.quantity || 0
      
      kzIEMs.forEach(([iemName, iemData]) => {
        const comboSets = Math.min(iemData.quantity, pouchCount, dacCount)
        
        if (comboSets > 0) {
          const comboName = `${iemName} DEAL`
          console.log(`   🎯 Pattern detected: ${comboSets}x ${comboName} (${iemName}+Pouch+DAC)`)
          totalCombos += comboSets
          
          const existing = comboTypes.get(comboName)
          if (existing) {
            existing.count += comboSets
          } else {
            comboTypes.set(comboName, { count: comboSets })
          }
        }
      })
    }
  })

  console.log('\n\n✅ RESULTS:\n')
  console.log(`   Total combos detected: ${totalCombos}`)
  console.log(`\n   Combo breakdown:`)
  comboTypes.forEach((data, name) => {
    console.log(`      ${name}: ${data.count}x`)
  })

  // Check expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*, expense_categories(name)')
    .gte('created_at', '2026-02-01')
    .lt('created_at', '2026-03-01')

  console.log('\n\n💰 OPERATING COSTS:\n')
  
  const excludedCategories = ['business expense', 'personal items', 'personal']
  let operatingUSD = 0
  let excludedUSD = 0

  expenses.forEach(e => {
    const cat = (e.expense_categories?.name || '').toLowerCase()
    const amtUSD = e.currency === 'USD' ? e.amount : e.amount / 40
    
    if (excludedCategories.includes(cat)) {
      excludedUSD += amtUSD
    } else {
      operatingUSD += amtUSD
      console.log(`   ${e.expense_categories?.name}: $${amtUSD.toFixed(2)} (${e.currency} ${e.amount})`)
    }
  })

  console.log(`\n   Operating Costs: $${operatingUSD.toFixed(2)} = SRD ${(operatingUSD * 40).toFixed(0)}`)
  console.log(`   Excluded Costs: $${excludedUSD.toFixed(2)} = SRD ${(excludedUSD * 40).toFixed(0)}`)

  console.log('\n' + '=' .repeat(80))
  console.log('✅ Test complete!\n')
}

testNewLogic().catch(console.error)
