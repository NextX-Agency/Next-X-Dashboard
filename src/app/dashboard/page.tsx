'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  DollarSign,
  MapPin,
  Package,
  Receipt,
  RefreshCcw,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { ActivityItem, ChartCard, QuickActionCard, StatCard } from '@/components/Cards'
import { LoadingCard } from '@/components/UI'
import { formatCurrency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'
import type { DashboardMetrics, DashboardResponse } from '@/types/dashboard'

const EMPTY_DASHBOARD: DashboardMetrics = {
  totalSalesUSD: 0,
  totalSalesSRD: 0,
  weeklySalesUSD: 0,
  weeklySalesSRD: 0,
  activeOrders: 0,
  stockItems: 0,
  lowStockItems: 0,
  outOfStockItems: 0,
  totalRevenue: 0,
  todaysSalesUSD: 0,
  todaysSalesSRD: 0,
  salesTrend: 0,
  totalSalesTrend: 0,
  weeklySalesTrend: 0,
  weeklyGrossProfitUSD: 0,
  weeklyGrossProfitTrend: 0,
  weeklyNetProfitUSD: 0,
  weeklyNetProfitTrend: 0,
  exchangeRate: 40,
  monthlySalesUSD: Array.from({ length: 12 }, () => 0),
  recentActivity: [],
}

const QUICK_ACTIONS = [
  { name: 'New Sale', icon: ShoppingCart, path: '/sales', color: 'orange' as const },
  { name: 'Add Stock', icon: Package, path: '/stock', color: 'blue' as const },
  { name: 'Exchange Rate', icon: DollarSign, path: '/exchange', color: 'green' as const },
  { name: 'View Reports', icon: BarChart3, path: '/reports', color: 'purple' as const },
]

const MOBILE_MODULES = [
  { name: 'Items', icon: Package, path: '/items' },
  { name: 'Locations', icon: MapPin, path: '/locations' },
  { name: 'Wallets', icon: Wallet, path: '/wallets' },
  { name: 'Expenses', icon: Receipt, path: '/expenses' },
  { name: 'Commissions', icon: Users, path: '/commissions' },
  { name: 'Budgets', icon: Target, path: '/budgets' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

async function fetchDashboardMetrics(signal?: AbortSignal): Promise<DashboardMetrics> {
  const response = await fetch('/api/dashboard', {
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your session has expired. Please sign in again.')
    }

    if (response.status === 403) {
      throw new Error('You no longer have access to this dashboard.')
    }

    throw new Error('Unable to load dashboard metrics right now.')
  }

  const payload = await response.json() as DashboardResponse
  return payload.data
}

function getTimeAgo(dateString: string): string {
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

function DashboardHeroCardSkeleton() {
  return (
    <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-white shadow-lg">
      <div className="shimmer h-3 w-24 rounded bg-white/20 mb-3" />
      <div className="shimmer h-8 w-32 rounded bg-white/20 mb-3" />
      <div className="shimmer h-3 w-28 rounded bg-white/20" />
    </div>
  )
}

function DashboardChartSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 pb-2 border-b border-border/50">
        <div className="shimmer h-4 w-20 rounded" />
        <div className="shimmer h-6 w-28 rounded" />
      </div>
      <div className="h-48 lg:h-56 rounded-2xl border border-border/50 bg-muted/10 p-4">
        <div className="flex h-full items-end gap-2">
          {Array.from({ length: 12 }, (_, index) => (
            <div
              key={index}
              className="shimmer flex-1 rounded-t-md"
              style={{ height: `${24 + ((index % 5) * 12)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 pt-2">
        <div className="shimmer h-3 w-24 rounded" />
        <div className="shimmer h-3 w-24 rounded" />
      </div>
    </div>
  )
}

function DashboardActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/10">
          <div className="shimmer h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="shimmer h-4 w-4/5 rounded" />
            <div className="shimmer h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const { displayCurrency, exchangeRate } = useCurrency()
  const [stats, setStats] = useState<DashboardMetrics>(EMPTY_DASHBOARD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    async function loadDashboardData() {
      try {
        setLoading(true)
        setError(null)

        const data = await fetchDashboardMetrics(controller.signal)
        if (!isMounted || controller.signal.aborted) return

        setStats(data)
        setLastUpdatedAt(new Date().toISOString())
      } catch (loadError) {
        if (!isMounted || controller.signal.aborted) return

        console.error('Error loading dashboard data:', loadError)
        setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard metrics right now.')
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadDashboardData()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [])

  async function handleRefresh() {
    try {
      setLoading(true)
      setError(null)

      const data = await fetchDashboardMetrics()
      setStats(data)
      setLastUpdatedAt(new Date().toISOString())
    } catch (refreshError) {
      console.error('Error refreshing dashboard data:', refreshError)
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh dashboard metrics right now.')
    } finally {
      setLoading(false)
    }
  }

  const hasData = lastUpdatedAt !== null
  const isInitialLoad = loading && !hasData
  const activeExchangeRate = exchangeRate || stats.exchangeRate || 40
  const todaysSalesDisplay = displayCurrency === 'USD'
    ? stats.todaysSalesUSD + (stats.todaysSalesSRD / activeExchangeRate)
    : stats.todaysSalesSRD + (stats.todaysSalesUSD * activeExchangeRate)
  const weeklySalesDisplay = displayCurrency === 'USD'
    ? stats.weeklySalesUSD + (stats.weeklySalesSRD / activeExchangeRate)
    : stats.weeklySalesSRD + (stats.weeklySalesUSD * activeExchangeRate)
  const weeklyGrossProfitDisplay = displayCurrency === 'USD'
    ? stats.weeklyGrossProfitUSD
    : stats.weeklyGrossProfitUSD * activeExchangeRate
  const weeklyNetProfitDisplay = displayCurrency === 'USD'
    ? stats.weeklyNetProfitUSD
    : stats.weeklyNetProfitUSD * activeExchangeRate
  const monthlySalesDisplay = stats.monthlySalesUSD.map((amount) => (
    displayCurrency === 'USD' ? amount : amount * activeExchangeRate
  ))
  const maxMonthlySale = Math.max(...monthlySalesDisplay, 1)
  const totalYearSales = monthlySalesDisplay.reduce((sum, amount) => sum + amount, 0)
  const currentMonth = new Date().getMonth()

  const recentActivity = stats.recentActivity.map((item) => ({
    icon: item.kind === 'exchange' ? DollarSign : ShoppingCart,
    title: item.title,
    time: getTimeAgo(item.timestamp),
    color: item.color,
  }))

  const focusCards = [
    {
      title: 'Inventory pressure',
      value: hasData ? (stats.lowStockItems > 0 ? `${stats.lowStockItems} low stock` : 'Inventory healthy') : 'Awaiting data',
      subtitle: hasData
        ? (stats.outOfStockItems > 0 ? `${stats.outOfStockItems} items are sold out` : 'No sold out items right now')
        : 'Checking stock movement',
      icon: stats.lowStockItems > 0 || stats.outOfStockItems > 0 ? AlertCircle : Package,
      panelClass: stats.lowStockItems > 0 || stats.outOfStockItems > 0
        ? 'border-amber-500/20 bg-amber-500/10'
        : 'border-emerald-500/20 bg-emerald-500/10',
      iconClass: stats.lowStockItems > 0 || stats.outOfStockItems > 0
        ? 'bg-amber-500 text-white shadow-amber-500/25'
        : 'bg-emerald-500 text-white shadow-emerald-500/25',
    },
    {
      title: 'Reservation queue',
      value: hasData ? `${stats.activeOrders} pending` : 'Awaiting data',
      subtitle: hasData ? 'Reservations ready to process next' : 'Checking pending reservations',
      icon: ShoppingCart,
      panelClass: 'border-blue-500/20 bg-blue-500/10',
      iconClass: 'bg-blue-500 text-white shadow-blue-500/25',
    },
    {
      title: 'Exchange snapshot',
      value: hasData ? `1 USD = ${stats.exchangeRate} SRD` : 'Awaiting data',
      subtitle: hasData ? `Display currency is ${displayCurrency}` : 'Checking active rate',
      icon: DollarSign,
      panelClass: 'border-primary/20 bg-primary/10',
      iconClass: 'bg-primary text-white shadow-primary/25',
    },
  ]

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-orange-600 via-orange-700 to-orange-900" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-900/30 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-10 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-4 py-2 rounded-full mb-4 border border-white/25 shadow-sm">
                <Activity size={16} className="text-white" />
                <span className="text-sm font-bold text-white tracking-wide">Operations Pulse</span>
              </div>
              <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
                A cleaner view of what needs attention today.
              </h1>
              <p className="text-orange-100/90 text-base lg:text-lg font-medium max-w-2xl leading-relaxed">
                Server-computed metrics keep the dashboard fast, while the summary below highlights sales pace, weekly profit, stock risk, and the live exchange rate without waiting for the browser to crunch raw tables.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 backdrop-blur-md">
                  {hasData ? `Updated ${getTimeAgo(lastUpdatedAt)}` : 'Preparing first sync'}
                </div>
                <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 backdrop-blur-md">
                  {hasData ? `${stats.lowStockItems} low-stock items` : 'Checking inventory alerts'}
                </div>
                <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 backdrop-blur-md">
                  {hasData ? `1 USD = ${stats.exchangeRate} SRD` : 'Checking exchange rate'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 min-w-full lg:min-w-[320px] lg:max-w-[360px]">
              {isInitialLoad ? (
                <>
                  <DashboardHeroCardSkeleton />
                  <DashboardHeroCardSkeleton />
                </>
              ) : (
                <>
                  <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-white shadow-lg">
                    <div className="text-sm font-semibold text-orange-100 mb-1.5">Today&apos;s Sales</div>
                    <div className="text-2xl lg:text-3xl font-bold">
                      {hasData ? formatCurrency(todaysSalesDisplay, displayCurrency) : '—'}
                    </div>
                    <div className="text-xs text-orange-200 mt-2 flex items-center gap-1">
                      {hasData ? (
                        <>
                          {stats.salesTrend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          <span className="font-medium">
                            {stats.salesTrend > 0 ? '+' : ''}{stats.salesTrend.toFixed(1)}% vs yesterday
                          </span>
                        </>
                      ) : (
                        <span className="font-medium">Sales pulse unavailable</span>
                      )}
                    </div>
                  </div>
                  <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-white shadow-lg">
                    <div className="text-sm font-semibold text-orange-100 mb-1.5">Active Orders</div>
                    <div className="text-2xl lg:text-3xl font-bold">{hasData ? stats.activeOrders : '—'}</div>
                    <div className="text-xs text-orange-200 mt-2">
                      {hasData ? 'Reservations waiting to be handled' : 'Checking queue health'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 lg:py-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">Store overview</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Weekly profit and stock pressure in one fast server-computed snapshot.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh metrics
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-foreground">Dashboard data is unavailable</p>
                <p className="text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
          {isInitialLoad ? (
            Array.from({ length: 4 }, (_, index) => <LoadingCard key={index} />)
          ) : (
            <>
              <StatCard
                title={`Sales This Week (${displayCurrency})`}
                value={hasData ? formatCurrency(weeklySalesDisplay, displayCurrency) : '—'}
                icon={DollarSign}
                trend={hasData
                  ? { value: `${stats.weeklySalesTrend > 0 ? '+' : ''}${stats.weeklySalesTrend.toFixed(1)}%`, isPositive: stats.weeklySalesTrend >= 0 }
                  : undefined}
                color="orange"
              />
              <StatCard
                title="Stock Items"
                value={hasData ? stats.stockItems.toString() : '—'}
                icon={Package}
                trend={hasData
                  ? {
                    value: stats.lowStockItems > 0 ? `${stats.lowStockItems} low stock` : 'In stock',
                    isPositive: stats.lowStockItems === 0,
                  }
                  : undefined}
                color={stats.lowStockItems > 0 ? 'orange' : 'green'}
              />
              <StatCard
                title={`Gross Profit This Week (${displayCurrency})`}
                value={hasData ? formatCurrency(weeklyGrossProfitDisplay, displayCurrency) : '—'}
                icon={TrendingUp}
                trend={hasData
                  ? {
                    value: `${stats.weeklyGrossProfitTrend > 0 ? '+' : ''}${stats.weeklyGrossProfitTrend.toFixed(1)}%`,
                    isPositive: stats.weeklyGrossProfitTrend >= 0,
                  }
                  : undefined}
                color={stats.weeklyGrossProfitUSD >= 0 ? 'green' : 'red'}
              />
              <StatCard
                title={`Net Profit This Week (${displayCurrency})`}
                value={hasData ? formatCurrency(weeklyNetProfitDisplay, displayCurrency) : '—'}
                icon={Wallet}
                trend={hasData
                  ? {
                    value: `${stats.weeklyNetProfitTrend > 0 ? '+' : ''}${stats.weeklyNetProfitTrend.toFixed(1)}%`,
                    isPositive: stats.weeklyNetProfitTrend >= 0,
                  }
                  : undefined}
                color={stats.weeklyNetProfitUSD >= 0 ? 'green' : 'red'}
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-8 lg:mb-12">
          {focusCards.map((card) => {
            const Icon = card.icon

            return (
              <div key={card.title} className={`rounded-2xl border p-5 shadow-sm transition-all duration-200 ${card.panelClass}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg ${card.iconClass}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{card.title}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{card.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mb-8 lg:mb-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">Quick Actions</h2>
              <p className="text-sm text-muted-foreground mt-1">Common tasks and shortcuts</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {QUICK_ACTIONS.map((action) => (
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
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
              {isInitialLoad ? (
                <DashboardChartSkeleton />
              ) : !hasData ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <BarChart3 size={32} className="text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-foreground">No chart data yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Refresh the dashboard once data is available again.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span className="text-sm text-muted-foreground">Year Total</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">{formatCurrency(totalYearSales, displayCurrency)}</span>
                  </div>

                  <div className="relative h-48 lg:h-56">
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                      {[0, 1, 2, 3].map((step) => (
                        <div key={step} className="flex items-center gap-2 w-full">
                          <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">
                            {formatCurrency(maxMonthlySale * (1 - (step / 3)), displayCurrency).replace(/\.\d+/, '')}
                          </span>
                          <div className="flex-1 border-b border-dashed border-border/40" />
                        </div>
                      ))}
                    </div>

                    <div className="absolute inset-0 pl-14 flex items-end gap-1 pb-6">
                      {monthlySalesDisplay.map((displayAmount, index) => {
                        const heightPercent = maxMonthlySale > 0 ? (displayAmount / maxMonthlySale) * 100 : 0
                        const isCurrentMonth = index === currentMonth
                        const hasSales = displayAmount > 0

                        return (
                          <div key={MONTHS[index]} className="flex-1 flex flex-col items-center group relative h-full">
                            <div className="relative w-full h-full flex items-end justify-center">
                              <div
                                className={`w-full max-w-8 rounded-t-md transition-all duration-300 cursor-pointer relative overflow-hidden ${
                                  hasSales
                                    ? isCurrentMonth
                                      ? 'bg-linear-to-t from-primary to-primary/80 shadow-lg shadow-primary/20'
                                      : 'bg-linear-to-t from-primary/70 to-primary/50 hover:from-primary hover:to-primary/80'
                                    : 'bg-muted/30'
                                }`}
                                style={{ height: hasSales ? `${Math.max(heightPercent, 4)}%` : '2px' }}
                              >
                                {isCurrentMonth && hasSales && (
                                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent" />
                                )}
                              </div>

                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-card border border-border shadow-xl rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 pointer-events-none">
                                <div className="text-[10px] text-muted-foreground text-center">{MONTHS[index]}</div>
                                <div className="text-xs font-bold text-foreground whitespace-nowrap">
                                  {formatCurrency(displayAmount, displayCurrency)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="absolute bottom-0 left-14 right-0 flex justify-between">
                      {MONTHS.map((month, index) => (
                        <div key={month} className="flex-1 text-center">
                          <span className={`text-[10px] font-medium ${index === currentMonth ? 'text-primary' : 'text-muted-foreground'}`}>
                            {month.substring(0, 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-linear-to-t from-primary to-primary/80 shadow-sm" />
                      <span className="text-xs text-muted-foreground">Current Month</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-linear-to-t from-primary/70 to-primary/50" />
                      <span className="text-xs text-muted-foreground">Other Months</span>
                    </div>
                  </div>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="lg:col-span-1">
            <ChartCard title="Recent Activity" subtitle="Latest updates">
              {isInitialLoad ? (
                <DashboardActivitySkeleton />
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-10">
                  <Activity size={32} className="mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((item, index) => (
                    <ActivityItem key={`${item.title}-${index}`} {...item} />
                  ))}
                </div>
              )}
            </ChartCard>
          </div>
        </div>

        <div className="lg:hidden mt-8">
          <h2 className="text-lg font-bold text-foreground mb-4">All Modules</h2>
          <div className="grid grid-cols-3 gap-3">
            {MOBILE_MODULES.map((item) => {
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