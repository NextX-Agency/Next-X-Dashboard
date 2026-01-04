'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { BarChart3, TrendingUp, Package, DollarSign, MapPin, Award } from 'lucide-react'
import { PageHeader, Badge } from '@/components/UI'
import { ChartCard } from '@/components/Cards'
import { formatCurrency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'

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
  const { displayCurrency, exchangeRate } = useCurrency()
  const [sales, setSales] = useState<SaleWithItems[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily')
  const [selectedLocation, setSelectedLocation] = useState<string>('')

  const loadData = async () => {
    const now = new Date()
    const startDate = new Date()

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

    if (salesRes.data) setSales(salesRes.data as SaleWithItems[])
    if (itemsRes.data) setItems(itemsRes.data)
    if (stocksRes.data) setStocks(stocksRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  // Get total sales converted to display currency
  const getTotalSalesInDisplayCurrency = () => {
    const filteredSales = sales.filter(s => !selectedLocation || s.location_id === selectedLocation)
    
    const totalUSD = filteredSales.filter(s => s.currency === 'USD').reduce((sum, s) => sum + s.total_amount, 0)
    const totalSRD = filteredSales.filter(s => s.currency === 'SRD').reduce((sum, s) => sum + s.total_amount, 0)
    
    if (displayCurrency === 'USD') {
      return totalUSD + (totalSRD / exchangeRate)
    }
    return totalSRD + (totalUSD * exchangeRate)
  }

  // Calculate profit in USD (base currency for cost)
  const getTotalProfitUSD = () => {
    let profitUSD = 0
    
    sales
      .filter(s => !selectedLocation || s.location_id === selectedLocation)
      .forEach(sale => {
        sale.sale_items?.forEach(saleItem => {
          const item = items.find(i => i.id === saleItem.item_id)
          if (item && item.purchase_price_usd) {
            const purchasePrice = typeof item.purchase_price_usd === 'string'
              ? parseFloat(item.purchase_price_usd)
              : item.purchase_price_usd
            const costInUSD = purchasePrice * saleItem.quantity
            let revenueInUSD = saleItem.subtotal
            
            // Convert SRD revenue to USD using actual exchange rate
            if (sale.currency === 'SRD') {
              revenueInUSD = saleItem.subtotal / exchangeRate
            }
            
            profitUSD += revenueInUSD - costInUSD
          }
        })
      })
    return profitUSD
  }

  // Get profit in display currency
  const getTotalProfit = () => {
    const profitUSD = getTotalProfitUSD()
    if (displayCurrency === 'USD') {
      return profitUSD
    }
    return profitUSD * exchangeRate
  }

  const getTopSellingItems = () => {
    const itemSales = new Map<string, { name: string; quantity: number; revenueUSD: number }>()
    
    sales
      .filter(s => !selectedLocation || s.location_id === selectedLocation)
      .forEach(sale => {
        sale.sale_items?.forEach(saleItem => {
          const item = items.find(i => i.id === saleItem.item_id)
          if (item) {
            // Convert revenue to USD for consistent comparison
            const revenueUSD = sale.currency === 'USD' 
              ? saleItem.subtotal 
              : saleItem.subtotal / exchangeRate
            
            const existing = itemSales.get(saleItem.item_id)
            if (existing) {
              existing.quantity += saleItem.quantity
              existing.revenueUSD += revenueUSD
            } else {
              itemSales.set(saleItem.item_id, {
                name: item.name,
                quantity: saleItem.quantity,
                revenueUSD: revenueUSD
              })
            }
          }
        })
      })

    return Array.from(itemSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map(item => ({
        ...item,
        revenue: displayCurrency === 'USD' ? item.revenueUSD : item.revenueUSD * exchangeRate
      }))
  }

  // Get stock value in USD (base), then convert to display currency
  const getStockValueUSD = (locationId?: string) => {
    return stocks
      .filter(s => !locationId || s.location_id === locationId)
      .reduce((sum, stock) => {
        const item = items.find(i => i.id === stock.item_id)
        if (item && item.purchase_price_usd) {
          const purchasePrice = typeof item.purchase_price_usd === 'string' 
            ? parseFloat(item.purchase_price_usd) 
            : item.purchase_price_usd
          return sum + (purchasePrice * stock.quantity)
        }
        return sum
      }, 0)
  }

  const getStockValue = (locationId?: string) => {
    const valueUSD = getStockValueUSD(locationId)
    if (displayCurrency === 'USD') {
      return valueUSD
    }
    return valueUSD * exchangeRate
  }

  const getProfitByLocation = () => {
    return locations.map(location => {
      const locationSales = sales.filter(s => s.location_id === location.id)
      let profitUSD = 0
      
      locationSales.forEach(sale => {
        sale.sale_items?.forEach(saleItem => {
          const item = items.find(i => i.id === saleItem.item_id)
          if (item && item.purchase_price_usd) {
            const purchasePrice = typeof item.purchase_price_usd === 'string'
              ? parseFloat(item.purchase_price_usd)
              : item.purchase_price_usd
            const costInUSD = purchasePrice * saleItem.quantity
            let revenueInUSD = saleItem.subtotal
            
            // Convert SRD revenue to USD using actual exchange rate
            if (sale.currency === 'SRD') {
              revenueInUSD = saleItem.subtotal / exchangeRate
            }
            
            profitUSD += revenueInUSD - costInUSD
          }
        })
      })

      const stockValueUSD = getStockValueUSD(location.id)

      return {
        name: location.name,
        profit: displayCurrency === 'USD' ? profitUSD : profitUSD * exchangeRate,
        sales: locationSales.length,
        stockValue: displayCurrency === 'USD' ? stockValueUSD : stockValueUSD * exchangeRate
      }
    })
  }

  const topItems = getTopSellingItems()
  const locationStats = getProfitByLocation()

  return (
    <div className="min-h-screen bg-[var(--background)] pb-20">
      <PageHeader 
        title="Reports & Insights" 
        subtitle="Analytics and performance metrics"
        icon={<BarChart3 className="w-6 h-6" />}
      />

      <div className="px-4 lg:px-6 pt-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex gap-1 overflow-x-auto p-1.5 bg-card rounded-2xl shadow-sm border border-border">
            {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as 'daily' | 'weekly' | 'monthly' | 'yearly')}
                className={`px-5 py-2.5 rounded-xl font-semibold whitespace-nowrap text-sm transition-all duration-200 ${
                  period === p
                    ? 'bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg shadow-orange-500/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="flex-1 px-4 py-3 border border-border rounded-xl text-body bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm cursor-pointer"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-caption text-muted-foreground">Total Sales ({displayCurrency})</span>
              </div>
              <div className="text-3xl font-bold tracking-tight">
                {formatCurrency(getTotalSalesInDisplayCurrency(), displayCurrency)}
              </div>
            </div>
          </div>

          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-transparent blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-caption text-muted-foreground">Est. Profit ({displayCurrency})</span>
              </div>
              <div className="text-3xl font-bold tracking-tight">
                {formatCurrency(getTotalProfit(), displayCurrency)}
              </div>
            </div>
          </div>

          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-600/10 border border-orange-500/20 flex items-center justify-center">
                  <Package className="w-5 h-5 text-orange-600" />
                </div>
                <span className="text-caption text-muted-foreground">Total Sales</span>
              </div>
              <div className="text-3xl font-bold tracking-tight">
                {sales.filter(s => !selectedLocation || s.location_id === selectedLocation).length}
              </div>
            </div>
          </div>
        </div>

        {/* Top Selling Items */}
        <ChartCard title="Top Selling Items" icon={<Award size={20} />}>
          <div className="space-y-3">
            {topItems.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-4 bg-gradient-to-r from-muted/30 to-transparent rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 font-bold text-sm text-primary">
                    #{index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground group-hover:text-primary transition-colors truncate">{item.name}</div>
                    <div className="text-sm text-muted-foreground">Sold: <span className="font-medium text-foreground">{item.quantity}</span> units</div>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-xl font-bold text-[hsl(var(--success))]">
                    {formatCurrency(item.revenue, displayCurrency)}
                  </div>
                  <div className="text-xs text-muted-foreground">revenue</div>
                </div>
              </div>
            ))}
            {topItems.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No sales data for this period</p>
              </div>
            )}
          </div>
        </ChartCard>

        {/* Location Performance */}
        <ChartCard title="Location Performance" icon={<MapPin size={20} />}>
          <div className="space-y-4">
            {locationStats.map((stat, index) => (
              <div key={index} className="bg-muted/30 rounded-xl p-5 border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-foreground group-hover:text-primary transition-colors">{stat.name}</h4>
                  <Badge variant="orange">{stat.sales} sales</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[hsl(var(--success-muted))] rounded-xl p-3.5 border border-[hsl(var(--success))]/20">
                    <div className="text-xs text-muted-foreground mb-1 font-medium">Profit ({displayCurrency})</div>
                    <div className="text-2xl font-bold text-[hsl(var(--success))]">
                      {formatCurrency(stat.profit, displayCurrency)}
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-3.5 border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 font-medium">Stock Value ({displayCurrency})</div>
                    <div className="text-2xl font-bold text-foreground">
                      {formatCurrency(stat.stockValue, displayCurrency)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Total Stock Value */}
        <div className="card-premium text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-orange-500/5"></div>
          <div className="relative">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 mb-4">
              <Package className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-headline font-semibold tracking-tight mb-2">Total Stock Value ({displayCurrency})</h3>
            <div className="text-5xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-orange-600 bg-clip-text text-transparent mb-2">
              {formatCurrency(getStockValue(), displayCurrency)}
            </div>
            <div className="text-caption text-muted-foreground">
              Across all locations
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}