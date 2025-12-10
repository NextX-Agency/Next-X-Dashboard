'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Package, Plus, ArrowRightLeft } from 'lucide-react'

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

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedLocation) {
      loadStockByLocation(selectedLocation)
    } else {
      loadAllStock()
    }
  }, [selectedLocation])

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
    const { data } = await supabase
      .from('stock')
      .select('*, items(*), locations(*)')
      .order('quantity', { ascending: false })
    if (data) setStocks(data as any)
  }

  const loadStockByLocation = async (locationId: string) => {
    const { data } = await supabase
      .from('stock')
      .select('*, items(*), locations(*)')
      .eq('location_id', locationId)
      .order('quantity', { ascending: false })
    if (data) setStocks(data as any)
  }

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
    loadAllStock()
  }

  const handleTransferStock = async (e: React.FormEvent) => {
    e.preventDefault()
    const { item_id, from_location_id, to_location_id, quantity } = transferForm
    const qty = parseInt(quantity)

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
    loadAllStock()
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
    loadAllStock()
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Stock Management</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex-1 bg-green-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Add Stock
          </button>
          <button
            onClick={() => setShowTransferForm(true)}
            className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <ArrowRightLeft size={20} />
            Transfer
          </button>
        </div>

        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="w-full p-3 border rounded-lg text-lg"
        >
          <option value="">All Locations</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {showAddForm && (
          <form onSubmit={handleAddStock} className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-3">Add Stock</h3>
            <select
              value={addForm.item_id}
              onChange={(e) => setAddForm({ ...addForm, item_id: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
            >
              <option value="">Select Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={addForm.location_id}
              onChange={(e) => setAddForm({ ...addForm, location_id: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
            >
              <option value="">Select Location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={addForm.quantity}
              onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
              placeholder="Quantity"
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
              min="1"
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-green-500 text-white py-3 rounded-lg font-medium">
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showTransferForm && (
          <form onSubmit={handleTransferStock} className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-3">Transfer Stock</h3>
            <select
              value={transferForm.item_id}
              onChange={(e) => setTransferForm({ ...transferForm, item_id: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
            >
              <option value="">Select Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={transferForm.from_location_id}
              onChange={(e) => setTransferForm({ ...transferForm, from_location_id: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
            >
              <option value="">From Location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <select
              value={transferForm.to_location_id}
              onChange={(e) => setTransferForm({ ...transferForm, to_location_id: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
            >
              <option value="">To Location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={transferForm.quantity}
              onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
              placeholder="Quantity"
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
              min="1"
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                Transfer
              </button>
              <button
                type="button"
                onClick={() => setShowTransferForm(false)}
                className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {stocks.map((stock) => (
            <div key={stock.id} className="bg-white p-4 rounded-lg shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{stock.item?.name}</h3>
                  <p className="text-sm text-gray-600">{stock.location?.name}</p>
                  <p className="text-lg font-bold text-green-600 mt-1">Qty: {stock.quantity}</p>
                </div>
                <button
                  onClick={() => handleRemoveStock(stock.id, stock.quantity)}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg active:scale-95 transition"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {stocks.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Package size={48} className="mx-auto mb-2 opacity-50" />
            <p>No stock items</p>
          </div>
        )}
      </div>
    </div>
  )
}
