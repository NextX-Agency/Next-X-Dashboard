import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

function asNumber(value: unknown) {
  return Number(value ?? 0)
}

type CurrencySummary = { inflow: number; outflow: number; net: number }

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const start = new Date()
    start.setDate(start.getDate() - 90)
    const [entries, totals] = await Promise.all([
      prisma.financeLedgerEntry.findMany({
        take: 250,
        orderBy: { occurredAt: 'desc' },
        include: {
          wallet: { select: { personName: true, type: true } },
          location: { select: { name: true } },
          seller: { select: { name: true } },
          category: { select: { name: true } },
          actor: { select: { name: true, email: true } },
        },
      }),
      prisma.financeLedgerEntry.findMany({
        where: { occurredAt: { gte: start } },
        select: { direction: true, amount: true, currency: true, eventType: true, location: { select: { name: true } } },
      }),
    ])

    const byCurrency: Record<string, CurrencySummary> = {}
    const byEvent: Record<string, Record<string, CurrencySummary>> = {}
    const byLocation: Record<string, Record<string, CurrencySummary>> = {}
    const add = (collection: Record<string, Record<string, CurrencySummary>>, group: string, currency: string, direction: string, amount: number) => {
      collection[group] ??= {}
      collection[group][currency] ??= { inflow: 0, outflow: 0, net: 0 }
      const summary = collection[group][currency]
      if (direction === 'in') summary.inflow += amount
      else summary.outflow += amount
      summary.net = summary.inflow - summary.outflow
    }

    totals.forEach((entry) => {
      const currency = entry.currency
      const amount = asNumber(entry.amount)
      byCurrency[currency] ??= { inflow: 0, outflow: 0, net: 0 }
      if (entry.direction === 'in') byCurrency[currency].inflow += amount
      else byCurrency[currency].outflow += amount
      byCurrency[currency].net = byCurrency[currency].inflow - byCurrency[currency].outflow
      add(byEvent, entry.eventType, currency, entry.direction, amount)
      add(byLocation, entry.location?.name ?? 'Unassigned', currency, entry.direction, amount)
    })

    return NextResponse.json({
      data: {
        windowStart: start.toISOString(),
        byCurrency,
        byEvent,
        byLocation,
        entries: entries.map((entry) => ({
          id: entry.id,
          eventType: entry.eventType,
          direction: entry.direction,
          amount: asNumber(entry.amount),
          currency: entry.currency,
          description: entry.description,
          occurredAt: entry.occurredAt.toISOString(),
          location: entry.location?.name ?? 'Unassigned',
          wallet: entry.wallet ? `${entry.wallet.personName} · ${entry.wallet.type}` : null,
          seller: entry.seller?.name ?? null,
          category: entry.category?.name ?? null,
          actor: entry.actor?.name ?? entry.actor?.email ?? 'System / legacy record',
        })),
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Finance ledger route error:', error)
    return NextResponse.json({ error: 'Unable to load finance traceability data.' }, { status: 500 })
  }
}
