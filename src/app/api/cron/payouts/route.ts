import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { evaluatePayout } from '@/lib/payoutEvaluator'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'

function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function POST(request: NextRequest) {
  const isScheduledRun = authorize(request)
  const actor = isScheduledRun ? null : await requireAdmin(request)
  if (!isScheduledRun && actor instanceof NextResponse) return actor
  try {
    const body = await request.json().catch(() => ({})) as { sourceWalletId?: string; savingsWalletId?: string; notes?: string }
    const now = new Date()
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
    if (isScheduledRun && now.getUTCDate() !== lastDay) return NextResponse.json({ data: { status: 'skipped', reason: 'not_month_end' } })
    const data = await runSerializableTransaction(async (tx) => {
      const evaluation = await evaluatePayout(tx, now, body.sourceWalletId, body.savingsWalletId)
      const existing = await tx.payoutRun.findFirst({ where: { periodKey: evaluation.periodKey, status: { in: ['draft', 'posted'] } }, select: { id: true, status: true } })
      if (existing?.status === 'posted') return { id: existing.id, status: 'posted', alreadyPosted: true, ...evaluation }
      const runValues = { trailingMonths: evaluation.trailingMonths, trailingAvgProfit: evaluation.trailingAvgProfit, distributable: evaluation.distributable, savingsAmount: evaluation.savingsAmount, foundersAmount: evaluation.foundersAmount, restockCeiling: evaluation.restockCeiling, sourceWalletId: evaluation.sourceWalletId, savingsWalletId: evaluation.savingsWalletId, blockedBy: evaluation.blockedBy, blockedDetail: evaluation.blockedDetail, notes: body.notes?.slice(0, 2000) ?? null, createdBy: actor instanceof NextResponse ? null : actor?.id ?? null }
      const run = existing ? await tx.payoutRun.update({ where: { id: existing.id }, data: { ...runValues, status: 'draft' }, select: { id: true, correlationId: true } }) : await tx.payoutRun.create({ data: { periodKey: evaluation.periodKey, status: 'draft', ...runValues }, select: { id: true, correlationId: true } })
      if (evaluation.blockedBy || !evaluation.sourceWalletId || !evaluation.savingsWalletId) {
        await writeActivityLog({ action: 'update', entityType: 'finance_obligation', entityId: run.id, entityName: `Payout ${evaluation.periodKey}`, details: `Payout remains draft: ${evaluation.blockedDetail}`, user: actor instanceof NextResponse ? undefined : actor ?? undefined, source: isScheduledRun ? 'cron' : 'server', client: tx })
        return { id: run.id, status: 'draft', ...evaluation }
      }
      const [source, savings] = await Promise.all([
        tx.wallet.findUniqueOrThrow({ where: { id: evaluation.sourceWalletId }, select: { id: true, companyId: true, balance: true, currency: true, location_id: true } }),
        tx.wallet.findUniqueOrThrow({ where: { id: evaluation.savingsWalletId }, select: { id: true, companyId: true, balance: true, currency: true, location_id: true } }),
      ])
      if (Number(source.balance) < evaluation.foundersAmount + evaluation.savingsAmount) throw new Error('Payout source balance changed before posting; run remained draft.')
      await markFinanceLedgerRecorded(tx)
      const correlationId = run.correlationId || randomUUID()
      if (evaluation.savingsAmount > 0) {
        const sourceAfter = await tx.wallet.update({ where: { id: source.id }, data: { balance: { decrement: evaluation.savingsAmount } }, select: { balance: true } })
        const savingsAfter = await tx.wallet.update({ where: { id: savings.id }, data: { balance: { increment: evaluation.savingsAmount } }, select: { balance: true } })
        const out = await tx.wallet_transactions.create({ data: { companyId: source.companyId, wallet_id: source.id, type: 'transfer_out', amount: evaluation.savingsAmount, balance_before: source.balance, balance_after: sourceAfter.balance, description: `Payout-run savings allocation ${evaluation.periodKey}`, currency: 'SRD', reference_type: 'payout_run', reference_id: run.id } })
        const incoming = await tx.wallet_transactions.create({ data: { companyId: savings.companyId, wallet_id: savings.id, type: 'transfer_in', amount: evaluation.savingsAmount, balance_before: savings.balance, balance_after: savingsAfter.balance, description: `Payout-run savings allocation ${evaluation.periodKey}`, currency: 'SRD', reference_type: 'payout_run', reference_id: run.id } })
        await recordFinanceLedgerEntry(tx, { companyId: source.companyId, walletTransactionId: out.id, walletId: source.id, locationId: source.location_id, eventType: 'wallet_transfer', direction: 'out', amount: evaluation.savingsAmount, currency: 'SRD', sourceType: 'payout_run', sourceId: run.id, description: `Savings allocation ${evaluation.periodKey}`, correlationId })
        await recordFinanceLedgerEntry(tx, { companyId: savings.companyId, walletTransactionId: incoming.id, walletId: savings.id, locationId: savings.location_id, eventType: 'wallet_transfer', direction: 'in', amount: evaluation.savingsAmount, currency: 'SRD', sourceType: 'payout_run', sourceId: run.id, description: `Savings allocation ${evaluation.periodKey}`, correlationId })
      }
      if (evaluation.foundersAmount > 0) {
        const expense = await tx.expense.create({ data: { companyId: source.companyId, walletId: source.id, amount: evaluation.foundersAmount, currency: 'SRD', description: `Founder draw payout run ${evaluation.periodKey}`, location_id: source.location_id, classification: 'owner_draw', status: 'posted', payoutRunId: run.id } })
        const sourceAfter = await tx.wallet.update({ where: { id: source.id }, data: { balance: { decrement: evaluation.foundersAmount } }, select: { balance: true } })
        const transaction = await tx.wallet_transactions.create({ data: { companyId: source.companyId, wallet_id: source.id, expense_id: expense.id, type: 'expense', amount: evaluation.foundersAmount, balance_before: Number(sourceAfter.balance) + evaluation.foundersAmount, balance_after: sourceAfter.balance, description: `Founder draw ${evaluation.periodKey}`, currency: 'SRD', reference_type: 'payout_run', reference_id: run.id } })
        await recordFinanceLedgerEntry(tx, { companyId: source.companyId, walletTransactionId: transaction.id, walletId: source.id, locationId: source.location_id, eventType: 'expense', direction: 'out', amount: evaluation.foundersAmount, currency: 'SRD', sourceType: 'payout_run', sourceId: run.id, description: `Founder draw ${evaluation.periodKey}`, correlationId })
      }
      await tx.payoutRun.update({ where: { id: run.id }, data: { status: 'posted', postedAt: new Date(), blockedBy: null, blockedDetail: null } })
      await writeActivityLog({ action: 'pay', entityType: 'finance_obligation', entityId: run.id, entityName: `Payout ${evaluation.periodKey}`, details: `Posted savings ${evaluation.savingsAmount.toFixed(2)} and founder draw ${evaluation.foundersAmount.toFixed(2)} SRD.`, user: actor instanceof NextResponse ? undefined : actor ?? undefined, source: isScheduledRun ? 'cron' : 'server', client: tx })
      return { id: run.id, status: 'posted', ...evaluation }
    })
    return NextResponse.json({ data })
  } catch (error) { console.error('Payout run error:', error); return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to evaluate payout run.' }, { status: 500 }) }
}
