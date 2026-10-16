'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { normaliseToUsd } from '@/lib/fx';
import {
  expenseSchema,
  fxRateSchema,
  ledgerEntrySchema,
  recurringExpenseSchema,
  settingsSchema,
  uuid,
} from '@/lib/schemas';
import { db } from '../db/client';
import {
  expenses,
  fxRates,
  ledgerEntries,
  members,
  reconciliationExceptions,
  recurringExpenses,
  settings,
  wallets,
} from '../db/schema';
import { defaultWalletFor, logActivity, postLedgerEntry } from '../services/posting';
import { rateForRecord, rateOn } from '../services/rates';
import { ActionError, ownerAction, writeAction } from './client';

/**
 * An expense is money leaving the business, so by default it posts to the cash
 * ledger as well. The toggle exists for the case where the payment was already
 * entered by hand — without it, importing historical expenses would
 * double-count every one of them.
 */
export const createExpense = writeAction
  .metadata({ action: 'created', entity: 'expense' })
  .inputSchema(expenseSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.occurredAt, tx)
          : await rateForRecord(input.occurredAt, tx);
      const walletId = input.postToLedger
        ? (input.walletId ??
          (await defaultWalletFor(tx, {
            currency: input.currency,
            method: input.paymentMethod,
          })))
        : (input.walletId ?? null);

      const [expense] = await tx
        .insert(expenses)
        .values({
          description: input.description,
          vendorName: input.vendorName,
          classification: input.classification,
          categoryId: input.categoryId,
          currency: input.currency,
          fxRateMicros: rateMicros,
          amountCents: input.amountCents,
          amountUsdCents: normaliseToUsd(input.amountCents, input.currency, rateMicros),
          paymentMethod: input.paymentMethod,
          walletId,
          locationId: input.locationId ?? null,
          storefrontId: input.storefrontId ?? null,
          occurredAt: input.occurredAt,
          receiptNumber: input.receiptNumber || null,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning();

      if (!expense) throw new ActionError('Could not record the expense.');

      if (input.postToLedger) {
        await postLedgerEntry(tx, {
          direction: 'out',
          category: 'operating',
          description: input.description,
          currency: input.currency,
          rateMicros,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          occurredAt: input.occurredAt,
          memberId: ctx.member.id,
          sourceKind: 'expense',
          sourceId: expense.id,
          walletId,
          locationId: input.locationId ?? null,
          storefrontId: input.storefrontId ?? null,
          eventType: 'expense_posted',
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'logged expense',
        entityType: 'expense',
        entityId: expense.id,
        entityLabel: input.description,
      });

      return { id: expense.id, description: input.description };
    });
    return result;
  });

/** Clear a legacy or current review flag while retaining its reason and reviewer audit trail. */
export const markExpenseReviewed = ownerAction
  .metadata({ action: 'reviewed', entity: 'expense' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [expense] = await tx
        .select({
          id: expenses.id,
          description: expenses.description,
          needsReview: expenses.needsReview,
        })
        .from(expenses)
        .where(eq(expenses.id, input.id))
        .limit(1);

      if (!expense) throw new ActionError('That expense no longer exists.');
      if (!expense.needsReview) return { id: expense.id, description: expense.description };

      await tx
        .update(expenses)
        .set({
          needsReview: false,
          reviewedAt: new Date(),
          reviewedById: ctx.member.id,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, input.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'reviewed expense',
        entityType: 'expense',
        entityId: expense.id,
        entityLabel: expense.description,
      });
      return { id: expense.id, description: expense.description };
    });
  });

/** Create or revise an owner-controlled recurring expense schedule. */
export const saveRecurringExpense = ownerAction
  .metadata({ action: 'saved', entity: 'recurring expense schedule' })
  .inputSchema(recurringExpenseSchema.extend({ id: uuid.optional() }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const walletId = input.walletId ?? null;
      if (input.isActive && input.autoPost) {
        if (!walletId)
          throw new ActionError('Choose a wallet before enabling automatic posting.');
        const [wallet] = await tx
          .select({ currency: wallets.currency, active: wallets.active })
          .from(wallets)
          .where(eq(wallets.id, walletId))
          .limit(1);
        if (!wallet?.active)
          throw new ActionError('Choose an active wallet for automatic posting.');
        if (wallet.currency !== input.currency) {
          throw new ActionError('The wallet and schedule must use the same currency.');
        }
      }

      const values = {
        name: input.name,
        vendorName: input.vendorName,
        amountCents: input.amountCents,
        currency: input.currency,
        cadence: input.cadence,
        anchorDay: input.anchorDay,
        walletId,
        locationId: input.locationId ?? null,
        categoryId: input.categoryId ?? null,
        nextRunOn: input.nextRunOn.toISOString().slice(0, 10),
        isActive: input.isActive,
        autoPost: input.autoPost,
        amountIsEstimated: input.amountIsEstimated,
        anchorDayIsEstimated: input.anchorDayIsEstimated,
        lastError: null,
        updatedAt: new Date(),
      };

      let id = input.id;
      if (id) {
        const [existing] = await tx
          .select({ id: recurringExpenses.id })
          .from(recurringExpenses)
          .where(eq(recurringExpenses.id, id))
          .limit(1);
        if (!existing) throw new ActionError('That recurring expense no longer exists.');
        await tx.update(recurringExpenses).set(values).where(eq(recurringExpenses.id, id));
      } else {
        const [created] = await tx
          .insert(recurringExpenses)
          .values({ ...values, createdById: ctx.member.id })
          .returning({ id: recurringExpenses.id });
        if (!created) throw new ActionError('Could not save the recurring expense.');
        id = created.id;
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.id ? 'updated recurring expense' : 'created recurring expense',
        entityType: 'recurring_expense',
        entityId: id,
        entityLabel: input.name,
      });
      return { id, name: input.name };
    });
    return result;
  });

export const setRecurringExpenseActive = ownerAction
  .metadata({ action: 'changed status of', entity: 'recurring expense schedule' })
  .inputSchema(z.object({ id: uuid, isActive: z.boolean() }))
  .action(async ({ parsedInput: input, ctx }) => {
    const updated = await db.transaction(async (tx) => {
      if (input.isActive) {
        const [schedule] = await tx
          .select({
            autoPost: recurringExpenses.autoPost,
            walletId: recurringExpenses.walletId,
            currency: recurringExpenses.currency,
          })
          .from(recurringExpenses)
          .where(eq(recurringExpenses.id, input.id))
          .limit(1);
        if (!schedule) throw new ActionError('That recurring expense no longer exists.');
        if (schedule.autoPost) {
          if (!schedule.walletId)
            throw new ActionError('Assign a wallet before resuming automatic posting.');
          const [wallet] = await tx
            .select({ currency: wallets.currency, active: wallets.active })
            .from(wallets)
            .where(eq(wallets.id, schedule.walletId))
            .limit(1);
          if (!wallet?.active || wallet.currency !== schedule.currency) {
            throw new ActionError(
              'Choose an active wallet in the same currency before resuming.',
            );
          }
        }
      }
      const [result] = await tx
        .update(recurringExpenses)
        .set({ isActive: input.isActive, updatedAt: new Date(), lastError: null })
        .where(eq(recurringExpenses.id, input.id))
        .returning({ id: recurringExpenses.id, name: recurringExpenses.name });
      if (!result) throw new ActionError('That recurring expense no longer exists.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.isActive ? 'resumed recurring expense' : 'paused recurring expense',
        entityType: 'recurring_expense',
        entityId: result.id,
        entityLabel: result.name,
      });
      return result;
    });
    return updated;
  });

export const updateExpense = writeAction
  .metadata({ action: 'updated', entity: 'expense' })
  .inputSchema(expenseSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, input.id))
        .limit(1);

      if (!existing) throw new ActionError('That expense no longer exists.');
      if (existing.voidedAt) throw new ActionError('A voided expense cannot be edited.');

      const [existingPosting] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.sourceId, input.id))
        .limit(1);
      if (existingPosting) {
        const financialFieldsUnchanged =
          input.description === existing.description &&
          input.currency === existing.currency &&
          input.amountCents === existing.amountCents &&
          input.paymentMethod === existing.paymentMethod &&
          input.occurredAt.toISOString().slice(0, 10) ===
            existing.occurredAt.toISOString().slice(0, 10) &&
          input.postToLedger;
        if (!financialFieldsUnchanged) {
          throw new ActionError(
            'A posted expense’s amount, date, currency, payment method and description are immutable. Void it with a reason and record a corrected expense.',
          );
        }

        // Receipt references and notes are supporting metadata, not ledger
        // facts. Allow these to be corrected without rewriting the posting.
        await tx
          .update(expenses)
          .set({
            categoryId: input.categoryId,
            vendorName: input.vendorName,
            classification: input.classification,
            receiptNumber: input.receiptNumber || null,
            notes: input.notes ?? null,
            updatedAt: new Date(),
          })
          .where(eq(expenses.id, input.id));
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'updated expense reference details',
          entityType: 'expense',
          entityId: input.id,
          entityLabel: input.description,
        });
        return { id: input.id, description: input.description };
      }

      // Re-resolved from the (possibly changed) date, not read off the
      // existing row: moving an expense to a different day must not leave it
      // valued at the rate that was in force on the old one.
      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.occurredAt, tx)
          : await rateForRecord(input.occurredAt, tx);
      const walletId = input.postToLedger
        ? (input.walletId ??
          (await defaultWalletFor(tx, {
            currency: input.currency,
            method: input.paymentMethod,
          })))
        : (input.walletId ?? null);

      await tx
        .update(expenses)
        .set({
          description: input.description,
          vendorName: input.vendorName,
          classification: input.classification,
          categoryId: input.categoryId,
          currency: input.currency,
          fxRateMicros: rateMicros,
          amountCents: input.amountCents,
          amountUsdCents: normaliseToUsd(input.amountCents, input.currency, rateMicros),
          paymentMethod: input.paymentMethod,
          walletId,
          locationId: input.locationId ?? null,
          storefrontId: input.storefrontId ?? null,
          occurredAt: input.occurredAt,
          receiptNumber: input.receiptNumber || null,
          notes: input.notes ?? null,
        })
        .where(eq(expenses.id, input.id));

      if (input.postToLedger) {
        await postLedgerEntry(tx, {
          direction: 'out',
          category: 'operating',
          description: input.description,
          currency: input.currency,
          rateMicros,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          occurredAt: input.occurredAt,
          memberId: ctx.member.id,
          sourceKind: 'expense',
          sourceId: input.id,
          walletId,
          locationId: input.locationId ?? null,
          storefrontId: input.storefrontId ?? null,
          eventType: 'expense_posted',
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated expense',
        entityType: 'expense',
        entityId: input.id,
        entityLabel: input.description,
      });

      return { id: input.id, description: input.description };
    });
    return result;
  });

/** Posted expenses are corrected by a reversal, never by deleting history. */
export const voidExpense = ownerAction
  .metadata({ action: 'voided', entity: 'expense' })
  .inputSchema(z.object({ id: uuid, reason: z.string().trim().min(3).max(500) }))
  .action(async ({ parsedInput: input, ctx }) => {
    const description = await db.transaction(async (tx) => {
      const [expense] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, input.id))
        .limit(1);

      if (!expense) throw new ActionError('That expense no longer exists.');
      if (expense.voidedAt) throw new ActionError('That expense is already void.');

      const postings = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.sourceId, expense.id));
      for (const entry of postings) {
        await postLedgerEntry(tx, {
          direction: entry.direction === 'in' ? 'out' : 'in',
          category: entry.category,
          description: `Void ${entry.description}`,
          currency: entry.currency,
          rateMicros: entry.fxRateMicros,
          amountCents: entry.amountCents,
          paymentMethod: entry.paymentMethod,
          occurredAt: new Date(),
          memberId: ctx.member.id,
          principalId: entry.memberId,
          walletId: entry.walletId,
          locationId: entry.locationId,
          storefrontId: entry.storefrontId,
          reversalOfId: entry.id,
          eventType: 'expense_voided',
          notes: input.reason,
        });
      }
      await tx
        .update(expenses)
        .set({ voidedAt: new Date(), voidReason: input.reason, updatedAt: new Date() })
        .where(eq(expenses.id, expense.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'voided expense',
        entityType: 'expense',
        entityLabel: expense.description,
      });

      return expense.description;
    });
    return { description };
  });

/**
 * A manual cash movement: capital in, an owner draw, anything not already
 * posted by a document.
 *
 * Entries created here are `source_kind = 'manual'` on purpose. That is what
 * lets the Overview compare document-posted cash against the documents
 * themselves and flag drift, which is how it found the spreadsheet's $147.01
 * and $130 discrepancies.
 */
export const createLedgerEntry = writeAction
  .metadata({ action: 'created', entity: 'ledger entry' })
  .inputSchema(ledgerEntrySchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      if (input.category === 'owner_contribution' || input.category === 'owner_draw') {
        const [principal] = await tx
          .select({ isPrincipal: members.isPrincipal })
          .from(members)
          .where(eq(members.id, input.memberId ?? ''))
          .limit(1);
        if (!principal?.isPrincipal) {
          throw new ActionError('Owner contributions and draws must name an active principal.');
        }
      }

      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.occurredAt, tx)
          : await rateForRecord(input.occurredAt, tx);

      await postLedgerEntry(tx, {
        direction: input.direction,
        category: input.category,
        description: input.description,
        currency: input.currency,
        rateMicros,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        occurredAt: input.occurredAt,
        memberId: ctx.member.id,
        principalId: input.memberId,
        walletId:
          input.walletId ??
          (await defaultWalletFor(tx, {
            currency: input.currency,
            method: input.paymentMethod,
          })),
        locationId: input.locationId ?? null,
        storefrontId: input.storefrontId ?? null,
        eventType: 'manual',
        notes: input.notes ?? null,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `recorded cash ${input.direction}`,
        entityType: 'ledger_entry',
        entityLabel: input.description,
      });
    });
    return { description: input.description };
  });

/**
 * Reverse a ledger entry.
 *
 * The original is never deleted — `ledger_entries` is append-only, and that is
 * the property that makes the cash history worth trusting. A correction is a
 * new, opposite entry that points back at what it reverses.
 */
export const reverseLedgerEntry = writeAction
  .metadata({ action: 'reversed', entity: 'ledger entry' })
  .inputSchema(z.object({ id: uuid, reason: z.string().trim().min(3).max(500) }))
  .action(async ({ parsedInput: input, ctx }) => {
    const description = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.id, input.id))
        .limit(1);

      if (!entry) throw new ActionError('That entry no longer exists.');

      const [existingReversal] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.reversalOfId, entry.id))
        .limit(1);
      if (existingReversal)
        throw new ActionError('That ledger entry has already been reversed.');

      await postLedgerEntry(tx, {
        direction: entry.direction === 'in' ? 'out' : 'in',
        category: entry.category,
        description: `Reversal of ${entry.description}`,
        currency: entry.currency,
        rateMicros: entry.fxRateMicros,
        amountCents: entry.amountCents,
        paymentMethod: entry.paymentMethod,
        occurredAt: new Date(),
        memberId: ctx.member.id,
        principalId: entry.memberId,
        walletId: entry.walletId,
        locationId: entry.locationId,
        storefrontId: entry.storefrontId,
        reversalOfId: entry.id,
        eventType: 'manual_reversal',
        notes: input.reason,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'reversed ledger entry',
        entityType: 'ledger_entry',
        entityId: entry.id,
        entityLabel: entry.description,
      });

      return entry.description;
    });
    return { description };
  });

/** Close a reconciliation note only after the original business evidence has
 * been reviewed. The exception row remains as the audit record. */
export const resolveReconciliationException = ownerAction
  .metadata({ action: 'resolved', entity: 'reconciliation exception' })
  .inputSchema(z.object({ id: uuid, resolutionNotes: z.string().trim().min(3).max(1_000) }))
  .action(async ({ parsedInput: input, ctx }) => {
    const [resolved] = await db
      .update(reconciliationExceptions)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolutionNotes: input.resolutionNotes,
        resolvedById: ctx.member.id,
      })
      .where(eq(reconciliationExceptions.id, input.id))
      .returning({ id: reconciliationExceptions.id });

    if (!resolved) throw new ActionError('That reconciliation item no longer exists.');
    return { id: resolved.id };
  });

/**
 * Record a new exchange rate.
 *
 * Always an insert, never an update. Past transactions keep the rate they were
 * recorded with, which is the whole reason this is a dated series rather than a
 * setting — see ADR-0001 and `docs/02-data/money-and-fx.md`.
 */
export const createFxRate = writeAction
  .metadata({ action: 'created', entity: 'exchange rate' })
  .inputSchema(fxRateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      await tx.insert(fxRates).values({
        base: 'USD',
        quote: 'SRD',
        rateMicros: input.rate,
        effectiveFrom: input.effectiveFrom,
        source: 'manual',
        note: input.note ?? null,
        createdById: ctx.member.id,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'set exchange rate',
        entityType: 'fx_rate',
        entityLabel: `${(input.rate / 1_000_000).toFixed(4)} SRD/USD`,
      });
    });
    return { rate: input.rate };
  });

export const updateSettings = ownerAction
  .metadata({ action: 'updated', entity: 'settings' })
  .inputSchema(settingsSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(settings).limit(1);

      const identity = {
        legalName: input.legalName ?? null,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        email: input.email ?? null,
        taxId: input.taxId ?? null,
        logoUrl: input.logoUrl ?? null,
        invoiceFooter: input.invoiceFooter ?? null,
        instagram: input.instagram ?? null,
        openingHours: input.openingHours ?? null,
        pickupEnabled: input.pickupEnabled,
        pickupLabel: input.pickupLabel ?? null,
        pickupDetails: input.pickupDetails ?? null,
        sameDayPickupEnabled: input.sameDayPickupEnabled,
        pickupCutoffTime: input.pickupCutoffTime ?? null,
        deliveryEnabled: input.deliveryEnabled,
        deliveryDetails: input.deliveryDetails ?? null,
        deliveryAreas: input.deliveryAreas ?? null,
        deliveryFeeDisplay: input.deliveryFeeDisplay ?? null,
        deliveryEstimateDisplay: input.deliveryEstimateDisplay ?? null,
        paymentMethods: input.paymentMethods,
        announcement: input.announcement ?? null,
        heroTitle: input.heroTitle ?? null,
        heroBody: input.heroBody ?? null,
        supportTitle: input.supportTitle ?? null,
        supportBody: input.supportBody ?? null,
        defaultNewArrivalDays: input.defaultNewArrivalDays,
        homepageAvailableNowEnabled: input.homepageAvailableNowEnabled,
        homepageAvailableNowLimit: input.homepageAvailableNowLimit,
        homepageFeaturedBundlesEnabled: input.homepageFeaturedBundlesEnabled,
        homepageFeaturedBundlesLimit: input.homepageFeaturedBundlesLimit,
        homepageJustArrivedEnabled: input.homepageJustArrivedEnabled,
        homepageJustArrivedLimit: input.homepageJustArrivedLimit,
        homepageComingNextEnabled: input.homepageComingNextEnabled,
        homepageComingNextLimit: input.homepageComingNextLimit,
      };

      if (existing) {
        await tx
          .update(settings)
          .set({
            businessName: input.businessName,
            displayCurrency: input.displayCurrency,
            lowStockThreshold: input.lowStockThreshold,
            quoteValidityDays: input.quoteValidityDays,
            defaultPaymentDays: input.defaultPaymentDays,
            weeklyPurchaseBudgetCents: input.weeklyPurchaseBudgetCents,
            reviewHorizonDays: input.reviewHorizonDays,
            safetyStockDays: input.safetyStockDays,
            defaultSupplierLeadTimeDays: input.defaultSupplierLeadTimeDays,
            targetBundleMarginBp: input.targetBundleMarginBp,
            defaultBundleDiscountBp: input.defaultBundleDiscountBp,
            ...identity,
          })
          .where(eq(settings.id, existing.id));
      } else {
        await tx.insert(settings).values({
          businessName: input.businessName,
          displayCurrency: input.displayCurrency,
          lowStockThreshold: input.lowStockThreshold,
          quoteValidityDays: input.quoteValidityDays,
          defaultPaymentDays: input.defaultPaymentDays,
          weeklyPurchaseBudgetCents: input.weeklyPurchaseBudgetCents,
          reviewHorizonDays: input.reviewHorizonDays,
          safetyStockDays: input.safetyStockDays,
          defaultSupplierLeadTimeDays: input.defaultSupplierLeadTimeDays,
          targetBundleMarginBp: input.targetBundleMarginBp,
          defaultBundleDiscountBp: input.defaultBundleDiscountBp,
          ...identity,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated settings',
        entityType: 'settings',
        entityLabel: input.businessName,
      });
    });
    return { businessName: input.businessName };
  });
