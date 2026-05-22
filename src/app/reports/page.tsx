'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart3, TrendingUp, Package, DollarSign, Calendar,
  Award, ShoppingBag, Wallet, MapPin, Layers, Sparkles, Users,
  ArrowUpRight, ArrowDownRight, CreditCard, PieChart, Target,
  Clock, ChevronDown, ChevronUp, History,
  Activity, BookOpen, ArrowRight, Download
} from 'lucide-react'
import { PageHeader, Badge } from '@/components/UI'
import { formatCurrency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'
import { cn } from '@/lib/utils'
import type {
  ReportCategory as Category,
  ReportComboItem as ComboItem,
  ReportCommission as CommissionWithSale,
  ReportExpense as ExpenseWithCategory,
  ReportExpenseCategory as ExpenseCategory,
  ReportItem as Item,
  ReportLocation as Location,
  ReportPurchaseOrder as PurchaseOrder,
  ReportReservation as ReservationWithItem,
  ReportsDataResponse,
  ReportSale as SaleWithItems,
  ReportStock as Stock,
  ReportWallet as WalletRow,
  ReportWalletTransaction as WalletTransaction,
  ReportSeller as Seller,
} from '@/types/reports'

// ─── Types ───────────────────────────────────────────────────────────
interface MonthlySales {
  month: string
  monthKey: string
  year: number
  totalSales: number
  totalProfit: number
  totalExpenses: number
  salesCount: number
}

interface WalletActivitySummary {
  creditTotal: number
  debitTotal: number
  netChange: number
  salesCredits: number
  saleRefunds: number
  expenseDebits: number
  expenseRefunds: number
  commissionDebits: number
  transferNet: number
  adjustmentNet: number
  correctionNet: number
  otherNet: number
  operationalNet: number
  nonOperationalNet: number
  transactionCount: number
}

interface FinancialHealthScore {
  score: number
  label: string
  tone: 'emerald' | 'blue' | 'amber' | 'red'
  summary: string
  profitability: number
  liquidity: number
  reconciliation: number
  inventory: number
  liquidityCoverage: number
}

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly'
type ViewTab = 'current' | 'historical'

// ─── Helpers ─────────────────────────────────────────────────────────
function getCalendarPeriodBounds(period: PeriodType, now: Date): { start: Date; end: Date } {
  const year = now.getFullYear()
  const month = now.getMonth()
  const date = now.getDate()
  const day = now.getDay()

  switch (period) {
    case 'daily':
      return {
        start: new Date(year, month, date, 0, 0, 0, 0),
        end: new Date(year, month, date, 23, 59, 59, 999),
      }
    case 'weekly': {
      const mondayOffset = day === 0 ? -6 : 1 - day
      const monday = new Date(year, month, date + mondayOffset, 0, 0, 0, 0)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)
      return { start: monday, end: sunday > now ? now : sunday }
    }
    case 'monthly':
      return {
        start: new Date(year, month, 1, 0, 0, 0, 0),
        end: new Date(year, month + 1, 0, 23, 59, 59, 999),
      }
    case 'yearly':
      return {
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: new Date(year, 11, 31, 23, 59, 59, 999),
      }
  }
}

function getPreviousPeriodBounds(period: PeriodType, now: Date): { start: Date; end: Date } {
  const year = now.getFullYear()
  const month = now.getMonth()
  const date = now.getDate()
  const day = now.getDay()

  switch (period) {
    case 'daily': {
      const yesterday = new Date(year, month, date - 1)
      return {
        start: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0),
        end: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999),
      }
    }
    case 'weekly': {
      const mondayOffset = day === 0 ? -6 : 1 - day
      const thisMonday = new Date(year, month, date + mondayOffset)
      const prevMonday = new Date(thisMonday)
      prevMonday.setDate(thisMonday.getDate() - 7)
      const prevSunday = new Date(prevMonday)
      prevSunday.setDate(prevMonday.getDate() + 6)
      prevSunday.setHours(23, 59, 59, 999)
      prevMonday.setHours(0, 0, 0, 0)
      return { start: prevMonday, end: prevSunday }
    }
    case 'monthly':
      return {
        start: new Date(year, month - 1, 1, 0, 0, 0, 0),
        end: new Date(year, month, 0, 23, 59, 59, 999),
      }
    case 'yearly':
      return {
        start: new Date(year - 1, 0, 1, 0, 0, 0, 0),
        end: new Date(year - 1, 11, 31, 23, 59, 59, 999),
      }
  }
}

function periodLabel(period: PeriodType): string {
  switch (period) {
    case 'daily': return 'Today'
    case 'weekly': return 'This Week'
    case 'monthly': return 'This Month'
    case 'yearly': return 'This Year'
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

function formatPct(value: number | null): string {
  if (value === null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function inRange(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr)
  return d >= start && d <= end
}

const toNum = (v: number | string | null): number => {
  if (v === null) return 0
  return typeof v === 'string' ? parseFloat(v) || 0 : v
}

function classifyWalletTransaction(transaction: WalletTransaction): keyof Pick<
  WalletActivitySummary,
  'salesCredits' | 'saleRefunds' | 'expenseDebits' | 'expenseRefunds' | 'commissionDebits' | 'transferNet' | 'adjustmentNet' | 'correctionNet' | 'otherNet'
> {
  if (transaction.reference_type === 'commission_payout') return 'commissionDebits'
  if (transaction.reference_type === 'transfer') return 'transferNet'
  if (transaction.reference_type === 'expense_refund') return 'expenseRefunds'
  if (transaction.reference_type === 'expense' || transaction.expense_id) return 'expenseDebits'
  if (transaction.reference_type === 'sale_refund') return 'saleRefunds'
  if (transaction.reference_type === 'adjustment') return 'adjustmentNet'
  if (transaction.reference_type === 'correction') return 'correctionNet'
  if (transaction.sale_id) return transaction.type === 'debit' ? 'saleRefunds' : 'salesCredits'
  return 'otherNet'
}

// ─── Main Component ──────────────────────────────────────────────────
export default function ReportsPage() {
  const { displayCurrency, exchangeRate } = useCurrency()
  const rate = (exchangeRate as unknown as number) || 40

  // ─── State ───
  const [allSales, setAllSales] = useState<SaleWithItems[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [allExpenses, setAllExpenses] = useState<ExpenseWithCategory[]>([])
  const [allCommissions, setAllCommissions] = useState<CommissionWithSale[]>([])
  const [wallets, setWallets] = useState<WalletRow[]>([])
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([])
  const [reservations, setReservations] = useState<ReservationWithItem[]>([])
  const [comboItems, setComboItems] = useState<ComboItem[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [period, setPeriod] = useState<PeriodType>('monthly')
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [activeTab, setActiveTab] = useState<ViewTab>('current')
  const [excludeLowValueItems, setExcludeLowValueItems] = useState(false)
  const [excludeInventoryExpenses, setExcludeInventoryExpenses] = useState(true)
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [deepDebugData, setDeepDebugData] = useState<any>(null)
  const [deepDebugLoading, setDeepDebugLoading] = useState(false)
  const [deepDebugError, setDeepDebugError] = useState<string | null>(null)

  // Historical date range
  const [histStart, setHistStart] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [histEnd, setHistEnd] = useState(() => new Date().toISOString().slice(0, 10))

  // collapsed sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    financial: true,
    assetHealth: true,
    salesHistory: false,
    topItems: false,
    topCombos: false,
    expenses: false,
    categories: false,
    locations: true,
    sellers: false,
    inventory: false,
    reservations: false,
    payments: false,
  })

  const toggleSection = (key: string) =>
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  // ─── Data Loading ───
  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await fetch('/api/reports', {
        cache: 'no-store',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }

        if (response.status === 403) {
          throw new Error('You no longer have access to this report.')
        }

        throw new Error('Unable to load report data right now.')
      }

      const payload = await response.json() as ReportsDataResponse

      setAllSales(payload.data.sales)
      setItems(payload.data.items)
      setStocks(payload.data.stocks)
      setLocations(payload.data.locations)
      setAllExpenses(payload.data.expenses)
      setAllCommissions(payload.data.commissions)
      setWallets(payload.data.wallets)
      setWalletTransactions(payload.data.walletTransactions)
      setReservations(payload.data.reservations)
      setComboItems(payload.data.comboItems)
      setSellers(payload.data.sellers)
      setCategories(payload.data.categories)
      setPurchaseOrders(payload.data.purchaseOrders)
    } catch (error) {
      console.error('Error loading reports data:', error)
      setLoadError(error instanceof Error ? error.message : 'Unable to load report data right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const downloadReport = useCallback((exportPeriod: 'monthly' | 'yearly') => {
    const params = new URLSearchParams({
      period: exportPeriod,
    })

    if (selectedLocation) {
      params.set('locationId', selectedLocation)
    }

    const anchor = document.createElement('a')
    anchor.href = `/api/reports/export?${params.toString()}`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }, [selectedLocation])

  // ─── Helper to check if expense is inventory-related ───
  const isInventoryExpense = useCallback((exp: ExpenseWithCategory): boolean => {
    const categoryName = (exp.expense_categories?.name || '').toLowerCase().trim()
    // Exclude inventory purchases AND personal/non-business expenses
    const isInventory = 
      categoryName === 'business expense' ||  // Your inventory category
      categoryName === 'personal items' ||     // Personal expenses (not business operating costs)
      categoryName === 'personal' ||
      categoryName === 'inventory' ||
      categoryName === 'stock' ||
      categoryName === 'stock purchase' ||
      categoryName === 'purchases' ||
      categoryName === 'goods' ||
      categoryName === 'wholesale' ||
      categoryName === 'vendor' ||
      categoryName === 'cogs' ||
      categoryName === 'cost of goods sold' ||
      categoryName === 'merchandise' ||
      categoryName === 'product purchases' ||
      categoryName.includes('inventory purchase') ||
      categoryName.includes('stock order') ||
      // Only exclude shipping/marketing if explicitly for inventory
      categoryName === 'inventory shipping' ||
      categoryName === 'stock shipping' ||
      categoryName.includes('product shipping')
    
    // Check description for additional context
    const description = (exp.description || '').toLowerCase()
    const hasInventoryKeywords = description.includes('inventory') || 
                                 description.includes('stock') || 
                                 description.includes('wholesale') ||
                                 description.includes('supplier') ||
                                 description.includes('vendor')
    
    return isInventory || (hasInventoryKeywords && (categoryName === 'shipping' || categoryName === 'marketing'))
  }, [])

  // ─── Period boundaries ───
  const now = useMemo(() => new Date(), [])
  const currentBounds = useMemo(() => getCalendarPeriodBounds(period, now), [period, now])
  const prevBounds = useMemo(() => getPreviousPeriodBounds(period, now), [period, now])

  const histBounds = useMemo(() => ({
    start: new Date(histStart + 'T00:00:00'),
    end: new Date(histEnd + 'T23:59:59.999'),
  }), [histStart, histEnd])

  // ─── Filtered slices ───
  const isCurrentTab = activeTab === 'current'
  const activeBounds = isCurrentTab ? currentBounds : histBounds

  const filteredSales = useMemo(() => allSales.filter(s => {
    if (!inRange(s.created_at, activeBounds.start, activeBounds.end)) return false
    if (selectedLocation && s.location_id !== selectedLocation) return false
    return true
  }), [allSales, activeBounds, selectedLocation])

  const prevSales = useMemo(() => {
    if (!isCurrentTab) return []
    return allSales.filter(s => {
      if (!inRange(s.created_at, prevBounds.start, prevBounds.end)) return false
      if (selectedLocation && s.location_id !== selectedLocation) return false
      return true
    })
  }, [allSales, prevBounds, selectedLocation, isCurrentTab])

  const filteredExpenses = useMemo(() => allExpenses.filter(e => {
    if (!inRange(e.created_at, activeBounds.start, activeBounds.end)) return false
    if (selectedLocation && e.location_id !== selectedLocation) return false
    return true
  }), [allExpenses, activeBounds, selectedLocation])

  const prevExpenses = useMemo(() => {
    if (!isCurrentTab) return []
    return allExpenses.filter(e => {
      if (!inRange(e.created_at, prevBounds.start, prevBounds.end)) return false
      if (selectedLocation && e.location_id !== selectedLocation) return false
      return true
    })
  }, [allExpenses, prevBounds, selectedLocation, isCurrentTab])

  const filteredCommissions = useMemo(() => {
    // Create a Set of sale IDs from filtered sales
    const saleIds = new Set(filteredSales.map(s => s.id))
    // Only include commissions for sales in this period
    return allCommissions.filter(c => {
      // Match by sale_id to get commissions for sales in this period
      if (c.sale_id && !saleIds.has(c.sale_id)) return false
      // Also check location filter
      if (selectedLocation && c.location_id !== selectedLocation) return false
      return true
    })
  }, [allCommissions, filteredSales, selectedLocation])

  const prevCommissions = useMemo(() => {
    if (!isCurrentTab) return []
    const prevSaleIds = new Set(prevSales.map(s => s.id))
    return allCommissions.filter(c => {
      if (c.sale_id && !prevSaleIds.has(c.sale_id)) return false
      if (selectedLocation && c.location_id !== selectedLocation) return false
      return true
    })
  }, [allCommissions, prevSales, selectedLocation, isCurrentTab])

  const visibleWallets = useMemo(() => wallets.filter(wallet => {
    if (selectedLocation && wallet.location_id !== selectedLocation) return false
    return true
  }), [wallets, selectedLocation])

  const visibleWalletIds = useMemo(() => new Set(visibleWallets.map(wallet => wallet.id)), [visibleWallets])

  const relevantWalletTransactions = useMemo(() => walletTransactions.filter(transaction =>
    visibleWalletIds.has(transaction.wallet_id)
  ), [walletTransactions, visibleWalletIds])

  const filteredWalletTransactions = useMemo(() => relevantWalletTransactions.filter(transaction =>
    inRange(transaction.created_at, activeBounds.start, activeBounds.end)
  ), [relevantWalletTransactions, activeBounds])

  const prevWalletTransactions = useMemo(() => {
    if (!isCurrentTab) return []
    return relevantWalletTransactions.filter(transaction =>
      inRange(transaction.created_at, prevBounds.start, prevBounds.end)
    )
  }, [relevantWalletTransactions, prevBounds, isCurrentTab])

  const relevantPurchaseOrders = useMemo(() => purchaseOrders.filter(order => {
    if (selectedLocation && order.location_id !== selectedLocation) return false
    return true
  }), [purchaseOrders, selectedLocation])

  const filteredPurchaseOrders = useMemo(() => relevantPurchaseOrders.filter(order =>
    inRange(order.created_at, activeBounds.start, activeBounds.end)
  ), [relevantPurchaseOrders, activeBounds])

  const prevPurchaseOrders = useMemo(() => {
    if (!isCurrentTab) return []
    return relevantPurchaseOrders.filter(order =>
      inRange(order.created_at, prevBounds.start, prevBounds.end)
    )
  }, [relevantPurchaseOrders, prevBounds, isCurrentTab])

  const activeReservations = useMemo(() =>
    reservations.filter(r => r.status === 'pending' || r.status === 'confirmed'),
    [reservations]
  )

  // ─── Calculation helpers ───
  const saleAmountInDisplay = useCallback((sale: SaleWithItems): number => {
    // Use sale's recorded exchange rate, or fallback to 40 (safer assumption than current rate)
    const saleRate = (sale.exchange_rate as number) || 40
    if (displayCurrency === 'USD') {
      return sale.currency === 'USD' ? sale.total_amount : sale.total_amount / saleRate
    }
    // When displaying in SRD, use the original amount if sale was in SRD
    if (sale.currency === 'SRD' && displayCurrency === 'SRD') {
      return sale.total_amount
    }
    // Convert USD sale to SRD using sale's rate or display rate
    return sale.currency === 'SRD' ? sale.total_amount : sale.total_amount * saleRate
  }, [displayCurrency])

  const saleProfitUSD = useCallback((sale: SaleWithItems): number => {
    // Use sale's recorded exchange rate, or fallback to 40
    const saleRate = (sale.exchange_rate as number) || 40
    let profit = 0
    sale.sale_items?.forEach(si => {
      const item = items.find(i => i.id === si.item_id)
      if (item?.purchase_price_usd) {
        const cost = toNum(item.purchase_price_usd) * si.quantity
        const revenue = sale.currency === 'SRD' ? si.subtotal / saleRate : si.subtotal
        profit += revenue - cost
      } else if (item) {
        // If no cost data, assume 0 cost (don't skip the sale)
        const revenue = sale.currency === 'SRD' ? si.subtotal / saleRate : si.subtotal
        profit += revenue
      }
    })
    return profit
  }, [items])

  const profitInDisplay = useCallback((profitUSD: number): number =>
    displayCurrency === 'USD' ? profitUSD : profitUSD * rate,
    [displayCurrency, rate]
  )

  const amountInDisplay = useCallback((amount: number, currency: string | null | undefined, sourceRate?: number | null): number => {
    const conversionRate = sourceRate || rate
    if (displayCurrency === 'USD') {
      return currency === 'SRD' ? amount / conversionRate : amount
    }
    return currency === 'USD' ? amount * conversionRate : amount
  }, [displayCurrency, rate])

  const walletTransactionInDisplay = useCallback((transaction: WalletTransaction): number => {
    const currency = transaction.currency || visibleWallets.find(wallet => wallet.id === transaction.wallet_id)?.currency || 'SRD'
    return amountInDisplay(toNum(transaction.amount), currency)
  }, [amountInDisplay, visibleWallets])

  const signedWalletTransactionAmount = useCallback((transaction: WalletTransaction): number => {
    const amount = walletTransactionInDisplay(transaction)
    return transaction.type === 'debit' ? -amount : amount
  }, [walletTransactionInDisplay])

  const purchaseOrderTotalInDisplay = useCallback((order: PurchaseOrder): number =>
    amountInDisplay(toNum(order.total_amount), order.currency, order.exchange_rate),
  [amountInDisplay])

  const purchaseOrderRemainingInDisplay = useCallback((order: PurchaseOrder): number => {
    return (order.purchase_order_items || []).reduce((sum, item) => {
      const remainingQuantity = Math.max(0, item.quantity - (item.quantity_received || 0))
      return sum + amountInDisplay(remainingQuantity * toNum(item.unit_cost), order.currency, order.exchange_rate)
    }, 0)
  }, [amountInDisplay])

  const summarizeWalletActivity = useCallback((transactions: WalletTransaction[]): WalletActivitySummary => {
    const summary: WalletActivitySummary = {
      creditTotal: 0,
      debitTotal: 0,
      netChange: 0,
      salesCredits: 0,
      saleRefunds: 0,
      expenseDebits: 0,
      expenseRefunds: 0,
      commissionDebits: 0,
      transferNet: 0,
      adjustmentNet: 0,
      correctionNet: 0,
      otherNet: 0,
      operationalNet: 0,
      nonOperationalNet: 0,
      transactionCount: transactions.length,
    }

    transactions.forEach(transaction => {
      const amount = walletTransactionInDisplay(transaction)
      const signedAmount = transaction.type === 'debit' ? -amount : amount
      const bucket = classifyWalletTransaction(transaction)

      if (transaction.type === 'debit') summary.debitTotal += amount
      else summary.creditTotal += amount

      if (bucket === 'salesCredits' || bucket === 'saleRefunds' || bucket === 'expenseDebits' || bucket === 'expenseRefunds' || bucket === 'commissionDebits') {
        summary[bucket] += amount
      } else {
        summary[bucket] += signedAmount
      }
    })

    summary.netChange = summary.creditTotal - summary.debitTotal
    summary.operationalNet = summary.salesCredits + summary.expenseRefunds - summary.saleRefunds - summary.expenseDebits - summary.commissionDebits
    summary.nonOperationalNet = summary.transferNet + summary.adjustmentNet + summary.correctionNet + summary.otherNet

    return summary
  }, [walletTransactionInDisplay])

  const expenseInDisplay = useCallback((exp: ExpenseWithCategory): number => {
    if (displayCurrency === 'USD') {
      return exp.currency === 'USD' ? exp.amount : exp.amount / 40  // Use 40 as standard rate
    }
    if (displayCurrency === 'SRD' && exp.currency === 'SRD') {
      return exp.amount  // Keep original SRD amount
    }
    return exp.currency === 'SRD' ? exp.amount : exp.amount * 40
  }, [displayCurrency])

  const commissionInDisplay = useCallback((c: CommissionWithSale): number => {
    const amt = toNum(c.commission_amount)
    // 🔧 FIX: Commissions inherit currency from their source sale
    // Check the related sale's currency to determine conversion
    const commissionCurrency = c.sales?.currency || 'USD' // Default to USD if not available
    
    // Convert commission based on source currency vs display currency
    if (commissionCurrency === 'USD') {
      // Commission is in USD
      return displayCurrency === 'SRD' ? amt * 40 : amt
    } else {
      // Commission is in SRD
      return displayCurrency === 'USD' ? amt / 40 : amt
    }
  }, [displayCurrency])

  // ─── Aggregates ───
  const totalRevenue = useMemo(() => filteredSales.reduce((s, sale) => s + saleAmountInDisplay(sale), 0), [filteredSales, saleAmountInDisplay])
  const totalGrossProfit = useMemo(() => profitInDisplay(filteredSales.reduce((s, sale) => s + saleProfitUSD(sale), 0)), [filteredSales, saleProfitUSD, profitInDisplay])
  const totalExpensesAmt = useMemo(() => {
    return filteredExpenses
      .filter(e => !excludeInventoryExpenses || !isInventoryExpense(e))
      .reduce((s, e) => s + expenseInDisplay(e), 0)
  }, [filteredExpenses, expenseInDisplay, excludeInventoryExpenses, isInventoryExpense])
  const totalCommissionsAmt = useMemo(() => filteredCommissions.reduce((s, c) => s + commissionInDisplay(c), 0), [filteredCommissions, commissionInDisplay])
  const netProfit = totalGrossProfit - totalExpensesAmt - totalCommissionsAmt
  const salesCount = filteredSales.length
  const avgTransactionValue = salesCount > 0 ? totalRevenue / salesCount : 0
  const grossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0
  const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  const expenseRatio = totalRevenue > 0 ? (totalExpensesAmt / totalRevenue) * 100 : 0

  // Previous period
  const prevRevenue = useMemo(() => prevSales.reduce((s, sale) => s + saleAmountInDisplay(sale), 0), [prevSales, saleAmountInDisplay])
  const prevGrossProfit = useMemo(() => profitInDisplay(prevSales.reduce((s, sale) => s + saleProfitUSD(sale), 0)), [prevSales, saleProfitUSD, profitInDisplay])
  const prevExpensesAmt = useMemo(() => {
    return prevExpenses
      .filter(e => !excludeInventoryExpenses || !isInventoryExpense(e))
      .reduce((s, e) => s + expenseInDisplay(e), 0)
  }, [prevExpenses, expenseInDisplay, excludeInventoryExpenses, isInventoryExpense])
  const prevCommissionsAmt = useMemo(() => prevCommissions.reduce((s, c) => s + commissionInDisplay(c), 0), [prevCommissions, commissionInDisplay])
  const prevNetProfit = prevGrossProfit - prevExpensesAmt - prevCommissionsAmt

  // ─── Combo Stats ───
  const comboStats = useMemo(() => {
    let totalCombos = 0; let totalComboRevenue = 0
    
    // Track items in each sale to detect combo patterns
    filteredSales.forEach(sale => {
      const saleRate = (sale.exchange_rate as number) || rate
      
      // First, count explicit combo items (is_combo=true)
      sale.sale_items?.forEach(si => {
        const item = items.find(i => i.id === si.item_id)
        if (item?.is_combo) {
          totalCombos += si.quantity
          if (displayCurrency === 'USD') {
            totalComboRevenue += sale.currency === 'USD' ? si.subtotal : si.subtotal / saleRate
          } else {
            totalComboRevenue += sale.currency === 'SRD' ? si.subtotal : si.subtotal * rate
          }
        }
      })
      
      // Pattern detection: Identify combo deals sold as discounted individual items
      // Universal pattern: ANY KZ IEM + KZ Pouch + ESSAGER DAC = Combo
      if (sale.sale_items && sale.sale_items.length >= 3) {
        const itemCounts = new Map<string, { name: string; quantity: number; subtotal: number }>()
        
        sale.sale_items.forEach(si => {
          const item = items.find(i => i.id === si.item_id)
          if (item && !item.is_combo) {
            const existing = itemCounts.get(item.name)
            if (existing) {
              existing.quantity += si.quantity
              existing.subtotal += si.subtotal
            } else {
              itemCounts.set(item.name, { name: item.name, quantity: si.quantity, subtotal: si.subtotal })
            }
          }
        })
        
        // Find all KZ IEMs (earphones) in this sale
        const kzIEMs = Array.from(itemCounts.entries()).filter(([name]) => 
          name.startsWith('KZ ') && 
          !name.includes('Pouch') && 
          !name.includes('Cable') &&
          !name.includes('Verlengkabel') &&
          !name.includes('DEAL')
        )
        
        const pouchCount = itemCounts.get('KZ Elliptical Pouch')?.quantity || 0
        const dacCount = itemCounts.get('ESSAGER AUX(3.5mm) to Type-C DAC')?.quantity || 0
        
        // Check each IEM type for combo patterns
        kzIEMs.forEach(([iemName, iemData]) => {
          const comboSets = Math.min(iemData.quantity, pouchCount, dacCount)
          
          if (comboSets > 0) {
            totalCombos += comboSets
            
            // Calculate revenue for these combo sets
            // Each combo = IEM + Pouch + DAC
            const iemRevPerUnit = iemData.subtotal / iemData.quantity
            const pouchRevPerUnit = (itemCounts.get('KZ Elliptical Pouch')?.subtotal || 0) / pouchCount
            const dacRevPerUnit = (itemCounts.get('ESSAGER AUX(3.5mm) to Type-C DAC')?.subtotal || 0) / dacCount
            
            const comboRevThisSale = (iemRevPerUnit + pouchRevPerUnit + dacRevPerUnit) * comboSets
            
            if (displayCurrency === 'USD') {
              totalComboRevenue += sale.currency === 'USD' ? comboRevThisSale : comboRevThisSale / saleRate
            } else {
              totalComboRevenue += sale.currency === 'SRD' ? comboRevThisSale : comboRevThisSale * rate
            }
          }
        })
      }
    })
    
    return { totalCombos, totalComboRevenue }
  }, [filteredSales, items, displayCurrency, rate])

  // ─── Top Selling Items ───
  const topSellingItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenueUSD: number }>()
    filteredSales.forEach(sale => {
      const saleRate = (sale.exchange_rate as number) || rate
      sale.sale_items?.forEach(si => {
        const item = items.find(i => i.id === si.item_id)
        if (item) {
          const revUSD = sale.currency === 'USD' ? si.subtotal : si.subtotal / saleRate
          const existing = map.get(si.item_id)
          if (existing) { existing.quantity += si.quantity; existing.revenueUSD += revUSD }
          else map.set(si.item_id, { name: item.name, quantity: si.quantity, revenueUSD: revUSD })
        }
      })
    })
    return Array.from(map.values())
      .sort((a, b) => b.revenueUSD - a.revenueUSD)
      .slice(0, 10)
      .map(i => ({ ...i, revenue: displayCurrency === 'USD' ? i.revenueUSD : i.revenueUSD * rate }))
  }, [filteredSales, items, displayCurrency, rate])

  // ─── Top Combos ───
  const topCombos = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number }>()
    
    filteredSales.forEach(sale => {
      const saleRate = (sale.exchange_rate as number) || rate
      
      // Count explicit combo items
      sale.sale_items?.forEach(si => {
        const item = items.find(i => i.id === si.item_id)
        if (item?.is_combo) {
          const rev = displayCurrency === 'USD'
            ? (sale.currency === 'USD' ? si.subtotal : si.subtotal / saleRate)
            : (sale.currency === 'SRD' ? si.subtotal : si.subtotal * rate)
          const existing = map.get(item.id)
          if (existing) { existing.count += si.quantity; existing.revenue += rev }
          else map.set(item.id, { name: item.name, count: si.quantity, revenue: rev })
        }
      })
      
      // Detect pattern-based combos
      if (sale.sale_items && sale.sale_items.length >= 3) {
        const itemCounts = new Map<string, { quantity: number; subtotal: number }>()
        
        sale.sale_items.forEach(si => {
          const item = items.find(i => i.id === si.item_id)
          if (item && !item.is_combo) {
            const existing = itemCounts.get(item.name)
            if (existing) {
              existing.quantity += si.quantity
              existing.subtotal += si.subtotal
            } else {
              itemCounts.set(item.name, { quantity: si.quantity, subtotal: si.subtotal })
            }
          }
        })
        
        // Find all KZ IEMs
        const kzIEMs = Array.from(itemCounts.entries()).filter(([name]) => 
          name.startsWith('KZ ') && 
          !name.includes('Pouch') && 
          !name.includes('Cable') &&
          !name.includes('Verlengkabel') &&
          !name.includes('DEAL')
        )
        
        const pouchData = itemCounts.get('KZ Elliptical Pouch')
        const dacData = itemCounts.get('ESSAGER AUX(3.5mm) to Type-C DAC')
        
        // For each IEM type, check if it forms a combo
        kzIEMs.forEach(([iemName, iemData]) => {
          if (pouchData && dacData) {
            const comboSets = Math.min(iemData.quantity, pouchData.quantity, dacData.quantity)
            
            if (comboSets > 0) {
              // Create a combo name
              const comboName = `${iemName} DEAL (IEM+Pouch+DAC)`
              
              const iemRevPerUnit = iemData.subtotal / iemData.quantity
              const pouchRevPerUnit = pouchData.subtotal / pouchData.quantity
              const dacRevPerUnit = dacData.subtotal / dacData.quantity
              const comboRevThisSale = (iemRevPerUnit + pouchRevPerUnit + dacRevPerUnit) * comboSets
              
              const rev = displayCurrency === 'USD'
                ? (sale.currency === 'USD' ? comboRevThisSale : comboRevThisSale / saleRate)
                : (sale.currency === 'SRD' ? comboRevThisSale : comboRevThisSale * rate)
              
              const existing = map.get(comboName)
              if (existing) { 
                existing.count += comboSets
                existing.revenue += rev
              } else {
                map.set(comboName, { name: comboName, count: comboSets, revenue: rev })
              }
            }
          }
        })
      }
    })
    
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [filteredSales, items, displayCurrency, rate])

  // ─── Expenses by Category ───
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, { categoryName: string; amount: number }>()
    const excludedMap = new Map<string, { categoryName: string; amount: number }>()
    
    filteredExpenses.forEach(e => {
      const name = e.expense_categories?.name || 'Uncategorized'
      const amt = expenseInDisplay(e)
      const isExcluded = excludeInventoryExpenses && isInventoryExpense(e)
      
      const targetMap = isExcluded ? excludedMap : map
      const existing = targetMap.get(name)
      if (existing) existing.amount += amt
      else targetMap.set(name, { categoryName: name, amount: amt })
    })
    
    return {
      included: Array.from(map.values()).sort((a, b) => b.amount - a.amount),
      excluded: Array.from(excludedMap.values()).sort((a, b) => b.amount - a.amount)
    }
  }, [filteredExpenses, expenseInDisplay, excludeInventoryExpenses, isInventoryExpense])

  // ─── Category Performance ───
  const categoryPerformance = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; profitUSD: number; salesCount: number; quantity: number }>()
    filteredSales.forEach(sale => {
      const saleRate = (sale.exchange_rate as number) || rate
      sale.sale_items?.forEach(si => {
        const item = items.find(i => i.id === si.item_id)
        if (item) {
          const catId = item.category_id || 'uncategorized'
          const catName = categories.find(c => c.id === catId)?.name || 'Uncategorized'
          const revUSD = sale.currency === 'USD' ? si.subtotal : si.subtotal / saleRate
          const cost = toNum(item.purchase_price_usd) * si.quantity
          const profit = revUSD - cost
          const existing = map.get(catId)
          if (existing) {
            existing.revenue += revUSD; existing.profitUSD += profit
            existing.salesCount += 1; existing.quantity += si.quantity
          } else {
            map.set(catId, { name: catName, revenue: revUSD, profitUSD: profit, salesCount: 1, quantity: si.quantity })
          }
        }
      })
    })
    return Array.from(map.values())
      .map(c => ({
        ...c,
        revenueDisplay: displayCurrency === 'USD' ? c.revenue : c.revenue * rate,
        profitDisplay: displayCurrency === 'USD' ? c.profitUSD : c.profitUSD * rate,
        margin: c.revenue > 0 ? (c.profitUSD / c.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenueDisplay - a.revenueDisplay)
  }, [filteredSales, items, categories, displayCurrency, rate])

  // ─── Location Performance ───
  const locationPerformance = useMemo(() => {
    return locations.map(loc => {
      const locSales = filteredSales.filter(s => s.location_id === loc.id)
      const locExpenses = filteredExpenses.filter(e => e.location_id === loc.id)
      const locCommissions = filteredCommissions.filter(c => c.location_id === loc.id)
      const revenue = locSales.reduce((s, sale) => s + saleAmountInDisplay(sale), 0)
      const profitUSD = locSales.reduce((s, sale) => s + saleProfitUSD(sale), 0)
      const grossProfit = profitInDisplay(profitUSD)
      const expenses = locExpenses.reduce((s, e) => s + expenseInDisplay(e), 0)
      const commissions = locCommissions.reduce((s, c) => s + commissionInDisplay(c), 0)
      const locNetProfit = grossProfit - expenses - commissions
      const stockValueUSD = stocks
        .filter(s => s.location_id === loc.id)
        .reduce((sum, stock) => {
          const item = items.find(i => i.id === stock.item_id)
          return item?.purchase_price_usd ? sum + toNum(item.purchase_price_usd) * stock.quantity : sum
        }, 0)
      return {
        id: loc.id, name: loc.name, revenue, grossProfit, expenses, commissions,
        netProfit: locNetProfit, salesCount: locSales.length,
        stockValue: displayCurrency === 'USD' ? stockValueUSD : stockValueUSD * rate,
        avgTransaction: locSales.length > 0 ? revenue / locSales.length : 0,
      }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [locations, filteredSales, filteredExpenses, filteredCommissions, stocks, items, saleAmountInDisplay, saleProfitUSD, profitInDisplay, expenseInDisplay, commissionInDisplay, displayCurrency, rate])

  // ─── Seller Performance ───
  const sellerPerformance = useMemo(() => {
    return sellers.map(seller => {
      const sellerSales = filteredSales.filter(s => s.seller_id === seller.id)
      const sellerComms = filteredCommissions.filter(c => c.seller_id === seller.id)
      const revenue = sellerSales.reduce((s, sale) => s + saleAmountInDisplay(sale), 0)
      const commissionsTotal = sellerComms.reduce((s, c) => s + commissionInDisplay(c), 0)
      const locationName = locations.find(l => l.id === seller.location_id)?.name || '—'
      return {
        id: seller.id, name: seller.name, locationName, revenue,
        salesCount: sellerSales.length, commissions: commissionsTotal,
        commissionRate: seller.commission_rate,
      }
    }).filter(s => s.salesCount > 0).sort((a, b) => b.revenue - a.revenue)
  }, [sellers, filteredSales, filteredCommissions, locations, saleAmountInDisplay, commissionInDisplay])

  // ─── Payment Methods ───
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>()
    filteredSales.forEach(sale => {
      const method = sale.payment_method || 'Unknown'
      const amt = saleAmountInDisplay(sale)
      const existing = map.get(method)
      if (existing) { existing.count += 1; existing.amount += amt }
      else map.set(method, { count: 1, amount: amt })
    })
    return Array.from(map.entries())
      .map(([method, data]) => ({ method, ...data, pct: salesCount > 0 ? (data.count / salesCount) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [filteredSales, saleAmountInDisplay, salesCount])

  // ─── Wallet Balances ───
  const walletSummary = useMemo(() => {
    let totalUSD = 0; let totalSRD = 0
    visibleWallets.forEach(w => {
      if (w.currency === 'USD') totalUSD += w.balance
      else totalSRD += w.balance
    })
    const totalInDisplay = displayCurrency === 'USD'
      ? totalUSD + totalSRD / rate
      : totalSRD + totalUSD * rate
    return { totalUSD, totalSRD, totalInDisplay, count: visibleWallets.length }
  }, [visibleWallets, displayCurrency, rate])

  // ─── Reservations ───
  const reservationSummary = useMemo(() => {
    let pendingRevenue = 0
    activeReservations.forEach(r => {
      const item = items.find(i => i.id === r.item_id)
      if (item) {
        let price = 0
        if (r.combo_price) {
          price = r.combo_price
        } else if (item.selling_price_usd && displayCurrency === 'USD') {
          price = toNum(item.selling_price_usd) * r.quantity
        } else if (item.selling_price_srd && displayCurrency === 'SRD') {
          price = toNum(item.selling_price_srd) * r.quantity
        } else if (item.selling_price_usd) {
          price = displayCurrency === 'SRD' ? toNum(item.selling_price_usd) * rate * r.quantity : toNum(item.selling_price_usd) * r.quantity
        }
        pendingRevenue += price
      }
    })
    const completedCount = reservations.filter(r => r.status === 'completed').length
    const totalCount = reservations.length
    const conversionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
    return { pendingRevenue, activeCount: activeReservations.length, conversionRate }
  }, [activeReservations, reservations, items, displayCurrency, rate])

  // ─── Inventory Analysis ───
  const inventoryAnalysis = useMemo(() => {
    let stockValueUSD = 0; let potentialRevenueDisplay = 0
    let totalUnits = 0; let itemCount = 0; let excludedCount = 0

    stocks.forEach(stock => {
      const item = items.find(i => i.id === stock.item_id)
      if (!item) return
      // Exclude items with price <= 200 (in display currency)
      if (excludeLowValueItems) {
        let itemPrice = 0
        if (displayCurrency === 'USD') {
          itemPrice = item.selling_price_usd ? toNum(item.selling_price_usd) : (item.selling_price_srd ? toNum(item.selling_price_srd) / rate : 0)
        } else {
          itemPrice = item.selling_price_srd ? toNum(item.selling_price_srd) : (item.selling_price_usd ? toNum(item.selling_price_usd) * rate : 0)
        }
        if (itemPrice <= 200) {
          excludedCount++
          return
        }
      }
      totalUnits += stock.quantity
      itemCount++
      if (item.purchase_price_usd) stockValueUSD += toNum(item.purchase_price_usd) * stock.quantity
      // Use only the relevant display currency price (fix double-counting)
      if (displayCurrency === 'USD') {
        if (item.selling_price_usd) potentialRevenueDisplay += toNum(item.selling_price_usd) * stock.quantity
        else if (item.selling_price_srd) potentialRevenueDisplay += toNum(item.selling_price_srd) / rate * stock.quantity
      } else {
        if (item.selling_price_srd) potentialRevenueDisplay += toNum(item.selling_price_srd) * stock.quantity
        else if (item.selling_price_usd) potentialRevenueDisplay += toNum(item.selling_price_usd) * rate * stock.quantity
      }
    })

    const stockValueDisplay = displayCurrency === 'USD' ? stockValueUSD : stockValueUSD * rate
    const potentialProfit = potentialRevenueDisplay - stockValueDisplay
    const soldQuantity = filteredSales.reduce((sum, sale) =>
      sum + (sale.sale_items?.reduce((s, si) => s + si.quantity, 0) || 0), 0)
    const daysInPeriod = Math.max(1, Math.ceil((activeBounds.end.getTime() - activeBounds.start.getTime()) / 86400000))
    const dailySalesRate = soldQuantity / daysInPeriod
    const daysOfInventory = dailySalesRate > 0 ? Math.round(totalUnits / dailySalesRate) : null

    return {
      stockValueDisplay, potentialRevenueDisplay, potentialProfit,
      totalUnits, itemCount, excludedCount,
      soldQuantity, daysOfInventory,
      profitMarginPct: stockValueDisplay > 0 ? (potentialProfit / stockValueDisplay) * 100 : 0,
      markupPct: stockValueDisplay > 0 ? (potentialRevenueDisplay / stockValueDisplay) * 100 : 0,
    }
  }, [stocks, items, displayCurrency, rate, excludeLowValueItems, filteredSales, activeBounds])

  const walletActivity = useMemo(() => summarizeWalletActivity(filteredWalletTransactions), [filteredWalletTransactions, summarizeWalletActivity])
  const prevWalletActivity = useMemo(() => summarizeWalletActivity(prevWalletTransactions), [prevWalletTransactions, summarizeWalletActivity])

  const purchaseCapitalDeployed = useMemo(() => filteredPurchaseOrders
    .filter(order => order.status !== 'cancelled')
    .reduce((sum, order) => sum + purchaseOrderTotalInDisplay(order), 0),
  [filteredPurchaseOrders, purchaseOrderTotalInDisplay])

  const prevPurchaseCapitalDeployed = useMemo(() => prevPurchaseOrders
    .filter(order => order.status !== 'cancelled')
    .reduce((sum, order) => sum + purchaseOrderTotalInDisplay(order), 0),
  [prevPurchaseOrders, purchaseOrderTotalInDisplay])

  const openPurchaseCommitment = useMemo(() => relevantPurchaseOrders
    .filter(order => order.status !== 'cancelled')
    .reduce((sum, order) => sum + purchaseOrderRemainingInDisplay(order), 0),
  [relevantPurchaseOrders, purchaseOrderRemainingInDisplay])

  const totalAssetPosition = walletSummary.totalInDisplay + inventoryAnalysis.stockValueDisplay + openPurchaseCommitment
  const liquidAssetShare = totalAssetPosition > 0 ? (walletSummary.totalInDisplay / totalAssetPosition) * 100 : 0
  const stockAssetShare = totalAssetPosition > 0 ? (inventoryAnalysis.stockValueDisplay / totalAssetPosition) * 100 : 0
  const committedAssetShare = totalAssetPosition > 0 ? (openPurchaseCommitment / totalAssetPosition) * 100 : 0

  const realizedCogs = totalRevenue - totalGrossProfit
  const prevRealizedCogs = prevRevenue - prevGrossProfit

  const walletLinkedSales = useMemo(() => filteredSales
    .filter(sale => sale.wallet_id && visibleWalletIds.has(sale.wallet_id))
    .reduce((sum, sale) => sum + saleAmountInDisplay(sale), 0),
  [filteredSales, visibleWalletIds, saleAmountInDisplay])

  const walletLinkedExpenses = useMemo(() => filteredExpenses
    .filter(expense => expense.wallet_id && visibleWalletIds.has(expense.wallet_id))
    .reduce((sum, expense) => sum + expenseInDisplay(expense), 0),
  [filteredExpenses, visibleWalletIds, expenseInDisplay])

  const unmappedRevenue = totalRevenue - walletLinkedSales
  const salesCreditGap = walletActivity.salesCredits - walletLinkedSales
  const expenseDebitGap = walletActivity.expenseDebits - walletLinkedExpenses
  const currentOpenOrderCount = relevantPurchaseOrders.filter(order => order.status !== 'received' && order.status !== 'cancelled').length
  const assetCreationSignal = netProfit
  const previousAssetCreationSignal = prevNetProfit

  const financialHealthScore = useMemo<FinancialHealthScore>(() => {
    const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

    const profitability = totalRevenue <= 0
      ? 0
      : clampScore(((netMarginPct + 15) * 3.5) + (netProfit > 0 ? 5 : 0))

    const liquidityBase = totalExpensesAmt + totalCommissionsAmt + (openPurchaseCommitment * 0.5)
    const liquidityCoverage = walletSummary.totalInDisplay / Math.max(1, liquidityBase)
    const liquidity = clampScore((liquidityCoverage * 75) + (walletActivity.netChange >= 0 ? 5 : 0))

    const reconciliationExposure = Math.abs(salesCreditGap) + Math.abs(expenseDebitGap) + Math.abs(unmappedRevenue)
    const reconciliationBase = Math.max(totalRevenue, walletLinkedSales, walletLinkedExpenses, 1)
    const reconciliation = clampScore(100 - ((reconciliationExposure / reconciliationBase) * 120))

    let inventory = 70
    if (inventoryAnalysis.daysOfInventory === null) inventory = 55
    else if (inventoryAnalysis.daysOfInventory <= 60) inventory = 90
    else if (inventoryAnalysis.daysOfInventory <= 120) inventory = 78
    else if (inventoryAnalysis.daysOfInventory <= 180) inventory = 65
    else if (inventoryAnalysis.daysOfInventory <= 365) inventory = 45
    else inventory = 30

    if (openPurchaseCommitment > walletSummary.totalInDisplay && walletSummary.totalInDisplay > 0) {
      inventory -= 10
    }
    if (inventoryAnalysis.potentialProfit < 0) {
      inventory -= 15
    }
    inventory = clampScore(inventory)

    const score = clampScore(
      (profitability * 0.35) +
      (liquidity * 0.25) +
      (reconciliation * 0.25) +
      (inventory * 0.15)
    )

    const weakestArea = [
      { key: 'profitability', value: profitability },
      { key: 'liquidity', value: liquidity },
      { key: 'reconciliation', value: reconciliation },
      { key: 'inventory', value: inventory },
    ].sort((left, right) => left.value - right.value)[0]?.key

    if (score >= 85) {
      return {
        score,
        label: 'Strong',
        tone: 'emerald',
        summary: 'Profitability, cash cover, and reconciliation are working together well.',
        profitability,
        liquidity,
        reconciliation,
        inventory,
        liquidityCoverage,
      }
    }

    if (score >= 70) {
      return {
        score,
        label: 'Healthy',
        tone: 'blue',
        summary: weakestArea === 'liquidity'
          ? 'Business health is solid, but liquid cash cover should be watched more closely.'
          : 'The business is in decent shape, with one weaker area worth tightening.',
        profitability,
        liquidity,
        reconciliation,
        inventory,
        liquidityCoverage,
      }
    }

    if (score >= 55) {
      return {
        score,
        label: 'Watch',
        tone: 'amber',
        summary: weakestArea === 'reconciliation'
          ? 'Wallet gaps are making the picture noisy. Clean reconciliation will improve trust in the report.'
          : weakestArea === 'profitability'
            ? 'Sales are coming in, but too little is turning into net profit.'
            : weakestArea === 'inventory'
              ? 'Inventory pressure is heavier than ideal relative to movement and cash.'
              : 'Cash cover is tighter than ideal against current commitments.',
        profitability,
        liquidity,
        reconciliation,
        inventory,
        liquidityCoverage,
      }
    }

    return {
      score,
      label: 'At Risk',
      tone: 'red',
      summary: weakestArea === 'profitability'
        ? 'The business is not converting revenue into enough profit.'
        : weakestArea === 'reconciliation'
          ? 'Too many wallet mismatches make the financial picture unreliable.'
          : weakestArea === 'inventory'
            ? 'Too much value is tied up in stock or orders relative to the current pace.'
            : 'Liquidity is under pressure relative to expenses and purchase commitments.',
      profitability,
      liquidity,
      reconciliation,
      inventory,
      liquidityCoverage,
    }
  }, [
    expenseDebitGap,
    inventoryAnalysis.daysOfInventory,
    inventoryAnalysis.potentialProfit,
    netMarginPct,
    netProfit,
    openPurchaseCommitment,
    salesCreditGap,
    totalCommissionsAmt,
    totalExpensesAmt,
    totalRevenue,
    unmappedRevenue,
    walletActivity.netChange,
    walletLinkedExpenses,
    walletLinkedSales,
    walletSummary.totalInDisplay,
  ])

  // ─── Monthly Sales History ───
  const monthlySalesHistory = useMemo(() => {
    const monthlyData = new Map<string, MonthlySales>()
    allSales.forEach(sale => {
      const d = new Date(sale.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      if (!monthlyData.has(key)) {
        monthlyData.set(key, { month: monthName, monthKey: key, year: d.getFullYear(), totalSales: 0, totalProfit: 0, totalExpenses: 0, salesCount: 0 })
      }
      const data = monthlyData.get(key)!
      data.totalSales += saleAmountInDisplay(sale)
      data.totalProfit += profitInDisplay(saleProfitUSD(sale))
      data.salesCount += 1
    })
    allExpenses.forEach(e => {
      const d = new Date(e.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const data = monthlyData.get(key)
      if (data) data.totalExpenses += expenseInDisplay(e)
    })
    return Array.from(monthlyData.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey)).slice(0, 12)
  }, [allSales, allExpenses, saleAmountInDisplay, saleProfitUSD, profitInDisplay, expenseInDisplay])

  // ─── Month-End Projection ───
  const projection = useMemo(() => {
    if (!isCurrentTab || period !== 'monthly') return null
    const today = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    if (today < 1) return null
    const dailyAvgRevenue = totalRevenue / today
    const dailyAvgNetProfit = netProfit / today
    return {
      projectedRevenue: dailyAvgRevenue * daysInMonth,
      projectedNetProfit: dailyAvgNetProfit * daysInMonth,
      daysElapsed: today,
      daysInMonth,
    }
  }, [isCurrentTab, period, now, totalRevenue, netProfit])

  const hasLoadedData = allSales.length > 0 || items.length > 0 || locations.length > 0 || allExpenses.length > 0 || wallets.length > 0 || walletTransactions.length > 0 || purchaseOrders.length > 0

  // ─── Loading ───
  if (loading) {
    return (
      <div className="min-h-screen bg-(--background) pb-20">
        <PageHeader
          title="Reports & Insights"
          subtitle="Loading financial data..."
          icon={<BarChart3 className="w-6 h-6" />}
          action={
            <button
              type="button"
              disabled
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground opacity-70"
            >
              Syncing...
            </button>
          }
        />
        <div className="px-3 sm:px-4 lg:px-6 pt-4 sm:pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card-premium animate-pulse">
                <div className="h-4 w-24 bg-muted rounded mb-3" />
                <div className="h-8 w-32 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!hasLoadedData && loadError) {
    return (
      <div className="min-h-screen bg-(--background) pb-20">
        <PageHeader
          title="Reports & Insights"
          subtitle="Financial reporting is temporarily unavailable"
          icon={<BarChart3 className="w-6 h-6" />}
          action={
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
            >
              Retry
            </button>
          }
        />
        <div className="px-3 sm:px-4 lg:px-6 pt-4 sm:pt-6">
          <div className="card-premium border border-red-500/20 bg-red-500/5 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-500/10 p-2 text-red-500">
                <BarChart3 size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Report data could not be loaded</h2>
                <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  The page now loads through a single protected API request. Retrying will re-fetch the full report dataset without leaving the page.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render helpers ───
  const TrendBadge = ({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) => {
    const change = pctChange(current, previous)
    if (change === null) return null
    const isPositive = invert ? change < 0 : change >= 0
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${isPositive ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
        {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {formatPct(change)}
      </span>
    )
  }

  const SectionHeader = ({ title, icon, sectionKey, badge }: { title: string; icon: React.ReactNode; sectionKey: string; badge?: string }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between p-4 hover:bg-muted/30 rounded-xl transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[hsl(var(--primary-muted))] flex items-center justify-center">
          <div className="text-primary">{icon}</div>
        </div>
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        {badge && <Badge variant="orange">{badge}</Badge>}
      </div>
      {expandedSections[sectionKey] ? <ChevronUp size={20} className="text-muted-foreground" /> : <ChevronDown size={20} className="text-muted-foreground" />}
    </button>
  )

  return (
    <div className="min-h-screen bg-(--background) pb-20">
      <PageHeader
        title="Reports & Insights"
        subtitle="Comprehensive financial analytics and performance metrics"
        icon={<BarChart3 className="w-6 h-6" />}
        action={
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            Refresh Data
          </button>
        }
      />

      <div className="px-3 sm:px-4 lg:px-6 pt-4 sm:pt-6 space-y-3 sm:space-y-5">
        {loadError && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Report sync warning:</span> {loadError}
          </div>
        )}

        {/* ─── Tab Switcher ─── */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex gap-1 p-1.5 bg-card rounded-2xl shadow-sm border border-border">
            <button
              onClick={() => setActiveTab('current')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-3 sm:py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'current'
                  ? 'bg-linear-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg shadow-orange-500/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Activity size={16} />
              Current Period
            </button>
            <button
              onClick={() => setActiveTab('historical')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-3 sm:py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'historical'
                  ? 'bg-linear-to-r from-purple-500 via-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <History size={16} />
              Historical Analysis
            </button>
          </div>
        </div>

        {/* ─── Filters ─── */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {isCurrentTab ? (
            <div className="flex gap-1 overflow-x-auto p-1.5 bg-card rounded-2xl shadow-sm border border-border scrollbar-thin">
              {(['daily', 'weekly', 'monthly', 'yearly'] as PeriodType[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} className={`px-4 sm:px-5 py-3 sm:py-2.5 rounded-xl font-semibold whitespace-nowrap text-sm transition-all duration-200 ${
                  period === p ? 'bg-linear-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg shadow-orange-500/25' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 p-3 sm:p-2 bg-card rounded-2xl shadow-sm border border-border">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs text-muted-foreground font-medium whitespace-nowrap">From</label>
                <input type="date" value={histStart} onChange={e => setHistStart(e.target.value)}
                  className="flex-1 px-3 py-2.5 sm:py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs text-muted-foreground font-medium whitespace-nowrap">To</label>
                <input type="date" value={histEnd} onChange={e => setHistEnd(e.target.value)}
                  className="flex-1 px-3 py-2.5 sm:py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          )}
          <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}
            className="w-full sm:flex-1 px-4 py-3.5 sm:py-3 border border-border rounded-xl text-body bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm cursor-pointer">
            <option value="">All Locations</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between rounded-2xl border border-border bg-card p-3 sm:p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Exports</p>
            <p className="text-xs text-muted-foreground mt-1">Download organized monthly or yearly PDF reports with sales totals, item performance, payment mix and location breakdowns.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
            <button
              type="button"
              onClick={() => downloadReport('monthly')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
            >
              <Download size={16} />
              Export Month PDF
            </button>
            <button
              type="button"
              onClick={() => downloadReport('yearly')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
            >
              <Download size={16} />
              Export Year PDF
            </button>
          </div>
        </div>

        {/* Period indicator */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Calendar size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">
              Showing data for:{' '}
              <span className="font-semibold text-foreground">
                {isCurrentTab ? periodLabel(period) : `${histStart} to ${histEnd}`}
              </span>
              {isCurrentTab && (
                <span className="text-muted-foreground ml-1">
                  ({activeBounds.start.toLocaleDateString()} – {now.toLocaleDateString()})
                </span>
              )}
            </span>
          </div>
          <button
            onClick={async () => {
              const next = !showDebugInfo
              setShowDebugInfo(next)
              if (next && !deepDebugData) {
                setDeepDebugLoading(true)
                setDeepDebugError(null)
                try {
                  const start = activeBounds.start.toISOString().slice(0, 10)
                  const end = activeBounds.end.toISOString().slice(0, 10)
                  const res = await fetch(`/api/debug-profit?start=${start}&end=${end}`)
                  if (!res.ok) throw new Error(await res.text())
                  setDeepDebugData(await res.json())
                } catch (err: any) {
                  setDeepDebugError(err.message)
                } finally {
                  setDeepDebugLoading(false)
                }
              }
            }}
            className="text-xs px-3 py-2 sm:py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors whitespace-nowrap"
          >
            {showDebugInfo ? 'Hide' : 'Show'} Debug Info
          </button>
        </div>

        {/* Debug Info Section */}
        {showDebugInfo && (
          <div className="space-y-3">
            {/* Quick summary panel */}
            <div className="card-premium bg-yellow-500/5 border-yellow-500/20">
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={16} className="text-yellow-600" />
                  <h3 className="font-bold text-foreground">Calculation Debug Info</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-xs font-mono">
                  <div className="space-y-2">
                    <div className="font-bold text-blue-600">SALES DATA</div>
                    <div>• Total Sales: {filteredSales.length}</div>
                    <div>• Total Revenue: {formatCurrency(totalRevenue, displayCurrency)}</div>
                    <div>• Gross Profit: {formatCurrency(totalGrossProfit, displayCurrency)}</div>
                    <div>• Avg Transaction: {formatCurrency(avgTransactionValue, displayCurrency)}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-bold text-red-600">EXPENSES DATA</div>
                    <div>• Total Expenses (raw): {filteredExpenses.length} items</div>
                    <div>• Excluded (inventory): {filteredExpenses.filter(e => excludeInventoryExpenses && isInventoryExpense(e)).length} items</div>
                    <div>• Included in calc: {filteredExpenses.filter(e => !excludeInventoryExpenses || !isInventoryExpense(e)).length} items</div>
                    <div>• Operating Expenses: {formatCurrency(totalExpensesAmt, displayCurrency)}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-bold text-orange-600">COMMISSIONS DATA</div>
                    <div>• Total Commissions: {filteredCommissions.length} payments</div>
                    <div>• Commission Amount: {formatCurrency(totalCommissionsAmt, displayCurrency)}</div>
                    <div>• As % of Revenue: {totalRevenue > 0 ? ((totalCommissionsAmt / totalRevenue) * 100).toFixed(1) : '0'}%</div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-bold text-emerald-600">NET PROFIT CALC</div>
                    <div>• Gross Profit: {formatCurrency(totalGrossProfit, displayCurrency)}</div>
                    <div>• - Operating Exp: {formatCurrency(totalExpensesAmt, displayCurrency)}</div>
                    <div>• - Commissions: {formatCurrency(totalCommissionsAmt, displayCurrency)}</div>
                    <div className="pt-1 border-t border-yellow-500/20">
                      <strong>= Net Profit: {formatCurrency(netProfit, displayCurrency)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Deep diagnostic panel (server-side Prisma data) */}
            <div className="card-premium bg-blue-500/5 border-blue-500/20">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-blue-500" />
                    <h3 className="font-bold text-foreground">Deep Profit Diagnosis (Server)</h3>
                    <span className="text-xs text-muted-foreground">reads database directly, bypasses RLS</span>
                  </div>
                  <button
                    onClick={async () => {
                      setDeepDebugLoading(true)
                      setDeepDebugError(null)
                      try {
                        const start = activeBounds.start.toISOString().slice(0, 10)
                        const end = activeBounds.end.toISOString().slice(0, 10)
                        const res = await fetch(`/api/debug-profit?start=${start}&end=${end}`)
                        if (!res.ok) throw new Error(await res.text())
                        setDeepDebugData(await res.json())
                      } catch (err: any) {
                        setDeepDebugError(err.message)
                      } finally {
                        setDeepDebugLoading(false)
                      }
                    }}
                    className="text-xs px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
                  >
                    {deepDebugLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>

                {deepDebugError && (
                  <div className="text-xs text-red-500 bg-red-500/10 rounded p-2">{deepDebugError}</div>
                )}

                {deepDebugLoading && (
                  <div className="text-xs text-muted-foreground animate-pulse">Fetching server data…</div>
                )}

                {deepDebugData && !deepDebugLoading && (
                  <div className="space-y-4 text-xs font-mono">

                    {/* Missing sale items — highest priority alert */}
                    {deepDebugData.summary.issueCount.missingSaleItems > 0 && (
                      <div className="bg-red-600/15 border-2 border-red-500/50 rounded p-3 space-y-2">
                        <div className="font-bold text-red-400 text-sm">
                          🚨 {deepDebugData.summary.issueCount.missingSaleItems} SALE(S) HAVE NO ITEMS RECORDED
                        </div>
                        <div className="text-red-300 text-xs leading-relaxed">
                          These sales were saved to the database but their line items (sale_items) were never stored — likely a network or permission error during checkout.
                          Revenue and profit from these sales are invisible to the report. <strong className="text-white">FIX: Go to Sales page → find the sale → click Undo → re-record it.</strong>
                        </div>
                        <div className="space-y-1 pt-1 border-t border-red-500/20">
                          {deepDebugData.summary.salesMissingItems.map((s: any) => (
                            <div key={s.saleId} className="flex justify-between text-red-300">
                              <span>{new Date(s.date).toLocaleString()} · {s.locationName} · {s.currency}</span>
                              <span className="text-white font-bold">
                                Recorded total: {s.currency} {s.recordedTotal.toFixed(2)} (${s.recordedTotalUSD.toFixed(2)} USD) — MISSING FROM REPORT
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other issues */}
                    {deepDebugData.summary.salesWithIssues > 0 && (
                      deepDebugData.summary.issueCount.deletedItems > 0 ||
                      deepDebugData.summary.issueCount.noCOGS > 0 ||
                      deepDebugData.summary.issueCount.noCategory > 0
                    ) && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded p-3 space-y-1">
                        <div className="font-bold text-red-400">⚠ ITEM DATA ISSUES</div>
                        {deepDebugData.summary.issueCount.deletedItems > 0 && (
                          <div className="text-red-300">• {deepDebugData.summary.issueCount.deletedItems} line item(s) reference deleted items — profit lost</div>
                        )}
                        {deepDebugData.summary.issueCount.noCOGS > 0 && (
                          <div className="text-yellow-300">• {deepDebugData.summary.issueCount.noCOGS} line item(s) have purchase_price_usd = $0 — profit overstated</div>
                        )}
                        {deepDebugData.summary.issueCount.noCategory > 0 && (
                          <div className="text-orange-300">• {deepDebugData.summary.issueCount.noCategory} line item(s) have no category — won't appear in Category Performance</div>
                        )}
                      </div>
                    )}

                    {deepDebugData.summary.salesWithIssues === 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3 text-emerald-400">
                        ✓ No data issues found. All items have costs and categories.
                      </div>
                    )}

                    {/* Server summary vs client */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/30 rounded p-2 space-y-1">
                        <div className="font-bold text-blue-400">SERVER (DB direct)</div>
                        <div>Revenue: ${deepDebugData.summary.totalRevenueUSD.toFixed(2)} USD</div>
                        <div>Gross Profit: ${deepDebugData.summary.totalProfitUSD.toFixed(2)} USD</div>
                        <div>Margin: {deepDebugData.summary.grossMarginPct.toFixed(1)}%</div>
                        <div>Sales: {deepDebugData.summary.totalSales}</div>
                      </div>
                      <div className="bg-muted/30 rounded p-2 space-y-1">
                        <div className="font-bold text-green-400">CLIENT (this page)</div>
                        <div>Revenue: ${(totalRevenue / (displayCurrency === 'SRD' ? rate : 1)).toFixed(2)} USD</div>
                        <div>Gross Profit: ${(totalGrossProfit / (displayCurrency === 'SRD' ? rate : 1)).toFixed(2)} USD</div>
                        <div>Margin: {grossMarginPct.toFixed(1)}%</div>
                        <div>Sales: {filteredSales.length}</div>
                      </div>
                    </div>

                    {/* Category breakdown from server */}
                    <div>
                      <div className="font-bold text-purple-400 mb-2">CATEGORY BREAKDOWN (server)</div>
                      <div className="space-y-1">
                        {deepDebugData.categoryBreakdown.map((cat: any) => (
                          <div key={cat.name} className="flex justify-between bg-muted/20 rounded px-2 py-1">
                            <span className={cat.name === 'Uncategorized' || cat.name === '[deleted]' ? 'text-red-400' : 'text-foreground'}>
                              {cat.name}
                            </span>
                            <span className="text-muted-foreground">
                              Rev: ${cat.revenueUSD.toFixed(2)} &nbsp;|&nbsp;
                              Profit: <span className={cat.profitUSD < 0 ? 'text-red-400' : 'text-emerald-400'}>${cat.profitUSD.toFixed(2)}</span> &nbsp;({cat.marginPct.toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-sale breakdown */}
                    <div>
                      <div className="font-bold text-orange-400 mb-2">PER-SALE BREAKDOWN</div>
                      <div className="space-y-3">
                        {deepDebugData.sales.map((sale: any) => (
                          <div key={sale.saleId} className={`rounded border p-2 space-y-1 ${
                            sale.missingItems ? 'border-red-600/60 bg-red-600/10' :
                            sale.issues.length > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-border/30 bg-muted/10'
                          }`}>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                {new Date(sale.date).toLocaleString()} · {sale.locationName} · {sale.currency}
                              </span>
                              <span>
                                {sale.missingItems
                                  ? <span className="text-red-400 font-bold">Recorded: {sale.currency} {sale.totalAmount.toFixed(2)} — NO ITEMS IN DB</span>
                                  : <>Rev: ${sale.totalRevenueUSD.toFixed(2)} · Profit:{' '}
                                    <span className={sale.totalProfitUSD < 0 ? 'text-red-400' : 'text-emerald-400'}>
                                      ${sale.totalProfitUSD.toFixed(2)}
                                    </span>{' '}({sale.grossMarginPct.toFixed(0)}%)</>
                                }
                              </span>
                            </div>
                            {sale.issues.length > 0 && (
                              <div className="text-red-400">
                                Issues: {sale.issues.map((iss: any) => `${iss.item} → ${iss.issue}`).join(', ')}
                              </div>
                            )}
                            <div className="pl-2 space-y-0.5">
                              {sale.items.map((si: any, idx: number) => (
                                <div key={idx} className={`flex justify-between ${
                                  si.issue === 'ITEM_DELETED' ? 'text-red-400' :
                                  si.issue === 'NO_COGS' ? 'text-yellow-400' :
                                  si.issue === 'NO_CATEGORY' ? 'text-orange-400' : 'text-muted-foreground'
                                }`}>
                                  <span>↳ {si.itemName} ×{si.quantity} [{si.categoryName}]</span>
                                  <span>
                                    cost: ${si.costUSD !== null ? si.costUSD.toFixed(2) : '?'} · profit:{' '}
                                    {si.profitUSD !== null ? `$${si.profitUSD.toFixed(2)}` : '?'}
                                    {si.issue && <span className="ml-1 text-red-400">({si.issue})</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ KEY METRICS ═══════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Revenue */}
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-blue-500/10 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground font-medium">Revenue</span>
                </div>
                {isCurrentTab && <TrendBadge current={totalRevenue} previous={prevRevenue} />}
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight mt-1">{formatCurrency(totalRevenue, displayCurrency)}</div>
              <div className="text-xs text-muted-foreground mt-1">{salesCount} sales</div>
            </div>
          </div>

          {/* Gross Profit */}
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-green-500/10 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br from-green-500/10 to-green-600/10 border border-green-500/20 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground font-medium">Gross Profit</span>
                </div>
                {isCurrentTab && <TrendBadge current={totalGrossProfit} previous={prevGrossProfit} />}
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight mt-1">{formatCurrency(totalGrossProfit, displayCurrency)}</div>
              <div className="text-xs text-muted-foreground mt-1">{grossMarginPct.toFixed(1)}% margin</div>
            </div>
          </div>

          {/* Net Profit */}
          <div className="card-premium group relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-linear-to-br ${netProfit >= 0 ? 'from-emerald-500/10' : 'from-red-500/10'} to-transparent blur-2xl`} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br ${netProfit >= 0 ? 'from-emerald-500/10 to-emerald-600/10 border-emerald-500/20' : 'from-red-500/10 to-red-600/10 border-red-500/20'} border flex items-center justify-center`}>
                    <Target className={`w-4 h-4 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground font-medium">Net Profit</span>
                </div>
                {isCurrentTab && <TrendBadge current={netProfit} previous={prevNetProfit} />}
              </div>
              <div className={`text-lg sm:text-xl font-bold tracking-tight mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(netProfit, displayCurrency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{netMarginPct.toFixed(1)}% net margin</div>
            </div>
          </div>

          {/* Expenses */}
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-red-500/10 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br from-red-500/10 to-red-600/10 border border-red-500/20 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-red-600" />
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground font-medium">Expenses</span>
                </div>
                {isCurrentTab && <TrendBadge current={totalExpensesAmt} previous={prevExpensesAmt} invert />}
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight mt-1 text-red-600">{formatCurrency(totalExpensesAmt, displayCurrency)}</div>
              <div className="text-xs text-muted-foreground mt-1">{expenseRatio.toFixed(1)}% of revenue</div>
            </div>
          </div>

          {/* Commissions */}
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-orange-500/10 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br from-orange-500/10 to-orange-600/10 border border-orange-500/20 flex items-center justify-center">
                  <Users className="w-4 h-4 text-orange-600" />
                </div>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium">Commissions</span>
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight mt-1 text-orange-600">{formatCurrency(totalCommissionsAmt, displayCurrency)}</div>
              <div className="text-xs text-muted-foreground mt-1">{filteredCommissions.length} payments</div>
            </div>
          </div>

          {/* Avg Transaction */}
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-purple-500/10 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/20 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium">Avg Transaction</span>
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight mt-1">{formatCurrency(avgTransactionValue, displayCurrency)}</div>
              <div className="text-xs text-muted-foreground mt-1">{salesCount} transactions</div>
            </div>
          </div>

          {/* Combos */}
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-pink-500/10 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br from-pink-500/10 to-pink-600/10 border border-pink-500/20 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-pink-600" />
                </div>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium">Combos Sold</span>
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight mt-1">{comboStats.totalCombos}</div>
              <div className="text-xs text-muted-foreground mt-1">{formatCurrency(comboStats.totalComboRevenue, displayCurrency)} revenue</div>
            </div>
          </div>

          {/* Wallet Balance */}
          <div className="card-premium group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-cyan-500/10 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-linear-to-br from-cyan-500/10 to-cyan-600/10 border border-cyan-500/20 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-cyan-600" />
                </div>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium">Wallet Balance</span>
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight mt-1">{formatCurrency(walletSummary.totalInDisplay, displayCurrency)}</div>
              <div className="text-xs text-muted-foreground mt-1">{walletSummary.count} wallets</div>
            </div>
          </div>
        </div>

        {/* ═══════════════ FINANCIAL SUMMARY ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title={isCurrentTab ? `${periodLabel(period)} Financial Summary` : 'Period Financial Summary'} icon={<BookOpen size={20} />} sectionKey="financial" />
          {expandedSections.financial && (
            <div className="px-4 pb-4 space-y-4">
              {/* P&L Flow */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 sm:gap-3 items-center">
                <div className="rounded-xl p-3 sm:p-4 bg-linear-to-br from-blue-500/10 to-transparent border border-blue-500/20 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Revenue</div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-600">{formatCurrency(totalRevenue, displayCurrency)}</div>
                </div>
                <div className="hidden md:flex items-center justify-center"><ArrowRight size={20} className="text-muted-foreground" /></div>
                <div className="rounded-xl p-4 bg-linear-to-br from-green-500/10 to-transparent border border-green-500/20 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Gross Profit</div>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(totalGrossProfit, displayCurrency)}</div>
                  <div className="text-xs text-muted-foreground">{grossMarginPct.toFixed(1)}% margin</div>
                </div>
                <div className="hidden md:flex items-center justify-center"><ArrowRight size={20} className="text-muted-foreground" /></div>
                <div className={`rounded-xl p-4 bg-linear-to-br ${netProfit >= 0 ? 'from-emerald-500/10 border-emerald-500/20' : 'from-red-500/10 border-red-500/20'} to-transparent border text-center`}>
                  <div className="text-xs text-muted-foreground mb-1">Net Profit</div>
                  <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(netProfit, displayCurrency)}</div>
                  <div className="text-xs text-muted-foreground">{netMarginPct.toFixed(1)}% net margin</div>
                </div>
              </div>

              {/* Deductions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
                <div className="p-3 sm:p-4 bg-linear-to-r from-red-500/10 to-transparent rounded-xl border border-red-500/20">
                  <div className="text-xs text-muted-foreground mb-1">Operating Expenses</div>
                  <div className="text-lg sm:text-xl font-bold text-red-600">{formatCurrency(totalExpensesAmt, displayCurrency)}</div>
                  <div className="text-xs text-muted-foreground">{expensesByCategory.included.length} categories</div>
                </div>
                <div className="p-4 bg-linear-to-r from-orange-500/10 to-transparent rounded-xl border border-orange-500/20">
                  <div className="text-xs text-muted-foreground mb-1">Commissions</div>
                  <div className="text-xl font-bold text-orange-600">{formatCurrency(totalCommissionsAmt, displayCurrency)}</div>
                  <div className="text-xs text-muted-foreground">{filteredCommissions.length} payments</div>
                </div>
                <div className="p-4 bg-linear-to-r from-purple-500/10 to-transparent rounded-xl border border-purple-500/20">
                  <div className="text-xs text-muted-foreground mb-1">Total Obligations</div>
                  <div className="text-xl font-bold text-purple-600">{formatCurrency(totalExpensesAmt + totalCommissionsAmt, displayCurrency)}</div>
                  <div className="text-xs text-muted-foreground">
                    {totalRevenue > 0 ? ((totalExpensesAmt + totalCommissionsAmt) / totalRevenue * 100).toFixed(1) : '0.0'}% of revenue
                  </div>
                </div>
              </div>

              {/* Projection (monthly only) */}
              {projection && (
                <div className="p-3 sm:p-4 bg-linear-to-r from-indigo-500/10 to-transparent rounded-xl border border-indigo-500/20">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Target size={16} className="text-indigo-600" />
                      <span className="text-sm font-bold text-foreground">Month-End Projection</span>
                    </div>
                    <span className="text-xs text-muted-foreground">({projection.daysElapsed} of {projection.daysInMonth} days)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Projected Revenue</div>
                      <div className="text-base sm:text-lg font-bold text-indigo-600">{formatCurrency(projection.projectedRevenue, displayCurrency)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Projected Net Profit</div>
                      <div className={`text-base sm:text-lg font-bold ${projection.projectedNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(projection.projectedNetProfit, displayCurrency)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-linear-to-r from-indigo-500 to-indigo-600 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (projection.daysElapsed / projection.daysInMonth) * 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Pending Reservations */}
              {reservationSummary.activeCount > 0 && (
                <div className="p-3 sm:p-4 bg-linear-to-r from-amber-500/10 to-transparent rounded-xl border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2 sm:mb-1">
                    <Clock size={16} className="text-amber-600" />
                    <span className="text-sm font-bold text-foreground">Pending Reservations</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Pending Revenue</div>
                      <div className="text-base sm:text-lg font-bold text-amber-600">{formatCurrency(reservationSummary.pendingRevenue, displayCurrency)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Active Orders</div>
                      <div className="text-base sm:text-lg font-bold text-foreground">{reservationSummary.activeCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Conversion Rate</div>
                      <div className="text-base sm:text-lg font-bold text-foreground">{reservationSummary.conversionRate.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ FINANCIAL HEALTH ═══════════════ */}
        <div className="card-premium">
          <SectionHeader
            title="Financial Health & Reconciliation"
            icon={<Activity size={20} />}
            sectionKey="assetHealth"
            badge={`${financialHealthScore.score}/100`}
          />
          {expandedSections.assetHealth && (
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">
                <div className={cn(
                  'rounded-2xl border p-5',
                  financialHealthScore.tone === 'emerald' && 'border-emerald-500/20 bg-emerald-500/10',
                  financialHealthScore.tone === 'blue' && 'border-cyan-500/20 bg-cyan-500/10',
                  financialHealthScore.tone === 'amber' && 'border-amber-500/20 bg-amber-500/10',
                  financialHealthScore.tone === 'red' && 'border-red-500/20 bg-red-500/10'
                )}>
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Finance Health Score</div>
                  <div className={cn(
                    'mt-3 text-5xl font-bold tracking-tight',
                    financialHealthScore.tone === 'emerald' && 'text-emerald-600',
                    financialHealthScore.tone === 'blue' && 'text-cyan-600',
                    financialHealthScore.tone === 'amber' && 'text-amber-600',
                    financialHealthScore.tone === 'red' && 'text-red-600'
                  )}>
                    {financialHealthScore.score}
                  </div>
                  <div className="mt-2 inline-flex rounded-full border border-border/60 bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                    {financialHealthScore.label}
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">{financialHealthScore.summary}</div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    Built from profitability, liquidity cover, reconciliation quality, and inventory discipline.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="text-xs text-muted-foreground">Profitability</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-600">{financialHealthScore.profitability}/100</div>
                    <div className="mt-2 text-xs text-muted-foreground">Net margin {netMarginPct.toFixed(1)}% and current net profit quality.</div>
                  </div>
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <div className="text-xs text-muted-foreground">Liquidity</div>
                    <div className="mt-1 text-2xl font-bold text-cyan-600">{financialHealthScore.liquidity}/100</div>
                    <div className="mt-2 text-xs text-muted-foreground">Wallet cover of {financialHealthScore.liquidityCoverage.toFixed(2)}x against costs and open inventory commitments.</div>
                  </div>
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
                    <div className="text-xs text-muted-foreground">Reconciliation</div>
                    <div className="mt-1 text-2xl font-bold text-blue-600">{financialHealthScore.reconciliation}/100</div>
                    <div className="mt-2 text-xs text-muted-foreground">Penalizes wallet gaps, expense mismatches, and unmapped revenue.</div>
                  </div>
                  <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                    <div className="text-xs text-muted-foreground">Inventory Discipline</div>
                    <div className="mt-1 text-2xl font-bold text-orange-600">{financialHealthScore.inventory}/100</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {inventoryAnalysis.daysOfInventory !== null
                        ? `${inventoryAnalysis.daysOfInventory} days of inventory at current pace.`
                        : 'No sell-through rate yet to estimate days of inventory.'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-linear-to-r from-primary/10 via-transparent to-cyan-500/10 p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Management view</div>
                    <div className="text-lg sm:text-xl font-bold text-foreground">Profit, liquidity, and stock are separate signals.</div>
                    <div className="max-w-3xl text-sm text-muted-foreground">
                      Revenue is turnover. Gross profit removes stock cost. Net profit removes operating expenses and commissions.
                      Wallet balance is liquid cash, not profit. Asset position combines liquid cash, stock at cost, and inventory already funded but not fully received.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                    <div className="text-xs text-muted-foreground">Business value created this period</div>
                    <div className={`mt-1 text-2xl font-bold ${assetCreationSignal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(assetCreationSignal, displayCurrency)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {assetCreationSignal >= 0 ? <ArrowUpRight size={14} className="text-emerald-600" /> : <ArrowDownRight size={14} className="text-red-600" />}
                      <span>This is net profit, not wallet balance.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-2xl border border-cyan-500/20 bg-linear-to-br from-cyan-500/10 to-transparent p-4">
                  <div className="text-xs text-muted-foreground">Total Asset Position</div>
                  <div className="mt-1 text-2xl font-bold text-cyan-600">{formatCurrency(totalAssetPosition, displayCurrency)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">Wallets + stock cost + inventory on order</div>
                </div>
                <div className="rounded-2xl border border-blue-500/20 bg-linear-to-br from-blue-500/10 to-transparent p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Liquid Wallet Balance</div>
                      <div className="mt-1 text-2xl font-bold text-blue-600">{formatCurrency(walletSummary.totalInDisplay, displayCurrency)}</div>
                    </div>
                    <div className="text-right">
                      {isCurrentTab && <TrendBadge current={walletActivity.netChange} previous={prevWalletActivity.netChange} />}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{liquidAssetShare.toFixed(1)}% of current asset position</div>
                </div>
                <div className="rounded-2xl border border-orange-500/20 bg-linear-to-br from-orange-500/10 to-transparent p-4">
                  <div className="text-xs text-muted-foreground">Stock at Cost</div>
                  <div className="mt-1 text-2xl font-bold text-orange-600">{formatCurrency(inventoryAnalysis.stockValueDisplay, displayCurrency)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{stockAssetShare.toFixed(1)}% of current asset position</div>
                </div>
                <div className="rounded-2xl border border-violet-500/20 bg-linear-to-br from-violet-500/10 to-transparent p-4">
                  <div className="text-xs text-muted-foreground">Inventory on Order</div>
                  <div className="mt-1 text-2xl font-bold text-violet-600">{formatCurrency(openPurchaseCommitment, displayCurrency)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{currentOpenOrderCount} open orders · {committedAssetShare.toFixed(1)}% of assets</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">Net Profit</span>
                    {isCurrentTab && <TrendBadge current={netProfit} previous={previousAssetCreationSignal} />}
                  </div>
                  <div className={`mt-2 text-xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(netProfit, displayCurrency)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Revenue after cost of goods, expenses, and commissions.</div>
                </div>
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">Tracked Wallet Movement</span>
                    {isCurrentTab && <TrendBadge current={walletActivity.netChange} previous={prevWalletActivity.netChange} />}
                  </div>
                  <div className={`mt-2 text-xl font-bold ${walletActivity.netChange >= 0 ? 'text-cyan-600' : 'text-red-600'}`}>{formatCurrency(walletActivity.netChange, displayCurrency)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Credits minus debits recorded in wallet transactions for this period.</div>
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">Inventory Capital Deployed</span>
                    {isCurrentTab && <TrendBadge current={purchaseCapitalDeployed} previous={prevPurchaseCapitalDeployed} invert />}
                  </div>
                  <div className="mt-2 text-xl font-bold text-violet-600">{formatCurrency(purchaseCapitalDeployed, displayCurrency)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Purchase orders created in this period. This is capital moved into stock, not operating expense.</div>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">Cost of Goods Sold</span>
                    {isCurrentTab && <TrendBadge current={realizedCogs} previous={prevRealizedCogs} invert />}
                  </div>
                  <div className="mt-2 text-xl font-bold text-amber-600">{formatCurrency(realizedCogs, displayCurrency)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">The stock cost consumed to generate the revenue above.</div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-bold text-foreground">Asset Mix</div>
                    <div className="text-xs text-muted-foreground">Where the business value currently sits.</div>
                  </div>
                  <div className="text-xs text-muted-foreground">Wallets {liquidAssetShare.toFixed(1)}% · Stock {stockAssetShare.toFixed(1)}% · On order {committedAssetShare.toFixed(1)}%</div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="flex h-full w-full overflow-hidden rounded-full">
                    <div className="bg-cyan-500" style={{ width: `${liquidAssetShare}%` }} />
                    <div className="bg-orange-500" style={{ width: `${stockAssetShare}%` }} />
                    <div className="bg-violet-500" style={{ width: `${committedAssetShare}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen size={16} className="text-primary" />
                    <div className="text-sm font-bold text-foreground">Profit Structure</div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">Revenue</div>
                        <div className="text-xs text-muted-foreground">Turnover booked from sales.</div>
                      </div>
                      <div className="text-right font-bold text-blue-600">{formatCurrency(totalRevenue, displayCurrency)}</div>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">Gross Profit</div>
                        <div className="text-xs text-muted-foreground">Revenue after subtracting cost of goods sold.</div>
                      </div>
                      <div className="text-right font-bold text-green-600">{formatCurrency(totalGrossProfit, displayCurrency)}</div>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">Net Profit</div>
                        <div className="text-xs text-muted-foreground">Gross profit after operating expenses and commissions.</div>
                      </div>
                      <div className={`text-right font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(netProfit, displayCurrency)}</div>
                    </div>
                    <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-3">
                      <div>
                        <div className="font-semibold text-foreground">Wallet Balance</div>
                        <div className="text-xs text-muted-foreground">Liquid cash currently sitting in selected wallets.</div>
                      </div>
                      <div className="text-right font-bold text-cyan-600">{formatCurrency(walletSummary.totalInDisplay, displayCurrency)}</div>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">Asset Position</div>
                        <div className="text-xs text-muted-foreground">Wallets plus stock value plus funded inventory still on order.</div>
                      </div>
                      <div className="text-right font-bold text-violet-600">{formatCurrency(totalAssetPosition, displayCurrency)}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard size={16} className="text-primary" />
                    <div className="text-sm font-bold text-foreground">Wallet Reconciliation</div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-foreground">Sales mapped to wallets</span>
                        <span className="font-bold text-blue-600">{formatCurrency(walletLinkedSales, displayCurrency)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Wallet sale credits recorded</span>
                        <span className={`font-semibold ${Math.abs(salesCreditGap) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {formatCurrency(walletActivity.salesCredits, displayCurrency)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Gap</span>
                        <span className={`font-semibold ${Math.abs(salesCreditGap) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.abs(salesCreditGap) < 0.01 ? 'In sync' : formatCurrency(salesCreditGap, displayCurrency)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-foreground">Expenses paid from wallets</span>
                        <span className="font-bold text-red-600">{formatCurrency(walletLinkedExpenses, displayCurrency)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Wallet expense debits recorded</span>
                        <span className={`font-semibold ${Math.abs(expenseDebitGap) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {formatCurrency(walletActivity.expenseDebits, displayCurrency)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Gap</span>
                        <span className={`font-semibold ${Math.abs(expenseDebitGap) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.abs(expenseDebitGap) < 0.01 ? 'In sync' : formatCurrency(expenseDebitGap, displayCurrency)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
                        <div className="text-xs text-muted-foreground">Commission payouts</div>
                        <div className="mt-1 text-lg font-bold text-orange-600">{formatCurrency(walletActivity.commissionDebits, displayCurrency)}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="text-xs text-muted-foreground">Expense refunds</div>
                        <div className="mt-1 text-lg font-bold text-emerald-600">{formatCurrency(walletActivity.expenseRefunds, displayCurrency)}</div>
                      </div>
                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                        <div className="text-xs text-muted-foreground">Transfers</div>
                        <div className={`mt-1 text-lg font-bold ${walletActivity.transferNet >= 0 ? 'text-cyan-600' : 'text-red-600'}`}>{formatCurrency(walletActivity.transferNet, displayCurrency)}</div>
                      </div>
                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                        <div className="text-xs text-muted-foreground">Adjustments & corrections</div>
                        <div className={`mt-1 text-lg font-bold ${walletActivity.adjustmentNet + walletActivity.correctionNet >= 0 ? 'text-violet-600' : 'text-red-600'}`}>
                          {formatCurrency(walletActivity.adjustmentNet + walletActivity.correctionNet, displayCurrency)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-foreground">Revenue not mapped to a wallet</span>
                        <span className={`font-bold ${unmappedRevenue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {formatCurrency(unmappedRevenue, displayCurrency)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        If this is high, revenue can look strong while wallets do not move the way you expect.
                      </div>
                    </div>

                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-foreground">Purchase orders funded this period</span>
                        <span className="font-bold text-violet-600">{formatCurrency(purchaseCapitalDeployed, displayCurrency)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        This money is converted into inventory capital. It is not operating expense, which is why wallet movement and net profit can move differently.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════ CATEGORY PERFORMANCE ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Category Performance" icon={<PieChart size={20} />} sectionKey="categories" badge={`${categoryPerformance.length}`} />
          {expandedSections.categories && (
            <div className="px-4 pb-4">
              {categoryPerformance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Category</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Revenue</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Profit</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Margin</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Qty Sold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryPerformance.map((cat, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-2 font-medium">{cat.name}</td>
                          <td className="py-3 px-2 text-right text-blue-600 font-semibold">{formatCurrency(cat.revenueDisplay, displayCurrency)}</td>
                          <td className={`py-3 px-2 text-right font-semibold ${cat.profitDisplay >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(cat.profitDisplay, displayCurrency)}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${cat.margin >= 30 ? 'bg-green-500/10 text-green-600' : cat.margin >= 15 ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}`}>
                              {cat.margin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right">{cat.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No category data for this period</div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ LOCATION PERFORMANCE ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Location Performance" icon={<MapPin size={20} />} sectionKey="locations" badge={`${locationPerformance.length}`} />
          {expandedSections.locations && (
            <div className="px-4 pb-4 space-y-3">
              {locationPerformance.map((loc, i) => (
                <div key={i} className="bg-muted/30 rounded-xl p-3 sm:p-4 border border-border/50 hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <h4 className="font-bold text-sm sm:text-base text-foreground">{loc.name}</h4>
                    <Badge variant="orange">{loc.salesCount} sales</Badge>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
                    <div className="rounded-lg p-2 sm:p-2.5 bg-blue-500/5 border border-blue-500/10">
                      <div className="text-xs text-muted-foreground">Revenue</div>
                      <div className="text-base sm:text-lg font-bold text-blue-600">{formatCurrency(loc.revenue, displayCurrency)}</div>
                    </div>
                    <div className="rounded-lg p-2 sm:p-2.5 bg-green-500/5 border border-green-500/10">
                      <div className="text-xs text-muted-foreground">Gross Profit</div>
                      <div className="text-base sm:text-lg font-bold text-green-600">{formatCurrency(loc.grossProfit, displayCurrency)}</div>
                    </div>
                    <div className="rounded-lg p-2 sm:p-2.5 bg-red-500/5 border border-red-500/10">
                      <div className="text-xs text-muted-foreground">Expenses</div>
                      <div className="text-base sm:text-lg font-bold text-red-600">{formatCurrency(loc.expenses, displayCurrency)}</div>
                    </div>
                    <div className={`rounded-lg p-2 sm:p-2.5 ${loc.netProfit >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-red-500/5 border-red-500/10'} border`}>
                      <div className="text-xs text-muted-foreground">Net Profit</div>
                      <div className={`text-base sm:text-lg font-bold ${loc.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(loc.netProfit, displayCurrency)}</div>
                    </div>
                    <div className="rounded-lg p-2 sm:p-2.5 bg-muted/50 border border-border/50">
                      <div className="text-xs text-muted-foreground">Stock Value</div>
                      <div className="text-base sm:text-lg font-bold text-foreground">{formatCurrency(loc.stockValue, displayCurrency)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══════════════ SELLER PERFORMANCE ═══════════════ */}
        {sellerPerformance.length > 0 && (
          <div className="card-premium">
            <SectionHeader title="Seller Performance" icon={<Users size={20} />} sectionKey="sellers" badge={`${sellerPerformance.length}`} />
            {expandedSections.sellers && (
              <div className="px-4 pb-4">
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <table className="w-full text-xs sm:text-sm min-w-[600px] sm:min-w-0">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">#</th>
                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Seller</th>
                        <th className="text-left py-3 px-2 text-muted-foreground font-medium">Location</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Sales</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Revenue</th>
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellerPerformance.map((seller, i) => (
                        <tr key={seller.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-2">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${i === 0 ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-muted text-muted-foreground'}`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="py-3 px-2 font-medium">{seller.name}</td>
                          <td className="py-3 px-2 text-muted-foreground">{seller.locationName}</td>
                          <td className="py-3 px-2 text-right">{seller.salesCount}</td>
                          <td className="py-3 px-2 text-right text-blue-600 font-semibold">{formatCurrency(seller.revenue, displayCurrency)}</td>
                          <td className="py-3 px-2 text-right text-orange-600 font-semibold">{formatCurrency(seller.commissions, displayCurrency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ PAYMENT METHODS ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Payment Methods" icon={<CreditCard size={20} />} sectionKey="payments" badge={`${paymentBreakdown.length}`} />
          {expandedSections.payments && (
            <div className="px-4 pb-4 space-y-2 sm:space-y-3">
              {paymentBreakdown.length > 0 ? paymentBreakdown.map((pm, i) => (
                <div key={i} className="p-3 bg-muted/30 rounded-xl border border-border/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold capitalize">{pm.method}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{pm.count} sales</span>
                      <span className="font-bold">{formatCurrency(pm.amount, displayCurrency)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-linear-to-r from-primary to-orange-600 rounded-full" style={{ width: `${pm.pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground w-12 text-right">{pm.pct.toFixed(1)}%</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">No payment data for this period</div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ EXPENSES BY CATEGORY ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Expenses by Category" icon={<Wallet size={20} />} sectionKey="expenses" badge={formatCurrency(totalExpensesAmt, displayCurrency)} />
          {expandedSections.expenses && (
            <div className="px-4 pb-4 space-y-2 sm:space-y-3">
              {/* Excluded categories info */}
              {excludeInventoryExpenses && expensesByCategory.excluded.length > 0 && (
                <div className="p-3 sm:p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs sm:text-sm font-bold text-green-600">✓ Inventory purchases excluded from operating expenses</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="text-xs opacity-75 mb-2">These expenses are inventory costs, not operating expenses:</div>
                    {expensesByCategory.excluded.map((exp, i) => (
                      <div key={i} className="flex justify-between items-center py-1">
                        <span>• {exp.categoryName}</span>
                        <span className="font-medium text-foreground">{formatCurrency(exp.amount, displayCurrency)}</span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-green-500/20 flex justify-between font-bold">
                      <span>Total Inventory Spending (not counted in net profit):</span>
                      <span className="text-green-600">
                        {formatCurrency(expensesByCategory.excluded.reduce((s, e) => s + e.amount, 0), displayCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {!excludeInventoryExpenses && (
                <div className="p-3 sm:p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xs sm:text-sm font-bold text-amber-600">⚠️ Warning: Inventory expenses are being counted as operating costs</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    This will make your net profit appear lower than actual. Enable the toggle above to exclude inventory purchases.
                  </div>
                </div>
              )}
              {expensesByCategory.included.length > 0 ? (
                <>
                  {expensesByCategory.included.map((exp, i) => {
                    const pct = totalExpensesAmt > 0 ? (exp.amount / totalExpensesAmt) * 100 : 0
                    return (
                      <div key={i} className="p-3 bg-linear-to-r from-red-500/10 to-transparent rounded-xl border border-red-500/20">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-sm sm:text-base">{exp.categoryName}</span>
                          <span className="text-base sm:text-lg font-bold text-red-600">{formatCurrency(exp.amount, displayCurrency)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-linear-to-r from-red-500 to-red-600 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    )
                  })}
                  <div className="pt-3 border-t border-border">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm sm:text-base">Total Expenses</span>
                      <span className="text-xl sm:text-2xl font-bold text-red-600">{formatCurrency(totalExpensesAmt, displayCurrency)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No expenses recorded in this period</div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ MONTHLY SALES HISTORY ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Monthly Sales History" icon={<TrendingUp size={20} />} sectionKey="salesHistory" badge="Last 12 months" />
          {expandedSections.salesHistory && (
            <div className="px-4 pb-4 space-y-2 sm:space-y-3">
              {monthlySalesHistory.length > 0 ? monthlySalesHistory.map((monthData, i) => {
                const prev = monthlySalesHistory[i + 1]
                const growth = prev ? pctChange(monthData.totalSales, prev.totalSales) : null
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-linear-to-r from-muted/30 to-transparent rounded-xl border border-border/60 hover:border-primary/30 transition-all gap-2 sm:gap-3">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-linear-to-br from-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-foreground">{monthData.month}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{monthData.salesCount} sales</span>
                          {growth !== null && (
                            <span className={`text-xs font-bold ${growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {formatPct(growth)} MoM
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 sm:gap-6">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-0.5">Revenue</div>
                        <div className="text-base font-bold text-blue-600">{formatCurrency(monthData.totalSales, displayCurrency)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-0.5">Profit</div>
                        <div className="text-base font-bold text-green-600">{formatCurrency(monthData.totalProfit, displayCurrency)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-0.5">Expenses</div>
                        <div className="text-base font-bold text-red-600">{formatCurrency(monthData.totalExpenses, displayCurrency)}</div>
                      </div>
                    </div>
                  </div>
                )
              }) : (
                <div className="text-center py-8 text-muted-foreground">No sales history available</div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ TOP SELLING ITEMS ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Top Selling Items" icon={<Award size={20} />} sectionKey="topItems" badge={`Top ${topSellingItems.length}`} />
          {expandedSections.topItems && (
            <div className="px-4 pb-4 space-y-2 sm:space-y-3">
              {topSellingItems.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-2.5 sm:p-3 bg-linear-to-r from-muted/30 to-transparent rounded-xl border border-border/60 hover:border-primary/30 transition-all">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-linear-to-br from-primary/10 to-primary/5 border border-primary/20 font-bold text-xs text-primary">
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm sm:text-base text-foreground truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">Sold: <span className="font-medium text-foreground">{item.quantity}</span> units</div>
                    </div>
                  </div>
                  <div className="text-right ml-2 sm:ml-3">
                    <div className="text-base sm:text-lg font-bold text-success">{formatCurrency(item.revenue, displayCurrency)}</div>
                  </div>
                </div>
              ))}
              {topSellingItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No sales data for this period</div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ TOP COMBOS ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Top Selling Combos" icon={<Sparkles size={20} />} sectionKey="topCombos" badge={`${comboStats.totalCombos} sold`} />
          {expandedSections.topCombos && (
            <div className="px-4 pb-4 space-y-2 sm:space-y-3">
              {topCombos.map((combo, i) => (
                <div key={i} className="flex justify-between items-center p-2.5 sm:p-3 bg-linear-to-r from-pink-500/10 to-transparent rounded-xl border border-pink-500/20 hover:border-pink-500/40 transition-all">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-linear-to-br from-pink-500/20 to-pink-600/10 border border-pink-500/30 font-bold text-xs text-pink-600">
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm sm:text-base truncate flex items-center gap-1"><Sparkles size={12} className="text-pink-500" />{combo.name}</div>
                      <div className="text-xs text-muted-foreground">Sold: <span className="font-medium">{combo.count}</span> times</div>
                    </div>
                  </div>
                  <div className="text-right ml-2 sm:ml-3">
                    <div className="text-base sm:text-lg font-bold text-pink-600">{formatCurrency(combo.revenue, displayCurrency)}</div>
                  </div>
                </div>
              ))}
              {topCombos.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No combo sales for this period</div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ INVENTORY ANALYSIS ═══════════════ */}
        <div className="card-premium">
          <SectionHeader title="Inventory Analysis" icon={<Package size={20} />} sectionKey="inventory" />
          {expandedSections.inventory && (
            <div className="px-4 pb-4 space-y-3 sm:space-y-4">
              {/* Inventory expense exclusion toggle */}
              <label className="flex items-center gap-3 p-3 bg-blue-500/5 rounded-xl border border-blue-500/20 cursor-pointer hover:bg-blue-500/10 transition-colors">
                <input type="checkbox" checked={excludeInventoryExpenses}
                  onChange={e => setExcludeInventoryExpenses(e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary" />
                <div>
                  <div className="text-sm font-medium">Exclude inventory purchase expenses from net profit</div>
                  <div className="text-xs text-muted-foreground">
                    Don&apos;t count stock/goods purchases as operating expenses (recommended for accurate profitability)
                  </div>
                </div>
              </label>
              {/* Low-value item exclusion toggle */}
              <label className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors">
                <input type="checkbox" checked={excludeLowValueItems}
                  onChange={e => setExcludeLowValueItems(e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary" />
                <div>
                  <div className="text-sm font-medium">Exclude low-value items (≤ {formatCurrency(200, displayCurrency)}) from inventory calculation</div>
                  <div className="text-xs text-muted-foreground">
                    Small accessories won&apos;t inflate potential revenue and profit metrics
                    {excludeLowValueItems && inventoryAnalysis.excludedCount > 0 && (
                      <span className="text-amber-600 ml-1">({inventoryAnalysis.excludedCount} items excluded)</span>
                    )}
                  </div>
                </div>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                <div className="rounded-2xl p-4 sm:p-5 bg-linear-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20">
                  <ShoppingBag className="w-6 h-6 sm:w-7 sm:h-7 text-orange-600 mb-2" />
                  <div className="text-xs text-muted-foreground mb-0.5">Stock Value (Cost)</div>
                  <div className="text-xl sm:text-2xl font-bold text-orange-600">{formatCurrency(inventoryAnalysis.stockValueDisplay, displayCurrency)}</div>
                </div>
                <div className="rounded-2xl p-4 sm:p-5 bg-linear-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
                  <DollarSign className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 mb-2" />
                  <div className="text-xs text-muted-foreground mb-0.5">Potential Revenue</div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-600">{formatCurrency(inventoryAnalysis.potentialRevenueDisplay, displayCurrency)}</div>
                </div>
                <div className="rounded-2xl p-4 sm:p-5 bg-linear-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
                  <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-green-600 mb-2" />
                  <div className="text-xs text-muted-foreground mb-0.5">Potential Profit</div>
                  <div className="text-xl sm:text-2xl font-bold text-green-600">{formatCurrency(inventoryAnalysis.potentialProfit, displayCurrency)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 p-3 sm:p-4 bg-muted/30 rounded-xl border border-border/50 text-center">
                <div>
                  <div className="text-lg sm:text-2xl font-bold text-foreground">{inventoryAnalysis.itemCount}</div>
                  <div className="text-xs text-muted-foreground">Stock Items</div>
                </div>
                <div>
                  <div className="text-lg sm:text-2xl font-bold text-foreground">{inventoryAnalysis.totalUnits.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Total Units</div>
                </div>
                <div>
                  <div className="text-lg sm:text-2xl font-bold text-primary">{inventoryAnalysis.profitMarginPct.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">Profit Margin</div>
                </div>
                <div>
                  <div className="text-lg sm:text-2xl font-bold text-foreground">
                    {inventoryAnalysis.daysOfInventory !== null ? `${inventoryAnalysis.daysOfInventory}d` : '∞'}
                  </div>
                  <div className="text-xs text-muted-foreground">Days of Inventory</div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

