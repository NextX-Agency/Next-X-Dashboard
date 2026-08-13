import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

function number(value: unknown) {
  return Number(value ?? 0)
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null
}

/**
 * Read-only purchasing view for Finance. A purchase order is an operational
 * record; the linked finance obligation is the payable commitment. Keeping
 * both in this response lets Finance follow the purchase from confirmation to
 * receipt without treating an order as a wallet transaction.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const orders = await prisma.purchaseOrder.findMany({
      where: { status: { not: 'cancelled' } },
      orderBy: [{ expected_arrival: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        status: true,
        totalAmount: true,
        currency: true,
        expected_arrival: true,
        createdAt: true,
        clients: { select: { name: true } },
        location: { select: { name: true } },
        wallet: { select: { personName: true } },
        purchase_order_items: { select: { quantity: true, quantity_received: true } },
      },
    })
    const commitments = await prisma.financeObligation.findMany({
      where: {
        type: 'payable',
        sourceType: 'purchase_order',
        sourceId: { in: orders.map((order) => order.id) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, sourceId: true, status: true, originalAmount: true, paidAmount: true, currency: true },
    })
    const commitmentByOrderId = new Map<string, typeof commitments[number]>()
    for (const commitment of commitments) {
      if (commitment.sourceId && !commitmentByOrderId.has(commitment.sourceId)) commitmentByOrderId.set(commitment.sourceId, commitment)
    }

    const outstandingByCurrency = new Map<string, number>()
    const unlinkedByCurrency = new Map<string, number>()
    let draftCount = 0
    let linkedCount = 0
    let unlinkedCount = 0
    let awaitingReceiptCount = 0

    const rows = orders.map((order) => {
      const commitment = commitmentByOrderId.get(order.id)
      const orderedUnits = order.purchase_order_items.reduce((sum, line) => sum + line.quantity, 0)
      const receivedUnits = order.purchase_order_items.reduce((sum, line) => sum + line.quantity_received, 0)
      const totalAmount = number(order.totalAmount)
      const paidAmount = commitment ? number(commitment.paidAmount) : 0
      const outstandingAmount = commitment ? Math.max(0, number(commitment.originalAmount) - paidAmount) : null

      let financeStage: 'draft' | 'needs_link' | 'payable' | 'partially_settled' | 'settled' = 'draft'
      if (order.status === 'pending') {
        draftCount += 1
      } else if (!commitment) {
        financeStage = 'needs_link'
        unlinkedCount += 1
        unlinkedByCurrency.set(order.currency, (unlinkedByCurrency.get(order.currency) ?? 0) + totalAmount)
      } else if (commitment.status === 'paid') {
        financeStage = 'settled'
        linkedCount += 1
      } else if (commitment.status === 'partial') {
        financeStage = 'partially_settled'
        linkedCount += 1
        outstandingByCurrency.set(commitment.currency, (outstandingByCurrency.get(commitment.currency) ?? 0) + (outstandingAmount ?? 0))
      } else if (commitment.status !== 'cancelled') {
        financeStage = 'payable'
        linkedCount += 1
        outstandingByCurrency.set(commitment.currency, (outstandingByCurrency.get(commitment.currency) ?? 0) + (outstandingAmount ?? 0))
      }

      if (order.status === 'ordered' || order.status === 'shipped' || order.status === 'partially_received') awaitingReceiptCount += 1

      return {
        id: order.id,
        status: order.status,
        totalAmount,
        currency: order.currency === 'USD' ? 'USD' : 'SRD',
        expectedArrival: iso(order.expected_arrival),
        createdAt: order.createdAt.toISOString(),
        supplier: order.clients?.name ?? 'Supplier to confirm',
        location: order.location.name,
        fundingSource: order.wallet?.personName ?? null,
        orderedUnits,
        receivedUnits,
        financeStage,
        commitment: commitment ? {
          id: commitment.id,
          status: commitment.status,
          outstandingAmount,
        } : null,
      }
    })

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        summary: {
          draftCount,
          linkedCount,
          unlinkedCount,
          awaitingReceiptCount,
          outstandingByCurrency: Array.from(outstandingByCurrency.entries()).map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency)),
          unlinkedByCurrency: Array.from(unlinkedByCurrency.entries()).map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency)),
        },
        rows: rows.slice(0, 8),
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Finance purchasing view error:', error)
    return NextResponse.json({ error: 'Unable to load purchasing commitments.' }, { status: 500 })
  }
}
