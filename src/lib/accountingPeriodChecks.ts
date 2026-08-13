import { Prisma } from '@prisma/client'

export type PeriodCloseChecks = {
  reconciledWallets: { complete: boolean; missing: Array<{ id: string; label: string }> }
  recurringExpenses: { complete: boolean; due: Array<{ id: string; name: string; nextRunOn: string }> }
  classifiedExpenses: { complete: boolean; unclassified: number }
}

function dateLabel(value: Date) {
  return value.toISOString().slice(0, 10)
}

/** The T-22 gates that must be true before a period can become immutable. */
export async function getPeriodCloseChecks(
  tx: Prisma.TransactionClient,
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<PeriodCloseChecks> {
  const [wallets, dueSchedules, unclassifiedExpenses] = await Promise.all([
    tx.wallet.findMany({
      where: { companyId },
      select: {
        id: true,
        personName: true,
        type: true,
        currency: true,
        reconciliations: {
          where: { reconciledAt: { gte: periodEnd } },
          take: 1,
          orderBy: { reconciledAt: 'desc' },
          select: { id: true },
        },
      },
    }),
    tx.recurringExpense.findMany({
      where: { isActive: true, nextRunOn: { lte: periodEnd }, wallet: { companyId } },
      select: { id: true, name: true, nextRunOn: true },
      orderBy: { nextRunOn: 'asc' },
    }),
    tx.expense.count({
      where: {
        companyId,
        status: 'posted',
        expenseDate: { gte: periodStart, lte: periodEnd },
        OR: [{ classification: 'unclassified' }, { classification: '' }],
      },
    }),
  ])

  const missing = wallets
    .filter((wallet) => wallet.reconciliations.length === 0)
    .map((wallet) => ({ id: wallet.id, label: `${wallet.personName} · ${wallet.type} (${wallet.currency})` }))

  return {
    reconciledWallets: { complete: missing.length === 0, missing },
    recurringExpenses: {
      complete: dueSchedules.length === 0,
      due: dueSchedules.map((schedule) => ({ id: schedule.id, name: schedule.name, nextRunOn: dateLabel(schedule.nextRunOn) })),
    },
    classifiedExpenses: { complete: unclassifiedExpenses === 0, unclassified: unclassifiedExpenses },
  }
}

export function periodCloseBlockers(checks: PeriodCloseChecks) {
  const blockers: string[] = []
  if (!checks.reconciledWallets.complete) blockers.push(`${checks.reconciledWallets.missing.length} wallet(s) still need reconciliation.`)
  if (!checks.recurringExpenses.complete) blockers.push(`${checks.recurringExpenses.due.length} recurring expense(s) are due but unposted.`)
  if (!checks.classifiedExpenses.complete) blockers.push(`${checks.classifiedExpenses.unclassified} posted expense(s) need classification.`)
  return blockers
}
