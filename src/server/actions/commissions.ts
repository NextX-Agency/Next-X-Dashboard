'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { fromBase, normaliseToUsd, toBase } from '@/lib/fx';
import { uuid } from '@/lib/schemas';
import { db } from '../db/client';
import {
  commissionPayouts,
  commissions,
  expenses,
  locations,
  sellerCategoryRates,
  sellers,
  wallets,
} from '../db/schema';
import { logActivity, postLedgerEntry, walletBalanceCents } from '../services/posting';
import { rateForRecord, rateOn } from '../services/rates';
import { ActionError, ownerAction } from './client';

const rateBps = z.number().int().min(0).max(10_000);

const sellerProfileSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(120),
  locationId: uuid.nullable().optional(),
  defaultRateBps: rateBps,
  active: z.boolean().default(true),
  categoryRates: z
    .array(z.object({ categoryId: uuid, rateBps }))
    .default([])
    .superRefine((rows, ctx) => {
      if (new Set(rows.map((row) => row.categoryId)).size !== rows.length) {
        ctx.addIssue({ code: 'custom', message: 'A category can only have one rate.' });
      }
    }),
});

export const saveSellerProfile = ownerAction
  .metadata({ action: 'saved', entity: 'seller' })
  .inputSchema(sellerProfileSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      if (input.locationId) {
        const [location] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.id, input.locationId))
          .limit(1);
        if (!location) throw new ActionError('That seller location does not exist.');
      }
      const values = {
        name: input.name,
        locationId: input.locationId ?? null,
        defaultRateBps: input.defaultRateBps,
        active: input.active,
        updatedAt: new Date(),
      };
      let sellerId = input.id;
      if (sellerId) {
        const [updated] = await tx
          .update(sellers)
          .set(values)
          .where(eq(sellers.id, sellerId))
          .returning({ id: sellers.id });
        if (!updated) throw new ActionError('That seller no longer exists.');
      } else {
        const [created] = await tx.insert(sellers).values(values).returning({ id: sellers.id });
        if (!created) throw new ActionError('Could not create the seller.');
        sellerId = created.id;
      }
      await tx.delete(sellerCategoryRates).where(eq(sellerCategoryRates.sellerId, sellerId));
      if (input.categoryRates.length > 0) {
        await tx
          .insert(sellerCategoryRates)
          .values(input.categoryRates.map((row) => ({ sellerId: sellerId as string, ...row })));
      }
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.id ? 'updated seller commission rates' : 'created seller',
        entityType: 'seller',
        entityId: sellerId,
        entityLabel: input.name,
      });
      return { id: sellerId, name: input.name };
    });
    return result;
  });

export const setLocationCommissionRate = ownerAction
  .metadata({ action: 'updated', entity: 'location_commission_rate' })
  .inputSchema(z.object({ locationId: uuid, rateBps }))
  .action(async ({ parsedInput: input, ctx }) => {
    const location = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(locations)
        .set({ commissionRateBps: input.rateBps, updatedAt: new Date() })
        .where(eq(locations.id, input.locationId))
        .returning({ id: locations.id, name: locations.name });
      if (!updated) throw new ActionError('That location no longer exists.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated location commission fallback rate',
        entityType: 'location',
        entityId: updated.id,
        entityLabel: updated.name,
      });
      return updated;
    });
    return { id: location.id, rateBps: input.rateBps };
  });

export const paySellerCommissions = ownerAction
  .metadata({ action: 'paid', entity: 'commission_payout' })
  .inputSchema(z.object({ sellerId: uuid, walletId: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM wallets WHERE id = ${input.walletId} FOR UPDATE`);
      await tx.execute(
        sql`SELECT id FROM commissions
            WHERE seller_id = ${input.sellerId} AND status = 'open'
            ORDER BY id FOR UPDATE`,
      );

      const [seller] = await tx
        .select({ id: sellers.id, name: sellers.name, active: sellers.active })
        .from(sellers)
        .where(eq(sellers.id, input.sellerId))
        .limit(1);
      const [wallet] = await tx
        .select({
          id: wallets.id,
          name: wallets.name,
          currency: wallets.currency,
          active: wallets.active,
          locationId: wallets.locationId,
        })
        .from(wallets)
        .where(eq(wallets.id, input.walletId))
        .limit(1);
      if (!seller?.active)
        throw new ActionError('That seller is inactive or no longer exists.');
      if (!wallet?.active) throw new ActionError('Choose an active payout wallet.');

      const openCommissions = await tx
        .select({
          id: commissions.id,
          amountCents: commissions.amountCents,
          currency: commissions.currency,
          fxRateMicros: commissions.fxRateMicros,
        })
        .from(commissions)
        .where(and(eq(commissions.sellerId, seller.id), eq(commissions.status, 'open')))
        .orderBy(commissions.createdAt, commissions.id);
      if (openCommissions.length === 0)
        throw new ActionError('There are no unpaid commissions for this seller.');

      const amountCents = Math.round(
        openCommissions.reduce((total, commission) => {
          if (commission.currency === wallet.currency) return total + commission.amountCents;
          return (
            total +
            (commission.currency === 'USD'
              ? fromBase(commission.amountCents, commission.fxRateMicros)
              : toBase(commission.amountCents, commission.fxRateMicros))
          );
        }, 0),
      );
      if (amountCents <= 0) throw new ActionError('The open commissions total to zero.');

      const balance = await walletBalanceCents(tx, wallet.id);
      if (balance < amountCents) {
        throw new ActionError(
          `Insufficient balance in ${wallet.name}; ${amountCents - balance} more cents are needed.`,
        );
      }

      const occurredAt = new Date();
      const fxRateMicros =
        wallet.currency === 'SRD'
          ? await rateOn(occurredAt, tx)
          : await rateForRecord(occurredAt, tx);
      const description = `Commission payout · ${seller.name} · ${openCommissions.length} commission${openCommissions.length === 1 ? '' : 's'}`;
      const [expense] = await tx
        .insert(expenses)
        .values({
          description,
          currency: wallet.currency,
          fxRateMicros,
          amountCents,
          amountUsdCents: normaliseToUsd(amountCents, wallet.currency, fxRateMicros),
          paymentMethod: 'other',
          walletId: wallet.id,
          locationId: wallet.locationId,
          occurredAt,
          notes:
            'Commission payout; commissions and cash posting are linked by the payout record.',
          createdById: ctx.member.id,
        })
        .returning({ id: expenses.id });
      if (!expense) throw new ActionError('Could not create the commission payout expense.');

      const correlationId = randomUUID();
      const [payout] = await tx
        .insert(commissionPayouts)
        .values({
          sellerId: seller.id,
          walletId: wallet.id,
          expenseId: expense.id,
          amountCents,
          amountUsdCents: normaliseToUsd(amountCents, wallet.currency, fxRateMicros),
          currency: wallet.currency,
          fxRateMicros,
          correlationId,
          createdById: ctx.member.id,
        })
        .returning({ id: commissionPayouts.id });
      if (!payout) throw new ActionError('Could not create the commission payout record.');

      await postLedgerEntry(tx, {
        direction: 'out',
        category: 'operating',
        description,
        currency: wallet.currency,
        rateMicros: fxRateMicros,
        amountCents,
        paymentMethod: 'other',
        occurredAt,
        memberId: ctx.member.id,
        sourceKind: 'expense',
        sourceId: expense.id,
        walletId: wallet.id,
        locationId: wallet.locationId,
        correlationId,
        eventType: 'commission_payout',
        notes: `Commission payout ${payout.id}`,
      });

      const paidRows = await tx
        .update(commissions)
        .set({ status: 'paid', paidAt: occurredAt, payoutId: payout.id })
        .where(
          and(
            inArray(
              commissions.id,
              openCommissions.map((commission) => commission.id),
            ),
            eq(commissions.status, 'open'),
          ),
        )
        .returning({ id: commissions.id });
      if (paidRows.length !== openCommissions.length) {
        throw new ActionError('The commission set changed. The payout was rolled back.');
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'paid seller commissions',
        entityType: 'commission_payout',
        entityId: payout.id,
        entityLabel: seller.name,
      });
      return {
        id: payout.id,
        count: paidRows.length,
        amountCents,
        currency: wallet.currency,
        walletName: wallet.name,
      };
    });
  });
