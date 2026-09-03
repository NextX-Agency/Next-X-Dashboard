'use client'

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  DollarSign,
  FileCheck2,
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
import { formatCurrency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'
import type { DashboardMetrics, DashboardResponse } from '@/types/dashboard'

const EMPTY_DASHBOARD: DashboardMetrics = {
  totalSalesUSD: 0, totalSalesSRD: 0, weeklySalesUSD: 0, weeklySalesSRD: 0,
  activeOrders: 0, stockItems: 0, lowStockItems: 0, outOfStockItems: 0,
  totalRevenue: 0, todaysSalesUSD: 0, todaysSalesSRD: 0, salesTrend: 0,
  totalSalesTrend: 0, weeklySalesTrend: 0, weeklyGrossProfitUSD: 0,
  weeklyGrossProfitTrend: 0, weeklyNetProfitUSD: 0, weeklyNetProfitTrend: 0,
  exchangeRate: 40, exchangeRateSetAt: null, exchangeRateAgeDays: null,
  exchangeRateIsStale: false, monthlySalesUSD: Array.from({ length: 12 }, () => 0),
  recentActivity: [],
}

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
  const response = await fetch('/api/dashboard', { cache: 'no-store', signal })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
    if (response.status === 403) throw new Error('You no longer have access to this dashboard.')
    throw new Error('Unable to load dashboard metrics right now.')
  }
  return (await response.json() as DashboardResponse).data
}

function getTimeAgo(dateString: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

function Metric({ label, value, note, icon: Icon, tone = 'neutral' }: {
  label: string
  value: string
  note: string
  icon: ComponentType<{ size?: number; className?: string }>
  tone?: 'neutral' | 'positive' | 'warning' | 'negative'
}) {
  const toneClasses = {
    neutral: 'border-white/[0.08] bg-[#101620] text-white',
    positive: 'border-emerald-300/15 bg-emerald-300/[0.055] text-emerald-100',
    warning: 'border-amber-300/15 bg-amber-300/[0.055] text-amber-100',
    negative: 'border-rose-300/15 bg-rose-300/[0.055] text-rose-100',
  }
  const iconClasses = {
    neutral: 'bg-white/[0.06] text-slate-300',
    positive: 'bg-emerald-300/10 text-emerald-300',
    warning: 'bg-amber-300/10 text-amber-300',
    negative: 'bg-rose-300/10 text-rose-300',
  }

  return <article className={`rounded-2xl border p-5 ${toneClasses[tone]}`}>
    <div className="flex items-start justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><span className={`grid h-8 w-8 place-items-center rounded-xl ${iconClasses[tone]}`}><Icon size={16} /></span></div>
    <p className="mt-4 text-2xl font-semibold tracking-[-0.035em] tabular-nums">{value}</p>
    <p className="mt-1.5 text-xs leading-5 text-slate-500">{note}</p>
  </article>
}

function TaskRow({ icon: Icon, title, detail, href, state }: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  detail: string
  href: string
  state: 'clear' | 'attention' | 'warning'
}) {
  const styles = {
    clear: 'border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-300',
    attention: 'border-amber-300/15 bg-amber-300/[0.055] text-amber-300',
    warning: 'border-rose-300/15 bg-rose-300/[0.055] text-rose-300',
  }
  return <Link href={href} className="group flex items-center gap-4 border-b border-white/[0.07] px-5 py-4 last:border-b-0 transition hover:bg-white/[0.03] sm:px-6">
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${styles[state]}`}><Icon size={17} /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-100">{title}</span><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span>
    <ArrowUpRight size={17} className="shrink-0 text-slate-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-orange-300" />
  </Link>
}

export default function DashboardPage() {
  const { displayCurrency, exchangeRate } = useCurrency()
  const [stats, setStats] = useState<DashboardMetrics>(EMPTY_DASHBOARD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let mounted = true
    const load = async () => {
      try {
        setLoading(true); setError(null)
        const data = await fetchDashboardMetrics(controller.signal)
        if (!mounted || controller.signal.aborted) return
        setStats(data); setLastUpdatedAt(new Date().toISOString())
      } catch (loadError) {
        if (!mounted || controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard metrics right now.')
      } finally {
        if (mounted && !controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => { mounted = false; controller.abort() }
  }, [])

  const refresh = async () => {
    try {
      setLoading(true); setError(null)
      setStats(await fetchDashboardMetrics())
      setLastUpdatedAt(new Date().toISOString())
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh dashboard metrics right now.')
    } finally { setLoading(false) }
  }

  const hasData = lastUpdatedAt !== null
  const activeExchangeRate = exchangeRate || stats.exchangeRate || 40
  const todaysSales = displayCurrency === 'USD' ? stats.todaysSalesUSD + stats.todaysSalesSRD / activeExchangeRate : stats.todaysSalesSRD + stats.todaysSalesUSD * activeExchangeRate
  const weeklySales = displayCurrency === 'USD' ? stats.weeklySalesUSD + stats.weeklySalesSRD / activeExchangeRate : stats.weeklySalesSRD + stats.weeklySalesUSD * activeExchangeRate
  const weeklyGrossProfit = displayCurrency === 'USD' ? stats.weeklyGrossProfitUSD : stats.weeklyGrossProfitUSD * activeExchangeRate
  const weeklyNetProfit = displayCurrency === 'USD' ? stats.weeklyNetProfitUSD : stats.weeklyNetProfitUSD * activeExchangeRate
  const monthlySales = stats.monthlySalesUSD.map((amount) => displayCurrency === 'USD' ? amount : amount * activeExchangeRate)
  const maxMonthlySale = Math.max(...monthlySales, 1)
  const totalYearSales = monthlySales.reduce((sum, amount) => sum + amount, 0)
  const currentMonth = new Date().getMonth()
  const inventoryIssues = stats.lowStockItems + stats.outOfStockItems
  const activity = stats.recentActivity.map((item) => ({ ...item, time: getTimeAgo(item.timestamp) }))

  return <main className="min-h-full bg-[#090d13] text-slate-100">
    {hasData && stats.exchangeRateIsStale ? <div className="border-b border-amber-300/20 bg-amber-300/[0.08] px-4 py-3"><div className="mx-auto flex max-w-[1560px] items-start gap-3 text-sm text-amber-100 sm:px-2"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" /><p><strong>Update the exchange rate.</strong> {stats.exchangeRateAgeDays === null ? 'No active rate is set.' : `The current rate was set ${stats.exchangeRateAgeDays} days ago.`} <Link href="/exchange" className="font-semibold text-amber-200 underline underline-offset-4">Open exchange settings</Link></p></div></div> : null}

    <div className="mx-auto max-w-[1560px] px-4 pb-24 pt-5 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
      <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">Store overview</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">What needs your attention today?</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Start with the open items below, then use the workspace navigation to manage sales, stock, money, and reporting.</p></div>
        <div className="flex flex-wrap items-center gap-2"><Link href="/sales" className="inline-flex items-center gap-2 rounded-xl bg-orange-400 px-4 py-2.5 text-sm font-bold text-[#17100b] transition hover:bg-orange-300 active:translate-y-px"><ShoppingCart size={16} />Record sale</Link><button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.11] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></div>
      </header>

      {error ? <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100"><AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-300" /><div><p className="font-semibold">Dashboard data is unavailable</p><p className="mt-1 text-rose-100/75">{error}</p></div></div> : null}

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(410px,.9fr)]">
        <article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Start here</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Open work</h2></div><span className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-400">{hasData ? `Updated ${getTimeAgo(lastUpdatedAt!)}` : 'Loading data'}</span></div>
          {loading && !hasData ? <div className="space-y-3 p-6">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />)}</div> : <div>
            <TaskRow icon={Package} title={inventoryIssues ? `${inventoryIssues} stock issue${inventoryIssues === 1 ? '' : 's'} to review` : 'Inventory looks healthy'} detail={inventoryIssues ? `${stats.lowStockItems} low stock, ${stats.outOfStockItems} sold out` : 'No low-stock or sold-out products reported'} href="/stock" state={stats.outOfStockItems > 0 ? 'warning' : inventoryIssues > 0 ? 'attention' : 'clear'} />
            <TaskRow icon={ShoppingCart} title={stats.activeOrders ? `${stats.activeOrders} reservation${stats.activeOrders === 1 ? '' : 's'} waiting` : 'No reservations waiting'} detail={stats.activeOrders ? 'Open the reservation desk to process or update them' : 'The reservation queue is clear'} href="/reservations" state={stats.activeOrders ? 'attention' : 'clear'} />
            <TaskRow icon={DollarSign} title={stats.exchangeRateIsStale ? 'Exchange rate needs an update' : 'Exchange rate is current'} detail={stats.exchangeRateIsStale ? 'USD pricing and reports use this rate' : `1 USD = ${activeExchangeRate} SRD`} href="/exchange" state={stats.exchangeRateIsStale ? 'attention' : 'clear'} />
            <TaskRow icon={FileCheck2} title="Review the finance workspace" detail="Check money trail, documentation, and month-end readiness" href="/finance" state="clear" />
          </div>}
        </article>

        <section className="grid gap-3 sm:grid-cols-2"><Metric label="Sales today" value={hasData ? formatCurrency(todaysSales, displayCurrency) : '—'} note={hasData ? `${stats.salesTrend >= 0 ? '+' : ''}${stats.salesTrend.toFixed(1)}% compared with yesterday` : 'Waiting for server metrics'} icon={DollarSign} tone={stats.salesTrend < 0 ? 'negative' : 'positive'} /><Metric label="Sales this week" value={hasData ? formatCurrency(weeklySales, displayCurrency) : '—'} note={hasData ? `${stats.weeklySalesTrend >= 0 ? '+' : ''}${stats.weeklySalesTrend.toFixed(1)}% compared with prior week` : 'Waiting for server metrics'} icon={TrendingUp} tone="neutral" /><Metric label="Gross profit" value={hasData ? formatCurrency(weeklyGrossProfit, displayCurrency) : '—'} note="This week, based on the current exchange rate" icon={TrendingUp} tone={weeklyGrossProfit < 0 ? 'negative' : 'positive'} /><Metric label="Net profit" value={hasData ? formatCurrency(weeklyNetProfit, displayCurrency) : '—'} note="Expenses and commissions included" icon={Wallet} tone={weeklyNetProfit < 0 ? 'negative' : 'positive'} /></section>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4 sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Sales pace</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Monthly sales in {new Date().getFullYear()}</h2></div><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Year total</p><p className="mt-1 text-lg font-semibold tabular-nums text-white">{hasData ? formatCurrency(totalYearSales, displayCurrency) : '—'}</p></div></div>
          {loading && !hasData ? <div className="m-6 h-60 animate-pulse rounded-xl bg-white/[0.04]" /> : <div className="p-5 sm:p-6"><div className="flex h-56 items-end gap-1.5 border-b border-white/[0.08] pb-7 sm:gap-2">{monthlySales.map((amount, index) => { const height = maxMonthlySale > 0 ? Math.max((amount / maxMonthlySale) * 100, amount > 0 ? 6 : 1) : 1; const isCurrent = index === currentMonth; return <div key={MONTHS[index]} className="group relative flex h-full flex-1 items-end"><div title={`${MONTHS[index]}: ${formatCurrency(amount, displayCurrency)}`} className={`w-full rounded-t-md transition duration-200 group-hover:brightness-125 ${isCurrent ? 'bg-orange-400' : amount > 0 ? 'bg-slate-500/70' : 'bg-white/[0.06]'}`} style={{ height: `${height}%` }} /><span className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold ${isCurrent ? 'text-orange-300' : 'text-slate-500'}`}>{MONTHS[index].slice(0, 1)}</span></div> })}</div><p className="mt-5 text-xs text-slate-500">Each column shows sales for that month in {displayCurrency}. Hover a column for the exact amount.</p></div>}
        </article>

        <aside className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Audit trail</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Recent activity</h2></div><Link href="/activity" className="text-xs font-semibold text-orange-300 hover:text-orange-200">View all</Link></div>{loading && !hasData ? <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-white/[0.04]" />)}</div> : activity.length === 0 ? <div className="grid min-h-64 place-items-center px-8 text-center"><div><Activity className="mx-auto text-slate-600" size={28} /><p className="mt-3 text-sm font-medium text-slate-300">No recent activity</p><p className="mt-1 text-xs leading-5 text-slate-500">New sales, exchange changes, and operations will appear here.</p></div></div> : <div className="divide-y divide-white/[0.06]">{activity.slice(0, 6).map((item, index) => <div key={`${item.title}-${index}`} className="flex items-center gap-3 px-5 py-3.5"><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/[0.05] text-orange-300"><Activity size={15} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-200">{item.title}</p><p className="mt-0.5 text-xs text-slate-500">{item.time}</p></div></div>)}</div>}</aside>
      </section>

      <section className="mt-5"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Common actions</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Go directly to your task</h2></div><p className="text-sm text-slate-500">These links do not change data until you confirm an action on the next screen.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Link href="/sales" className="group rounded-2xl border border-white/[0.09] bg-[#101620] p-5 transition hover:border-orange-400/25 hover:bg-[#131b27]"><ShoppingCart size={19} className="text-orange-300" /><h3 className="mt-5 text-sm font-semibold text-white">Record a sale</h3><p className="mt-1 text-xs leading-5 text-slate-500">Create a sale with its stock, wallet, and commission records.</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-orange-300">Open sales <ArrowUpRight size={14} /></span></Link><Link href="/stock" className="group rounded-2xl border border-white/[0.09] bg-[#101620] p-5 transition hover:border-orange-400/25 hover:bg-[#131b27]"><Package size={19} className="text-orange-300" /><h3 className="mt-5 text-sm font-semibold text-white">Manage stock</h3><p className="mt-1 text-xs leading-5 text-slate-500">Receive inventory, inspect locations, and resolve stock pressure.</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-orange-300">Open stock <ArrowUpRight size={14} /></span></Link><Link href="/finance" className="group rounded-2xl border border-white/[0.09] bg-[#101620] p-5 transition hover:border-orange-400/25 hover:bg-[#131b27]"><Wallet size={19} className="text-orange-300" /><h3 className="mt-5 text-sm font-semibold text-white">Check money trail</h3><p className="mt-1 text-xs leading-5 text-slate-500">Review cash movement, finance documentation, and close controls.</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-orange-300">Open finance <ArrowUpRight size={14} /></span></Link><Link href="/reports" className="group rounded-2xl border border-white/[0.09] bg-[#101620] p-5 transition hover:border-orange-400/25 hover:bg-[#131b27]"><BarChart3 size={19} className="text-orange-300" /><h3 className="mt-5 text-sm font-semibold text-white">View reports</h3><p className="mt-1 text-xs leading-5 text-slate-500">Compare sales, product performance, and business trends.</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-orange-300">Open reports <ArrowUpRight size={14} /></span></Link></div></section>

      <section className="mt-6 lg:hidden"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">All workspaces</p><div className="mt-3 grid grid-cols-3 gap-3">{MOBILE_MODULES.map(({ name, icon: Icon, path }) => <Link key={name} href={path} className="flex min-h-25 flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#101620] p-3 text-center transition active:scale-[0.98]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-400/10 text-orange-300"><Icon size={17} /></span><span className="mt-2 text-[11px] font-semibold text-slate-300">{name}</span></Link>)}</div></section>
    </div>
  </main>
}
