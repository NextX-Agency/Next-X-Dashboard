import { Prisma } from '@prisma/client'
import { getPeriodCloseChecks, periodCloseBlockers } from '@/lib/accountingPeriodChecks'

type Gate = { id: string; label: string; complete: boolean; detail: string }

export async function getMonthEndCloseChecklist(
  tx: Prisma.TransactionClient,
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  const core = await getPeriodCloseChecks(tx, companyId, periodStart, periodEnd)
  const periodKey = periodEnd.toISOString().slice(0, 7)
  const [fxRun, payoutRun, approvedBills] = await Promise.all([
    tx.fxRevaluationRun.findUnique({ where: { companyId_periodKey: { companyId, periodKey } }, select: { id: true, status: true, deltaSrd: true, createdAt: true } }),
    tx.payoutRun.findFirst({ where: { periodKey, status: { in: ['draft', 'posted'] } }, orderBy: { computedAt: 'desc' }, select: { id: true, status: true, blockedBy: true, blockedDetail: true, computedAt: true } }),
    tx.billInbox.count({ where: { companyId, status: 'approved' } }),
  ])
  const fxComplete = Boolean(fxRun && ['baseline', 'posted', 'zero'].includes(fxRun.status))
  const payoutComplete = Boolean(payoutRun)
  const gates: Gate[] = [
    { id: 'subscriptions', label: 'Recurring expenses posted', complete: core.recurringExpenses.complete, detail: core.recurringExpenses.complete ? 'No active recurring expense is due.' : `${core.recurringExpenses.due.length} schedule(s) are due.` },
    { id: 'wallets', label: 'Wallets reconciled', complete: core.reconciledWallets.complete, detail: core.reconciledWallets.complete ? 'Every wallet is reconciled at period end.' : `${core.reconciledWallets.missing.length} wallet(s) need reconciliation.` },
    { id: 'classification', label: 'Expenses classified', complete: core.classifiedExpenses.complete, detail: core.classifiedExpenses.complete ? 'No posted expense is unclassified.' : `${core.classifiedExpenses.unclassified} expense(s) need classification.` },
    { id: 'fx', label: 'FX revaluation completed', complete: fxComplete, detail: fxRun ? `${fxRun.status} run recorded${Number(fxRun.deltaSrd) ? `; SRD ${Number(fxRun.deltaSrd).toLocaleString()} movement` : ''}.` : `No FX run exists for ${periodKey}.` },
    { id: 'payout', label: 'Payout evaluated', complete: payoutComplete, detail: payoutRun ? payoutRun.blockedBy ? `Draft retained by breaker: ${payoutRun.blockedBy}.` : `${payoutRun.status} payout run exists.` : `No payout draft exists for ${periodKey}.` },
  ]
  const blockers = [...periodCloseBlockers(core)]
  if (!fxComplete) blockers.push(`USD FX revaluation is not complete for ${periodKey}.`)
  if (!payoutComplete) blockers.push(`Payout evaluation is not drafted for ${periodKey}.`)
  return {
    period: { key: periodKey, start: periodStart.toISOString().slice(0, 10), end: periodEnd.toISOString().slice(0, 10) },
    gates,
    blockers,
    canClose: blockers.length === 0,
    core,
    fxRun: fxRun ? { ...fxRun, deltaSrd: Number(fxRun.deltaSrd), createdAt: fxRun.createdAt.toISOString() } : null,
    payoutRun: payoutRun ? { ...payoutRun, computedAt: payoutRun.computedAt.toISOString() } : null,
    approvedBills,
  }
}
