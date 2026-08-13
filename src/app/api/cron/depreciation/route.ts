import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'

function priorMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  return { start, end, key: start.toISOString().slice(0, 7) }
}

function accountCodes(currency: string) {
  return currency === 'USD'
    ? { expense: '6101', accumulated: '1611' }
    : { expense: '6100', accumulated: '1610' }
}

/**
 * Non-cash recurring posting. Depreciation creates a balanced journal entry
 * but deliberately never debits a wallet or creates a wallet transaction.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const scheduled = Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
  if (!scheduled) {
    const user = await requireAdmin(request)
    if (user instanceof NextResponse) return user
  }

  const period = priorMonth()
  const assets = await prisma.fixedAsset.findMany({
    where: { status: 'active', depreciationMethod: 'straight_line', acquiredOn: { lte: period.end } },
    select: { id: true },
  })
  let posted = 0
  let skipped = 0
  let blocked = 0

  for (const candidate of assets) {
    try {
      const result = await runSerializableTransaction(async (tx) => {
        const asset = await tx.fixedAsset.findUnique({ where: { id: candidate.id } })
        if (!asset || asset.status !== 'active' || asset.depreciationMethod !== 'straight_line' || !asset.usefulLifeMonths) return 'skipped' as const
        if (asset.acquiredOn > period.end) return 'skipped' as const

        const prior = await tx.assetDepreciationRun.findUnique({ where: { fixedAssetId_periodKey: { fixedAssetId: asset.id, periodKey: period.key } }, select: { id: true } })
        if (prior) return 'skipped' as const

        const depreciableBase = Number(asset.cost) - Number(asset.residualValue)
        const remaining = depreciableBase - Number(asset.accumulatedDepreciation)
        const monthly = Math.min(remaining, Math.round((depreciableBase / asset.usefulLifeMonths + Number.EPSILON) * 10000) / 10000)
        if (monthly <= 0) return 'skipped' as const

        const codes = accountCodes(asset.currency)
        const accounts = await tx.account.findMany({
          where: { companyId: asset.companyId, currency: asset.currency, code: { in: [codes.expense, codes.accumulated] } },
          select: { id: true, code: true },
        })
        const expense = accounts.find((account) => account.code === codes.expense)
        const accumulated = accounts.find((account) => account.code === codes.accumulated)
        if (!expense || !accumulated) throw new Error('Depreciation accounts are not configured.')

        const runId = randomUUID()
        const entry = await tx.journalEntry.create({
          data: {
            companyId: asset.companyId,
            entryDate: period.end,
            description: `Depreciation ${period.key}: ${asset.name}`,
            sourceType: 'depreciation',
            sourceId: runId,
            status: 'posted',
            postedAt: new Date(),
          },
        })
        await tx.journalLine.createMany({ data: [
          { journalEntryId: entry.id, accountId: expense.id, currency: asset.currency, debit: monthly, credit: 0 },
          { journalEntryId: entry.id, accountId: accumulated.id, currency: asset.currency, debit: 0, credit: monthly },
        ] })
        await tx.assetDepreciationRun.create({ data: { id: runId, fixedAssetId: asset.id, periodKey: period.key, amount: monthly, journalEntryId: entry.id } })
        await tx.fixedAsset.update({ where: { id: asset.id }, data: { accumulatedDepreciation: { increment: monthly } } })
        return 'posted' as const
      })
      if (result === 'posted') posted++
      else skipped++
    } catch (error) {
      // A close lock or validation error leaves the serializable attempt empty.
      console.error(`Depreciation run failed for ${candidate.id}:`, error)
      blocked++
    }
  }

  return NextResponse.json({ period: period.key, evaluated: assets.length, posted, skipped, blocked })
}
