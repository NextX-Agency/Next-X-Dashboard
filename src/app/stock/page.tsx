'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Package, Plus, ArrowRightLeft, AlertTriangle, Filter, Search, X, ArrowUpDown } from 'lucide-react'
import { PageHeader, PageContainer, Button, Select, Input, EmptyState, LoadingSpinner, StatBox } from '@/components/UI'
import { StockCard, Modal } from '@/components/PageCards'

type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type Stock = Database['public']['Tables']['stock']['Row']

interface StockWithDetails extends Stock {
  items?: Item | null
  locations?: Location | null
}

type SortField = 'item' | 'location' | 'quantity'
type SortOrder = 'asc' | 'desc'

export default function StockPage() {
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [stocks, setStocks] = useState<StockWithDetails[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [showLowStock, setShowLowStock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
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
  
  // Search and sort states
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('quantity')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const loadData = async () => {
    setLoading(true)
    const [itemsRes, locationsRes] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('name')
    ])
    if (itemsRes.data) setItems(itemsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
    await loadAllStock()
    setLoading(false)
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
    if (submitting) return
    setSubmitting(true)
    
    try {
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
    } finally {
      setSubmitting(false)
    }
  }

  const handleTransferStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    
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

    setSubmitting(true)
    try {
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
    } finally {
      setSubmitting(false)
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
    ? stocks.filter(s => s.quantity < 2)
    : stocks
    
  // Search and sort filtered stocks
  const searchedAndSortedStocks = filteredStocks
    .filter(stock => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        stock.items?.name?.toLowerCase().includes(query) ||
        stock.locations?.name?.toLowerCase().includes(query)
      )
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'item':
          comparison = (a.items?.name || '').localeCompare(b.items?.name || '')
          break
        case 'location':
          comparison = (a.locations?.name || '').localeCompare(b.locations?.name || '')
          break
        case 'quantity':
          comparison = a.quantity - b.quantity
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedLocation('')
    setShowLowStock(false)
    setSortField('quantity')
    setSortOrder('desc')
  }

  const hasActiveFilters = searchQuery || selectedLocation || showLowStock

  const lowStockCount = stocks.filter(s => s.quantity < 2).length
  const totalItems = stocks.length
  const totalQuantity = stocks.reduce((sum, s) => sum + s.quantity, 0)

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Stock Management" subtitle="Track inventory across locations" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Stock Management" 
        subtitle="Track inventory across locations"
        icon={<Package size={24} />}
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
          <StatBox label="Total Items" value={totalItems.toString()} icon={<Package size={20} />} />
          <StatBox label="Total Quantity" value={totalQuantity.toString()} icon={<Package size={20} />} />
          <StatBox label="Locations" value={locations.length.toString()} icon={<Package size={20} />} />
          <div className="bg-card p-5 lg:p-6 rounded-2xl border border-destructive/30 hover:shadow-md transition-all duration-200">
            <div className="text-sm text-muted-foreground mb-2 flex items-center gap-2 font-medium">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle size={16} className="text-destructive" />
              </div>
              Low Stock
            </div>
            <div className="text-3xl font-bold text-destructive">{lowStockCount}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card p-4 lg:p-5 rounded-2xl border border-border mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Filter size={18} className="text-primary" />
              Filters & Sort
            </h2>
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="ghost" size="sm">
                <X size={16} />
                Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search items or locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-9 text-sm"
              />
            </div>
            <Select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
            <button
              onClick={() => setShowLowStock(!showLowStock)}
              className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-98 ${
                showLowStock
                  ? 'bg-destructive text-white shadow-lg shadow-destructive/25'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              {showLowStock ? '✓ Low Stock Only' : 'Show Low Stock'}
            </button>
          </div>
          {/* Sort Options */}
          <div className="flex gap-2 mt-4 flex-wrap">
            <span className="text-sm text-muted-foreground self-center">Sort by:</span>
            <button
              onClick={() => toggleSort('quantity')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'quantity' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Quantity
              {sortField === 'quantity' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
            <button
              onClick={() => toggleSort('item')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'item' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Item Name
              {sortField === 'item' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
            <button
              onClick={() => toggleSort('location')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'location' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Location
              {sortField === 'location' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
          </div>
        </div>

        {/* Stock Grid */}
        {searchedAndSortedStocks.length === 0 ? (
          <EmptyState
            icon={Package}
            title={hasActiveFilters ? 'No matching stock items' : 'No stock items yet'}
            description={hasActiveFilters ? 'Try adjusting your filters.' : 'Add stock to get started.'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {searchedAndSortedStocks.map((stock) => (
              <StockCard
                key={stock.id}
                itemName={stock.items?.name || 'Unknown Item'}
                locationName={stock.locations?.name || 'Unknown Location'}
                quantity={stock.quantity}
                imageUrl={stock.items?.image_url}
                onRemove={() => handleRemoveStock(stock.id, stock.quantity)}
              />
            ))}
          </div>
        )}
      </PageContainer>

      {/* Add Stock Modal */}
      <Modal isOpen={showAddForm} onClose={() => setShowAddForm(false)} title="Add Stock">
        <form onSubmit={handleAddStock} className="space-y-4">
          <Select
            label="Item"
            value={addForm.item_id}
            onChange={(e) => setAddForm({ ...addForm, item_id: e.target.value })}
            required
          >
            <option value="">Select Item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Select
            label="Location"
            value={addForm.location_id}
            onChange={(e) => setAddForm({ ...addForm, location_id: e.target.value })}
            required
          >
            <option value="">Select Location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </Select>
          <Input
            label="Quantity"
            type="number"
            value={addForm.quantity}
            onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
            placeholder="Enter quantity"
            required
            min="1"
          />
          <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting}>
            Add Stock
          </Button>
        </form>
      </Modal>

      {/* Transfer Stock Modal */}
      <Modal isOpen={showTransferForm} onClose={() => setShowTransferForm(false)} title="Transfer Stock">
        <form onSubmit={handleTransferStock} className="space-y-4">
          <Select
            label="Item"
            value={transferForm.item_id}
            onChange={(e) => setTransferForm({ ...transferForm, item_id: e.target.value })}
            required
          >
            <option value="">Select Item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="From Location"
              value={transferForm.from_location_id}
              onChange={(e) => setTransferForm({ ...transferForm, from_location_id: e.target.value })}
              required
            >
              <option value="">Select</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
            <Select
              label="To Location"
              value={transferForm.to_location_id}
              onChange={(e) => setTransferForm({ ...transferForm, to_location_id: e.target.value })}
              required
            >
              <option value="">Select</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
          </div>
          <Input
            label="Quantity"
            type="number"
            value={transferForm.quantity}
            onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
            placeholder="Enter quantity to transfer"
            required
            min="1"
          />
          <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting}>
            Transfer Stock
          </Button>
        </form>
      </Modal>
    </div>
  )
}

