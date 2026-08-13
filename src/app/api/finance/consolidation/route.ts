import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

function number(value: unknown) {
  return Number(value ?? 0)
}

/**
 * T-25 is deliberately a live all-companies query. There is only one legal
 * company today, so materialising or signing intercompany snapshots would add
 * an integration boundary that does not exist yet.
 */
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const companies = await prisma.company.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, baseCurrency: true } })
    const entities = await Promise.all(companies.map(async (company) => {
      const [cash, cashAccounts, assets, investments, latestRevaluation] = await Promise.all([
        prisma.wallet.groupBy({ by: ['currency'], where: { companyId: company.id }, _sum: { balance: true } }),
        prisma.account.findMany({ where: { companyId: company.id, code: { in: ['1000', '1001'] } }, include: { journalLines: { select: { currency: true, debit: true, credit: true } } } }),
        prisma.fixedAsset.aggregate({ where: { companyId: company.id, status: 'active' }, _count: true, _sum: { cost: true, accumulatedDepreciation: true } }),
        prisma.investmentHolding.aggregate({ where: { companyId: company.id, status: 'active' }, _count: true, _sum: { carryingValue: true } }),
        prisma.fxRevaluationRun.findFirst({ where: { companyId: company.id }, orderBy: { periodEnd: 'desc' }, select: { periodKey: true, status: true, carryingValueSrd: true } }),
      ])
      const walletCash = Object.fromEntries(cash.map((row) => [row.currency, number(row._sum.balance)]))
      const journalCash: Record<string, number> = {}
      for (const account of cashAccounts) {
        for (const line of account.journalLines) journalCash[line.currency] = (journalCash[line.currency] ?? 0) + number(line.debit) - number(line.credit)
      }
      return {
        ...company,
        walletCash,
        journalCash,
        cashMatchesJournal: Object.keys(walletCash).every((currency) => Math.abs((walletCash[currency] ?? 0) - (journalCash[currency] ?? 0)) < 0.0001),
        fixedAssets: { count: assets._count, cost: number(assets._sum.cost), accumulatedDepreciation: number(assets._sum.accumulatedDepreciation) },
        investments: { count: investments._count, carryingValue: number(investments._sum.carryingValue) },
        latestFxRevaluation: latestRevaluation ? { periodKey: latestRevaluation.periodKey, status: latestRevaluation.status, carryingValueSrd: number(latestRevaluation.carryingValueSrd) } : null,
      }
    }))

    const totals: Record<string, number> = {}
    for (const entity of entities) for (const [currency, amount] of Object.entries(entity.walletCash)) totals[currency] = (totals[currency] ?? 0) + amount
    return NextResponse.json({ data: { mode: entities.length > 1 ? 'live_multi_company' : 'single_company_live', signedSnapshotContract: entities.length > 1 ? 'not_implemented: company fork has not been approved' : null, entities, totals } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Consolidation read model error:', error)
    return NextResponse.json({ error: 'Unable to load consolidated finance data.' }, { status: 500 })
  }
}
