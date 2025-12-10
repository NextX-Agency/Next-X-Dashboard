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
  Calendar, 
  TrendingUp, 
  Target,
  BarChart3,
  ArrowUpRight,
  Activity
} from 'lucide-react'
import { StatCard, ChartCard, QuickActionCard, ActivityItem } from '@/components/Cards'

type DashboardStats = {
  totalSalesUSD: number
  totalSalesSRD: number
  activeOrders: number
  stockItems: number
  totalRevenue: number
  todaysSales: number
  salesTrend: number
  recentActivity: Array<{
    icon: any
    title: string
    time: string
    color: 'orange' | 'blue' | 'green' | 'purple'
  }>
}

export default function Home() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats>({
    totalSalesUSD: 0,
    totalSalesSRD: 0,
    activeOrders: 0,
    stockItems: 0,
    totalRevenue: 0,
    todaysSales: 0,
    salesTrend: 0,
    recentActivity: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

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

      // Calculate monthly sales for chart
      const monthlyData = Array(12).fill(0)
      sales.forEach(sale => {
        const month = new Date(sale.created_at).getMonth()
        monthlyData[month] += Number(sale.total_amount)
      })
      setMonthlySales(monthlyData)

      // Calculate total sales
      const totalUSD = sales.filter(s => s.currency === 'USD').reduce((sum, s) => sum + Number(s.total_amount), 0)
      const totalSRD = sales.filter(s => s.currency === 'SRD').reduce((sum, s) => sum + Number(s.total_amount), 0)

      // Today's sales
      const todaySales = sales.filter(s => new Date(s.created_at) >= today)
      const todaysTotal = todaySales.reduce((sum, s) => sum + Number(s.total_amount), 0)

      // Yesterday's sales for trend
      const yesterdaySales = sales.filter(s => {
        const date = new Date(s.created_at)
        return date >= yesterday && date < today
      })
      const yesterdaysTotal = yesterdaySales.reduce((sum, s) => sum + Number(s.total_amount), 0)
      const trend = yesterdaysTotal > 0 ? ((todaysTotal - yesterdaysTotal) / yesterdaysTotal) * 100 : 0

      // Stock items with quantity > 0
      const stockItemsCount = stock.filter(s => s.quantity > 0).length

      // Total revenue (convert SRD to USD)
      const srdToUSD = currentRate ? totalSRD / Number(currentRate.usd_to_srd) : totalSRD / 40
      const totalRevenue = totalUSD + srdToUSD

      // Recent activity - get last 4 sales
      const recentSales = sales.slice(-4).reverse()
      const activity = recentSales.map(sale => ({
        icon: ShoppingCart,
        title: `New sale - ${sale.currency} ${Number(sale.total_amount).toFixed(2)}`,
        time: getTimeAgo(sale.created_at),
        color: 'orange' as const
      }))

      // Add exchange rate update if available
      if (currentRate) {
        activity.push({
          icon: DollarSign,
          title: `Exchange rate: 1 USD = ${currentRate.usd_to_srd} SRD`,
          time: getTimeAgo(currentRate.set_at),
          color: 'green' as const
        })
      }

      setStats({
        totalSalesUSD: totalUSD,
        totalSalesSRD: totalSRD,
        activeOrders: reservations.length,
        stockItems: stockItemsCount,
        totalRevenue,
        todaysSales: todaysTotal,
        salesTrend: Math.abs(trend),
        recentActivity: activity.slice(0, 4)
      })
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Premium Welcome Section */}
      <div className="relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700" />
        
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-700/20 rounded-full blur-3xl" />
        
        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-4 border border-white/20">
                <Activity size={16} className="text-white" />
                <span className="text-sm font-semibold text-white">Live Dashboard</span>
              </div>
              <h1 className="text-3xl lg:text-5xl font-bold text-white mb-3 tracking-tight">
                Welcome back 👋
              </h1>
              <p className="text-orange-100 text-base lg:text-lg font-medium max-w-2xl leading-relaxed">
                Here's what's happening with your business today. All metrics are updated in real-time.
              </p>
            </div>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white">
                <div className="text-sm font-medium text-orange-100 mb-1">Today's Sales</div>
                <div className="text-2xl font-bold">${stats.todaysSales.toFixed(2)}</div>
                <div className="text-xs text-orange-200 mt-1 flex items-center gap-1">
                  <ArrowUpRight size={12} />
                  {stats.salesTrend > 0 ? '+' : ''}{stats.salesTrend.toFixed(1)}% vs yesterday
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white">
                <div className="text-sm font-medium text-orange-100 mb-1">Active Orders</div>
                <div className="text-2xl font-bold">{stats.activeOrders}</div>
                <div className="text-xs text-orange-200 mt-1">Processing now</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
          <StatCard 
            title="Total Sales (USD)" 
            value={`$${stats.totalSalesUSD.toFixed(2)}`}
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
            title="Total Revenue" 
            icon={TrendingUp}
            value={`$${stats.totalRevenue.toFixed(2)}`}
            trend={{ value: "All time", isPositive: true }}
            color="purple"
          />
        </div>

        {/* Quick Actions - Premium Design */}
        <div className="mb-8 lg:mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Quick Actions</h2>
              <p className="text-sm text-gray-600 mt-1">Common tasks and shortcuts</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              title="Monthly Sales" 
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
              <div className="h-64 lg:h-80 flex items-end justify-between gap-2 lg:gap-4">
                {monthlySales.map((amount, i) => {
                  const maxSale = Math.max(...monthlySales, 1)
                  const height = (amount / maxSale) * 100 || 5
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="relative">
                        <div 
                          className="w-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t-lg hover:from-orange-600 hover:to-orange-500 transition-all cursor-pointer"
                          style={{ height: `${Math.max(height, 5)}px`, minHeight: '5px' }}
                          title={`${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}: $${amount.toFixed(2)}`}
                        ></div>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          ${amount.toFixed(0)}
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 hidden lg:block">{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}</span>
                    </div>
                  )
                })}
              </div>
            </ChartCard>

            {/* Quick Stats - Desktop Only */}
            <div className="hidden lg:block">
              <ChartCard title="Quick Stats" subtitle="Overview of key metrics">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                        <DollarSign className="text-white" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Sales (USD)</p>
                        <p className="text-xl font-bold text-gray-900">${stats.totalSalesUSD.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Package className="text-white" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Stock Items</p>
                        <p className="text-xl font-bold text-gray-900">{stats.stockItems}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                        <ShoppingCart className="text-white" size={20} />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pending Reservations</p>
                        <p className="text-xl font-bold text-gray-900">{stats.activeOrders}</p>
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
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : stats.recentActivity.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No recent activity</div>
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
          <h2 className="text-lg font-bold text-gray-900 mb-4">All Modules</h2>
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
                  className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all active:scale-95 flex flex-col items-center gap-2"
                >
                  <Icon size={24} className="text-orange-500" />
                  <span className="text-xs font-medium text-gray-700">{item.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
