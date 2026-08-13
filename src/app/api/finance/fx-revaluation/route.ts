import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'

class FxRevaluationError extends Error {}

function parsePeriodEnd(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FxRevaluationError('periodEnd must use YYYY-MM-DD.')
  const date = new Date(`${value}T00:00:00.000Z`)
  const nextDay = new Date(date); nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || nextDay.getUTCDate() !== 1) throw new FxRevaluationError('periodEnd must be the final day of a calendar month.')
  if (date >= new Date(new Date().toISOString().slice(0, 10))) throw new FxRevaluationError('Only a fully elapsed month can be revalued.')
  return date
}

function periodKey(periodEnd: Date) {
  return periodEnd.toISOString().slice(0, 7)
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000
}

function serialise(run: { id: string; periodKey: string; periodEnd: Date; usdBalance: unknown; carryingValueSrd: unknown; deltaSrd: unknown; status: string; journalEntryId: string | null; createdAt: Date }) {
  return { ...run, periodEnd: run.periodEnd.toISOString().slice(0, 10), usdBalance: Number(run.usdBalance), carryingValueSrd: Number(run.carryingValueSrd), deltaSrd: Number(run.deltaSrd), createdAt: run.createdAt.toISOString() }
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })
  const [runs, rate] = await Promise.all([
    prisma.fxRevaluationRun.findMany({ where: { companyId: company.id }, orderBy: { periodEnd: 'desc' } }),
    prisma.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true, setAt: true } }),
  ])
  return NextResponse.json({ data: { runs: runs.map(serialise), latestRate: rate ? { usdToSrd: Number(rate.usdToSrd), setAt: rate.setAt.toISOString() } : null } }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json() as Record<string, unknown>
    const end = parsePeriodEnd(body.periodEnd)
    const key = periodKey(end)
    const run = await runSerializableTransaction(async (tx) => {
      const company = await tx.company.findFirst({ where: { isActive: true }, select: { id: true } })
      if (!company) throw new FxRevaluationError('No active company is configured.')
      const previousRun = await tx.fxRevaluationRun.findUnique({ where: { companyId_periodKey: { companyId: company.id, periodKey: key } } })
      if (previousRun) return previousRun

      const closed = await tx.accountingPeriod.findFirst({ where: { companyId: company.id, status: 'closed', periodStart: { lte: end }, periodEnd: { gte: end } }, select: { id: true } })
      if (closed) throw new FxRevaluationError('This period is already closed. Post a correcting entry in an open period instead.')

      const nextDay = new Date(end); nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      const rate = await tx.exchangeRate.findFirst({ where: { isActive: true, setAt: { lte: nextDay } }, orderBy: { setAt: 'desc' } })
      if (!rate) throw new FxRevaluationError(`No USD/SRD rate exists on or before ${end.toISOString().slice(0, 10)}.`)
      const ageDays = Math.floor((end.getTime() - rate.setAt.getTime()) / 86_400_000)
      if (ageDays > 7) throw new FxRevaluationError(`The latest FX rate is ${ageDays} days old. Record a rate dated within seven days of the period end before revaluing.`)

      const walletTotal = await tx.wallet.aggregate({ where: { companyId: company.id, currency: 'USD' }, _sum: { balance: true } })
      const usdBalance = round(Number(walletTotal._sum.balance ?? 0))
      const carryingValueSrd = round(usdBalance * Number(rate.usdToSrd))
      const previous = await tx.fxRevaluationRun.findFirst({ where: { companyId: company.id, periodEnd: { lt: end } }, orderBy: { periodEnd: 'desc' } })
      const deltaSrd = previous ? round(carryingValueSrd - Number(previous.carryingValueSrd)) : 0

      if (!previous) return tx.fxRevaluationRun.create({ data: { companyId: company.id, periodKey: key, periodEnd: end, exchangeRateId: rate.id, usdBalance, carryingValueSrd, deltaSrd: 0, status: 'baseline' } })
      if (deltaSrd === 0) return tx.fxRevaluationRun.create({ data: { companyId: company.id, periodKey: key, periodEnd: end, exchangeRateId: rate.id, usdBalance, carryingValueSrd, deltaSrd, status: 'zero' } })

      const accounts = await tx.account.findMany({ where: { companyId: company.id, currency: 'SRD', code: { in: ['1020', '7100', '7101'] } }, select: { id: true, code: true } })
      const adjustment = accounts.find((account) => account.code === '1020')
      const gain = accounts.find((account) => account.code === '7100')
      const loss = accounts.find((account) => account.code === '7101')
      if (!adjustment || !gain || !loss) throw new FxRevaluationError('FX revaluation accounts are not configured.')

      const runId = randomUUID()
      const entry = await tx.journalEntry.create({ data: { companyId: company.id, entryDate: end, description: `USD FX revaluation ${key}`, sourceType: 'fx_revaluation', sourceId: runId, status: 'posted', postedAt: new Date() } })
      const amount = Math.abs(deltaSrd)
      await tx.journalLine.createMany({ data: deltaSrd > 0
        ? [{ journalEntryId: entry.id, accountId: adjustment.id, currency: 'SRD', debit: amount, credit: 0 }, { journalEntryId: entry.id, accountId: gain.id, currency: 'SRD', debit: 0, credit: amount }]
        : [{ journalEntryId: entry.id, accountId: loss.id, currency: 'SRD', debit: amount, credit: 0 }, { journalEntryId: entry.id, accountId: adjustment.id, currency: 'SRD', debit: 0, credit: amount }],
      })
      return tx.fxRevaluationRun.create({ data: { id: runId, companyId: company.id, periodKey: key, periodEnd: end, exchangeRateId: rate.id, usdBalance, carryingValueSrd, deltaSrd, status: 'posted', journalEntryId: entry.id } })
    })
    return NextResponse.json({ data: serialise(run) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to run FX revaluation.' }, { status: error instanceof FxRevaluationError ? 409 : 500 })
  }
}
