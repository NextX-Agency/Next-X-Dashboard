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
  Activity
} from 'lucide-react'
import { StatCard, ChartCard, QuickActionCard, ActivityItem } from '@/components/Cards'
import { formatCurrency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'

type DashboardStats = {
  totalSalesUSD: number
  totalSalesSRD: number
  activeOrders: number
  stockItems: number
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

      // Calculate monthly sales for chart (normalized to USD)
      const monthlyData = Array(12).fill(0)
      sales.forEach(sale => {
        const month = new Date(sale.created_at).getMonth()
        const amountInUSD = sale.currency === 'USD' 
          ? Number(sale.total_amount) 
          : Number(sale.total_amount) / rate
        monthlyData[month] += amountInUSD
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
      
      const trend = yesterdaysTotalInUSD > 0 ? ((todaysTotalInUSD - yesterdaysTotalInUSD) / yesterdaysTotalInUSD) * 100 : 0

      // Stock items with quantity > 0
      const stockItemsCount = stock.filter(s => s.quantity > 0).length

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
        totalRevenue,
        todaysSalesUSD: todaysUSD,
        todaysSalesSRD: todaysSRD,
        salesTrend: Math.abs(trend),
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
                  <ArrowUpRight size={12} />
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
            trend={{ value: "In Stock", isPositive: true }}
            color="green"
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
              title={`Monthly Sales (${displayCurrency})`}
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
              <div className="h-64 lg:h-80 flex items-end justify-between gap-2 lg:gap-4 px-2">
                {monthlySales.map((amount, i) => {
                  const displayAmount = displayCurrency === 'USD' ? amount : amount * exchangeRate
                  const displayAmounts = monthlySales.map(a => displayCurrency === 'USD' ? a : a * exchangeRate)
                  // Only use actual data for scaling - no arbitrary minimum
                  const maxSale = Math.max(...displayAmounts)
                  // Calculate height based on actual data proportion, with minimum visibility for non-zero values
                  const heightPercent = maxSale > 0 ? (displayAmount / maxSale) * 100 : 0
                  const height = displayAmount > 0 ? Math.max(heightPercent, 5) : 2
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="relative w-full h-full flex items-end">
                        <div 
                          className={`w-full rounded-t-lg transition-all cursor-pointer ${
                            displayAmount > 0 
                              ? 'bg-gradient-to-t from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500' 
                              : 'bg-muted/50'
                          }`}
                          style={{ height: `${height}%`, minHeight: displayAmount > 0 ? '12px' : '4px' }}
                          title={`${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}: ${formatCurrency(displayAmount, displayCurrency)}`}
                        ></div>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card text-foreground text-xs font-bold px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap shadow-lg border border-border z-10">
                          {formatCurrency(displayAmount, displayCurrency)}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground hidden lg:block font-medium">{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}</span>
                    </div>
                  )
                })}
              </div>
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
                  <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 hover:border-blue-500/40 transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Package className="text-white" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground font-medium">Stock Items</p>
                        <p className="text-xl font-bold text-foreground">{stats.stockItems}</p>
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

