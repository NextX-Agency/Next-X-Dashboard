import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { DEFAULT_EXCHANGE_RATE, normalizeExchangeRate } from '@/lib/pricing'
import { prisma } from '@/lib/prisma'
import type {
  FinanceMoneyTotals,
  FinanceObligationRecord,
  FinancePeriodSummary,
  FinanceSummaryPayload,
  FinanceSystemPayable,
  FinanceWalletSummary,
} from '@/types/finance'
import type { Currency } from '@/lib/currency'

type MoneySource = {
  amount: unknown
  currency: string | null | undefined
  exchangeRate?: unknown
}

type ProfitSale = {
  id: string
  currency: string
  exchangeRate: unknown
  totalAmount: unknown
  saleItems: Array<{
    quantity: number
    item: {
      purchasePriceUsd: unknown
    } | null
  }>
}

type ProfitExpense = {
  amount: unknown
  currency: string
  description: string | null
  category: {
    name: string
  } | null
}

type ProfitCommission = {
  commissionAmount: unknown
  sale: {
    currency: string
    exchangeRate: unknown
  } | null
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNullableIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function getCurrency(value: string | null | undefined): Currency {
  return value === 'USD' ? 'USD' : 'SRD'
}

function emptyMoney(): FinanceMoneyTotals {
  return { srd: 0, usd: 0, totalSrd: 0, totalUsd: 0 }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function toUsd(amount: unknown, currency: string | null | undefined, exchangeRate: number): number {
  const numericAmount = toNumber(amount)
  return getCurrency(currency) === 'SRD' ? numericAmount / exchangeRate : numericAmount
}

function toSrd(amount: unknown, currency: string | null | undefined, exchangeRate: number): number {
  const numericAmount = toNumber(amount)
  return getCurrency(currency) === 'USD' ? numericAmount * exchangeRate : numericAmount
}

function addMoney(total: FinanceMoneyTotals, source: MoneySource, fallbackRate: number) {
  const amount = toNumber(source.amount)
  const currency = getCurrency(source.currency)
  const rate = normalizeExchangeRate(toNumber(source.exchangeRate) || fallbackRate)

  if (currency === 'USD') {
    total.usd += amount
  } else {
    total.srd += amount
  }

  total.totalUsd += toUsd(amount, currency, rate)
  total.totalSrd += toSrd(amount, currency, rate)
}

function finishMoney(total: FinanceMoneyTotals): FinanceMoneyTotals {
  return {
    srd: roundMoney(total.srd),
    usd: roundMoney(total.usd),
    totalSrd: roundMoney(total.totalSrd),
    totalUsd: roundMoney(total.totalUsd),
  }
}

function moneyFromUsd(usd: number, exchangeRate: number): FinanceMoneyTotals {
  return finishMoney({
    srd: 0,
    usd,
    totalSrd: usd * exchangeRate,
    totalUsd: usd,
  })
}

function scaleMoney(total: FinanceMoneyTotals, multiplier: number): FinanceMoneyTotals {
  return finishMoney({
    srd: total.srd * multiplier,
    usd: total.usd * multiplier,
    totalSrd: total.totalSrd * multiplier,
    totalUsd: total.totalUsd * multiplier,
  })
}

function isInventoryExpense(expense: ProfitExpense): boolean {
  const categoryName = (expense.category?.name || '').toLowerCase().trim()
  const isInventory =
    categoryName === 'business expense' ||
    categoryName === 'personal items' ||
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
    categoryName === 'inventory shipping' ||
    categoryName === 'stock shipping' ||
    categoryName.includes('product shipping')

  const description = (expense.description || '').toLowerCase()
  const hasInventoryKeywords = description.includes('inventory') ||
    description.includes('stock') ||
    description.includes('wholesale') ||
    description.includes('supplier') ||
    description.includes('vendor')

  return isInventory || (hasInventoryKeywords && (categoryName === 'shipping' || categoryName === 'marketing'))
}

function buildPeriodSummary(
  sales: ProfitSale[],
  expenses: ProfitExpense[],
  commissions: ProfitCommission[],
  exchangeRate: number,
): FinancePeriodSummary {
  const revenue = emptyMoney()
  const expensesTotal = emptyMoney()
  const operatingExpenses = emptyMoney()
  const commissionsTotal = emptyMoney()

  let cogsUsd = 0

  for (const sale of sales) {
    const saleRate = normalizeExchangeRate(toNumber(sale.exchangeRate) || exchangeRate)
    addMoney(revenue, { amount: sale.totalAmount, currency: sale.currency, exchangeRate: saleRate }, exchangeRate)
    cogsUsd += sale.saleItems.reduce((sum, saleItem) => (
      sum + (toNumber(saleItem.item?.purchasePriceUsd) * saleItem.quantity)
    ), 0)
  }

  for (const expense of expenses) {
    addMoney(expensesTotal, { amount: expense.amount, currency: expense.currency }, exchangeRate)
    if (!isInventoryExpense(expense)) {
      addMoney(operatingExpenses, { amount: expense.amount, currency: expense.currency }, exchangeRate)
    }
  }

  for (const commission of commissions) {
    const commissionCurrency = commission.sale?.currency || 'USD'
    const commissionRate = normalizeExchangeRate(toNumber(commission.sale?.exchangeRate) || exchangeRate)
    addMoney(commissionsTotal, {
      amount: commission.commissionAmount,
      currency: commissionCurrency,
      exchangeRate: commissionRate,
    }, exchangeRate)
  }

  const cogs = moneyFromUsd(cogsUsd, exchangeRate)
  const revenueFinished = finishMoney(revenue)
  const grossProfitUsd = revenueFinished.totalUsd - cogs.totalUsd
  const netProfitUsd = grossProfitUsd - finishMoney(operatingExpenses).totalUsd - finishMoney(commissionsTotal).totalUsd

  return {
    revenue: revenueFinished,
    expenses: finishMoney(expensesTotal),
    operatingExpenses: finishMoney(operatingExpenses),
    commissions: finishMoney(commissionsTotal),
    cogs,
    grossProfit: moneyFromUsd(grossProfitUsd, exchangeRate),
    netProfit: moneyFromUsd(netProfitUsd, exchangeRate),
    saleCount: sales.length,
    expenseCount: expenses.length,
  }
}

function mapObligation(obligation: {
  id: string
  type: string
  counterpartyName: string
  locationId: string | null
  currency: string
  originalAmount: unknown
  paidAmount: unknown
  status: string
  dueDate: Date | null
  issuedAt: Date
  notes: string | null
  sourceType: string | null
  sourceId: string | null
  createdAt: Date
  updatedAt: Date
  location: { name: string } | null
}): FinanceObligationRecord {
  const originalAmount = toNumber(obligation.originalAmount)
  const paidAmount = toNumber(obligation.paidAmount)

  return {
    id: obligation.id,
    type: obligation.type === 'payable' ? 'payable' : 'receivable',
    counterparty_name: obligation.counterpartyName,
    location_id: obligation.locationId,
    location_name: obligation.location?.name ?? null,
    currency: getCurrency(obligation.currency),
    original_amount: originalAmount,
    paid_amount: paidAmount,
    outstanding_amount: roundMoney(Math.max(0, originalAmount - paidAmount)),
    status: obligation.status === 'paid' || obligation.status === 'partial' || obligation.status === 'cancelled'
      ? obligation.status
      : 'open',
    due_date: toNullableIsoString(obligation.dueDate),
    issued_at: toIsoString(obligation.issuedAt),
    notes: obligation.notes,
    source_type: obligation.sourceType,
    source_id: obligation.sourceId,
    created_at: toIsoString(obligation.createdAt),
    updated_at: toIsoString(obligation.updatedAt),
  }
}

function sumObligations(obligations: FinanceObligationRecord[], exchangeRate: number): FinanceMoneyTotals {
  const total = emptyMoney()
  for (const obligation of obligations) {
    addMoney(total, {
      amount: obligation.outstanding_amount,
      currency: obligation.currency,
    }, exchangeRate)
  }
  return finishMoney(total)
}

function sumSystemPayables(payables: FinanceSystemPayable[], exchangeRate: number): FinanceMoneyTotals {
  const total = emptyMoney()
  for (const payable of payables) {
    addMoney(total, { amount: payable.amount, currency: payable.currency }, exchangeRate)
  }
  return finishMoney(total)
}

function buildWalletSummary(wallets: Array<{
  type: string
  currency: string
  balance: unknown
  purpose: string
}>, exchangeRate: number): FinanceWalletSummary {
  const summary = {
    operational: emptyMoney(),
    savings: emptyMoney(),
    reserve: emptyMoney(),
    cash: emptyMoney(),
    bank: emptyMoney(),
    total: emptyMoney(),
  }

  for (const wallet of wallets) {
    const source = { amount: wallet.balance, currency: wallet.currency }
    if (wallet.purpose === 'savings') addMoney(summary.savings, source, exchangeRate)
    else if (wallet.purpose === 'reserve') addMoney(summary.reserve, source, exchangeRate)
    else addMoney(summary.operational, source, exchangeRate)

    if (wallet.type === 'bank') addMoney(summary.bank, source, exchangeRate)
    else addMoney(summary.cash, source, exchangeRate)

    addMoney(summary.total, source, exchangeRate)
  }

  return {
    operational: finishMoney(summary.operational),
    savings: finishMoney(summary.savings),
    reserve: finishMoney(summary.reserve),
    cash: finishMoney(summary.cash),
    bank: finishMoney(summary.bank),
    total: finishMoney(summary.total),
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [
      currentRate,
      monthSales,
      yearSales,
      monthExpenses,
      yearExpenses,
      monthCommissions,
      yearCommissions,
      wallets,
      obligationsRaw,
      unpaidCommissionsRaw,
    ] = await Promise.all([
      prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' } }),
      prisma.sale.findMany({
        where: { createdAt: { gte: thisMonthStart, lt: nextMonthStart } },
        select: {
          id: true,
          currency: true,
          exchangeRate: true,
          totalAmount: true,
          saleItems: {
            select: {
              quantity: true,
              item: { select: { purchasePriceUsd: true } },
            },
          },
        },
      }),
      prisma.sale.findMany({
        where: { createdAt: { gte: yearStart, lt: nextYearStart } },
        select: {
          id: true,
          currency: true,
          exchangeRate: true,
          totalAmount: true,
          saleItems: {
            select: {
              quantity: true,
              item: { select: { purchasePriceUsd: true } },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: { createdAt: { gte: thisMonthStart, lt: nextMonthStart } },
        select: {
          amount: true,
          currency: true,
          description: true,
          category: { select: { name: true } },
        },
      }),
      prisma.expense.findMany({
        where: { createdAt: { gte: yearStart, lt: nextYearStart } },
        select: {
          amount: true,
          currency: true,
          description: true,
          category: { select: { name: true } },
        },
      }),
      prisma.commission.findMany({
        where: { createdAt: { gte: thisMonthStart, lt: nextMonthStart } },
        select: {
          commissionAmount: true,
          sale: { select: { currency: true, exchangeRate: true } },
        },
      }),
      prisma.commission.findMany({
        where: { createdAt: { gte: yearStart, lt: nextYearStart } },
        select: {
          commissionAmount: true,
          sale: { select: { currency: true, exchangeRate: true } },
        },
      }),
      prisma.wallet.findMany({
        select: {
          type: true,
          currency: true,
          balance: true,
          purpose: true,
        },
      }),
      prisma.financeObligation.findMany({
        where: { status: { in: ['open', 'partial'] } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          type: true,
          counterpartyName: true,
          locationId: true,
          currency: true,
          originalAmount: true,
          paidAmount: true,
          status: true,
          dueDate: true,
          issuedAt: true,
          notes: true,
          sourceType: true,
          sourceId: true,
          createdAt: true,
          updatedAt: true,
          location: { select: { name: true } },
        },
      }),
      prisma.commission.findMany({
        where: { paid: false },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          commissionAmount: true,
          createdAt: true,
          seller: { select: { name: true } },
          locations: { select: { name: true } },
          sale: { select: { currency: true, exchangeRate: true } },
        },
      }),
    ])

    const exchangeRate = normalizeExchangeRate(toNumber(currentRate?.usdToSrd) || DEFAULT_EXCHANGE_RATE)
    const obligations = obligationsRaw.map(mapObligation)
    const openReceivables = obligations.filter((obligation) => obligation.type === 'receivable')
    const openPayables = obligations.filter((obligation) => obligation.type === 'payable')
    const overdueReceivables = openReceivables.filter((obligation) => obligation.due_date && new Date(obligation.due_date) < todayStart)
    const overduePayables = openPayables.filter((obligation) => obligation.due_date && new Date(obligation.due_date) < todayStart)

    const unpaidCommissions = unpaidCommissionsRaw.map<FinanceSystemPayable>((commission) => ({
      id: commission.id,
      source_type: 'commission',
      counterparty_name: commission.seller?.name ?? 'Seller',
      location_name: commission.locations?.name ?? null,
      currency: getCurrency(commission.sale?.currency),
      amount: roundMoney(toNumber(commission.commissionAmount)),
      created_at: toIsoString(commission.createdAt),
    }))

    const month = buildPeriodSummary(monthSales, monthExpenses, monthCommissions, exchangeRate)
    const yearToDate = buildPeriodSummary(yearSales, yearExpenses, yearCommissions, exchangeRate)
    const monthsElapsed = now.getMonth() + 1
    const projectionMultiplier = 12 / monthsElapsed
    const projectedNetProfitUsd = yearToDate.netProfit.totalUsd * projectionMultiplier
    const openManualAndSystemPayablesUsd = sumObligations(openPayables, exchangeRate).totalUsd +
      sumSystemPayables(unpaidCommissions, exchangeRate).totalUsd
    const projectedSavingsUsd = Math.max(0, projectedNetProfitUsd - openManualAndSystemPayablesUsd)

    const data: FinanceSummaryPayload = {
      exchangeRate,
      month,
      yearToDate,
      wallets: buildWalletSummary(wallets, exchangeRate),
      obligations: {
        receivables: sumObligations(openReceivables, exchangeRate),
        payables: sumObligations(openPayables, exchangeRate),
        overdueReceivables: sumObligations(overdueReceivables, exchangeRate),
        overduePayables: sumObligations(overduePayables, exchangeRate),
        systemPayables: sumSystemPayables(unpaidCommissions, exchangeRate),
        openReceivables: openReceivables.slice(0, 20),
        openPayables: openPayables.slice(0, 20),
        unpaidCommissions: unpaidCommissions.slice(0, 12),
      },
      forecast: {
        monthsElapsed,
        projectedRevenue: scaleMoney(yearToDate.revenue, projectionMultiplier),
        projectedExpenses: scaleMoney(yearToDate.expenses, projectionMultiplier),
        projectedNetProfit: moneyFromUsd(projectedNetProfitUsd, exchangeRate),
        projectedSavingsCapacity: moneyFromUsd(projectedSavingsUsd, exchangeRate),
      },
    }

    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Finance summary route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
