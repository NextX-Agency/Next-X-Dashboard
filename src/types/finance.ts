import type { Currency } from '@/lib/currency'

export type FinanceObligationType = 'receivable' | 'payable'
export type FinanceObligationStatus = 'open' | 'partial' | 'paid' | 'cancelled'

export interface FinanceMoneyTotals {
  srd: number
  usd: number
  totalSrd: number
  totalUsd: number
}

export interface FinancePeriodSummary {
  revenue: FinanceMoneyTotals
  expenses: FinanceMoneyTotals
  operatingExpenses: FinanceMoneyTotals
  commissions: FinanceMoneyTotals
  cogs: FinanceMoneyTotals
  grossProfit: FinanceMoneyTotals
  netProfit: FinanceMoneyTotals
  saleCount: number
  expenseCount: number
}

export interface FinanceObligationRecord {
  id: string
  type: FinanceObligationType
  counterparty_name: string
  location_id: string | null
  location_name: string | null
  currency: Currency
  original_amount: number
  paid_amount: number
  outstanding_amount: number
  status: FinanceObligationStatus
  due_date: string | null
  issued_at: string
  notes: string | null
  source_type: string | null
  source_id: string | null
  created_at: string
  updated_at: string
}

export interface FinanceSystemPayable {
  id: string
  source_type: 'commission'
  counterparty_name: string
  location_name: string | null
  currency: Currency
  amount: number
  created_at: string
}

export interface FinanceWalletSummary {
  operational: FinanceMoneyTotals
  savings: FinanceMoneyTotals
  reserve: FinanceMoneyTotals
  cash: FinanceMoneyTotals
  bank: FinanceMoneyTotals
  total: FinanceMoneyTotals
}

export interface FinanceObligationSummary {
  receivables: FinanceMoneyTotals
  payables: FinanceMoneyTotals
  overdueReceivables: FinanceMoneyTotals
  overduePayables: FinanceMoneyTotals
  systemPayables: FinanceMoneyTotals
  openReceivables: FinanceObligationRecord[]
  openPayables: FinanceObligationRecord[]
  unpaidCommissions: FinanceSystemPayable[]
}

export interface FinanceForecastSummary {
  monthsElapsed: number
  elapsedMonthEquivalent: number
  remainingMonthEquivalent: number
  dataMonths: number
  confidence: 'low' | 'medium' | 'high'
  confidenceScore: number
  method: string
  monthlyRevenueRunRate: FinanceMoneyTotals
  monthlyExpensesRunRate: FinanceMoneyTotals
  monthlyNetProfitRunRate: FinanceMoneyTotals
  projectedRevenue: FinanceMoneyTotals
  projectedExpenses: FinanceMoneyTotals
  projectedNetProfit: FinanceMoneyTotals
  projectedSavingsCapacity: FinanceMoneyTotals
  history: FinanceForecastMonth[]
}

export interface FinanceForecastMonth {
  month: string
  label: string
  isPartial: boolean
  revenue: FinanceMoneyTotals
  expenses: FinanceMoneyTotals
  netProfit: FinanceMoneyTotals
  saleCount: number
  expenseCount: number
}

export interface FinanceSummaryPayload {
  exchangeRate: number
  month: FinancePeriodSummary
  yearToDate: FinancePeriodSummary
  wallets: FinanceWalletSummary
  obligations: FinanceObligationSummary
  forecast: FinanceForecastSummary
}

export interface FinanceSummaryResponse {
  data: FinanceSummaryPayload
}

export interface FinanceObligationsResponse {
  data: {
    obligations: FinanceObligationRecord[]
  }
}
