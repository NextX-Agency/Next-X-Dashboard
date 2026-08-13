import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

function amount(value: unknown) {
  return Number(value ?? 0)
}

/**
 * Read model for the forward-only T-21 general ledger. It deliberately exposes
 * no browser mutation path: journals are written only by server finance jobs.
 */
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const company = await prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })

    const [accounts, entries] = await Promise.all([
      prisma.account.findMany({
        where: { companyId: company.id, isActive: true },
        orderBy: [{ code: 'asc' }, { currency: 'asc' }],
      }),
      prisma.journalEntry.findMany({
        where: { companyId: company.id },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { createdAt: 'asc' } } },
      }),
    ])

    const balances = new Map<string, number>()
    for (const entry of entries) {
      for (const line of entry.lines) {
        const key = `${line.accountId}:${line.currency}`
        balances.set(key, (balances.get(key) ?? 0) + amount(line.debit) - amount(line.credit))
      }
    }

    return NextResponse.json({
      data: {
        company,
        accounts: accounts.map((account) => ({
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.accountType,
          currency: account.currency,
          balance: balances.get(`${account.id}:${account.currency}`) ?? 0,
        })),
        entries: entries.map((entry) => ({
          id: entry.id,
          date: entry.entryDate.toISOString().slice(0, 10),
          description: entry.description,
          sourceType: entry.sourceType,
          status: entry.status,
          lines: entry.lines.map((line) => ({
            id: line.id,
            account: `${line.account.code} ${line.account.name}`,
            currency: line.currency,
            debit: amount(line.debit),
            credit: amount(line.credit),
          })),
        })),
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Finance journal route error:', error)
    return NextResponse.json({ error: 'Unable to load the general journal.' }, { status: 500 })
  }
}
