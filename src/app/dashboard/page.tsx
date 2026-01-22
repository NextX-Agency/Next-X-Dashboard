'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  Package, 
  MapPin, 
  ShoppingCart, 
  Wallet, 
  Receipt, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Target,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  AlertCircle
} from 'lucide-react'
import { StatCard, ChartCard, QuickActionCard, ActivityItem } from '@/components/Cards'
import { formatCurrency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'
import { STOCK_THRESHOLDS } from '@/lib/stockUtils'

type DashboardStats = {
  totalSalesUSD: number
  totalSalesSRD: number
  activeOrders: number
  stockItems: number
  lowStockItems: number
  outOfStockItems: number
  totalRevenue: number
  todaysSalesUSD: number
  todaysSalesSRD: number
  salesTrend: number
  recentActivity: Array<{
    icon: typeof ShoppingCart
    title: string
    time: string
    color: 'orange' | 'blue' | 'green' | 'purple'
  }>
}

export default function Home() {
  const router = useRouter()
  const { displayCurrency, exchangeRate, convertToDisplay } = useCurrency()
  const [stats, setStats] = useState<DashboardStats>({
    totalSalesUSD: 0,
    totalSalesSRD: 0,
    activeOrders: 0,
    stockItems: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    totalRevenue: 0,
    todaysSalesUSD: 0,
    todaysSalesSRD: 0,
    salesTrend: 0,
    recentActivity: []
  })
  const [loading, setLoading] = useState(true)
  const [monthlySales, setMonthlySales] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

  const loadDashboardData = async () => {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const [salesRes, stockRes, reservationsRes, exchangeRes] = await Promise.all([
        supabase.from('sales').select('*'),
        supabase.from('stock').select('*'),
        supabase.from('reservations').select('*').eq('status', 'pending'),
        supabase.from('exchange_rates').select('*').eq('is_active', true).single()
      ])

      const sales = salesRes.data || []
      const stock = stockRes.data || []
      const reservations = reservationsRes.data || []
      const currentRate = exchangeRes.data
      const rate = currentRate?.usd_to_srd || 40

      // Calculate monthly sales for chart (normalized to USD) - current year only
      const currentYear = new Date().getFullYear()
      const monthlyData = Array(12).fill(0)
      sales.forEach(sale => {
        const saleDate = new Date(sale.created_at)
        // Only include sales from the current year
        if (saleDate.getFullYear() === currentYear) {
          const month = saleDate.getMonth()
          const amountInUSD = sale.currency === 'USD' 
            ? Number(sale.total_amount) 
            : Number(sale.total_amount) / rate
          monthlyData[month] += amountInUSD
        }
      })
      setMonthlySales(monthlyData)

      // Calculate total sales by currency
      const totalUSD = sales.filter(s => s.currency === 'USD').reduce((sum, s) => sum + Number(s.total_amount), 0)
      const totalSRD = sales.filter(s => s.currency === 'SRD').reduce((sum, s) => sum + Number(s.total_amount), 0)

      // Today's sales by currency
      const todaySales = sales.filter(s => new Date(s.created_at) >= today)
      const todaysUSD = todaySales.filter(s => s.currency === 'USD').reduce((sum, s) => sum + Number(s.total_amount), 0)
      const todaysSRD = todaySales.filter(s => s.currency === 'SRD').reduce((sum, s) => sum + Number(s.total_amount), 0)
      const todaysTotalInUSD = todaysUSD + (todaysSRD / rate)

      // Yesterday's sales for trend (normalized to USD)
      const yesterdaySales = sales.filter(s => {
        const date = new Date(s.created_at)
        return date >= yesterday && date < today
      })
      const yesterdaysUSD = yesterdaySales.filter(s => s.currency === 'USD').reduce((sum, s) => sum + Number(s.total_amount), 0)
      const yesterdaysSRD = yesterdaySales.filter(s => s.currency === 'SRD').reduce((sum, s) => sum + Number(s.total_amount), 0)
      const yesterdaysTotalInUSD = yesterdaysUSD + (yesterdaysSRD / rate)
      
      // Calculate trend: positive = growth, negative = decline, preserve the sign
      const trend = yesterdaysTotalInUSD > 0 
        ? ((todaysTotalInUSD - yesterdaysTotalInUSD) / yesterdaysTotalInUSD) * 100 
        : (todaysTotalInUSD > 0 ? 100 : 0) // If no sales yesterday but sales today, show 100% growth

      // Stock items with quantity > 0
      const stockItemsCount = stock.filter(s => s.quantity > 0).length
      
      // Count low stock and out of stock items using centralized thresholds
      // First, aggregate stock by item_id
      const stockByItem: Record<string, number> = {}
      stock.forEach(s => {
        stockByItem[s.item_id] = (stockByItem[s.item_id] || 0) + (s.quantity || 0)
      })
      
      const lowStockCount = Object.values(stockByItem).filter(
        qty => qty <= STOCK_THRESHOLDS.LOW_STOCK && qty > STOCK_THRESHOLDS.OUT_OF_STOCK
      ).length
      
      const outOfStockCount = Object.values(stockByItem).filter(
        qty => qty <= STOCK_THRESHOLDS.OUT_OF_STOCK
      ).length

      // Total revenue (all sales converted to USD)
      const srdToUSD = totalSRD / rate
      const totalRevenue = totalUSD + srdToUSD

      // Recent activity - get last 4 sales
      const recentSales = sales.slice(-4).reverse()
      const activity = recentSales.map(sale => ({
        icon: ShoppingCart,
        title: `New sale - ${formatCurrency(Number(sale.total_amount), sale.currency)}`,
        time: getTimeAgo(sale.created_at),
        color: 'orange' as const
      }))

      // Add exchange rate update if available
      if (currentRate) {
        activity.push({
          icon: DollarSign,
          title: `Exchange rate: 1 USD = ${currentRate.usd_to_srd} SRD`,
          time: getTimeAgo(currentRate.set_at),
          color: 'orange' as const
        })
      }

      setStats({
        totalSalesUSD: totalUSD,
        totalSalesSRD: totalSRD,
        activeOrders: reservations.length,
        stockItems: stockItemsCount,
        lowStockItems: lowStockCount,
        outOfStockItems: outOfStockCount,
        totalRevenue,
        todaysSalesUSD: todaysUSD,
        todaysSalesSRD: todaysSRD,
        salesTrend: trend, // Preserve sign for accurate trend display
        recentActivity: activity.slice(0, 4)
      })
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  const quickActions = [
    { name: 'New Sale', icon: ShoppingCart, path: '/sales', color: 'orange' as const },
    { name: 'Add Stock', icon: Package, path: '/stock', color: 'blue' as const },
    { name: 'Exchange Rate', icon: DollarSign, path: '/exchange', color: 'green' as const },
    { name: 'View Reports', icon: BarChart3, path: '/reports', color: 'purple' as const },
  ]

  return (
    <div className="min-h-screen">
      {/* Premium Welcome Section */}
      <div className="relative overflow-hidden">
        {/* Gradient Background - Dark Theme */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600 via-orange-700 to-orange-900" />
        
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-900/30 rounded-full blur-3xl" />
        
        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-4 py-2 rounded-full mb-4 border border-white/25 shadow-sm">
                <Activity size={16} className="text-white" />
                <span className="text-sm font-bold text-white tracking-wide">Live Dashboard</span>
              </div>
              <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
                Welcome back ≡ƒæï
              </h1>
              <p className="text-orange-100/90 text-base lg:text-lg font-medium max-w-2xl leading-relaxed">
                Here&apos;s what&apos;s happening with your business today. All metrics are updated in real-time.
              </p>
            </div>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-white shadow-lg">
                <div className="text-sm font-semibold text-orange-100 mb-1.5">Today&apos;s Sales</div>
                <div className="text-2xl lg:text-3xl font-bold">
                  {formatCurrency(
                    displayCurrency === 'USD' 
                      ? stats.todaysSalesUSD + (stats.todaysSalesSRD / exchangeRate)
                      : stats.todaysSalesSRD + (stats.todaysSalesUSD * exchangeRate),
                    displayCurrency
                  )}
                </div>
                <div className="text-xs text-orange-200 mt-2 flex items-center gap-1">
                  {stats.salesTrend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  <span className="font-medium">{stats.salesTrend > 0 ? '+' : ''}{stats.salesTrend.toFixed(1)}% vs yesterday</span>
                </div>
              </div>
              <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-white shadow-lg">
                <div className="text-sm font-semibold text-orange-100 mb-1.5">Active Orders</div>
                <div className="text-2xl lg:text-3xl font-bold">{stats.activeOrders}</div>
                <div className="text-xs text-orange-200 mt-2">Processing now</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
          <StatCard 
            title={`Total Sales (${displayCurrency})`}
            value={formatCurrency(
              displayCurrency === 'USD' 
                ? stats.totalSalesUSD + (stats.totalSalesSRD / exchangeRate)
                : stats.totalSalesSRD + (stats.totalSalesUSD * exchangeRate),
              displayCurrency
            )}
            icon={DollarSign}
            trend={{ value: `${stats.salesTrend.toFixed(1)}%`, isPositive: stats.salesTrend >= 0 }}
            color="orange"
          />
          <StatCard 
            title="Active Reservations" 
            value={stats.activeOrders.toString()}
            icon={ShoppingCart}
            trend={{ value: "Pending", isPositive: true }}
            color="blue"
          />
          <StatCard 
            title="Stock Items" 
            value={stats.stockItems.toString()}
            icon={Package}
            trend={{ 
              value: stats.lowStockItems > 0 
                ? `${stats.lowStockItems} low stock` 
                : "In Stock", 
              isPositive: stats.lowStockItems === 0 
            }}
            color={stats.lowStockItems > 0 ? "orange" : "green"}
          />
          <StatCard 
            title={`Total Revenue (${displayCurrency})`}
            icon={TrendingUp}
            value={formatCurrency(
              displayCurrency === 'USD'
                ? stats.totalRevenue
                : stats.totalRevenue * exchangeRate,
              displayCurrency
            )}
            trend={{ value: "All time", isPositive: true }}
            color="purple"
          />
        </div>

        {/* Quick Actions - Premium Design */}
        <div className="mb-8 lg:mb-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">Quick Actions</h2>
              <p className="text-sm text-muted-foreground mt-1">Common tasks and shortcuts</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {quickActions.map((action) => (
              <QuickActionCard
                key={action.name}
                title={action.name}
                icon={action.icon}
                onClick={() => router.push(action.path)}
                color={action.color}
              />
            ))}
          </div>
        </div>

        {/* Desktop Layout: Charts & Activity Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Chart Section */}
          <div className="lg:col-span-2 space-y-6">
            <ChartCard 
              title={`Monthly Sales ${new Date().getFullYear()} (${displayCurrency})`}
              subtitle="Sales trends throughout the year"
              action={
                <button 
                  onClick={() => router.push('/reports')}
                  className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium"
                >
                  View All <ArrowUpRight size={16} />
                </button>
              }
            >
              {(() => {
                const displayAmounts = monthlySales.map(a => displayCurrency === 'USD' ? a : a * exchangeRate)
                const maxSale = Math.max(...displayAmounts, 1)
                const totalYearSales = displayAmounts.reduce((sum, a) => sum + a, 0)
                const currentMonth = new Date().getMonth()
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                
                return (
                  <div className="space-y-4">
                    {/* Year Total Summary */}
                    <div className="flex items-center justify-between px-1 pb-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-sm text-muted-foreground">Year Total</span>
                      </div>
                      <span className="text-lg font-bold text-foreground">{formatCurrency(totalYearSales, displayCurrency)}</span>
                    </div>
                    
                    {/* Chart Area */}
                    <div className="relative h-48 lg:h-56">
                      {/* Y-axis grid lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                        {[0, 1, 2, 3].map((_, i) => (
                          <div key={i} className="flex items-center gap-2 w-full">
                            <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">
                              {formatCurrency(maxSale * (1 - i/3), displayCurrency).replace(/\.\d+/, '')}
                            </span>
                            <div className="flex-1 border-b border-dashed border-border/40" />
                          </div>
                        ))}
                      </div>
                      
                      {/* Bars Container */}
                      <div className="absolute inset-0 pl-14 flex items-end gap-1 pb-6">
                        {displayAmounts.map((displayAmount, i) => {
                          const heightPercent = maxSale > 0 ? (displayAmount / maxSale) * 100 : 0
                          const isCurrentMonth = i === currentMonth
                          const hasSales = displayAmount > 0
                          
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center group relative h-full">
                              {/* Bar */}
                              <div className="relative w-full h-full flex items-end justify-center">
                                <div 
                                  className={`w-full max-w-[32px] rounded-t-md transition-all duration-300 cursor-pointer relative overflow-hidden ${
                                    hasSales 
                                      ? isCurrentMonth
                                        ? 'bg-gradient-to-t from-primary to-primary/80 shadow-lg shadow-primary/20'
                                        : 'bg-gradient-to-t from-primary/70 to-primary/50 hover:from-primary hover:to-primary/80'
                                      : 'bg-muted/30'
                                  }`}
                                  style={{ 
                                    height: hasSales ? `${Math.max(heightPercent, 4)}%` : '2px',
                                  }}
                                >
                                  {/* Shine effect on current month */}
                                  {isCurrentMonth && hasSales && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                                  )}
                                </div>
                                
                                {/* Tooltip */}
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-card border border-border shadow-xl rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 pointer-events-none">
                                  <div className="text-[10px] text-muted-foreground text-center">{months[i]}</div>
                                  <div className="text-xs font-bold text-foreground whitespace-nowrap">
                                    {formatCurrency(displayAmount, displayCurrency)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      {/* X-axis labels */}
                      <div className="absolute bottom-0 left-14 right-0 flex justify-between">
                        {months.map((month, i) => (
                          <div key={month} className="flex-1 text-center">
                            <span className={`text-[10px] font-medium ${
                              i === currentMonth 
                                ? 'text-primary' 
                                : 'text-muted-foreground'
                            }`}>
                              {month.substring(0, 1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Legend */}
                    <div className="flex items-center justify-center gap-4 pt-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-primary to-primary/80 shadow-sm" />
                        <span className="text-xs text-muted-foreground">Current Month</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-primary/70 to-primary/50" />
                        <span className="text-xs text-muted-foreground">Other Months</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </ChartCard>

            {/* Quick Stats - Desktop Only */}
            <div className="hidden lg:block">
              <ChartCard title="Quick Stats" subtitle="Overview of key metrics">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-primary/10 rounded-xl border border-primary/20 hover:border-primary/40 transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
                        <DollarSign className="text-white" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground font-medium">Total Sales ({displayCurrency})</p>
                        <p className="text-xl font-bold text-foreground">
                          {formatCurrency(
                            displayCurrency === 'USD' 
                              ? stats.totalSalesUSD + (stats.totalSalesSRD / exchangeRate)
                              : stats.totalSalesSRD + (stats.totalSalesUSD * exchangeRate),
                            displayCurrency
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                    stats.lowStockItems > 0 
                      ? 'bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40' 
                      : 'bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg ${
                        stats.lowStockItems > 0 
                          ? 'bg-amber-500 shadow-amber-500/25' 
                          : 'bg-blue-500 shadow-blue-500/25'
                      }`}>
                        {stats.lowStockItems > 0 
                          ? <AlertCircle className="text-white" size={20} />
                          : <Package className="text-white" size={20} />
                        }
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground font-medium">Stock Items</p>
                        <p className="text-xl font-bold text-foreground">{stats.stockItems}</p>
                        {stats.lowStockItems > 0 && (
                          <p className="text-xs text-amber-600 font-medium">{stats.lowStockItems} low stock</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-xl border border-green-500/20 hover:border-green-500/40 transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/25">
                        <ShoppingCart className="text-white" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground font-medium">Pending Reservations</p>
                        <p className="text-xl font-bold text-foreground">{stats.activeOrders}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </ChartCard>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-1">
            <ChartCard title="Recent Activity" subtitle="Latest updates">
              <div className="space-y-2">
                {loading ? (
                  <div className="text-center py-10 text-muted-foreground">Loading...</div>
                ) : stats.recentActivity.length === 0 ? (
                  <div className="text-center py-10">
                    <Activity size={32} className="mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">No recent activity</p>
                  </div>
                ) : (
                  stats.recentActivity.map((activity, i) => (
                    <ActivityItem key={i} {...activity} />
                  ))
                )}
              </div>
            </ChartCard>
          </div>
        </div>

        {/* Mobile: All Modules Grid */}
        <div className="lg:hidden mt-8">
          <h2 className="text-lg font-bold text-foreground mb-4">All Modules</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'Items', icon: Package, path: '/items' },
              { name: 'Locations', icon: MapPin, path: '/locations' },
              { name: 'Wallets', icon: Wallet, path: '/wallets' },
              { name: 'Expenses', icon: Receipt, path: '/expenses' },
              { name: 'Commissions', icon: Users, path: '/commissions' },
              { name: 'Budgets', icon: Target, path: '/budgets' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.path)}
                  className="bg-card p-4 rounded-xl shadow-sm border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 active:scale-95 flex flex-col items-center gap-2.5 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon size={22} className="text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{item.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

