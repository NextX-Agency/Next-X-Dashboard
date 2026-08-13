import type { Prisma } from '@prisma/client'

type LedgerClient = Prisma.TransactionClient

export async function markFinanceLedgerRecorded(client: LedgerClient) {
  await client.$executeRawUnsafe("SELECT set_config('app.finance_ledger_recorded', 'on', true)")
}

export interface FinanceLedgerInput {
  // T-20 scopes new entries without relying on an RLS join. It stays nullable
  // in the database only for the historical backfill compatibility window.
  companyId?: string | null
  walletTransactionId?: string | null
  walletId?: string | null
  locationId?: string | null
  sellerId?: string | null
  categoryId?: string | null
  actorUserId?: string | null
  eventType: 'opening_balance' | 'sale' | 'expense' | 'wallet_adjustment' | 'wallet_transfer' | 'wallet_reconciliation' | 'commission' | 'other'
  direction: 'in' | 'out'
  amount: number
  currency: 'SRD' | 'USD'
  sourceType?: string | null
  sourceId?: string | null
  counterparty?: string | null
  description?: string | null
  correlationId?: string
  occurredAt?: Date
  metadata?: Prisma.InputJsonValue
}

export async function recordFinanceLedgerEntry(client: LedgerClient, input: FinanceLedgerInput) {
  return client.financeLedgerEntry.create({
    data: {
      companyId: input.companyId ?? null,
      walletTransactionId: input.walletTransactionId ?? null,
      walletId: input.walletId ?? null,
      locationId: input.locationId ?? null,
      sellerId: input.sellerId ?? null,
      categoryId: input.categoryId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      direction: input.direction,
      amount: Math.abs(input.amount),
      currency: input.currency,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      counterparty: input.counterparty ?? null,
      description: input.description ?? null,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
      metadata: input.metadata ?? {},
    },
  })
}
