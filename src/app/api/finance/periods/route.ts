import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { getPeriodCloseChecks, periodCloseBlockers } from '@/lib/accountingPeriodChecks'

class PeriodInputError extends Error {}

function parseDate(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PeriodInputError(`${field} must use YYYY-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new PeriodInputError(`${field} is invalid.`)
  return parsed
}

function periodJson(period: { id: string; periodStart: Date; periodEnd: Date; status: string; closedAt: Date | null; closeChecks: unknown }) {
  return {
    id: period.id,
    periodStart: period.periodStart.toISOString().slice(0, 10),
    periodEnd: period.periodEnd.toISOString().slice(0, 10),
    status: period.status,
    closedAt: period.closedAt?.toISOString() ?? null,
    checks: period.closeChecks,
  }
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
    if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })

    const start = parseDate(request.nextUrl.searchParams.get('start') ?? `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}-01`, 'start')
    const end = parseDate(request.nextUrl.searchParams.get('end') ?? new Date().toISOString().slice(0, 10), 'end')
    const [periods, checks] = await Promise.all([
      prisma.accountingPeriod.findMany({ where: { companyId: company.id }, orderBy: { periodEnd: 'desc' } }),
      prisma.$transaction((tx) => getPeriodCloseChecks(tx, company.id, start, end)),
    ])

    return NextResponse.json({ data: { periods: periods.map(periodJson), checks, blockers: periodCloseBlockers(checks) } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load accounting periods.' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const periodStart = parseDate(body.periodStart, 'periodStart')
    const periodEnd = parseDate(body.periodEnd, 'periodEnd')
    if (periodEnd < periodStart) throw new PeriodInputError('periodEnd must be on or after periodStart.')
    if (periodEnd >= new Date(new Date().toISOString().slice(0, 10))) throw new PeriodInputError('Only a fully elapsed accounting period can be closed.')

    const result = await runSerializableTransaction(async (tx) => {
      const company = await tx.company.findFirst({ where: { isActive: true }, select: { id: true } })
      if (!company) throw new PeriodInputError('No active company is configured.')

      const existing = await tx.accountingPeriod.findFirst({
        where: { companyId: company.id, periodStart, periodEnd },
        select: { id: true, status: true },
      })
      if (existing?.status === 'closed') throw new PeriodInputError('This accounting period is already closed.')

      const checks = await getPeriodCloseChecks(tx, company.id, periodStart, periodEnd)
      const blockers = periodCloseBlockers(checks)
      if (blockers.length) return { checks, blockers, period: null }

      const closeData = { status: 'closed', closedAt: new Date(), closedBy: user.id, closeChecks: checks }
      const period = existing
        ? await tx.accountingPeriod.update({ where: { id: existing.id }, data: closeData })
        : await tx.accountingPeriod.create({ data: { companyId: company.id, periodStart, periodEnd, ...closeData } })
      return { checks, blockers, period }
    })

    if (!result.period) return NextResponse.json({ data: result }, { status: 409 })
    return NextResponse.json({ data: { ...result, period: periodJson(result.period) } }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to close accounting period.' }, { status: error instanceof PeriodInputError ? 400 : 500 })
  }
}
