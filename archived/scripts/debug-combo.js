const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://ivvhazwjtnyznojeoojs.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2dmhhendqdG55em5vamVvb2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNjY4MTQsImV4cCI6MjA4MDk0MjgxNH0.0B9LKov_-ylmKssT8IYLVHluyzQMiSv8c5GsngHWHJw'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugCombo() {
  console.log('\n=== DEBUGGING COMBO PRODUCT ===\n')
  
  // 1. Find all combo products
  console.log('1. Finding combo products...')
  const { data: combos, error: combosError } = await supabase
    .from('items')
    .select('id, name, is_combo, selling_price_srd')
    .eq('is_combo', true)
  
  if (combosError) {
    console.error('Error fetching combos:', combosError)
    return
  }
  
  console.log(`Found ${combos.length} combo products:`)
  combos.forEach(c => console.log(`  - ${c.name} (${c.id})`))
  
  if (combos.length === 0) {
    console.log('\nNo combo products found!')
    return
  }
  
  // Use the first combo for testing
  const comboId = combos[0].id
  console.log(`\n2. Checking combo: ${combos[0].name} (${comboId})`)
  
  // 2. Get combo_items for this combo
  const { data: comboItems, error: comboItemsError } = await supabase
    .from('combo_items')
    .select('*')
    .eq('combo_id', comboId)
  
  if (comboItemsError) {
    console.error('Error fetching combo_items:', comboItemsError)
    return
  }
  
  console.log(`\nFound ${comboItems.length} items in this combo:`)
  console.log(JSON.stringify(comboItems, null, 2))
  
  // 3. Get the actual items data
  if (comboItems.length > 0) {
    const itemIds = comboItems.map(ci => ci.item_id)
    console.log(`\n3. Fetching item details for IDs: ${itemIds.join(', ')}`)
    
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id, name, is_combo')
      .in('id', itemIds)
    
    if (itemsError) {
      console.error('Error fetching items:', itemsError)
    } else {
      console.log('\nChild items:')
      items.forEach(item => console.log(`  - ${item.name} (${item.id})`))
    }
    
    // 4. Check stock for these items
    console.log('\n4. Checking stock levels...')
    const { data: stock, error: stockError } = await supabase
      .from('stock')
      .select('item_id, location_id, quantity')
      .in('item_id', itemIds)
    
    if (stockError) {
      console.error('Error fetching stock:', stockError)
    } else {
      console.log('\nStock data:')
      console.log(JSON.stringify(stock, null, 2))
      
      // Calculate total stock per item
      const stockMap = {}
      stock.forEach(s => {
        stockMap[s.item_id] = (stockMap[s.item_id] || 0) + s.quantity
      })
      
      console.log('\nTotal stock per item:')
      Object.entries(stockMap).forEach(([itemId, qty]) => {
        const item = items.find(i => i.id === itemId)
        console.log(`  - ${item?.name || itemId}: ${qty}`)
      })
    }
  }
  
  console.log('\n=== END DEBUG ===\n')
}

debugCombo().catch(console.error)
