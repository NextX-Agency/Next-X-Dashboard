'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Package, Plus, ArrowRightLeft, AlertTriangle, Filter } from 'lucide-react'
import { PageHeader, PageContainer, Button } from '@/components/UI'
import { StockCard, Modal } from '@/components/PageCards'

type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type Stock = Database['public']['Tables']['stock']['Row']

interface StockWithDetails extends Stock {
  item?: Item
  location?: Location
}

export default function StockPage() {
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [stocks, setStocks] = useState<StockWithDetails[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [showLowStock, setShowLowStock] = useState(false)
  const [addForm, setAddForm] = useState({
    item_id: '',
    location_id: '',
    quantity: ''
  })
  const [transferForm, setTransferForm] = useState({
    item_id: '',
    from_location_id: '',
    to_location_id: '',
    quantity: ''
  })

  const loadData = async () => {
    const [itemsRes, locationsRes] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('name')
    ])
    if (itemsRes.data) setItems(itemsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
    loadAllStock()
  }

  const loadAllStock = async () => {
    const { data, error } = await supabase
      .from('stock')
      .select(`
        *,
        items (*),
        locations (*)
      `)
      .order('quantity', { ascending: false })
    
    if (error) {
      console.error('Error loading stock:', error)
      return
    }
    
    if (data) setStocks(data as StockWithDetails[])
  }

  const loadStockByLocation = async (locationId: string) => {
    const { data, error } = await supabase
      .from('stock')
      .select(`
        *,
        items (*),
        locations (*)
      `)
      .eq('location_id', locationId)
      .order('quantity', { ascending: false })
    
    if (error) {
      console.error('Error loading stock by location:', error)
      return
    }
    
    if (data) setStocks(data as StockWithDetails[])
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedLocation) {
      loadStockByLocation(selectedLocation)
    } else {
      loadAllStock()
    }
  }, [selectedLocation])

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault()
    const { item_id, location_id, quantity } = addForm
    
    const { data: existing } = await supabase
      .from('stock')
      .select('*')
      .eq('item_id', item_id)
      .eq('location_id', location_id)
      .single()

    if (existing) {
      await supabase
        .from('stock')
        .update({ quantity: existing.quantity + parseInt(quantity) })
        .eq('id', existing.id)
    } else {
      await supabase.from('stock').insert({
        item_id,
        location_id,
        quantity: parseInt(quantity)
      })
    }

    setAddForm({ item_id: '', location_id: '', quantity: '' })
    setShowAddForm(false)
    if (selectedLocation) {
      await loadStockByLocation(selectedLocation)
    } else {
      await loadAllStock()
    }
  }

  const handleTransferStock = async (e: React.FormEvent) => {
    e.preventDefault()
    const { item_id, from_location_id, to_location_id, quantity } = transferForm
    const qty = parseInt(quantity)

    if (from_location_id === to_location_id) {
      alert('Cannot transfer to the same location')
      return
    }

    const { data: fromStock } = await supabase
      .from('stock')
      .select('*')
      .eq('item_id', item_id)
      .eq('location_id', from_location_id)
      .single()

    if (!fromStock || fromStock.quantity < qty) {
      alert('Insufficient stock')
      return
    }

    await supabase
      .from('stock')
      .update({ quantity: fromStock.quantity - qty })
      .eq('id', fromStock.id)

    const { data: toStock } = await supabase
      .from('stock')
      .select('*')
      .eq('item_id', item_id)
      .eq('location_id', to_location_id)
      .single()

    if (toStock) {
      await supabase
        .from('stock')
        .update({ quantity: toStock.quantity + qty })
        .eq('id', toStock.id)
    } else {
      await supabase.from('stock').insert({
        item_id,
        location_id: to_location_id,
        quantity: qty
      })
    }

    await supabase.from('stock_transfers').insert({
      item_id,
      from_location_id,
      to_location_id,
      quantity: qty
    })

    setTransferForm({ item_id: '', from_location_id: '', to_location_id: '', quantity: '' })
    setShowTransferForm(false)
    if (selectedLocation) {
      await loadStockByLocation(selectedLocation)
    } else {
      await loadAllStock()
    }
  }

  const handleRemoveStock = async (stockId: string, currentQty: number) => {
    const removeQty = prompt(`Remove quantity (max ${currentQty}):`)
    if (!removeQty) return
    
    const qty = parseInt(removeQty)
    if (qty <= 0 || qty > currentQty) {
      alert('Invalid quantity')
      return
    }

    const newQty = currentQty - qty
    if (newQty === 0) {
      await supabase.from('stock').delete().eq('id', stockId)
    } else {
      await supabase.from('stock').update({ quantity: newQty }).eq('id', stockId)
    }
    if (selectedLocation) {
      await loadStockByLocation(selectedLocation)
    } else {
      await loadAllStock()
    }
  }

  const filteredStocks = showLowStock 
    ? stocks.filter(s => s.quantity < 10)
    : stocks

  const lowStockCount = stocks.filter(s => s.quantity < 10).length
  const totalItems = stocks.length
  const totalQuantity = stocks.reduce((sum, s) => sum + s.quantity, 0)

  return (
    <div className="min-h-screen">
      <PageHeader 
        title="Stock Management" 
        subtitle="Track inventory across locations"
        action={
          <div className="flex gap-2">
            <Button onClick={() => setShowTransferForm(true)} variant="secondary">
              <ArrowRightLeft size={20} />
              <span className="hidden sm:inline">Transfer</span>
            </Button>
            <Button onClick={() => setShowAddForm(true)} variant="primary">
              <Plus size={20} />
              <span className="hidden sm:inline">Add Stock</span>
            </Button>
          </div>
        }
      />

      <PageContainer>
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
            <div className="text-sm text-muted-foreground mb-1">Total Items</div>
            <div className="text-3xl font-bold text-foreground">{totalItems}</div>
          </div>
          <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
            <div className="text-sm text-muted-foreground mb-1">Total Quantity</div>
            <div className="text-3xl font-bold text-orange-600">{totalQuantity}</div>
          </div>
          <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
            <div className="text-sm text-muted-foreground mb-1">Locations</div>
            <div className="text-3xl font-bold text-foreground">{locations.length}</div>
          </div>
          <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              <AlertTriangle size={16} className="text-red-500" />
              Low Stock
            </div>
            <div className="text-3xl font-bold text-red-600">{lowStockCount}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card p-4 rounded-2xl shadow-sm border border-border mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-2">
                <Filter size={16} className="inline mr-1" />
                Filter by Location
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setShowLowStock(!showLowStock)}
                className={`px-6 py-3 rounded-xl font-semibold transition ${
                  showLowStock
                    ? 'bg-red-500 text-white shadow-lg'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {showLowStock ? '✓ Low Stock Only' : 'Show Low Stock'}
              </button>
            </div>
          </div>
        </div>

        {/* Stock Grid */}
        {filteredStocks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package size={48} className="mx-auto mb-4 opacity-50" />
            <p>{showLowStock ? 'No low stock items' : 'No stock items yet'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredStocks.map((stock) => (
              <StockCard
                key={stock.id}
                itemName={stock.item?.name || 'Unknown Item'}
                locationName={stock.location?.name || 'Unknown Location'}
                quantity={stock.quantity}
                imageUrl={stock.item?.image_url}
                onRemove={() => handleRemoveStock(stock.id, stock.quantity)}
              />
            ))}
          </div>
        )}
      </PageContainer>

      {/* Add Stock Modal */}
      <Modal isOpen={showAddForm} onClose={() => setShowAddForm(false)} title="Add Stock">
        <form onSubmit={handleAddStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Item</label>
            <select
              value={addForm.item_id}
              onChange={(e) => setAddForm({ ...addForm, item_id: e.target.value })}
              className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            >
              <option value="">Select Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Location</label>
            <select
              value={addForm.location_id}
              onChange={(e) => setAddForm({ ...addForm, location_id: e.target.value })}
              className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            >
              <option value="">Select Location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Quantity</label>
            <input
              type="number"
              value={addForm.quantity}
              onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
              placeholder="Enter quantity"
              className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
              min="1"
            />
          </div>
          <Button type="submit" variant="primary" fullWidth size="lg">
            Add Stock
          </Button>
        </form>
      </Modal>

      {/* Transfer Stock Modal */}
      <Modal isOpen={showTransferForm} onClose={() => setShowTransferForm(false)} title="Transfer Stock">
        <form onSubmit={handleTransferStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Item</label>
            <select
              value={transferForm.item_id}
              onChange={(e) => setTransferForm({ ...transferForm, item_id: e.target.value })}
              className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            >
              <option value="">Select Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">From Location</label>
              <select
                value={transferForm.from_location_id}
                onChange={(e) => setTransferForm({ ...transferForm, from_location_id: e.target.value })}
                className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                required
              >
                <option value="">Select</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">To Location</label>
              <select
                value={transferForm.to_location_id}
                onChange={(e) => setTransferForm({ ...transferForm, to_location_id: e.target.value })}
                className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                required
              >
                <option value="">Select</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Quantity</label>
            <input
              type="number"
              value={transferForm.quantity}
              onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
              placeholder="Enter quantity to transfer"
              className="w-full px-4 py-3 bg-input text-foreground border border-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
              min="1"
            />
          </div>
          <Button type="submit" variant="primary" fullWidth size="lg">
            Transfer Stock
          </Button>
        </form>
      </Modal>
    </div>
  )
}

