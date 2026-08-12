import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { canAccessLocation } from '@/lib/locationAccess'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

function parseAmount(value: unknown) {
  const amount = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Confirmed balance must be zero or greater.')
  return Math.round(amount * 100) / 100
}

export async function POST(request: NextRequest) {
  const user = await requireRole(request, ['admin', 'seller'])
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const walletId = typeof body.walletId === 'string' ? body.walletId : ''
    const confirmedBalance = parseAmount(body.confirmedBalance)
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (!walletId) return NextResponse.json({ error: 'walletId is required.' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      await markFinanceLedgerRecorded(tx)
      const wallet = await tx.wallet.findUnique({
        where: { id: walletId },
        select: {
          id: true,
          balance: true,
          currency: true,
          location_id: true,
          personName: true,
          type: true,
          locations: { select: { name: true } },
        },
      })
      if (!wallet?.location_id) throw new Error('Wallet not found or not assigned to a seller location.')
      if (!await canAccessLocation(tx, user, wallet.location_id, { wallet: true })) {
        return null
      }

      const previousBalance = Number(wallet.balance)
      const difference = Math.round((confirmedBalance - previousBalance) * 100) / 100
      if (difference !== 0 && !note) {
        throw new Error('Add a note when the confirmed amount differs from the recorded balance.')
      }

      const reconciliation = await tx.walletReconciliation.create({
        data: {
          walletId,
          locationId: wallet.location_id,
          confirmedBalance,
          note: note || null,
          reconciledByUserId: user.id,
        },
      })

      let transactionId: string | null = null
      if (difference !== 0) {
        await tx.wallet.update({ where: { id: walletId }, data: { balance: confirmedBalance } })
        const transaction = await tx.wallet_transactions.create({
          data: {
            wallet_id: walletId,
            type: 'adjustment',
            amount: Math.abs(difference),
            balance_before: previousBalance,
            balance_after: confirmedBalance,
            description: note,
            reference_type: 'wallet_reconciliation',
            reference_id: reconciliation.id,
            currency: wallet.currency,
          },
        })
        transactionId = transaction.id

        await recordFinanceLedgerEntry(tx, {
          walletTransactionId: transaction.id,
          walletId,
          locationId: wallet.location_id,
          actorUserId: user.id,
          eventType: 'wallet_reconciliation',
          direction: difference > 0 ? 'in' : 'out',
          amount: Math.abs(difference),
          currency: wallet.currency as 'SRD' | 'USD',
          sourceType: 'wallet_reconciliation',
          sourceId: reconciliation.id,
          description: note,
          occurredAt: reconciliation.reconciledAt,
          metadata: { previousBalance, confirmedBalance },
        })
      }

      await tx.userNotification.updateMany({
        where: { userId: user.id, walletId, notificationType: 'wallet_reconciliation_due', resolvedAt: null },
        data: { resolvedAt: reconciliation.reconciledAt, readAt: reconciliation.reconciledAt },
      })

      await writeActivityLog({
        action: 'update',
        entityType: 'wallet',
        entityId: walletId,
        entityName: `${wallet.locations?.name || wallet.personName} - ${wallet.type} ${wallet.currency}`,
        details: difference === 0
          ? `Confirmed wallet balance at ${confirmedBalance.toFixed(2)} ${wallet.currency}`
          : `Reconciled wallet from ${previousBalance.toFixed(2)} to ${confirmedBalance.toFixed(2)} ${wallet.currency}: ${note}`,
        user,
        request,
        source: 'seller-portal',
        client: tx,
      })

      return { reconciliation, transactionId, difference }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (!result) return NextResponse.json({ error: 'You do not have permission to reconcile this wallet.' }, { status: 403 })
    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to reconcile wallet.' },
      { status: 400 },
    )
  }
}
