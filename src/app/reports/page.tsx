'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { BarChart3, TrendingUp, Package, DollarSign } from 'lucide-react'

type Sale = Database['public']['Tables']['sales']['Row']
type Item = Database['public']['Tables']['items']['Row']
type Stock = Database['public']['Tables']['stock']['Row']
type Location = Database['public']['Tables']['locations']['Row']

interface SaleWithItems extends Sale {
  sale_items?: Array<{
    item_id: string
    quantity: number
    unit_price: number
    subtotal: number
  }>
}

export default function ReportsPage() {
  const [sales, setSales] = useState<SaleWithItems[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily')
  const [selectedLocation, setSelectedLocation] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    const now = new Date()
    let startDate = new Date()

    switch (period) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0)
        break
      case 'weekly':
        startDate.setDate(now.getDate() - 7)
        break
      case 'monthly':
        startDate.setMonth(now.getMonth() - 1)
        break
      case 'yearly':
        startDate.setFullYear(now.getFullYear() - 1)
        break
    }

    const [salesRes, itemsRes, stocksRes, locationsRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*, sale_items(*)')
        .gte('created_at', startDate.toISOString()),
      supabase.from('items').select('*'),
      supabase.from('stock').select('*'),
      supabase.from('locations').select('*')
    ])

    if (salesRes.data) setSales(salesRes.data as any)
    if (itemsRes.data) setItems(itemsRes.data)
    if (stocksRes.data) setStocks(stocksRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
  }

  const getTotalSales = (currency: 'SRD' | 'USD') => {
    return sales
      .filter(s => !selectedLocation || s.location_id === selectedLocation)
      .filter(s => s.currency === currency)
      .reduce((sum, s) => sum + s.total_amount, 0)
  }

  const getTotalProfit = () => {
    let profit = 0
    sales
      .filter(s => !selectedLocation || s.location_id === selectedLocation)
      .forEach(sale => {
        sale.sale_items?.forEach(saleItem => {
          const item = items.find(i => i.id === saleItem.item_id)
          if (item) {
            const cost = item.purchase_price_usd * saleItem.quantity
            const revenue = saleItem.subtotal
            profit += revenue - cost
          }
        })
      })
    return profit
  }

  const getTopSellingItems = () => {
    const itemSales = new Map<string, { name: string; quantity: number; revenue: number }>()
    
    sales
      .filter(s => !selectedLocation || s.location_id === selectedLocation)
      .forEach(sale => {
        sale.sale_items?.forEach(saleItem => {
          const item = items.find(i => i.id === saleItem.item_id)
          if (item) {
            const existing = itemSales.get(saleItem.item_id)
            if (existing) {
              existing.quantity += saleItem.quantity
              existing.revenue += saleItem.subtotal
            } else {
              itemSales.set(saleItem.item_id, {
                name: item.name,
                quantity: saleItem.quantity,
                revenue: saleItem.subtotal
              })
            }
          }
        })
      })

    return Array.from(itemSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
  }

  const getStockValue = (locationId?: string) => {
    return stocks
      .filter(s => !locationId || s.location_id === locationId)
      .reduce((sum, stock) => {
        const item = items.find(i => i.id === stock.item_id)
        if (item) {
          return sum + (item.purchase_price_usd * stock.quantity)
        }
        return sum
      }, 0)
  }

  const getProfitByLocation = () => {
    return locations.map(location => {
      const locationSales = sales.filter(s => s.location_id === location.id)
      let profit = 0
      
      locationSales.forEach(sale => {
        sale.sale_items?.forEach(saleItem => {
          const item = items.find(i => i.id === saleItem.item_id)
          if (item) {
            const cost = item.purchase_price_usd * saleItem.quantity
            profit += saleItem.subtotal - cost
          }
        })
      })

      return {
        name: location.name,
        profit,
        sales: locationSales.length,
        stockValue: getStockValue(location.id)
      }
    })
  }

  const topItems = getTopSellingItems()
  const locationStats = getProfitByLocation()

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Reports & Insights</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto">
          {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p as any)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
                period === p
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="w-full p-3 border rounded-lg text-lg bg-white"
        >
          <option value="">All Locations</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={18} />
              <span className="text-sm opacity-90">Sales (SRD)</span>
            </div>
            <div className="text-2xl font-bold">
              {getTotalSales('SRD').toFixed(2)}
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={18} />
              <span className="text-sm opacity-90">Sales (USD)</span>
            </div>
            <div className="text-2xl font-bold">
              ${getTotalSales('USD').toFixed(2)}
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={18} />
              <span className="text-sm opacity-90">Est. Profit</span>
            </div>
            <div className="text-2xl font-bold">
              ${getTotalProfit().toFixed(2)}
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-1">
              <Package size={18} />
              <span className="text-sm opacity-90">Total Sales</span>
            </div>
            <div className="text-2xl font-bold">
              {sales.filter(s => !selectedLocation || s.location_id === selectedLocation).length}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 size={20} />
            Top Selling Items
          </h3>
          <div className="space-y-2">
            {topItems.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-gray-600">Sold: {item.quantity}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600">
                    ${item.revenue.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
            {topItems.length === 0 && (
              <p className="text-center text-gray-500 py-4">No sales data</p>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3">Location Performance</h3>
          <div className="space-y-2">
            {locationStats.map((stat, index) => (
              <div key={index} className="p-3 border rounded-lg">
                <div className="font-semibold mb-2">{stat.name}</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-gray-600">Sales</div>
                    <div className="font-semibold">{stat.sales}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Profit</div>
                    <div className="font-semibold text-green-600">
                      ${stat.profit.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Stock Value</div>
                    <div className="font-semibold">
                      ${stat.stockValue.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3">Total Stock Value</h3>
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600">
              ${getStockValue().toFixed(2)}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Across all locations
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
