import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdmin } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { prisma } from '@/lib/prisma'
import { normalizeExchangeRate, roundCurrencyAmount } from '@/lib/pricing'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { writeActivityLog } from '@/lib/serverActivityLog'

/**
 * POST /api/commissions/payout — pay a location's unpaid commissions (F-15).
 *
 * The browser used to do this in four unchecked writes. The expense insert
 * targeted `category`, `payment_method` and `date` — none of which exist — and
 * omitted the NOT NULL `wallet_id`, and nobody read the error. So 106
 * commissions worth SRD 9,458.05 are marked paid in production with **zero**
 * payout expenses recorded against them. The wallet was also debited by writing
 * `balance - total` from a value read at page load.
 *
 * This follows `POST /api/expenses` exactly: one Serializable transaction
 * creating the expense with the columns that actually exist, decrementing the
 * wallet atomically, writing the wallet transaction, recording the ledger
 * entry, logging the activity, and flipping `paid` — all of it or none.
 *
 * It does **not** backfill the historical SRD 9,458.05. That is T-09's report,
 * and inserting 106 backdated expenses would rewrite months already reviewed
 * (Part 5, R1, R11).
 */
export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const locationId = typeof body.locationId === 'string' ? body.locationId : ''
    const walletId = typeof body.walletId === 'string' ? body.walletId : ''
    const commissionIds = Array.isArray(body.commissionIds)
      ? body.commissionIds.filter((id): id is string => typeof id === 'string')
      : null

    if (!locationId || !walletId) {
      return NextResponse.json({ error: 'A location and a paying wallet are required.' }, { status: 400 })
    }

    const result = await runSerializableTransaction(async (tx) => {
      await markFinanceLedgerRecorded(tx)

      const [location, wallet, activeRate] = await Promise.all([
        tx.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, companyId: true, seller_name: true } }),
        tx.wallet.findUnique({
          where: { id: walletId },
          select: { id: true, companyId: true, personName: true, currency: true, type: true, balance: true, location_id: true },
        }),
        tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } }),
      ])
      if (!location) throw new PayoutError('That location does not exist.', 404)
      if (!wallet) throw new PayoutError('That wallet does not exist.', 404)
      if (wallet.companyId !== location.companyId) throw new PayoutError('The selected location and wallet belong to different companies.', 409)

      const rate = normalizeExchangeRate(activeRate ? Number(activeRate.usdToSrd) : undefined)
      const walletCurrency = wallet.currency === 'USD' ? 'USD' as const : 'SRD' as const

      // Read the commissions inside the transaction. Reading them in the
      // browser and posting ids back is how a commission paid twice by two
      // tabs used to be possible.
      const commissions = await tx.commission.findMany({
        where: {
          location_id: locationId,
          paid: false,
          ...(commissionIds && commissionIds.length > 0 ? { id: { in: commissionIds } } : {}),
        },
        select: {
          id: true, commissionAmount: true, sellerId: true,
          sale: { select: { currency: true, exchangeRate: true } },
        },
      })
      if (commissions.length === 0) {
        throw new PayoutError('There are no unpaid commissions for that location.', 409)
      }

      // Convert each commission into the paying wallet's currency using the
      // sale's own rate where it has one.
      const totalToPay = roundCurrencyAmount(commissions.reduce((sum, commission) => {
        const amount = Number(commission.commissionAmount)
        const commissionCurrency = commission.sale?.currency === 'USD' ? 'USD' : 'SRD'
        const saleRate = commission.sale?.exchangeRate == null
          ? rate
          : normalizeExchangeRate(Number(commission.sale.exchangeRate))
        if (commissionCurrency === walletCurrency) return sum + amount
        return sum + (commissionCurrency === 'USD' ? amount * saleRate : amount / saleRate)
      }, 0))

      if (totalToPay <= 0) throw new PayoutError('The commissions selected come to zero.', 400)
      // Checked inside the transaction, against the committed balance — not
      // against whatever the page was showing.
      if (Number(wallet.balance) < totalToPay) {
        throw new PayoutError(
          `Insufficient balance in ${wallet.personName}: needs ${totalToPay.toFixed(2)} ${walletCurrency},`
          + ` has ${Number(wallet.balance).toFixed(2)}.`,
          409,
        )
      }

      const payeeName = location.seller_name || location.name
      const description = `Commission payout for ${payeeName} (${commissions.length} commission${commissions.length === 1 ? '' : 's'})`
      const correlationId = randomUUID()

      // The expense, with the columns that actually exist on the table.
      const category = await tx.expenseCategory.findFirst({
        where: { name: { equals: 'Commissions', mode: 'insensitive' } },
        select: { id: true },
      })
      const expense = await tx.expense.create({
        data: {
          companyId: location.companyId,
          location_id: wallet.location_id ?? locationId,
          categoryId: category?.id ?? null,
          walletId: wallet.id,
          amount: totalToPay,
          currency: walletCurrency,
          description,
          expenseDate: new Date(),
          vendorName: payeeName,
          classification: 'payroll',
        },
        select: { id: true, createdAt: true },
      })

      const debited = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: totalToPay } },
        select: { balance: true },
      })
      const balanceAfter = roundCurrencyAmount(Number(debited.balance))
      const balanceBefore = roundCurrencyAmount(balanceAfter + totalToPay)

      const walletTransaction = await tx.wallet_transactions.create({
        data: {
          companyId: location.companyId,
          wallet_id: wallet.id,
          expense_id: expense.id,
          type: 'debit',
          amount: totalToPay,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          currency: walletCurrency,
          description,
          reference_type: 'commission_payout',
          reference_id: expense.id,
        },
      })

      await recordFinanceLedgerEntry(tx, {
        companyId: location.companyId,
        walletTransactionId: walletTransaction.id,
        walletId: wallet.id,
        locationId,
        sellerId: commissions[0]?.sellerId ?? null,
        actorUserId: user.id,
        eventType: 'commission',
        direction: 'out',
        amount: totalToPay,
        currency: walletCurrency,
        sourceType: 'commission_payout',
        sourceId: expense.id,
        counterparty: payeeName,
        description,
        correlationId,
        occurredAt: expense.createdAt,
        metadata: { commissionCount: commissions.length, classification: 'payroll' },
      })

      const marked = await tx.commission.updateMany({
        where: { id: { in: commissions.map((c) => c.id) } },
        data: { paid: true },
      })
      // Belt and braces: if the update touched a different number of rows than
      // we priced, something raced and the whole thing rolls back.
      if (marked.count !== commissions.length) {
        throw new PayoutError('Commission set changed while paying out. Nothing was posted.', 409)
      }

      await writeActivityLog({
        action: 'update',
        entityType: 'commission',
        entityId: expense.id,
        entityName: `Commission payout · ${location.name}`,
        details: `Paid ${totalToPay.toFixed(2)} ${walletCurrency} to ${payeeName} from ${wallet.personName}`
          + ` covering ${commissions.length} commission(s). Expense ${expense.id}.`,
        user,
        request,
        source: 'commissions-api',
        client: tx,
      })

      return {
        expenseId: expense.id,
        walletTransactionId: walletTransaction.id,
        correlationId,
        commissionsPaid: commissions.length,
        totalPaid: totalToPay,
        currency: walletCurrency,
        walletName: wallet.personName,
        balanceAfter,
      }
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof PayoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Commission payout error:', error)
    return NextResponse.json({ error: 'Unable to pay out commissions. Nothing was posted.' }, { status: 500 })
  }
}

class PayoutError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message)
  }
}
