#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function analyzeAllSales() {
  console.log('🔍 ANALYZING ALL SALES FOR COMBO PATTERNS\n')
  console.log('=' .repeat(80))

  // Get ALL sales
  const { data: allSales } = await supabase
    .from('sales')
    .select('*, sale_items(*, items(name, is_combo, purchase_price_usd, selling_price_srd, selling_price_usd))')
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: items } = await supabase
    .from('items')
    .select('*')

  console.log('\n📦 COMBO ITEMS IN DATABASE:\n')
  const comboItems = items.filter(i => i.is_combo)
  comboItems.forEach(c => {
    console.log(`   - ${c.name} (is_combo: ${c.is_combo})`)
  })

  console.log('\n\n📊 RECENT SALES ANALYSIS:\n')
  
  let totalCombosSold = 0
  let totalSalesWithCombos = 0
  const comboPatterns = new Map()

  allSales.forEach((sale, idx) => {
    if (idx < 20) { // Analyze last 20 sales
      console.log(`\n${sale.created_at.slice(0, 10)} | ${sale.currency} ${sale.total_amount}`)
      
      // Count items in this sale
      const itemCounts = new Map()
      let hasExplicitCombo = false
      
      sale.sale_items?.forEach(si => {
        if (si.items.is_combo) {
          hasExplicitCombo = true
          console.log(`   ✨ EXPLICIT COMBO: ${si.quantity}x ${si.items.name}`)
        } else {
          const name = si.items.name
          const count = itemCounts.get(name) || 0
          itemCounts.set(name, count + si.quantity)
          console.log(`      ${si.quantity}x ${name} @ ${sale.currency} ${si.unit_price}`)
        }
      })

      // Check for common combo patterns
      const patterns = [
        {
          name: 'ZS10 PRO X + Pouch + DAC',
          items: ['KZ ZS10 PRO X', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC']
        },
        {
          name: 'Castor PRO + Pouch + DAC',
          items: ['KZ Castor PRO', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC']
        },
        {
          name: 'Vader + Pouch + DAC',
          items: ['KZ Vader', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC']
        },
        {
          name: 'ZSN Pro 2 + Pouch + DAC',
          items: ['KZ ZSN Pro 2', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC']
        }
      ]

      let saleHadCombo = hasExplicitCombo
      patterns.forEach(pattern => {
        const counts = pattern.items.map(item => itemCounts.get(item) || 0)
        const minCount = Math.min(...counts)
        
        if (minCount > 0) {
          saleHadCombo = true
          console.log(`   🎯 DETECTED PATTERN: ${minCount}x ${pattern.name}`)
          totalCombosSold += minCount
          
          const existing = comboPatterns.get(pattern.name) || 0
          comboPatterns.set(pattern.name, existing + minCount)
        }
      })

      if (saleHadCombo) totalSalesWithCombos++
    }
  })

  console.log('\n\n📈 COMBO PATTERN SUMMARY:\n')
  console.log(`   Total sales analyzed: ${Math.min(20, allSales.length)}`)
  console.log(`   Sales with combos: ${totalSalesWithCombos}`)
  console.log(`   Total combos detected: ${totalCombosSold}`)
  console.log('\n   Combo patterns found:')
  comboPatterns.forEach((count, pattern) => {
    console.log(`      ${pattern}: ${count} times`)
  })

  // Check February specifically
  console.log('\n\n📅 FEBRUARY 2026 DETAILED:\n')
  const febSales = allSales.filter(s => s.created_at.startsWith('2026-02'))
  let febCombos = 0
  
  febSales.forEach(sale => {
    console.log(`\n${sale.created_at.slice(0, 19)} | ${sale.currency} ${sale.total_amount}`)
    
    const itemCounts = new Map()
    sale.sale_items?.forEach(si => {
      const name = si.items.name
      const count = itemCounts.get(name) || 0
      itemCounts.set(name, count + si.quantity)
      console.log(`   ${si.quantity}x ${name}`)
    })

    // Count ALL possible combo patterns
    const allPatterns = [
      ['KZ ZS10 PRO X', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC'],
      ['KZ Castor PRO', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC'],
      ['KZ Vader', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC'],
      ['KZ ZSN Pro 2', 'KZ Elliptical Pouch', 'ESSAGER AUX(3.5mm) to Type-C DAC']
    ]

    allPatterns.forEach(pattern => {
      const counts = pattern.map(item => itemCounts.get(item) || 0)
      const minCount = Math.min(...counts)
      if (minCount > 0) {
        febCombos += minCount
        console.log(`   → ${minCount} combo(s) detected`)
      }
    })
  })

  console.log(`\n   ✅ February total combos: ${febCombos}`)

  console.log('\n' + '=' .repeat(80))
  console.log('✅ Analysis complete\n')
}

analyzeAllSales().catch(console.error)
