import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'

const dayKey = (value: Date) => value.toISOString().slice(0, 10)
const periodKey = (value: Date, cadence: string) => {
  const year = value.getUTCFullYear(); const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  if (cadence === 'weekly') return `${year}-W${String(Math.ceil((value.getUTCDate() + new Date(Date.UTC(year, value.getUTCMonth(), 1)).getUTCDay()) / 7)).padStart(2, '0')}`
  if (cadence === 'quarterly') return `${year}-Q${Math.floor(value.getUTCMonth() / 3) + 1}`
  if (cadence === 'yearly') return String(year)
  return `${year}-${month}`
}
const advance = (value: Date, cadence: string, anchorDay: number) => {
  const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), anchorDay))
  if (cadence === 'weekly') result.setUTCDate(result.getUTCDate() + 7)
  else if (cadence === 'quarterly') result.setUTCMonth(result.getUTCMonth() + 3)
  else if (cadence === 'yearly') result.setUTCFullYear(result.getUTCFullYear() + 1)
  else result.setUTCMonth(result.getUTCMonth() + 1)
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(anchorDay, last))
  return result
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const isScheduledRun = Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
  let actor: Awaited<ReturnType<typeof requireAdmin>> | null = null
  if (!isScheduledRun) {
    actor = await requireAdmin(request)
    if (actor instanceof NextResponse) return actor
  }
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const schedules = await prisma.recurringExpense.findMany({ where: { isActive: true, autoPost: true, nextRunOn: { lte: today } }, select: { id: true } })
  let posted = 0; let skipped = 0
  for (const schedule of schedules) {
    for (let attempts = 0; attempts < 3; attempts++) {
      const result = await runSerializableTransaction(async (tx) => {
        const current = await tx.recurringExpense.findUnique({ where: { id: schedule.id }, select: { id: true, name: true, vendorName: true, amount: true, currency: true, cadence: true, anchorDay: true, walletId: true, locationId: true, categoryId: true, classification: true, nextRunOn: true, isActive: true, autoPost: true } })
        if (!current || !current.isActive || !current.autoPost || current.nextRunOn > today) return 'done' as const
        if (!current.walletId) return 'skip' as const
        const wallet = await tx.wallet.findUnique({ where: { id: current.walletId }, select: { id: true, companyId: true, balance: true, currency: true, location_id: true } })
        if (!wallet || wallet.currency !== current.currency || Number(wallet.balance) < Number(current.amount)) return 'skip' as const
        const key = periodKey(current.nextRunOn, current.cadence)
        await markFinanceLedgerRecorded(tx)
        const expense = await tx.expense.create({ data: { companyId: wallet.companyId, walletId: wallet.id, categoryId: current.categoryId, amount: current.amount, currency: current.currency, description: `${current.name} — ${current.vendorName}`, location_id: current.locationId ?? wallet.location_id, expenseDate: current.nextRunOn, vendorName: current.vendorName, classification: current.classification, status: 'posted', recurringExpenseId: current.id, periodKey: key } })
        const updatedWallet = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: current.amount } }, select: { balance: true } })
        const transaction = await tx.wallet_transactions.create({ data: { companyId: wallet.companyId, wallet_id: wallet.id, expense_id: expense.id, type: 'expense', amount: current.amount, balance_before: wallet.balance, balance_after: updatedWallet.balance, description: `Recurring expense: ${current.name}`, currency: current.currency, reference_type: 'recurring_expense', reference_id: current.id } })
        await recordFinanceLedgerEntry(tx, { companyId: wallet.companyId, walletTransactionId: transaction.id, walletId: wallet.id, locationId: current.locationId ?? wallet.location_id, eventType: 'expense', direction: 'out', amount: Number(current.amount), currency: current.currency as 'SRD' | 'USD', sourceType: 'recurring_expense', sourceId: current.id, description: `Recurring expense: ${current.name}`, metadata: { periodKey: key } })
        await tx.recurringExpense.update({ where: { id: current.id }, data: { lastPostedAt: new Date(), nextRunOn: advance(current.nextRunOn, current.cadence, current.anchorDay) } })
        await writeActivityLog({ action: 'pay', entityType: 'expense', entityId: expense.id, entityName: current.name, details: `Posted recurring expense for ${key}.`, user: actor instanceof NextResponse ? undefined : actor ?? undefined, source: isScheduledRun ? 'cron' : 'server', client: tx })
        return 'posted' as const
      })
      if (result === 'posted') { posted++; continue }
      if (result === 'skip') skipped++
      break
    }
  }
  return NextResponse.json({ posted, skipped, evaluated: schedules.length, date: dayKey(today) })
}
