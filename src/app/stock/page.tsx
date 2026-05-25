'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getStoredAdminCatalog, normalizeAdminCatalog, useAdminCatalog } from '@/lib/adminCatalog'
import { Package, Plus, ArrowRightLeft, AlertTriangle, Filter, Search, X, ArrowUpDown, Minus, RefreshCcw, Headphones, Watch } from 'lucide-react'
import { PageHeader, PageContainer, Button, Select, Input, EmptyState, LoadingSpinner, StatBox } from '@/components/UI'
import { StockCard, Modal } from '@/components/PageCards'
import { logActivity } from '@/lib/activityLog'
import type { StockPageDataResponse, StockPageItem as Item, StockPageLocation as Location, StockPageRow as StockWithDetails } from '@/types/stock'

type SortField = 'item' | 'location' | 'quantity'
type SortOrder = 'asc' | 'desc'
type CatalogType = 'audio' | 'watches'

export default function StockPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { catalog: preferredCatalog, setCatalog: setPreferredCatalog } = useAdminCatalog()
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [stocks, setStocks] = useState<StockWithDetails[]>([])
  const [catalogFilter, setCatalogFilter] = useState<CatalogType>(() => normalizeAdminCatalog(searchParams.get('catalog') ?? getStoredAdminCatalog()))
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [showLowStock, setShowLowStock] = useState(false)
  const [removeModal, setRemoveModal] = useState<{ stock: StockWithDetails; removeQty: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
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

  const loadData = useCallback(async (showLoadingState: boolean = false) => {
    if (showLoadingState) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setLoadError(null)

    try {
      const response = await fetch(`/api/stock?catalogType=${catalogFilter}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }

        if (response.status === 403) {
          throw new Error('You no longer have access to stock data.')
        }

        throw new Error('Unable to load stock data right now.')
      }

      const payload = await response.json() as StockPageDataResponse
      setItems(payload.data.items.filter((item) => !item.is_combo))
      setLocations(payload.data.locations)
      setStocks(payload.data.stocks.filter((stock) => !stock.items?.is_combo))
    } catch (error) {
      console.error('Error loading stock data:', error)
      setLoadError(error instanceof Error ? error.message : 'Unable to load stock data right now.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [catalogFilter])

  useEffect(() => {
    void loadData(true)
  }, [loadData])

  useEffect(() => {
    const queryCatalog = searchParams.get('catalog')
    if (!queryCatalog) {
      return
    }

    const nextCatalogFilter = normalizeAdminCatalog(queryCatalog)
    setCatalogFilter((current) => current === nextCatalogFilter ? current : nextCatalogFilter)
    if (preferredCatalog !== nextCatalogFilter) {
      setPreferredCatalog(nextCatalogFilter)
    }
  }, [preferredCatalog, searchParams, setPreferredCatalog])

  useEffect(() => {
    setCatalogFilter((current) => current === preferredCatalog ? current : preferredCatalog)
  }, [preferredCatalog])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get('catalog') === catalogFilter) {
      return
    }

    params.set('catalog', catalogFilter)
    router.replace(`${pathname}?${params.toString()}`)
  }, [catalogFilter, pathname, router, searchParams])

  useEffect(() => {
    setAddForm((current) => ({ ...current, item_id: '' }))
    setTransferForm((current) => ({ ...current, item_id: '' }))
  }, [catalogFilter])

  const handleCatalogFilterChange = useCallback((nextCatalog: CatalogType) => {
    setCatalogFilter(nextCatalog)
    setPreferredCatalog(nextCatalog)
  }, [setPreferredCatalog])

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    
    try {
      const { item_id, location_id, quantity } = addForm
      const item = items.find(i => i.id === item_id)
      const location = locations.find(l => l.id === location_id)
      
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

      await logActivity({
        action: 'create',
        entityType: 'stock',
        entityId: item_id,
        entityName: item?.name,
        details: `Added ${quantity} units of ${item?.name} to ${location?.name}`
      })

      setAddForm({ item_id: '', location_id: '', quantity: '' })
      setShowAddForm(false)
      await loadData()
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

    const item = items.find(i => i.id === item_id)
    const fromLocation = locations.find(l => l.id === from_location_id)
    const toLocation = locations.find(l => l.id === to_location_id)

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

      await logActivity({
        action: 'transfer',
        entityType: 'stock',
        entityId: item_id,
        entityName: item?.name,
        details: `Transferred ${qty} units of ${item?.name} from ${fromLocation?.name} to ${toLocation?.name}`
      })

      setTransferForm({ item_id: '', from_location_id: '', to_location_id: '', quantity: '' })
      setShowTransferForm(false)
      await loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveStock = (stockId: string, currentQty: number) => {
    const stock = stocks.find(s => s.id === stockId)
    if (!stock) return
    setRemoveModal({ stock, removeQty: '1' })
  }

  const handleConfirmRemoveStock = async () => {
    if (!removeModal) return
    const { stock, removeQty } = removeModal
    const qty = parseInt(removeQty)
    if (isNaN(qty) || qty <= 0 || qty > stock.quantity) return

    const newQty = stock.quantity - qty
    if (newQty === 0) {
      await supabase.from('stock').delete().eq('id', stock.id)
    } else {
      await supabase.from('stock').update({ quantity: newQty }).eq('id', stock.id)
    }
    setRemoveModal(null)
    await loadData()
  }

  const scopedStocks = useMemo(() => {
    return selectedLocation
      ? stocks.filter((stock) => stock.location_id === selectedLocation)
      : stocks
  }, [selectedLocation, stocks])

  const filteredStocks = useMemo(() => (
    showLowStock
      ? scopedStocks.filter((stock) => stock.quantity < 5)
      : scopedStocks
  ), [scopedStocks, showLowStock])
    
  // Search and sort filtered stocks
  const searchedAndSortedStocks = useMemo(() => {
    return filteredStocks
      .filter(stock => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        return (
          stock.items?.name?.toLowerCase().includes(query) ||
          stock.items?.brand?.toLowerCase().includes(query) ||
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
  }, [filteredStocks, searchQuery, sortField, sortOrder])

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

  const lowStockCount = scopedStocks.filter((stock) => stock.quantity < 5).length
  const totalItems = scopedStocks.length
  const totalQuantity = scopedStocks.reduce((sum, stock) => sum + stock.quantity, 0)
  const hasLoadedData = items.length > 0 || locations.length > 0 || stocks.length > 0

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Stock Management" subtitle="Track inventory across locations" />
        <LoadingSpinner />
      </div>
    )
  }

  if (!hasLoadedData && loadError) {
    return (
      <div className="min-h-screen pb-20 lg:pb-0">
        <PageHeader
          title="Stock Management"
          subtitle="Inventory data is temporarily unavailable"
          icon={<Package size={24} />}
          action={
            <Button onClick={() => void loadData(true)} variant="secondary">
              <RefreshCcw size={18} />
              Retry
            </Button>
          }
        />
        <PageContainer>
          <EmptyState
            icon={AlertTriangle}
            title="Could not load stock data"
            description={loadError}
            action={
              <Button onClick={() => void loadData(true)} variant="primary">
                <RefreshCcw size={18} />
                Retry
              </Button>
            }
          />
        </PageContainer>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Stock Management" 
        subtitle={`Track ${catalogFilter} inventory across locations`}
        icon={<Package size={24} />}
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <Button onClick={() => void loadData()} variant="ghost" loading={refreshing}>
              <RefreshCcw size={18} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
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
        {loadError && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Sync warning:</span> {loadError}
          </div>
        )}

        <div className="mb-6 flex gap-2">
          {([
            { key: 'audio', label: 'Audio', icon: <Headphones size={14} /> },
            { key: 'watches', label: 'Watches', icon: <Watch size={14} /> },
          ] as { key: CatalogType; label: string; icon: React.ReactNode }[]).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => handleCatalogFilterChange(option.key)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                catalogFilter === option.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatBox label="Total Items" value={totalItems.toString()} icon={<Package size={20} />} />
          <StatBox label="Total Quantity" value={totalQuantity.toString()} icon={<Package size={20} />} />
          <StatBox label="Locations" value={locations.length.toString()} icon={<Package size={20} />} />
          <StatBox 
            label="Low Stock" 
            value={lowStockCount.toString()} 
            icon={<AlertTriangle size={20} />} 
            variant={lowStockCount > 0 ? 'danger' : 'default'}
          />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <Select
              value={showLowStock ? 'low' : ''}
              onChange={(e) => setShowLowStock(e.target.value === 'low')}
            >
              <option value="">All Stock Levels</option>
              <option value="low">Low Stock Only (&lt; 5)</option>
            </Select>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Remove Stock Modal */}
      <Modal isOpen={!!removeModal} onClose={() => setRemoveModal(null)} title="Remove Stock">
        {removeModal && (
          <div className="space-y-4 pb-2">
            <div className="px-3 py-2.5 bg-muted/60 rounded-xl border border-border">
              <p className="text-sm font-semibold text-foreground">{removeModal.stock.items?.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{removeModal.stock.locations?.name} &bull; {removeModal.stock.quantity} in stock</p>
            </div>
            <Input
              label={`Quantity to remove (max ${removeModal.stock.quantity})`}
              type="number"
              min="1"
              max={removeModal.stock.quantity}
              value={removeModal.removeQty}
              onChange={(e) => setRemoveModal({ ...removeModal, removeQty: e.target.value })}
              placeholder="Enter quantity"
            />
            {(() => {
              const qty = parseInt(removeModal.removeQty)
              const valid = !isNaN(qty) && qty > 0 && qty <= removeModal.stock.quantity
              const remaining = valid ? removeModal.stock.quantity - qty : null
              return remaining !== null ? (
                <p className="text-xs text-muted-foreground">
                  Remaining stock after removal: <span className={`font-semibold ${remaining === 0 ? 'text-red-500' : 'text-foreground'}`}>{remaining}</span>{remaining === 0 ? ' (will delete entry)' : ''}
                </p>
              ) : null
            })()}
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveModal(null)}
                className="flex-1 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-sm transition-colors min-h-11 touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveStock}
                disabled={(() => { const q = parseInt(removeModal.removeQty); return isNaN(q) || q <= 0 || q > removeModal.stock.quantity })()}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-semibold text-sm transition-colors min-h-11 touch-manipulation flex items-center justify-center gap-2"
              >
                <Minus size={16} /> Remove
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

