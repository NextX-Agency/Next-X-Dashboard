'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Edit,
  FileText,
  History,
  Landmark,
  MapPin,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingSpinner,
  Modal,
  PageContainer,
  PageHeader,
  Select,
  Textarea,
} from '@/components/UI'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { formatCurrency, type Currency } from '@/lib/currency'
import {
  DEFAULT_WALLET_PURPOSE,
  WALLET_PURPOSE_LABELS,
  type WalletPurpose,
} from '@/types/walletPurpose'
import type {
  FinanceMoneyTotals,
  FinanceObligationRecord,
  FinanceObligationStatus,
  FinanceObligationType,
  FinanceObligationsResponse,
  FinanceSummaryPayload,
  FinanceSummaryResponse,
} from '@/types/finance'
import type {
  WalletsPageDataResponse,
  WalletsPageLocation as Location,
  WalletsPageTransaction as WalletTransaction,
  WalletsPageWallet as WalletType,
} from '@/types/wallets'

interface WalletWithLocation extends WalletType {
  locations?: Location | null
}

interface LocationWithWallets extends Location {
  wallets: WalletWithLocation[]
  totalSRD: number
  totalUSD: number
}

interface TransactionWithDetails extends WalletTransaction {
  wallets?: WalletWithLocation | null
}

interface ApiResponse<T> {
  data?: T
  error?: string
}

type FinanceTab = 'overview' | 'wallets' | 'receivables' | 'payables' | 'forecast'
type WalletView = 'locations' | 'all' | 'savings'
type BalanceFilter = 'all' | 'positive' | 'zero' | 'negative'
type HistoryFilter = 'all' | 'credit' | 'debit' | 'adjustment'

const ZERO_MONEY: FinanceMoneyTotals = { srd: 0, usd: 0, totalSrd: 0, totalUsd: 0 }

async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({})) as ApiResponse<T>

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.')
  }

  return payload.data as T
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function combineMoney(left: FinanceMoneyTotals, right: FinanceMoneyTotals): FinanceMoneyTotals {
  return {
    srd: roundMoney(left.srd + right.srd),
    usd: roundMoney(left.usd + right.usd),
    totalSrd: roundMoney(left.totalSrd + right.totalSrd),
    totalUsd: roundMoney(left.totalUsd + right.totalUsd),
  }
}

function getPurposeBadgeVariant(purpose: WalletPurpose): 'default' | 'warning' | 'info' {
  if (purpose === 'savings') return 'warning'
  if (purpose === 'reserve') return 'info'
  return 'default'
}

function formatMoneySummary(total: FinanceMoneyTotals | null | undefined, primaryCurrency: Currency = 'SRD') {
  const money = total ?? ZERO_MONEY
  return primaryCurrency === 'USD'
    ? formatCurrency(money.totalUsd, 'USD')
    : formatCurrency(money.totalSrd, 'SRD')
}

function formatSecondaryMoney(total: FinanceMoneyTotals | null | undefined, primaryCurrency: Currency = 'SRD') {
  const money = total ?? ZERO_MONEY
  return primaryCurrency === 'USD'
    ? `${formatCurrency(money.totalSrd, 'SRD')} total`
    : `${formatCurrency(money.totalUsd, 'USD')} total`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function obligationTypeLabel(type: FinanceObligationType) {
  return type === 'receivable' ? 'Debiteur' : 'Crediteur'
}

function statusVariant(status: FinanceObligationStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'cancelled') return 'danger'
  return 'info'
}

function confidenceVariant(confidence: FinanceSummaryPayload['forecast']['confidence'] | undefined): 'success' | 'warning' | 'danger' {
  if (confidence === 'high') return 'success'
  if (confidence === 'medium') return 'warning'
  return 'danger'
}

function confidenceLabel(confidence: FinanceSummaryPayload['forecast']['confidence'] | undefined) {
  if (confidence === 'high') return 'Sterke data'
  if (confidence === 'medium') return 'Redelijke data'
  return 'Weinig data'
}

export default function WalletsPage() {
  const { dialogProps, confirm } = useConfirmDialog()
  const [wallets, setWallets] = useState<WalletWithLocation[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([])
  const [financeSummary, setFinanceSummary] = useState<FinanceSummaryPayload | null>(null)
  const [obligations, setObligations] = useState<FinanceObligationRecord[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [financeTab, setFinanceTab] = useState<FinanceTab>('overview')
  const [walletView, setWalletView] = useState<WalletView>('locations')
  const [walletSearch, setWalletSearch] = useState('')
  const [walletLocationFilter, setWalletLocationFilter] = useState('')
  const [walletPurposeFilter, setWalletPurposeFilter] = useState<'all' | WalletPurpose>('all')
  const [walletCurrencyFilter, setWalletCurrencyFilter] = useState<'all' | Currency>('all')
  const [walletBalanceFilter, setWalletBalanceFilter] = useState<BalanceFilter>('all')

  const [obligationSearch, setObligationSearch] = useState('')
  const [obligationStatusFilter, setObligationStatusFilter] = useState<'all' | FinanceObligationStatus>('all')

  const [showWalletForm, setShowWalletForm] = useState(false)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [showTransactionHistory, setShowTransactionHistory] = useState(false)
  const [showObligationForm, setShowObligationForm] = useState(false)
  const [editingWallet, setEditingWallet] = useState<WalletWithLocation | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<WalletWithLocation | null>(null)
  const [editingObligation, setEditingObligation] = useState<FinanceObligationRecord | null>(null)

  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryFilter>('all')
  const [historyWalletFilter, setHistoryWalletFilter] = useState('')

  const [walletForm, setWalletForm] = useState({
    location_id: '',
    type: 'cash' as 'cash' | 'bank',
    currency: 'SRD' as Currency,
    balance: '',
    purpose: DEFAULT_WALLET_PURPOSE as WalletPurpose,
  })

  const [transactionForm, setTransactionForm] = useState({
    type: 'add' as 'add' | 'remove' | 'correct',
    amount: '',
    description: '',
  })

  const [transferForm, setTransferForm] = useState({
    fromWalletId: '',
    toWalletId: '',
    amount: '',
    description: '',
  })

  const [obligationForm, setObligationForm] = useState({
    type: 'receivable' as FinanceObligationType,
    counterparty_name: '',
    location_id: '',
    currency: 'SRD' as Currency,
    original_amount: '',
    paid_amount: '',
    status: 'open' as FinanceObligationStatus,
    due_date: '',
    notes: '',
  })

  const loadData = useCallback(async (showLoadingState = false) => {
    if (showLoadingState) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setLoadError(null)

    try {
      const [walletResponse, summaryResponse, obligationsResponse] = await Promise.all([
        fetch('/api/wallets', { cache: 'no-store' }),
        fetch('/api/finance/summary', { cache: 'no-store' }),
        fetch('/api/finance/obligations', { cache: 'no-store' }),
      ])

      for (const response of [walletResponse, summaryResponse, obligationsResponse]) {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error || 'Unable to load finance data right now.')
        }
      }

      const walletPayload = await walletResponse.json() as WalletsPageDataResponse
      const summaryPayload = await summaryResponse.json() as FinanceSummaryResponse
      const obligationsPayload = await obligationsResponse.json() as FinanceObligationsResponse

      setWallets(walletPayload.data.wallets as WalletWithLocation[])
      setLocations(walletPayload.data.locations)
      setTransactions(walletPayload.data.transactions as TransactionWithDetails[])
      setFinanceSummary(summaryPayload.data)
      setObligations(obligationsPayload.data.obligations)
    } catch (error) {
      console.error('Error loading finance data:', error)
      setLoadError(error instanceof Error ? error.message : 'Unable to load finance data right now.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData(true)
  }, [loadData])

  const resetWalletForm = () => {
    setWalletForm({
      location_id: '',
      type: 'cash',
      currency: 'SRD',
      balance: '',
      purpose: DEFAULT_WALLET_PURPOSE,
    })
    setEditingWallet(null)
    setShowWalletForm(false)
  }

  const resetObligationForm = () => {
    setObligationForm({
      type: 'receivable',
      counterparty_name: '',
      location_id: '',
      currency: 'SRD',
      original_amount: '',
      paid_amount: '',
      status: 'open',
      due_date: '',
      notes: '',
    })
    setEditingObligation(null)
    setShowObligationForm(false)
  }

  const openObligationForm = (type: FinanceObligationType, obligation?: FinanceObligationRecord) => {
    if (obligation) {
      setEditingObligation(obligation)
      setObligationForm({
        type: obligation.type,
        counterparty_name: obligation.counterparty_name,
        location_id: obligation.location_id || '',
        currency: obligation.currency,
        original_amount: String(obligation.original_amount),
        paid_amount: String(obligation.paid_amount),
        status: obligation.status,
        due_date: obligation.due_date ? obligation.due_date.slice(0, 10) : '',
        notes: obligation.notes || '',
      })
    } else {
      setEditingObligation(null)
      setObligationForm((current) => ({
        ...current,
        type,
        counterparty_name: '',
        location_id: '',
        currency: 'SRD',
        original_amount: '',
        paid_amount: '',
        status: 'open',
        due_date: '',
        notes: '',
      }))
    }
    setShowObligationForm(true)
  }

  const handleSubmitWallet = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting || !walletForm.location_id) return
    setSubmitting(true)

    try {
      const existing = wallets.find((wallet) =>
        wallet.id !== editingWallet?.id &&
        wallet.location_id === walletForm.location_id &&
        wallet.type === walletForm.type &&
        wallet.currency === walletForm.currency &&
        wallet.purpose === walletForm.purpose
      )

      if (existing) {
        alert(`A ${WALLET_PURPOSE_LABELS[walletForm.purpose]} ${walletForm.type} ${walletForm.currency} wallet already exists for this location.`)
        return
      }

      const payload = {
        id: editingWallet?.id,
        location_id: walletForm.location_id,
        type: walletForm.type,
        currency: walletForm.currency,
        balance: Number.parseFloat(walletForm.balance) || 0,
        purpose: walletForm.purpose,
      }

      await apiRequest('/api/wallets', {
        method: editingWallet ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      resetWalletForm()
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save wallet.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditWallet = (wallet: WalletWithLocation) => {
    setEditingWallet(wallet)
    setWalletForm({
      location_id: wallet.location_id || '',
      type: wallet.type as 'cash' | 'bank',
      currency: wallet.currency as Currency,
      balance: String(wallet.balance),
      purpose: wallet.purpose,
    })
    setShowWalletForm(true)
  }

  const handleDeleteWallet = async (wallet: WalletWithLocation) => {
    const ok = await confirm({
      title: 'Delete Wallet',
      message: 'Only empty wallets with no financial history can be deleted. Wallets with balance, transactions, sales, expenses, or orders are preserved for reports.',
      itemName: getWalletDisplayName(wallet),
      itemDetails: `Balance: ${formatCurrency(wallet.balance, wallet.currency as Currency)}`,
      variant: 'danger',
      confirmLabel: 'Delete Wallet',
    })
    if (!ok) return

    try {
      await apiRequest<{ id: string }>(`/api/wallets?id=${encodeURIComponent(wallet.id)}`, { method: 'DELETE' })
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete wallet.')
    }
  }

  const handleTransaction = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedWallet || submitting) return
    setSubmitting(true)

    try {
      const amount = Number.parseFloat(transactionForm.amount)
      if (!Number.isFinite(amount) || amount < 0 || (transactionForm.type !== 'correct' && amount === 0)) {
        alert('Enter a valid amount.')
        return
      }

      await apiRequest('/api/wallets/transactions', {
        method: 'POST',
        body: JSON.stringify({
          walletId: selectedWallet.id,
          type: transactionForm.type,
          amount,
          description: transactionForm.description,
        }),
      })

      setTransactionForm({ type: 'add', amount: '', description: '' })
      setShowTransactionForm(false)
      setSelectedWallet(null)
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update wallet balance.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTransfer = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting || !transferForm.fromWalletId || !transferForm.toWalletId) return
    setSubmitting(true)

    try {
      const amount = Number.parseFloat(transferForm.amount)
      const fromWallet = wallets.find((wallet) => wallet.id === transferForm.fromWalletId)
      const toWallet = wallets.find((wallet) => wallet.id === transferForm.toWalletId)

      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount.')
      if (!fromWallet || !toWallet) throw new Error('Invalid wallet selection.')
      if (fromWallet.currency !== toWallet.currency) throw new Error('Transfers must use the same currency.')
      if (fromWallet.balance < amount) throw new Error('Insufficient balance in source wallet.')

      await apiRequest('/api/wallets/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromWalletId: fromWallet.id,
          toWalletId: toWallet.id,
          amount,
          description: transferForm.description,
        }),
      })

      setTransferForm({ fromWalletId: '', toWalletId: '', amount: '', description: '' })
      setShowTransferForm(false)
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to transfer money between wallets.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitObligation = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)

    try {
      const payload = {
        id: editingObligation?.id,
        type: obligationForm.type,
        counterparty_name: obligationForm.counterparty_name,
        location_id: obligationForm.location_id || null,
        currency: obligationForm.currency,
        original_amount: Number.parseFloat(obligationForm.original_amount) || 0,
        paid_amount: Number.parseFloat(obligationForm.paid_amount) || 0,
        status: obligationForm.status,
        due_date: obligationForm.due_date || null,
        notes: obligationForm.notes || null,
      }

      await apiRequest('/api/finance/obligations', {
        method: editingObligation ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })

      resetObligationForm()
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save finance record.')
    } finally {
      setSubmitting(false)
    }
  }

  const updateObligationStatus = async (obligation: FinanceObligationRecord, status: FinanceObligationStatus) => {
    try {
      await apiRequest('/api/finance/obligations', {
        method: 'PATCH',
        body: JSON.stringify({ id: obligation.id, status }),
      })
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update finance record.')
    }
  }

  const deleteObligation = async (obligation: FinanceObligationRecord) => {
    const ok = await confirm({
      title: `Delete ${obligationTypeLabel(obligation.type)}`,
      message: 'This removes this manual open item from the finance overview.',
      itemName: obligation.counterparty_name,
      itemDetails: formatCurrency(obligation.outstanding_amount, obligation.currency),
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return

    try {
      await apiRequest<{ id: string }>(`/api/finance/obligations?id=${encodeURIComponent(obligation.id)}`, {
        method: 'DELETE',
      })
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete finance record.')
    }
  }

  const getWalletLocationName = (wallet: WalletWithLocation) => wallet.locations?.name || 'No location'
  const getWalletDisplayName = (wallet: WalletWithLocation) =>
    `${getWalletLocationName(wallet)} - ${WALLET_PURPOSE_LABELS[wallet.purpose]} ${wallet.type} ${wallet.currency}`

  const getLocationWallets = (sourceWallets: WalletWithLocation[]): LocationWithWallets[] => {
    const locationMap = new Map<string, LocationWithWallets>()

    locations.forEach((location) => {
      locationMap.set(location.id, {
        ...location,
        wallets: [],
        totalSRD: 0,
        totalUSD: 0,
      })
    })

    sourceWallets.forEach((wallet) => {
      if (!wallet.location_id || !locationMap.has(wallet.location_id)) return
      const location = locationMap.get(wallet.location_id)!
      location.wallets.push(wallet)
      if (wallet.currency === 'USD') location.totalUSD += wallet.balance
      else location.totalSRD += wallet.balance
    })

    return Array.from(locationMap.values()).filter((location) => location.wallets.length > 0)
  }

  const filteredWallets = wallets.filter((wallet) => {
    const search = walletSearch.trim().toLowerCase()
    const matchesSearch = !search ||
      getWalletLocationName(wallet).toLowerCase().includes(search) ||
      wallet.type.toLowerCase().includes(search) ||
      wallet.currency.toLowerCase().includes(search) ||
      WALLET_PURPOSE_LABELS[wallet.purpose].toLowerCase().includes(search)
    const matchesLocation = !walletLocationFilter || wallet.location_id === walletLocationFilter
    const matchesPurpose = walletView === 'savings'
      ? wallet.purpose === 'savings'
      : walletPurposeFilter === 'all' || wallet.purpose === walletPurposeFilter
    const matchesCurrency = walletCurrencyFilter === 'all' || wallet.currency === walletCurrencyFilter
    const matchesBalance =
      walletBalanceFilter === 'all' ||
      (walletBalanceFilter === 'positive' && wallet.balance > 0) ||
      (walletBalanceFilter === 'zero' && wallet.balance === 0) ||
      (walletBalanceFilter === 'negative' && wallet.balance < 0)

    return matchesSearch && matchesLocation && matchesPurpose && matchesCurrency && matchesBalance
  })

  const filteredLocationWallets = getLocationWallets(filteredWallets)

  const filteredTransactions = transactions.filter((transaction) => {
    const search = historySearchQuery.trim().toLowerCase()
    const walletName = transaction.wallets ? getWalletDisplayName(transaction.wallets).toLowerCase() : ''
    const description = (transaction.description || transaction.reference_type || '').toLowerCase()
    const matchesSearch = !search || walletName.includes(search) || description.includes(search)
    const matchesType = historyTypeFilter === 'all' || transaction.type === historyTypeFilter
    const matchesWallet = !historyWalletFilter || transaction.wallet_id === historyWalletFilter
    return matchesSearch && matchesType && matchesWallet
  })

  const filterObligations = (type: FinanceObligationType) => obligations.filter((obligation) => {
    if (obligation.type !== type) return false
    const search = obligationSearch.trim().toLowerCase()
    const matchesSearch = !search ||
      obligation.counterparty_name.toLowerCase().includes(search) ||
      (obligation.location_name || '').toLowerCase().includes(search) ||
      (obligation.notes || '').toLowerCase().includes(search)
    const matchesStatus = obligationStatusFilter === 'all' || obligation.status === obligationStatusFilter
    return matchesSearch && matchesStatus
  })

  const receivables = filterObligations('receivable')
  const payables = filterObligations('payable')
  const openPayablesTotal = combineMoney(
    financeSummary?.obligations.payables ?? ZERO_MONEY,
    financeSummary?.obligations.systemPayables ?? ZERO_MONEY,
  )
  const hasLoadedData = wallets.length > 0 || obligations.length > 0 || Boolean(financeSummary)

  const topMetrics: Array<{
    label: string
    value: string
    subValue: string
    icon: LucideIcon
    tone: string
  }> = [
    {
      label: 'Inkomsten deze maand',
      value: formatMoneySummary(financeSummary?.month.revenue),
      subValue: `${financeSummary?.month.saleCount ?? 0} sales`,
      icon: TrendingUp,
      tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Uitgaven deze maand',
      value: formatMoneySummary(combineMoney(financeSummary?.month.expenses ?? ZERO_MONEY, financeSummary?.month.commissions ?? ZERO_MONEY)),
      subValue: `${financeSummary?.month.expenseCount ?? 0} expenses + commissions`,
      icon: TrendingDown,
      tone: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    },
    {
      label: 'Netto winst',
      value: formatMoneySummary(financeSummary?.month.netProfit),
      subValue: formatSecondaryMoney(financeSummary?.month.netProfit),
      icon: DollarSign,
      tone: 'text-primary bg-primary/10 border-primary/20',
    },
    {
      label: 'Spaarvermogen',
      value: formatMoneySummary(financeSummary?.wallets.savings),
      subValue: formatSecondaryMoney(financeSummary?.wallets.savings),
      icon: PiggyBank,
      tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Debiteuren open',
      value: formatMoneySummary(financeSummary?.obligations.receivables),
      subValue: `${financeSummary?.obligations.openReceivables.length ?? 0} open posten`,
      icon: ReceiptText,
      tone: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    },
    {
      label: 'Crediteuren open',
      value: formatMoneySummary(openPayablesTotal),
      subValue: `${financeSummary?.obligations.openPayables.length ?? 0} manual + ${financeSummary?.obligations.unpaidCommissions.length ?? 0} commissions`,
      icon: FileText,
      tone: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    },
  ]

  const financeTabs: Array<{ tab: FinanceTab; label: string; icon: LucideIcon }> = [
    { tab: 'overview', label: 'Overzicht', icon: Landmark },
    { tab: 'wallets', label: 'Wallets', icon: Wallet },
    { tab: 'receivables', label: 'Debiteuren', icon: ReceiptText },
    { tab: 'payables', label: 'Crediteuren', icon: FileText },
    { tab: 'forecast', label: 'Prognose', icon: CalendarClock },
  ]

  const walletViews: Array<{ view: WalletView; label: string; icon: LucideIcon }> = [
    { view: 'locations', label: 'Per locatie', icon: MapPin },
    { view: 'all', label: 'Alle wallets', icon: Wallet },
    { view: 'savings', label: 'Sparen', icon: PiggyBank },
  ]

  const monthBreakdown: Array<{ label: string; value: FinanceMoneyTotals | undefined; icon: LucideIcon }> = [
    { label: 'Omzet', value: financeSummary?.month.revenue, icon: TrendingUp },
    { label: 'Kostprijs', value: financeSummary?.month.cogs, icon: ReceiptText },
    { label: 'Bruto winst', value: financeSummary?.month.grossProfit, icon: DollarSign },
    { label: 'Expenses', value: financeSummary?.month.expenses, icon: TrendingDown },
    { label: 'Commissies', value: financeSummary?.month.commissions, icon: FileText },
    { label: 'Netto winst', value: financeSummary?.month.netProfit, icon: Landmark },
  ]

  const forecastCards: Array<{ label: string; value: FinanceMoneyTotals | undefined; icon: LucideIcon }> = [
    { label: 'Jaaromzet', value: financeSummary?.forecast.projectedRevenue, icon: TrendingUp },
    { label: 'Jaaruitgaven', value: financeSummary?.forecast.projectedExpenses, icon: TrendingDown },
    { label: 'Jaarwinst', value: financeSummary?.forecast.projectedNetProfit, icon: DollarSign },
    { label: 'Spaarcapaciteit', value: financeSummary?.forecast.projectedSavingsCapacity, icon: PiggyBank },
  ]
  const forecastRunRates: Array<{ label: string; value: FinanceMoneyTotals | undefined }> = [
    { label: 'Maandelijkse omzet-run-rate', value: financeSummary?.forecast.monthlyRevenueRunRate },
    { label: 'Maandelijkse uitgaven-run-rate', value: financeSummary?.forecast.monthlyExpensesRunRate },
    { label: 'Maandelijkse winst-run-rate', value: financeSummary?.forecast.monthlyNetProfitRunRate },
  ]
  const forecastHistory = financeSummary?.forecast.history ?? []

  const transactionTypes: Array<{ type: 'add' | 'remove' | 'correct'; label: string; icon: LucideIcon }> = [
    { type: 'add', label: 'Add', icon: ArrowDownLeft },
    { type: 'remove', label: 'Remove', icon: ArrowUpRight },
    { type: 'correct', label: 'Correct', icon: Edit },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Finance" subtitle="Loading finance cockpit" icon={<Landmark size={24} />} />
        <LoadingSpinner />
      </div>
    )
  }

  if (!hasLoadedData && loadError) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader
          title="Finance"
          subtitle="Finance data is temporarily unavailable"
          icon={<AlertTriangle size={24} />}
          action={
            <Button onClick={() => void loadData(true)} variant="secondary">
              <RefreshCcw size={18} />
              Retry
            </Button>
          }
        />
        <PageContainer>
          <EmptyState
            icon={AlertTriangle}
            title="Could not load finance data"
            description={loadError}
          />
        </PageContainer>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <PageHeader
        title="Wallets"
        subtitle="Cashflow, open posten en prognose op basis van echte transacties"
        icon={<Landmark size={24} />}
        action={
          <>
            <Button onClick={() => void loadData()} variant="ghost" loading={refreshing} className="basis-[calc(50%-0.25rem)] sm:basis-auto">
              <RefreshCcw size={18} />
              Refresh
            </Button>
            <Button onClick={() => setShowTransferForm(true)} variant="secondary" className="basis-[calc(50%-0.25rem)] sm:basis-auto">
              <ArrowRightLeft size={18} />
              Transfer
            </Button>
            <Button onClick={() => setShowTransactionHistory(true)} variant="secondary" className="basis-[calc(50%-0.25rem)] sm:basis-auto">
              <History size={18} />
              History
            </Button>
            <Button onClick={() => setShowWalletForm(true)} variant="primary" className="basis-[calc(50%-0.25rem)] sm:basis-auto">
              <Plus size={18} />
              Wallet
            </Button>
          </>
        }
      />

      <PageContainer className="space-y-5">
        {loadError && (
          <div className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
            {loadError}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {topMetrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div key={metric.label} className={`rounded-lg border bg-card p-4 ${metric.tone}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                  <Icon size={18} className={metric.tone.split(' ')[0]} />
                </div>
                <p className="break-words text-xl font-bold text-foreground">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.subValue}</p>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 sm:grid-cols-3 xl:grid-cols-5">
          {financeTabs.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFinanceTab(tab)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
                financeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {financeTab === 'overview' && (
          <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Maandelijkse resultaten</h2>
                  <p className="text-sm text-muted-foreground">1 USD = {financeSummary?.exchangeRate ?? '-'} SRD</p>
                </div>
                <Badge variant={(financeSummary?.month.netProfit.totalSrd ?? 0) >= 0 ? 'success' : 'danger'}>
                  {(financeSummary?.month.netProfit.totalSrd ?? 0) >= 0 ? 'Profit' : 'Loss'}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {monthBreakdown.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-lg border border-border bg-background/40 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                      <Icon size={16} className="text-muted-foreground" />
                    </div>
                    <p className="text-xl font-bold text-foreground">{formatMoneySummary(value)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatSecondaryMoney(value)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Open posten</h2>
                  <p className="text-sm text-muted-foreground">Debiteuren en crediteuren</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => openObligationForm('receivable')} variant="secondary" size="sm">
                    <Plus size={16} />
                    Debiteur
                  </Button>
                  <Button onClick={() => openObligationForm('payable')} variant="secondary" size="sm">
                    <Plus size={16} />
                    Crediteur
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-sky-300">Debiteuren</span>
                    <span className="font-bold text-foreground">{formatMoneySummary(financeSummary?.obligations.receivables)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Overdue: {formatMoneySummary(financeSummary?.obligations.overdueReceivables)}
                  </p>
                </div>
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-orange-300">Crediteuren</span>
                    <span className="font-bold text-foreground">{formatMoneySummary(openPayablesTotal)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Manual + unpaid commissions
                  </p>
                </div>

                {(financeSummary?.obligations.openReceivables.length ?? 0) === 0 && (financeSummary?.obligations.openPayables.length ?? 0) === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    Geen handmatige open posten.
                  </div>
                ) : (
                  [...(financeSummary?.obligations.openReceivables ?? []), ...(financeSummary?.obligations.openPayables ?? [])]
                    .slice(0, 5)
                    .map((obligation) => (
                      <div key={obligation.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{obligation.counterparty_name}</p>
                          <p className="text-xs text-muted-foreground">{obligationTypeLabel(obligation.type)} - due {formatDate(obligation.due_date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">{formatCurrency(obligation.outstanding_amount, obligation.currency)}</p>
                          <Badge variant={statusVariant(obligation.status)} className="text-[10px]">{obligation.status}</Badge>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>
          </div>
        )}

        {financeTab === 'wallets' && (
          <section className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Wallets</h2>
                  <p className="text-sm text-muted-foreground">{filteredWallets.length} of {wallets.length} wallets</p>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-background/40 p-1 sm:min-w-[26rem]">
                  {walletViews.map(({ view, label, icon: Icon }) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setWalletView(view)}
                      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors sm:text-sm ${
                        walletView === view
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
                <Input label="Search" value={walletSearch} onChange={(event) => setWalletSearch(event.target.value)} placeholder="Location, type, purpose" />
                <Select label="Location" value={walletLocationFilter} onChange={(event) => setWalletLocationFilter(event.target.value)}>
                  <option value="">All locations</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </Select>
                <Select label="Purpose" value={walletPurposeFilter} onChange={(event) => setWalletPurposeFilter(event.target.value as 'all' | WalletPurpose)}>
                  <option value="all">All purposes</option>
                  <option value="operational">Operational</option>
                  <option value="savings">Savings</option>
                  <option value="reserve">Reserve</option>
                </Select>
                <Select label="Currency" value={walletCurrencyFilter} onChange={(event) => setWalletCurrencyFilter(event.target.value as 'all' | Currency)}>
                  <option value="all">All currencies</option>
                  <option value="SRD">SRD</option>
                  <option value="USD">USD</option>
                </Select>
                <Select label="Balance" value={walletBalanceFilter} onChange={(event) => setWalletBalanceFilter(event.target.value as BalanceFilter)}>
                  <option value="all">Any balance</option>
                  <option value="positive">Positive</option>
                  <option value="zero">Zero</option>
                  <option value="negative">Negative</option>
                </Select>
              </div>
            </div>

            {wallets.length === 0 ? (
              <EmptyState icon={Wallet} title="No wallets yet" description="Create a wallet for each location, purpose, type, and currency." />
            ) : walletView === 'locations' ? (
              filteredLocationWallets.length === 0 ? (
                <EmptyState icon={Search} title="No matching wallets" description="Change filters to see more wallets." />
              ) : (
                <div className="space-y-4">
                  {filteredLocationWallets.map((location) => (
                    <div key={location.id} className="rounded-lg border border-border bg-card">
                      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Building2 size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground">{location.name}</h3>
                            <p className="text-xs text-muted-foreground">{location.wallets.length} wallets</p>
                          </div>
                        </div>
                        <div className="grid gap-2 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                          <span className="rounded-md bg-background/50 px-3 py-2 font-semibold text-foreground">{formatCurrency(location.totalSRD, 'SRD')}</span>
                          <span className="rounded-md bg-background/50 px-3 py-2 font-semibold text-foreground">{formatCurrency(location.totalUSD, 'USD')}</span>
                          <Button
                            onClick={() => {
                              setWalletForm((current) => ({ ...current, location_id: location.id }))
                              setShowWalletForm(true)
                            }}
                            variant="ghost"
                            size="sm"
                            className="w-full sm:w-auto"
                          >
                            <Plus size={15} />
                            Add
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                        {location.wallets.map((wallet) => (
                          <WalletTile
                            key={wallet.id}
                            wallet={wallet}
                            onAdjust={() => {
                              setSelectedWallet(wallet)
                              setShowTransactionForm(true)
                            }}
                            onEdit={() => handleEditWallet(wallet)}
                            onDelete={() => void handleDeleteWallet(wallet)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              filteredWallets.length === 0 ? (
                <EmptyState icon={Search} title="No matching wallets" description="Change filters to see more wallets." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {filteredWallets.map((wallet) => (
                    <WalletTile
                      key={wallet.id}
                      wallet={wallet}
                      onAdjust={() => {
                        setSelectedWallet(wallet)
                        setShowTransactionForm(true)
                      }}
                      onEdit={() => handleEditWallet(wallet)}
                      onDelete={() => void handleDeleteWallet(wallet)}
                    />
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {financeTab === 'receivables' && (
          <ObligationSection
            title="Debiteuren"
            subtitle="Open facturen, leningen en bedragen die naar het bedrijf moeten komen"
            type="receivable"
            obligations={receivables}
            search={obligationSearch}
            status={obligationStatusFilter}
            onSearch={setObligationSearch}
            onStatus={setObligationStatusFilter}
            onCreate={() => openObligationForm('receivable')}
            onEdit={(obligation) => openObligationForm('receivable', obligation)}
            onMarkPaid={(obligation) => void updateObligationStatus(obligation, 'paid')}
            onCancel={(obligation) => void updateObligationStatus(obligation, 'cancelled')}
            onDelete={(obligation) => void deleteObligation(obligation)}
          />
        )}

        {financeTab === 'payables' && (
          <div className="space-y-4">
            <ObligationSection
              title="Crediteuren"
              subtitle="Open betalingen en geplande uitbetalingen"
              type="payable"
              obligations={payables}
              search={obligationSearch}
              status={obligationStatusFilter}
              onSearch={setObligationSearch}
              onStatus={setObligationStatusFilter}
              onCreate={() => openObligationForm('payable')}
              onEdit={(obligation) => openObligationForm('payable', obligation)}
              onMarkPaid={(obligation) => void updateObligationStatus(obligation, 'paid')}
              onCancel={(obligation) => void updateObligationStatus(obligation, 'cancelled')}
              onDelete={(obligation) => void deleteObligation(obligation)}
            />

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Onbetaalde commissies</h2>
                  <p className="text-sm text-muted-foreground">{formatMoneySummary(financeSummary?.obligations.systemPayables)}</p>
                </div>
                <Badge variant="warning">{financeSummary?.obligations.unpaidCommissions.length ?? 0}</Badge>
              </div>

              {(financeSummary?.obligations.unpaidCommissions.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Geen onbetaalde commissies.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {financeSummary?.obligations.unpaidCommissions.map((commission) => (
                    <div key={commission.id} className="rounded-lg border border-border bg-background/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{commission.counterparty_name}</p>
                          <p className="text-xs text-muted-foreground">{commission.location_name || 'No location'} - {formatDate(commission.created_at)}</p>
                        </div>
                        <Badge variant="warning">Commission</Badge>
                      </div>
                      <p className="mt-4 text-xl font-bold text-foreground">{formatCurrency(commission.amount, commission.currency)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {financeTab === 'forecast' && (
          <section className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">Jaarprognose</h2>
                    <Badge variant={confidenceVariant(financeSummary?.forecast.confidence)}>
                      {confidenceLabel(financeSummary?.forecast.confidence)} - {financeSummary?.forecast.confidenceScore ?? 0}%
                    </Badge>
                  </div>
                  <p className="max-w-3xl text-sm text-muted-foreground">
                    Rekent met echte sales, kostprijs, expenses en commissies. Recente maanden tellen zwaarder en de lopende maand wordt omgerekend naar een volledige maand.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">{new Date().getFullYear()}</Badge>
                  <Badge variant="default">{financeSummary?.forecast.dataMonths ?? 0} maanden data</Badge>
                  <Link
                    href="/reports"
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowUpRight size={13} />
                    Reports
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[1.1fr_1.2fr]">
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Verwachte jaarwinst</p>
                  <p className="mt-2 break-words text-[clamp(1.75rem,8vw,2.75rem)] font-bold leading-tight text-foreground">
                    {formatMoneySummary(financeSummary?.forecast.projectedNetProfit)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatSecondaryMoney(financeSummary?.forecast.projectedNetProfit)}
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-background/50 p-3">
                      <p className="text-xs text-muted-foreground">Nog te projecteren</p>
                      <p className="font-bold text-foreground">{financeSummary?.forecast.remainingMonthEquivalent ?? 0} maand(en)</p>
                    </div>
                    <div className="rounded-md bg-background/50 p-3">
                      <p className="text-xs text-muted-foreground">Spaarcapaciteit na open posten</p>
                      <p className="font-bold text-foreground">{formatMoneySummary(financeSummary?.forecast.projectedSavingsCapacity)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {forecastCards
                    .filter((card) => card.label !== 'Jaarwinst' && card.label !== 'Spaarcapaciteit')
                    .map(({ label, value, icon: Icon }) => (
                      <div key={label} className="rounded-lg border border-border bg-background/40 p-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                          <Icon size={16} className="text-muted-foreground" />
                        </div>
                        <p className="break-words text-xl font-bold text-foreground">{formatMoneySummary(value)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatSecondaryMoney(value)}</p>
                      </div>
                    ))}
                  {forecastRunRates.map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-border bg-background/40 p-4">
                      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                      <p className="mt-2 break-words text-lg font-bold text-foreground">{formatMoneySummary(value)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatSecondaryMoney(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-foreground">Data achter de prognose</h2>
                <p className="text-sm text-muted-foreground">{financeSummary?.forecast.method}</p>
              </div>

              {forecastHistory.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nog niet genoeg verkoop- of expensehistorie voor een sterke prognose.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {forecastHistory.map((month) => (
                    <div key={month.month} className="rounded-lg border border-border bg-background/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-foreground">{month.label}</p>
                          <p className="text-xs text-muted-foreground">{month.saleCount} sales - {month.expenseCount} expenses</p>
                        </div>
                        {month.isPartial && <Badge variant="warning">Lopend</Badge>}
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Omzet</span>
                          <span className="font-semibold text-foreground">{formatMoneySummary(month.revenue)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Uitgaven</span>
                          <span className="font-semibold text-foreground">{formatMoneySummary(month.expenses)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Winst</span>
                          <span className="font-semibold text-foreground">{formatMoneySummary(month.netProfit)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-bold text-foreground">Year-to-date overzicht</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ['YTD omzet', financeSummary?.yearToDate.revenue],
                  ['YTD bruto winst', financeSummary?.yearToDate.grossProfit],
                  ['YTD netto winst', financeSummary?.yearToDate.netProfit],
                  ['YTD expenses', financeSummary?.yearToDate.expenses],
                  ['YTD commissies', financeSummary?.yearToDate.commissions],
                  ['Huidige savings', financeSummary?.wallets.savings],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
                    <span className="text-sm font-semibold text-muted-foreground">{label as string}</span>
                    <span className="text-sm font-bold text-foreground">{formatMoneySummary(value as FinanceMoneyTotals | undefined)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </PageContainer>

      <Modal isOpen={showWalletForm} onClose={resetWalletForm} title={editingWallet ? 'Edit Wallet' : 'New Wallet'} size="md">
        <form onSubmit={handleSubmitWallet} className="space-y-4">
          <Select label="Location" value={walletForm.location_id} onChange={(event) => setWalletForm({ ...walletForm, location_id: event.target.value })} required>
            <option value="">Select location...</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </Select>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Type" value={walletForm.type} onChange={(event) => setWalletForm({ ...walletForm, type: event.target.value as 'cash' | 'bank' })}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </Select>
            <Select label="Currency" value={walletForm.currency} onChange={(event) => setWalletForm({ ...walletForm, currency: event.target.value as Currency })}>
              <option value="SRD">SRD</option>
              <option value="USD">USD</option>
            </Select>
          </div>

          <Select label="Purpose" value={walletForm.purpose} onChange={(event) => setWalletForm({ ...walletForm, purpose: event.target.value as WalletPurpose })}>
            <option value="operational">Operational</option>
            <option value="savings">Savings</option>
            <option value="reserve">Reserve</option>
          </Select>

          <Input
            label={editingWallet ? 'Balance' : 'Initial Balance'}
            type="number"
            step="0.01"
            min="0"
            value={walletForm.balance}
            onChange={(event) => setWalletForm({ ...walletForm, balance: event.target.value })}
            placeholder="0.00"
          />

          <div className="flex gap-3">
            <Button type="button" onClick={resetWalletForm} variant="secondary" fullWidth>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              {editingWallet ? 'Update' : 'Create'} Wallet
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showObligationForm}
        onClose={resetObligationForm}
        title={editingObligation ? `Edit ${obligationTypeLabel(obligationForm.type)}` : `New ${obligationTypeLabel(obligationForm.type)}`}
        size="md"
      >
        <form onSubmit={handleSubmitObligation} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Type" value={obligationForm.type} onChange={(event) => setObligationForm({ ...obligationForm, type: event.target.value as FinanceObligationType })}>
              <option value="receivable">Debiteur</option>
              <option value="payable">Crediteur</option>
            </Select>
            <Select label="Status" value={obligationForm.status} onChange={(event) => setObligationForm({ ...obligationForm, status: event.target.value as FinanceObligationStatus })}>
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>

          <Input
            label="Name"
            value={obligationForm.counterparty_name}
            onChange={(event) => setObligationForm({ ...obligationForm, counterparty_name: event.target.value })}
            placeholder="Customer, supplier, seller..."
            required
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Location" value={obligationForm.location_id} onChange={(event) => setObligationForm({ ...obligationForm, location_id: event.target.value })}>
              <option value="">No location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </Select>
            <Select label="Currency" value={obligationForm.currency} onChange={(event) => setObligationForm({ ...obligationForm, currency: event.target.value as Currency })}>
              <option value="SRD">SRD</option>
              <option value="USD">USD</option>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Original amount"
              type="number"
              step="0.01"
              min="0"
              value={obligationForm.original_amount}
              onChange={(event) => setObligationForm({ ...obligationForm, original_amount: event.target.value })}
              required
            />
            <Input
              label="Paid / received"
              type="number"
              step="0.01"
              min="0"
              value={obligationForm.paid_amount}
              onChange={(event) => setObligationForm({ ...obligationForm, paid_amount: event.target.value })}
            />
          </div>

          <Input
            label="Due date"
            type="date"
            value={obligationForm.due_date}
            onChange={(event) => setObligationForm({ ...obligationForm, due_date: event.target.value })}
          />

          <Textarea
            label="Notes"
            value={obligationForm.notes}
            onChange={(event) => setObligationForm({ ...obligationForm, notes: event.target.value })}
            placeholder="Reference, invoice number, payment terms..."
          />

          <div className="flex gap-3">
            <Button type="button" onClick={resetObligationForm} variant="secondary" fullWidth>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showTransactionForm}
        onClose={() => {
          setShowTransactionForm(false)
          setSelectedWallet(null)
          setTransactionForm({ type: 'add', amount: '', description: '' })
        }}
        title="Wallet Transaction"
        size="md"
      >
        {selectedWallet && (
          <form onSubmit={handleTransaction} className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
              <p className="text-sm text-muted-foreground">{getWalletDisplayName(selectedWallet)}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(selectedWallet.balance, selectedWallet.currency as Currency)}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {transactionTypes.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTransactionForm({ ...transactionForm, type })}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors ${
                    transactionForm.type === type
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>

            <Input
              label={transactionForm.type === 'correct' ? 'New balance' : 'Amount'}
              type="number"
              min="0"
              step="0.01"
              value={transactionForm.amount}
              onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })}
              required
            />

            <Input
              label="Description"
              value={transactionForm.description}
              onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })}
              placeholder="Reference or reason"
            />

            <Button type="submit" variant={transactionForm.type === 'remove' ? 'danger' : 'primary'} fullWidth loading={submitting}>
              Save Transaction
            </Button>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={showTransferForm}
        onClose={() => {
          setShowTransferForm(false)
          setTransferForm({ fromWalletId: '', toWalletId: '', amount: '', description: '' })
        }}
        title="Transfer Between Wallets"
        size="md"
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <Select value={transferForm.fromWalletId} label="From wallet" onChange={(event) => setTransferForm({ ...transferForm, fromWalletId: event.target.value, toWalletId: '' })} required>
            <option value="">Select source...</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {getWalletDisplayName(wallet)} ({formatCurrency(wallet.balance, wallet.currency as Currency)})
              </option>
            ))}
          </Select>

          <Select value={transferForm.toWalletId} label="To wallet" onChange={(event) => setTransferForm({ ...transferForm, toWalletId: event.target.value })} required>
            <option value="">Select destination...</option>
            {wallets
              .filter((wallet) => {
                if (!transferForm.fromWalletId) return true
                const fromWallet = wallets.find((candidate) => candidate.id === transferForm.fromWalletId)
                return wallet.id !== transferForm.fromWalletId && wallet.currency === fromWallet?.currency
              })
              .map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {getWalletDisplayName(wallet)} ({formatCurrency(wallet.balance, wallet.currency as Currency)})
                </option>
              ))}
          </Select>

          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={transferForm.amount}
            onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })}
            required
          />

          <Input
            label="Description"
            value={transferForm.description}
            onChange={(event) => setTransferForm({ ...transferForm, description: event.target.value })}
            placeholder="Reference or reason"
          />

          <Button type="submit" variant="primary" fullWidth loading={submitting}>
            <ArrowRightLeft size={18} />
            Transfer
          </Button>
        </form>
      </Modal>

      <Modal isOpen={showTransactionHistory} onClose={() => setShowTransactionHistory(false)} title="Transaction History" size="xl">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Search" value={historySearchQuery} onChange={(event) => setHistorySearchQuery(event.target.value)} placeholder="Wallet or description" />
            <Select label="Type" value={historyTypeFilter} onChange={(event) => setHistoryTypeFilter(event.target.value as HistoryFilter)}>
              <option value="all">All types</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
              <option value="adjustment">Adjustment</option>
            </Select>
            <Select label="Wallet" value={historyWalletFilter} onChange={(event) => setHistoryWalletFilter(event.target.value)}>
              <option value="">All wallets</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>{getWalletDisplayName(wallet)}</option>
              ))}
            </Select>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              No transactions found.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {transaction.type === 'credit' ? (
                        <ArrowDownLeft size={16} className="text-emerald-400" />
                      ) : transaction.type === 'debit' ? (
                        <ArrowUpRight size={16} className="text-rose-400" />
                      ) : (
                        <Edit size={16} className="text-sky-400" />
                      )}
                      <p className="truncate text-sm font-semibold text-foreground">
                        {transaction.wallets ? getWalletDisplayName(transaction.wallets) : 'Wallet'}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {transaction.description || transaction.reference_type || 'Transaction'} - {transaction.created_at ? new Date(transaction.created_at).toLocaleString() : '-'}
                    </p>
                  </div>
                  <p className={`font-bold ${transaction.type === 'credit' ? 'text-emerald-400' : transaction.type === 'debit' ? 'text-rose-400' : 'text-sky-400'}`}>
                    {transaction.type === 'credit' ? '+' : transaction.type === 'debit' ? '-' : ''}
                    {formatCurrency(transaction.amount, (transaction.currency || transaction.wallets?.currency || 'SRD') as Currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

function WalletTile({
  wallet,
  onAdjust,
  onEdit,
  onDelete,
}: {
  wallet: WalletWithLocation
  onAdjust: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isCash = wallet.type === 'cash'
  const walletTypeLabel = isCash ? 'Cash' : 'Bank'

  return (
    <div className={`rounded-lg border bg-background/40 p-4 ${isCash ? 'border-emerald-500/20' : 'border-sky-500/20'}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isCash ? 'bg-emerald-500/10 text-emerald-400' : 'bg-sky-500/10 text-sky-400'}`}>
          {isCash ? <Banknote size={19} /> : <CreditCard size={19} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-foreground">{walletTypeLabel}</p>
            <Badge variant={wallet.currency === 'USD' ? 'info' : 'success'}>{wallet.currency}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="min-w-0 text-xs text-muted-foreground">{wallet.locations?.name || wallet.person_name}</p>
            <Badge variant={getPurposeBadgeVariant(wallet.purpose)} className="shrink-0">{WALLET_PURPOSE_LABELS[wallet.purpose]}</Badge>
          </div>
        </div>
      </div>

      <p className="break-words text-[clamp(1.25rem,5vw,1.5rem)] font-bold leading-tight text-foreground">
        {formatCurrency(wallet.balance, wallet.currency as Currency)}
      </p>

      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
        <Button onClick={onAdjust} variant="secondary" size="sm" fullWidth>
          <DollarSign size={15} />
          Adjust
        </Button>
        <Button onClick={onEdit} variant="ghost" size="sm" ariaLabel={`Edit ${walletTypeLabel} wallet`}>
          <Edit size={15} />
        </Button>
        <Button onClick={onDelete} variant="ghost" size="sm" ariaLabel={`Delete ${walletTypeLabel} wallet`}>
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  )
}

function ObligationSection({
  title,
  subtitle,
  type,
  obligations,
  search,
  status,
  onSearch,
  onStatus,
  onCreate,
  onEdit,
  onMarkPaid,
  onCancel,
  onDelete,
}: {
  title: string
  subtitle: string
  type: FinanceObligationType
  obligations: FinanceObligationRecord[]
  search: string
  status: 'all' | FinanceObligationStatus
  onSearch: (value: string) => void
  onStatus: (value: 'all' | FinanceObligationStatus) => void
  onCreate: () => void
  onEdit: (obligation: FinanceObligationRecord) => void
  onMarkPaid: (obligation: FinanceObligationRecord) => void
  onCancel: (obligation: FinanceObligationRecord) => void
  onDelete: (obligation: FinanceObligationRecord) => void
}) {
  const srdTotal = obligations.filter((o) => o.currency === 'SRD').reduce((sum, o) => sum + o.outstanding_amount, 0)
  const usdTotal = obligations.filter((o) => o.currency === 'USD').reduce((sum, o) => sum + o.outstanding_amount, 0)
  const Icon = type === 'receivable' ? ReceiptText : FileText

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Icon size={18} className={type === 'receivable' ? 'text-sky-400' : 'text-orange-400'} />
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {usdTotal > 0 && <Badge variant={type === 'receivable' ? 'info' : 'warning'}>{formatCurrency(usdTotal, 'USD')}</Badge>}
          {(srdTotal > 0 || usdTotal === 0) && <Badge variant={type === 'receivable' ? 'info' : 'warning'}>{formatCurrency(srdTotal, 'SRD')}</Badge>}
          <Button onClick={onCreate} variant="primary" size="sm">
            <Plus size={16} />
            New
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <Input label="Search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Name, location, note" />
        <Select label="Status" value={status} onChange={(event) => onStatus(event.target.value as 'all' | FinanceObligationStatus)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {obligations.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={`No ${title.toLowerCase()} found`}
          description="Create a new record or change the filters."
          action={
            <Button onClick={onCreate} variant="primary" size="sm">
              <Plus size={15} />
              New
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {obligations.map((obligation) => (
            <div key={obligation.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-foreground">{obligation.counterparty_name}</p>
                    <Badge variant={statusVariant(obligation.status)}>{obligation.status}</Badge>
                    {obligation.location_name && <Badge variant="default">{obligation.location_name}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Due {formatDate(obligation.due_date)} - created {formatDate(obligation.created_at)}
                  </p>
                  {obligation.notes && <p className="mt-1 text-sm text-muted-foreground">{obligation.notes}</p>}
                </div>

                <div className="flex flex-col gap-3 lg:items-end">
                  <div className="text-left lg:text-right">
                    <p className="text-lg font-bold text-foreground">{formatCurrency(obligation.outstanding_amount, obligation.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      paid {formatCurrency(obligation.paid_amount, obligation.currency)} / {formatCurrency(obligation.original_amount, obligation.currency)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {obligation.status !== 'paid' && obligation.status !== 'cancelled' && (
                      <Button onClick={() => onMarkPaid(obligation)} variant="success" size="sm">
                        <CheckCircle2 size={15} />
                        Paid
                      </Button>
                    )}
                    {obligation.status !== 'cancelled' && (
                      <Button onClick={() => onCancel(obligation)} variant="secondary" size="sm">
                        <X size={15} />
                        Cancel
                      </Button>
                    )}
                    <Button onClick={() => onEdit(obligation)} variant="ghost" size="sm">
                      <Edit size={15} />
                    </Button>
                    <Button onClick={() => onDelete(obligation)} variant="ghost" size="sm">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
