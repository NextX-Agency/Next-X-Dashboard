'use server';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { parseMoney } from '@/lib/money';
import { dateInput, moneyInput, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import {
  financeObligationPayments,
  financeObligations,
  reconciliations,
  wallets,
  walletTransfers,
} from '../db/schema';
import { logActivity, postLedgerEntry, type Tx, walletBalanceCents } from '../services/posting';
import { rateForRecord, rateOn } from '../services/rates';
import { ActionError, ownerAction, writeAction } from './client';

const walletKind = z.enum(['cash', 'bank_transfer', 'card', 'other']);
const optionalNote = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((value) => (value === '' ? undefined : value));
const signedMoney = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return parseMoney(value === '' ? '0' : value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid amount' });
      return z.NEVER;
    }
  });
const walletSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: walletKind,
  currency: z.enum(['USD', 'SRD']),
  locationId: uuid.nullable().optional(),
  notes: optionalNote,
});

const transferSchema = z.object({
  sourceWalletId: uuid,
  destinationWalletId: uuid,
  amountCents: moneyInput.refine((amount) => amount > 0, 'Must be more than zero'),
  occurredAt: dateInput,
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  note: optionalNote,
});

const reconciliationSchema = z.object({
  walletId: uuid,
  periodEnd: dateInput,
  statementBalanceCents: signedMoney,
  notes: optionalNote,
});

const obligationSchema = z.object({
  direction: z.enum(['receivable', 'payable']),
  counterpartyName: z.string().trim().min(1).max(180),
  currency: z.enum(['USD', 'SRD']),
  originalAmountCents: moneyInput.refine((amount) => amount > 0, 'Must be more than zero'),
  locationId: uuid.nullable().optional(),
  dueDate: dateInput.nullable().optional(),
  issuedAt: dateInput,
  notes: optionalNote,
});

const obligationPaymentSchema = z.object({
  obligationId: uuid,
  walletId: uuid,
  amountCents: moneyInput.refine((amount) => amount > 0, 'Must be more than zero'),
  occurredAt: dateInput,
  paymentMethod: walletKind,
  idempotencyKey: z.string().trim().min(8).max(120),
  notes: optionalNote,
});

async function lockedWallets(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)].sort();
  await tx.execute(
    sql`SELECT id FROM wallets WHERE id IN (${sql.join(
      unique.map((id) => sql`${id}`),
      sql`, `,
    )}) ORDER BY id FOR UPDATE`,
  );
  const rows = await tx
    .select()
    .from(wallets)
    .where(inArray(wallets.id, unique))
    .orderBy(asc(wallets.id));
  return new Map(rows.map((wallet) => [wallet.id, wallet]));
}

export const createWallet = ownerAction
  .metadata({ action: 'created', entity: 'wallet' })
  .inputSchema(walletSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [wallet] = await tx
        .insert(wallets)
        .values({
          name: input.name,
          kind: input.kind,
          currency: input.currency,
          locationId: input.locationId ?? null,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning({ id: wallets.id, name: wallets.name });
      if (!wallet) throw new ActionError('Could not create the wallet.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created wallet',
        entityType: 'wallet',
        entityId: wallet.id,
        entityLabel: wallet.name,
      });
      return wallet;
    });
  });

export const updateWallet = ownerAction
  .metadata({ action: 'updated', entity: 'wallet' })
  .inputSchema(walletSchema.extend({ id: uuid, active: z.boolean() }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [wallet] = await tx
        .update(wallets)
        .set({
          name: input.name,
          kind: input.kind,
          currency: input.currency,
          locationId: input.locationId ?? null,
          notes: input.notes ?? null,
          active: input.active,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, input.id))
        .returning({ id: wallets.id, name: wallets.name });
      if (!wallet) throw new ActionError('That wallet no longer exists.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated wallet',
        entityType: 'wallet',
        entityId: wallet.id,
        entityLabel: wallet.name,
      });
      return wallet;
    });
  });

export const transferBetweenWallets = writeAction
  .metadata({ action: 'transferred', entity: 'wallet transfer' })
  .inputSchema(transferSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      if (input.sourceWalletId === input.destinationWalletId) {
        throw new ActionError('Choose two different wallets.');
      }
      if (input.idempotencyKey) {
        const [existing] = await tx
          .select({ id: walletTransfers.id, amountCents: walletTransfers.amountCents })
          .from(walletTransfers)
          .where(eq(walletTransfers.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (existing)
          return { id: existing.id, amountCents: existing.amountCents, reused: true };
      }

      const byId = await lockedWallets(tx, [input.sourceWalletId, input.destinationWalletId]);
      const source = byId.get(input.sourceWalletId);
      const destination = byId.get(input.destinationWalletId);
      if (!source || !destination) throw new ActionError('Both wallets must exist.');
      if (!source.active || !destination.active) {
        throw new ActionError('Transfers require active wallets.');
      }
      if (source.currency !== destination.currency) {
        throw new ActionError(
          'Cross-currency transfers are deferred. Use an explicit FX workflow.',
        );
      }
      const balance = await walletBalanceCents(tx, source.id);
      if (balance < input.amountCents) {
        throw new ActionError(`Insufficient balance in ${source.name}.`);
      }

      const [transfer] = await tx
        .insert(walletTransfers)
        .values({
          sourceWalletId: source.id,
          destinationWalletId: destination.id,
          amountCents: input.amountCents,
          currency: source.currency,
          occurredAt: input.occurredAt,
          idempotencyKey: input.idempotencyKey ?? null,
          note: input.note ?? null,
          createdById: ctx.member.id,
        })
        .returning();
      if (!transfer) throw new ActionError('Could not create the transfer.');

      const rateMicros =
        source.currency === 'SRD'
          ? await rateOn(input.occurredAt, tx)
          : await rateForRecord(input.occurredAt, tx);
      const correlationId = transfer.correlationId;
      const attribution = {
        locationId: source.locationId ?? destination.locationId ?? null,
        correlationId,
        eventType: 'wallet_transfer',
        notes: input.note ?? null,
      };
      await postLedgerEntry(tx, {
        direction: 'out',
        category: 'other',
        description: `Transfer to ${destination.name}`,
        currency: source.currency,
        rateMicros,
        amountCents: input.amountCents,
        paymentMethod: source.kind === 'bank_transfer' ? 'bank_transfer' : 'other',
        occurredAt: input.occurredAt,
        memberId: ctx.member.id,
        sourceKind: 'manual',
        sourceId: transfer.id,
        walletId: source.id,
        ...attribution,
      });
      await postLedgerEntry(tx, {
        direction: 'in',
        category: 'other',
        description: `Transfer from ${source.name}`,
        currency: destination.currency,
        rateMicros,
        amountCents: input.amountCents,
        paymentMethod: destination.kind === 'bank_transfer' ? 'bank_transfer' : 'other',
        occurredAt: input.occurredAt,
        memberId: ctx.member.id,
        sourceKind: 'manual',
        sourceId: transfer.id,
        walletId: destination.id,
        ...attribution,
      });
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'transferred between wallets',
        entityType: 'wallet_transfer',
        entityId: transfer.id,
        entityLabel: `${source.name} → ${destination.name}`,
      });
      return { id: transfer.id, amountCents: transfer.amountCents, reused: false };
    });
  });

export const createReconciliation = writeAction
  .metadata({ action: 'created', entity: 'reconciliation' })
  .inputSchema(reconciliationSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const byId = await lockedWallets(tx, [input.walletId]);
      const wallet = byId.get(input.walletId);
      if (!wallet) throw new ActionError('That wallet no longer exists.');
      const [row] = await tx
        .insert(reconciliations)
        .values({
          walletId: wallet.id,
          periodEnd: input.periodEnd,
          statementBalanceCents: input.statementBalanceCents,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning({ id: reconciliations.id });
      if (!row) throw new ActionError('Could not save the reconciliation.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created reconciliation checkpoint',
        entityType: 'reconciliation',
        entityId: row.id,
        entityLabel: wallet.name,
      });
      return { id: row.id, ledgerBalanceCents: await walletBalanceCents(tx, wallet.id) };
    });
    return result;
  });

export const completeReconciliation = ownerAction
  .metadata({ action: 'completed', entity: 'reconciliation' })
  .inputSchema(z.object({ id: uuid, notes: optionalNote }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(reconciliations)
        .set({
          status: 'completed',
          completedAt: new Date(),
          completedById: ctx.member.id,
          notes: input.notes ?? null,
        })
        .where(and(eq(reconciliations.id, input.id), eq(reconciliations.status, 'open')))
        .returning({ id: reconciliations.id });
      if (!row) throw new ActionError('That reconciliation is already complete or missing.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'completed reconciliation',
        entityType: 'reconciliation',
        entityId: row.id,
      });
      return row;
    });
  });

export const createFinanceObligation = ownerAction
  .metadata({ action: 'created', entity: 'finance obligation' })
  .inputSchema(obligationSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(financeObligations)
        .values({
          direction: input.direction,
          counterpartyName: input.counterpartyName,
          currency: input.currency,
          originalAmountCents: input.originalAmountCents,
          locationId: input.locationId ?? null,
          dueDate: input.dueDate?.toISOString().slice(0, 10) ?? null,
          issuedAt: input.issuedAt,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning({ id: financeObligations.id });
      if (!row) throw new ActionError('Could not create the obligation.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `created ${input.direction}`,
        entityType: 'finance_obligation',
        entityId: row.id,
        entityLabel: input.counterpartyName,
      });
      return row;
    });
  });

export const recordFinanceObligationPayment = ownerAction
  .metadata({ action: 'recorded settlement for', entity: 'finance obligation' })
  .inputSchema(obligationPaymentSchema)
  .action(async ({ parsedInput: input, ctx }) =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`,
      );
      const [existing] = await tx
        .select({
          id: financeObligationPayments.id,
          obligationId: financeObligationPayments.obligationId,
          walletId: financeObligationPayments.walletId,
          amountCents: financeObligationPayments.amountCents,
        })
        .from(financeObligationPayments)
        .where(eq(financeObligationPayments.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        if (
          existing.obligationId !== input.obligationId ||
          existing.walletId !== input.walletId ||
          existing.amountCents !== input.amountCents
        ) {
          throw new ActionError('That retry key is already used for a different settlement.');
        }
        return { id: existing.id, amountCents: existing.amountCents, reused: true };
      }

      await tx.execute(
        sql`SELECT id FROM finance_obligations WHERE id = ${input.obligationId} FOR UPDATE`,
      );
      const [obligation] = await tx
        .select()
        .from(financeObligations)
        .where(eq(financeObligations.id, input.obligationId))
        .limit(1);
      if (!obligation) throw new ActionError('That obligation no longer exists.');
      if (obligation.status === 'cancelled' || obligation.status === 'paid') {
        throw new ActionError('That obligation is already closed.');
      }
      const outstanding = obligation.originalAmountCents - obligation.paidAmountCents;
      if (input.amountCents > outstanding) {
        throw new ActionError('The settlement cannot exceed the outstanding amount.');
      }

      await tx.execute(sql`SELECT id FROM wallets WHERE id = ${input.walletId} FOR UPDATE`);
      const [wallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, input.walletId))
        .limit(1);
      if (!wallet?.active) throw new ActionError('Choose an active wallet.');
      if (wallet.currency !== obligation.currency) {
        throw new ActionError('The wallet currency must match the obligation currency.');
      }
      if (obligation.direction === 'payable') {
        const balance = await walletBalanceCents(tx, wallet.id);
        if (balance < input.amountCents)
          throw new ActionError(`Insufficient balance in ${wallet.name}.`);
      }

      const occurredAt = input.occurredAt;
      const [payment] = await tx
        .insert(financeObligationPayments)
        .values({
          obligationId: obligation.id,
          walletId: wallet.id,
          amountCents: input.amountCents,
          currency: obligation.currency,
          paymentMethod: input.paymentMethod,
          occurredAt,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning({
          id: financeObligationPayments.id,
          correlationId: financeObligationPayments.correlationId,
        });
      if (!payment) throw new ActionError('Could not record the settlement.');

      const rateMicros =
        obligation.currency === 'SRD'
          ? await rateOn(occurredAt, tx)
          : await rateForRecord(occurredAt, tx);
      await postLedgerEntry(tx, {
        direction: obligation.direction === 'receivable' ? 'in' : 'out',
        category: 'other',
        description: `${obligation.direction === 'receivable' ? 'Received' : 'Paid'} ${obligation.counterpartyName}`,
        currency: obligation.currency,
        rateMicros,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        occurredAt,
        memberId: ctx.member.id,
        sourceKind: 'manual',
        sourceId: payment.id,
        walletId: wallet.id,
        locationId: obligation.locationId ?? wallet.locationId,
        correlationId: payment.correlationId,
        eventType: 'obligation_payment',
        notes: input.notes ?? null,
      });

      const paidAmountCents = obligation.paidAmountCents + input.amountCents;
      const status = paidAmountCents === obligation.originalAmountCents ? 'paid' : 'partial';
      await tx
        .update(financeObligations)
        .set({ paidAmountCents, status, updatedAt: new Date() })
        .where(eq(financeObligations.id, obligation.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `settled ${obligation.direction}`,
        entityType: 'finance_obligation',
        entityId: obligation.id,
        entityLabel: obligation.counterpartyName,
      });
      return { id: payment.id, amountCents: input.amountCents, reused: false };
    }),
  );
