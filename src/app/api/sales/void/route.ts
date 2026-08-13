import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { roundCurrencyAmount } from '@/lib/pricing'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'
import { randomUUID } from 'crypto'

/**
 * POST /api/sales/void — reverse a sale without destroying it (F-06, R1, R4).
 *
 * The old undo path deleted commissions, then sale items, then the sale.
 * `finance_ledger_entries` refuses DELETE at the database level, so every undo
 * left the ledger holding a money movement for a sale that no longer existed —
 * the books and the ledger diverged permanently and silently.
 *
 * Voiding keeps every original row and posts the opposite entries under the
 * sale's `correlation_id`, so the pair nets to zero and both halves stay
 * readable. Stock is returned, the wallet is debited through a real
 * `wallet_transactions` row, and commissions are marked reversed rather than
 * removed.
 */
export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const saleId = typeof body.saleId === 'string' ? body.saleId : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (!saleId) {
      return NextResponse.json({ error: 'A sale id is required.' }, { status: 400 })
    }
    // A void moves real money back out of a wallet. It needs a stated reason,
    // for the same reason an expense does.
    if (reason.length < 3) {
      return NextResponse.json({ error: 'Give a reason for voiding this sale (at least 3 characters).' }, { status: 400 })
    }

    const result = await runSerializableTransaction(async (tx) => {
      await markFinanceLedgerRecorded(tx)

      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: {
          id: true, status: true, totalAmount: true, currency: true, locationId: true,
          sellerId: true, wallet_id: true, correlationId: true, createdAt: true,
          saleItems: { select: { id: true, itemId: true, quantity: true } },
          commissions: { select: { id: true, commissionAmount: true, paid: true } },
          location: { select: { name: true } },
        },
      })
      if (!sale) throw new SaleVoidError('That sale does not exist.', 404)
      // Voiding twice would post a second reversal and double-debit the wallet.
      if (sale.status === 'voided') throw new SaleVoidError('That sale is already voided.', 409)

      const totalAmount = roundCurrencyAmount(Number(sale.totalAmount))
      const currency = sale.currency === 'USD' ? 'USD' as const : 'SRD' as const

      // Reuse the sale's correlation id so the reversal is provably paired with
      // the original. Pre-T-11 sales have none stored, so fall back to the
      // correlation id the original ledger entry was given.
      const originalEntry = await tx.financeLedgerEntry.findFirst({
        where: { sourceType: 'sale', sourceId: sale.id },
        orderBy: { createdAt: 'asc' },
        select: { correlationId: true },
      })
      const correlationId = sale.correlationId ?? originalEntry?.correlationId ?? randomUUID()

      // Return the stock. Atomic increments; a missing stock row is created,
      // because the product may have been de-stocked at this location since.
      for (const line of sale.saleItems) {
        const stock = await tx.stock.findFirst({
          where: { itemId: line.itemId, locationId: sale.locationId },
          select: { id: true },
        })
        if (stock) {
          await tx.stock.update({ where: { id: stock.id }, data: { quantity: { increment: line.quantity } } })
        } else {
          await tx.stock.create({
            data: { itemId: line.itemId, locationId: sale.locationId, quantity: line.quantity },
          })
        }
      }

      // Debit the wallet the sale credited — through a wallet_transactions row,
      // never by writing a balance (R5).
      let walletTransactionId: string | null = null
      let balanceAfter: number | null = null
      if (sale.wallet_id) {
        const wallet = await tx.wallet.findUnique({
          where: { id: sale.wallet_id },
          select: { id: true, personName: true, balance: true },
        })
        if (!wallet) throw new SaleVoidError('The wallet this sale was paid into no longer exists.', 409)

        const debited = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: totalAmount } },
          select: { balance: true },
        })
        balanceAfter = roundCurrencyAmount(Number(debited.balance))
        const balanceBefore = roundCurrencyAmount(balanceAfter + totalAmount)

        const reversal = await tx.wallet_transactions.create({
          data: {
            wallet_id: wallet.id,
            sale_id: sale.id,
            type: 'debit',
            amount: totalAmount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            currency,
            description: `Void of sale ${sale.id}: ${reason}`,
            reference_type: 'sale_void',
            reference_id: sale.id,
          },
        })
        walletTransactionId = reversal.id

        await recordFinanceLedgerEntry(tx, {
          walletTransactionId: reversal.id,
          walletId: wallet.id,
          locationId: sale.locationId,
          sellerId: sale.sellerId,
          actorUserId: user.id,
          eventType: 'sale',
          direction: 'out',
          amount: totalAmount,
          currency,
          sourceType: 'sale_void',
          sourceId: sale.id,
          description: `Void of sale ${sale.id}: ${reason}`,
          correlationId,
          metadata: { voidedSaleId: sale.id, reason, reversalOf: 'sale' },
        })
      }

      // Commissions are marked, not deleted. An unpaid commission is cancelled;
      // a paid one is left flagged, because the money already left and reversing
      // a payout is a separate decision (Part 5 / R11).
      const paidCommissions = sale.commissions.filter((c) => c.paid)
      if (sale.commissions.length > 0) {
        await tx.commission.updateMany({
          where: { saleId: sale.id, paid: false },
          data: { commissionAmount: 0 },
        })
      }

      const voided = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: user.id,
          voidReason: reason,
          correlationId,
        },
        select: { id: true, status: true, voidedAt: true },
      })

      await writeActivityLog({
        action: 'update',
        entityType: 'sale',
        entityId: sale.id,
        entityName: `Void sale ${sale.id.slice(0, 8)}`,
        details: `Voided ${totalAmount.toFixed(2)} ${currency} at ${sale.location.name}. Reason: ${reason}.`
          + ` Stock returned for ${sale.saleItems.length} line(s).`
          + (paidCommissions.length > 0 ? ` ${paidCommissions.length} already-paid commission(s) left for review.` : ''),
        user,
        request,
        source: 'sales-api',
        client: tx,
      })

      return {
        saleId: voided.id,
        status: voided.status,
        voidedAt: voided.voidedAt?.toISOString() ?? null,
        correlationId,
        reversedAmount: totalAmount,
        currency,
        walletTransactionId,
        balanceAfter,
        stockLinesReturned: sale.saleItems.length,
        paidCommissionsNeedingReview: paidCommissions.length,
      }
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof SaleVoidError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Sale void error:', error)
    return NextResponse.json({ error: 'Unable to void the sale. Nothing was changed.' }, { status: 500 })
  }
}

class SaleVoidError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message)
  }
}
