import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/finance/review — everything the system knows it cannot trust (T-09).
 *
 * Read-only. Part 5's rule is that an unknown is recorded as unknown, excluded
 * from every derived figure, and surfaced here — never guessed at. A row on
 * this page is not a bug to be closed by software; it is a question only the
 * owner can answer.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const [sales, expenses, items, paidCommissions, payoutExpenses, voidedSales] = await Promise.all([
      prisma.sale.findMany({
        where: { needsReview: true },
        select: {
          id: true, createdAt: true, totalAmount: true, currency: true, reviewReason: true,
          location: { select: { name: true } },
          _count: { select: { saleItems: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expense.findMany({
        where: { needsReview: true },
        select: {
          id: true, createdAt: true, amount: true, currency: true, description: true,
          reviewReason: true, classification: true,
          category: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.item.findMany({
        where: { needsReview: true, deletedAt: null },
        select: { id: true, name: true, purchasePriceUsd: true, reviewReason: true },
        orderBy: { name: 'asc' },
      }),
      // The SRD 9,458.05 gap. Reported, never inserted (Part 5).
      prisma.commission.aggregate({
        where: { paid: true },
        _count: true,
        _sum: { commissionAmount: true },
      }),
      prisma.expense.count({
        where: { OR: [{ classification: 'payroll' }, { category: { name: { contains: 'ommission' } } }] },
      }),
      prisma.sale.count({ where: { status: 'voided' } }),
    ])

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        sales: sales.map((sale) => ({
          id: sale.id,
          createdAt: sale.createdAt.toISOString(),
          totalAmount: Number(sale.totalAmount),
          currency: sale.currency,
          locationName: sale.location.name,
          lineItemCount: sale._count.saleItems,
          reason: sale.reviewReason,
        })),
        expenses: expenses.map((expense) => ({
          id: expense.id,
          createdAt: expense.createdAt.toISOString(),
          amount: Number(expense.amount),
          currency: expense.currency,
          description: expense.description,
          categoryName: expense.category?.name ?? null,
          classification: expense.classification,
          reason: expense.reviewReason,
        })),
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          purchasePriceUsd: Number(item.purchasePriceUsd),
          reason: item.reviewReason,
        })),
        commissionPayoutGap: {
          paidCommissions: paidCommissions._count,
          totalSrd: Number(paidCommissions._sum.commissionAmount ?? 0),
          payoutExpensesRecorded: payoutExpenses,
          reportPath: 'docs/reports/commission-payout-backfill.csv',
        },
        voidedSales,
      },
    })
  } catch (error) {
    console.error('Finance review error:', error)
    return NextResponse.json({ error: 'Unable to load the review queue.' }, { status: 500 })
  }
}
