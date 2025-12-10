'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { ShoppingCart, Plus, Minus, Check, Trash2, MapPin } from 'lucide-react'
import { PageHeader, PageContainer, Button, Badge, LoadingSpinner } from '@/components/UI'

type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type ExchangeRate = Database['public']['Tables']['exchange_rates']['Row']
type Stock = Database['public']['Tables']['stock']['Row']

interface CartItem {
  item: Item
  quantity: number
  availableStock: number
}

export default function SalesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [currency, setCurrency] = useState<'SRD' | 'USD'>('SRD')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash')
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null)
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [reservationsMap, setReservationsMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedLocation) {
      loadStock(selectedLocation)
      loadReservations(selectedLocation)
    }
  }, [selectedLocation])

  const loadData = async () => {
    const [itemsRes, locationsRes, ratesRes] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('exchange_rates').select('*').eq('is_active', true).single()
    ])
    
    if (itemsRes.data) setItems(itemsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
    if (ratesRes.data) setCurrentRate(ratesRes.data)
  }

  const loadStock = async (locationId: string) => {
    const { data } = await supabase
      .from('stock')
      .select('*')
      .eq('location_id', locationId)
    
    if (data) {
      const map = new Map<string, number>()
      data.forEach((stock: Stock) => {
        map.set(stock.item_id, stock.quantity)
      })
      setStockMap(map)
    }
  }

  const loadReservations = async (locationId: string) => {
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('location_id', locationId)
      .eq('status', 'pending')
    
    if (data) {
      const map = new Map<string, number>()
      data.forEach((reservation: any) => {
        const current = map.get(reservation.item_id) || 0
        map.set(reservation.item_id, current + reservation.quantity)
      })
      setReservationsMap(map)
    }
  }

  const getAvailableStock = (itemId: string) => {
    const totalStock = stockMap.get(itemId) || 0
    const reserved = reservationsMap.get(itemId) || 0
    return totalStock - reserved
  }

  const addToCart = (item: Item) => {
    const availableStock = getAvailableStock(item.id)
    if (availableStock <= 0) {
      alert('No stock available')
      return
    }

    const existing = cart.find(c => c.item.id === item.id)
    if (existing) {
      if (existing.quantity >= availableStock) {
        alert('Cannot exceed available stock')
        return
      }
      setCart(cart.map(c => 
        c.item.id === item.id 
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ))
    } else {
      setCart([...cart, { item, quantity: 1, availableStock }])
    }
  }

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.item.id === itemId) {
        const newQty = c.quantity + delta
        if (newQty <= 0) return c
        if (newQty > c.availableStock) {
          alert('Cannot exceed available stock')
          return c
        }
        return { ...c, quantity: newQty }
      }
      return c
    }).filter(c => c.quantity > 0))
  }

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter(c => c.item.id !== itemId))
  }

  const calculateTotal = () => {
    return cart.reduce((sum, cartItem) => {
      const price = currency === 'SRD' 
        ? (cartItem.item.selling_price_srd || 0)
        : (cartItem.item.selling_price_usd || 0)
      return sum + (price * cartItem.quantity)
    }, 0)
  }

  const handleCompleteSale = async () => {
    if (!selectedLocation) {
      alert('Select a location')
      return
    }

    if (cart.length === 0) {
      alert('Cart is empty')
      return
    }

    const total = calculateTotal()
    
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        location_id: selectedLocation,
        currency,
        exchange_rate: currentRate?.usd_to_srd || null,
        total_amount: total,
        payment_method: paymentMethod
      })
      .select()
      .single()

    if (saleError || !sale) {
      alert('Error creating sale')
      return
    }

    for (const cartItem of cart) {
      const price = currency === 'SRD'
        ? (cartItem.item.selling_price_srd || 0)
        : (cartItem.item.selling_price_usd || 0)
      
      await supabase.from('sale_items').insert({
        sale_id: sale.id,
        item_id: cartItem.item.id,
        quantity: cartItem.quantity,
        unit_price: price,
        subtotal: price * cartItem.quantity
      })

      const { data: stock } = await supabase
        .from('stock')
        .select('*')
        .eq('item_id', cartItem.item.id)
        .eq('location_id', selectedLocation)
        .single()

      if (stock) {
        await supabase
          .from('stock')
          .update({ quantity: stock.quantity - cartItem.quantity })
          .eq('id', stock.id)
      }
    }

    alert('Sale completed!')
    setCart([])
    loadStock(selectedLocation)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Sales</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="w-full p-3 border rounded-lg text-lg"
        >
          <option value="">Select Location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {selectedLocation && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrency('SRD')}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  currency === 'SRD'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200'
                }`}
              >
                SRD
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  currency === 'USD'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200'
                }`}
              >
                USD
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  paymentMethod === 'cash'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200'
                }`}
              >
                Cash
              </button>
              <button
                onClick={() => setPaymentMethod('bank')}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  paymentMethod === 'bank'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200'
                }`}
              >
                Bank
              </button>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="font-semibold mb-3">Available Items</h3>
              <div className="space-y-2">
                {items.map((item) => {
                  const stock = getAvailableStock(item.id)
                  const price = currency === 'SRD' 
                    ? item.selling_price_srd 
                    : item.selling_price_usd
                  
                  if (stock <= 0 || !price) return null

                  return (
                    <div
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="p-3 border rounded-lg active:bg-gray-50 transition"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-sm text-gray-600">
                            Stock: {stock} | {currency} {price}
                          </div>
                        </div>
                        <Plus size={20} className="text-blue-500" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {cart.length > 0 && (
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <ShoppingCart size={20} />
                  Cart ({cart.length})
                </h3>
                <div className="space-y-2 mb-4">
                  {cart.map((cartItem) => {
                    const price = currency === 'SRD'
                      ? (cartItem.item.selling_price_srd || 0)
                      : (cartItem.item.selling_price_usd || 0)
                    
                    return (
                      <div key={cartItem.item.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-semibold">{cartItem.item.name}</div>
                            <div className="text-sm text-gray-600">
                              {currency} {price} × {cartItem.quantity}
                            </div>
                          </div>
                          <div className="font-bold">
                            {currency} {(price * cartItem.quantity).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateQuantity(cartItem.item.id, -1)}
                            className="bg-gray-200 px-3 py-1 rounded active:scale-95 transition"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="px-3 py-1 font-semibold">{cartItem.quantity}</span>
                          <button
                            onClick={() => updateQuantity(cartItem.item.id, 1)}
                            className="bg-gray-200 px-3 py-1 rounded active:scale-95 transition"
                          >
                            <Plus size={16} />
                          </button>
                          <button
                            onClick={() => removeFromCart(cartItem.item.id)}
                            className="ml-auto bg-red-500 text-white px-3 py-1 rounded active:scale-95 transition"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xl font-bold">Total:</span>
                    <span className="text-2xl font-bold text-green-600">
                      {currency} {calculateTotal().toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={handleCompleteSale}
                    className="w-full bg-green-500 text-white py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition"
                  >
                    <Check size={24} />
                    Complete Sale
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
