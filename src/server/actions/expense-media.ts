'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  EXPENSE_RECEIPT_TYPES,
  isExpenseReceiptPath,
  MAX_EXPENSE_RECEIPT_BYTES,
  validateExpenseReceiptUpload,
} from '@/lib/expense-receipts';
import { uuid } from '@/lib/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '../db/client';
import { expenses } from '../db/schema';
import {
  deleteExpenseReceiptObject,
  EXPENSE_RECEIPT_BUCKET,
} from '../services/expense-receipts';
import { logActivity } from '../services/posting';
import { ActionError, memberAction, ownerAction, writeAction } from './client';

const receiptType = z.enum(EXPENSE_RECEIPT_TYPES);

/** Authorize a direct browser upload to one generated private object path. */
export const startExpenseReceiptUpload = writeAction
  .metadata({ action: 'started upload', entity: 'expense receipt' })
  .inputSchema(z.object({ expenseId: uuid, contentType: receiptType }))
  .action(async ({ parsedInput: input }) => {
    const [expense] = await db
      .select({ id: expenses.id, voidedAt: expenses.voidedAt })
      .from(expenses)
      .where(eq(expenses.id, input.expenseId))
      .limit(1);
    if (!expense) throw new ActionError('That expense no longer exists.');
    if (expense.voidedAt)
      throw new ActionError('A receipt cannot be attached to a voided expense.');

    const path = `expenses/${input.expenseId}/${crypto.randomUUID()}`;
    const { data, error } = await createAdminClient()
      .storage.from(EXPENSE_RECEIPT_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) {
      throw new ActionError('Receipt uploads are not configured. Please contact the owner.');
    }
    return { path: data.path, token: data.token, maxBytes: MAX_EXPENSE_RECEIPT_BYTES };
  });

/** Verify object ownership and content before saving its private Storage key. */
export const finalizeExpenseReceiptUpload = writeAction
  .metadata({ action: 'uploaded', entity: 'expense receipt' })
  .inputSchema(z.object({ expenseId: uuid, pathname: z.string().min(1).max(300) }))
  .action(async ({ parsedInput: input, ctx }) => {
    if (!isExpenseReceiptPath(input.expenseId, input.pathname)) {
      throw new ActionError('The uploaded receipt does not belong to this expense.');
    }

    const [current] = await db
      .select({ receiptPathname: expenses.receiptPathname, voidedAt: expenses.voidedAt })
      .from(expenses)
      .where(eq(expenses.id, input.expenseId))
      .limit(1);
    if (!current) throw new ActionError('That expense no longer exists.');
    if (current.voidedAt)
      throw new ActionError('A receipt cannot be attached to a voided expense.');
    if (current.receiptPathname === input.pathname) {
      return { id: input.expenseId, hasReceipt: true };
    }

    const { data: object, error } = await createAdminClient()
      .storage.from(EXPENSE_RECEIPT_BUCKET)
      .download(input.pathname);
    if (error || !object) {
      throw new ActionError('The uploaded receipt could not be read. Please upload it again.');
    }
    if (object.size > MAX_EXPENSE_RECEIPT_BYTES) {
      await deleteExpenseReceiptObject(input.pathname);
      throw new ActionError('The receipt exceeds the 10 MB limit.');
    }

    try {
      validateExpenseReceiptUpload({
        expenseId: input.expenseId,
        pathname: input.pathname,
        bytes: Buffer.from(await object.arrayBuffer()),
        declaredType: object.type,
      });
    } catch (error) {
      await deleteExpenseReceiptObject(input.pathname);
      throw new ActionError(
        error instanceof Error ? error.message : 'The receipt file could not be verified.',
      );
    }

    let result: { previousPathname: string | null; unchanged: boolean };
    try {
      result = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ receiptPathname: expenses.receiptPathname, voidedAt: expenses.voidedAt })
          .from(expenses)
          .where(eq(expenses.id, input.expenseId))
          .for('update')
          .limit(1);
        if (!locked) throw new ActionError('That expense no longer exists.');
        if (locked.voidedAt)
          throw new ActionError('A receipt cannot be attached to a voided expense.');
        if (locked.receiptPathname === input.pathname) {
          return { previousPathname: null, unchanged: true };
        }

        await tx
          .update(expenses)
          .set({ receiptPathname: input.pathname, receiptUrl: null, updatedAt: new Date() })
          .where(eq(expenses.id, input.expenseId));
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'uploaded expense receipt',
          entityType: 'expense',
          entityId: input.expenseId,
        });
        return { previousPathname: locked.receiptPathname, unchanged: false };
      });
    } catch (error) {
      // A failed transaction can leave the just-uploaded object orphaned. Only
      // delete it after confirming no committed expense row references it.
      try {
        const [saved] = await db
          .select({ receiptPathname: expenses.receiptPathname })
          .from(expenses)
          .where(eq(expenses.id, input.expenseId))
          .limit(1);
        if (saved?.receiptPathname !== input.pathname) {
          await deleteExpenseReceiptObject(input.pathname);
        }
      } catch {
        // Keep the object if the reference check is unavailable: deleting a
        // potentially committed receipt would be worse than a private orphan.
      }
      throw error;
    }

    if (result.previousPathname && result.previousPathname !== input.pathname) {
      await deleteExpenseReceiptObject(result.previousPathname);
    }
    return { id: input.expenseId, hasReceipt: true, unchanged: result.unchanged };
  });

/** Issue a short-lived download URL only after checking membership and path scope. */
export const getExpenseReceiptUrl = memberAction
  .metadata({ action: 'opened', entity: 'expense receipt' })
  .inputSchema(z.object({ expenseId: uuid }))
  .action(async ({ parsedInput: input }) => {
    const [expense] = await db
      .select({ receiptPathname: expenses.receiptPathname })
      .from(expenses)
      .where(eq(expenses.id, input.expenseId))
      .limit(1);
    if (!expense?.receiptPathname)
      throw new ActionError('This expense has no attached receipt.');
    if (!isExpenseReceiptPath(input.expenseId, expense.receiptPathname)) {
      throw new ActionError(
        'The saved receipt reference is invalid. Please contact the owner.',
      );
    }

    const { data, error } = await createAdminClient()
      .storage.from(EXPENSE_RECEIPT_BUCKET)
      .createSignedUrl(expense.receiptPathname, 60, { download: true });
    if (error || !data?.signedUrl) {
      throw new ActionError('A secure receipt link could not be created. Please try again.');
    }
    return { url: data.signedUrl };
  });

/** Clear the owning row first, then remove only its path-scoped private object. */
export const removeExpenseReceipt = ownerAction
  .metadata({ action: 'deleted', entity: 'expense receipt' })
  .inputSchema(z.object({ expenseId: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const pathname = await db.transaction(async (tx) => {
      const [expense] = await tx
        .select({ receiptPathname: expenses.receiptPathname })
        .from(expenses)
        .where(eq(expenses.id, input.expenseId))
        .for('update')
        .limit(1);
      if (!expense) throw new ActionError('That expense no longer exists.');
      if (!expense.receiptPathname) return null;
      if (!isExpenseReceiptPath(input.expenseId, expense.receiptPathname)) {
        throw new ActionError(
          'The saved receipt reference is invalid. Please contact the owner.',
        );
      }

      await tx
        .update(expenses)
        .set({ receiptPathname: null, receiptUrl: null, updatedAt: new Date() })
        .where(eq(expenses.id, input.expenseId));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'removed expense receipt',
        entityType: 'expense',
        entityId: input.expenseId,
      });
      return expense.receiptPathname;
    });

    if (pathname) {
      const removed = await deleteExpenseReceiptObject(pathname);
      if (!removed) {
        // Restore the reference if no newer upload replaced it while Storage
        // was unavailable, so the owner can retry rather than losing access.
        await db.transaction(async (tx) => {
          const [restored] = await tx
            .update(expenses)
            .set({ receiptPathname: pathname, updatedAt: new Date() })
            .where(and(eq(expenses.id, input.expenseId), isNull(expenses.receiptPathname)))
            .returning({ id: expenses.id });
          if (restored) {
            await logActivity(tx, {
              memberId: ctx.member.id,
              action: 'restored expense receipt reference after Storage cleanup failed',
              entityType: 'expense',
              entityId: input.expenseId,
            });
          }
        });
        throw new ActionError(
          'Storage could not remove the receipt. The receipt reference was restored where possible; please retry.',
        );
      }
    }
    return { id: input.expenseId, hasReceipt: false };
  });
