import type { Prisma } from '@prisma/client'
import { countableExpenseWhere, countableSaleWhere } from '@/lib/financialFilters'
import { isExcludedExpenseFromOperatingProfit } from '@/lib/expenseClassification'

type SettingMap = Map<string, string>

const value = (settings: SettingMap, key: string, fallback: number) => {
  const parsed = Number(settings.get(key))
  return Number.isFinite(parsed) ? parsed : fallback
}

const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
export const payoutPeriodKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

export type PayoutEvaluation = {
  periodKey: string
  trailingMonths: number
  trailingAvgProfit: number
  distributable: number
  savingsAmount: number
  foundersAmount: number
  restockCeiling: number
  blockedBy: string | null
  blockedDetail: string | null
  sourceWalletId: string | null
  savingsWalletId: string | null
}

/** Compute a payout run conservatively. Any unknown is a breaker, never a guess. */
export async function evaluatePayout(
  tx: Prisma.TransactionClient,
  now = new Date(),
  preferredSourceWalletId?: string | null,
  preferredSavingsWalletId?: string | null,
): Promise<PayoutEvaluation> {
  const settingsRows = await tx.storeSetting.findMany({ where: { key: { startsWith: 'finance.payout_' } }, select: { key: true, value: true } })
  const settings = new Map(settingsRows.map((row) => [row.key, row.value]))
  const trailingMonths = Math.max(1, Math.floor(value(settings, 'finance.payout_trailing_months', 3)))
  const currentMonth = startOfMonth(now)
  const start = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - trailingMonths, 1))
  const end = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth(), 0, 23, 59, 59, 999))
  const [rate, sales, expenses, commissions, wallets, founders, dueSchedules] = await Promise.all([
    tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true, setAt: true } }),
    tx.sale.findMany({ where: countableSaleWhere({ createdAt: { gte: start, lte: end } }), select: { currency: true, exchangeRate: true, saleItems: { select: { quantity: true, subtotal: true, unitCostUsd: true, costIsEstimated: true } } } }),
    tx.expense.findMany({ where: countableExpenseWhere({ createdAt: { gte: start, lte: end } }), select: { amount: true, currency: true, classification: true, description: true, category: { select: { name: true } } } }),
    tx.commission.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { commissionAmount: true, sale: { select: { currency: true, exchangeRate: true } } } }),
    tx.wallet.findMany({ where: { currency: 'SRD' }, select: { id: true, companyId: true, purpose: true, type: true, balance: true, location_id: true } }),
    tx.founder.findMany({ where: { isActive: true }, select: { id: true, splitPercent: true } }),
    tx.recurringExpense.count({ where: { isActive: true, autoPost: true, nextRunOn: { lte: end } } }),
  ])
  const activeRate = rate ? Number(rate.usdToSrd) : 0
  const revenueMinusCogs = sales.reduce((total, sale) => {
    const saleRate = Number(sale.exchangeRate) || activeRate
    return total + sale.saleItems.reduce((sum, line) => {
      const revenueSrd = sale.currency === 'USD' ? Number(line.subtotal) * saleRate : Number(line.subtotal)
      const costSrd = Number(line.unitCostUsd) * line.quantity * saleRate
      return sum + revenueSrd - costSrd
    }, 0)
  }, 0)
  const operatingExpenses = expenses.reduce((total, expense) => isExcludedExpenseFromOperatingProfit({ classification: expense.classification, categoryName: expense.category?.name, description: expense.description }) ? total : total + (expense.currency === 'USD' ? Number(expense.amount) * activeRate : Number(expense.amount)), 0)
  const recordedCommissions = commissions.reduce((total, commission) => total + (commission.sale?.currency === 'USD' ? Number(commission.commissionAmount) * (Number(commission.sale.exchangeRate) || activeRate) : Number(commission.commissionAmount)), 0)
  const trailingAvgProfit = Math.round(((revenueMinusCogs - operatingExpenses - recordedCommissions) / trailingMonths) * 100) / 100
  const sourceWallet = wallets.find((wallet) => wallet.id === preferredSourceWalletId) ?? wallets.find((wallet) => wallet.purpose === 'operational' && wallet.type === 'cash') ?? null
  const savingsWallet = wallets.find((wallet) => wallet.id === preferredSavingsWalletId) ?? wallets.find((wallet) => wallet.purpose === 'savings') ?? null
  const savingsTarget = value(settings, 'finance.payout_savings_target_srd', 23439)
  const sourceSavings = savingsWallet ? Number(savingsWallet.balance) : 0
  const afterTarget = sourceSavings >= savingsTarget
  const savingsPct = value(settings, afterTarget ? 'finance.payout_split_savings_pct_after_target' : 'finance.payout_split_savings_pct', afterTarget ? 50 : 65) / 100
  const foundersPct = value(settings, afterTarget ? 'finance.payout_split_founders_pct_after_target' : 'finance.payout_split_founders_pct', afterTarget ? 30 : 20) / 100
  const restockPct = value(settings, afterTarget ? 'finance.payout_split_restock_pct_after_target' : 'finance.payout_split_restock_pct', afterTarget ? 20 : 15) / 100
  const distributable = Math.max(0, trailingAvgProfit)
  const foundersAmount = Math.round(distributable * foundersPct * 100) / 100
  const savingsAmount = Math.round(distributable * savingsPct * 100) / 100
  const restockCeiling = Math.round(distributable * restockPct * 100) / 100
  const breakers: Array<[string, string]> = []
  if (!rate || Math.floor((now.getTime() - rate.setAt.getTime()) / 86400000) > value(settings, 'finance.payout_stale_fx_days', 30)) breakers.push(['stale_fx', 'No active exchange rate, or active rate is stale.'])
  if (trailingAvgProfit <= 0) breakers.push(['negative_earnings', 'Trailing operating profit is zero or negative.'])
  if (!sourceWallet || !savingsWallet || sourceWallet.companyId !== savingsWallet.companyId) breakers.push(['wallet_configuration', 'Operational SRD source and savings wallet must both be configured in one company.'])
  if (founders.length === 0 || Math.abs(founders.reduce((sum, founder) => sum + Number(founder.splitPercent), 0) - 100) > 0.001) breakers.push(['founder_configuration', 'Active founders must be configured with splits totaling 100%.'])
  if (dueSchedules > 0) breakers.push(['subscriptions_unposted', `${dueSchedules} recurring subscription(s) due before period close remain unposted.`])
  if (sourceWallet && Number(sourceWallet.balance) - foundersAmount - savingsAmount < value(settings, 'finance.payout_reserve_floor_srd', 15000)) breakers.push(['reserve_floor', 'Payout transfers would breach the operating-cash reserve floor.'])
  if (foundersAmount > value(settings, 'finance.payout_max_srd', 10000)) breakers.push(['absolute_ceiling', 'Founder draw exceeds the configured payout ceiling.'])
  return { periodKey: payoutPeriodKey(end), trailingMonths, trailingAvgProfit, distributable, savingsAmount, foundersAmount, restockCeiling, blockedBy: breakers[0]?.[0] ?? null, blockedDetail: breakers.map((breaker) => breaker[1]).join(' ' ) || null, sourceWalletId: sourceWallet?.id ?? null, savingsWalletId: savingsWallet?.id ?? null }
}
