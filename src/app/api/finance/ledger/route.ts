import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { EXPENSE_CLASSIFICATION_LABELS, isExpenseClassification } from '@/lib/expenseClassification'
import {
  isDocumentationRelevant,
  summarizeExpenseDocumentation,
  type ExpenseDocumentationSummary,
} from '@/lib/expenseDocumentation'

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
    const [entries, totals, expenseReviewRows] = await Promise.all([
      prisma.financeLedgerEntry.findMany({
        where: { occurredAt: { gte: start } },
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
      prisma.expense.findMany({
        select: {
          amount: true, currency: true, status: true, classification: true, vendorName: true,
          receiptNumber: true, description: true, expenseDate: true, createdAt: true,
        },
      }),
    ])

    const byCurrency: Record<string, CurrencySummary> = {}
    const byEvent: Record<string, Record<string, CurrencySummary>> = {}
    const byLocation: Record<string, Record<string, CurrencySummary>> = {}
    // One shared definition of "not fully documented" — see expenseDocumentation.ts.
    const expenseReview: ExpenseDocumentationSummary = summarizeExpenseDocumentation(expenseReviewRows)
    const expenseClassification: Record<string, Record<string, number>> = {}
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

    expenseReviewRows.forEach((expense) => {
      if (!isDocumentationRelevant(expense)) return
      const classification = isExpenseClassification(expense.classification) ? expense.classification : 'unclassified'
      expenseClassification[classification] ??= {}
      const currency = expense.currency
      expenseClassification[classification][currency] = (expenseClassification[classification][currency] ?? 0) + asNumber(expense.amount)
    })

    return NextResponse.json({
      data: {
        windowStart: start.toISOString(),
        byCurrency,
        byEvent,
        byLocation,
        expenseReview,
        expenseClassification: Object.entries(expenseClassification).map(([classification, currencies]) => ({
          classification,
          label: EXPENSE_CLASSIFICATION_LABELS[classification as keyof typeof EXPENSE_CLASSIFICATION_LABELS] ?? 'Needs classification',
          currencies: Object.entries(currencies).map(([currency, amount]) => ({ currency, amount })),
        })),
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
