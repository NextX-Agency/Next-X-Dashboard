'use server';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { publicAppUrl } from '@/lib/env';
import { createPublicToken } from '@/lib/public-token';
import { uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { sales } from '../db/schema';
import { logActivity, nextDocumentNumber, type Tx } from '../services/posting';
import { ActionError, writeAction } from './client';

/** A shared invoice link is valid for this long unless the sender picks a
 *  different window. An invoice that is paid and filed has no business being
 *  reachable by an old WhatsApp message forever. */
const DEFAULT_LINK_DAYS = 90;

async function lockSale(tx: Tx, saleId: string) {
  await tx.execute(sql`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`);
  const [sale] = await tx
    .select({
      id: sales.id,
      number: sales.number,
      status: sales.status,
      invoiceNumber: sales.invoiceNumber,
      hasLink: sales.publicTokenHash,
    })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  return sale;
}

/**
 * Create a secure customer-facing invoice link.
 *
 * Only the SHA-256 of the token is stored, so a link cannot be shown again.
 * Creating a new one therefore REPLACES the previous link: whatever was sent
 * before stops working. The sender is asked to confirm that before this runs
 * when a link already exists (see `InvoiceActions`).
 */
export const createPublicInvoiceLink = writeAction
  .metadata({ action: 'created', entity: 'public invoice link' })
  .inputSchema(
    z.object({
      saleId: uuid,
      expiresInDays: z.number().int().min(1).max(730).default(DEFAULT_LINK_DAYS),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const token = createPublicToken();
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError('Only a confirmed sale can be shared as an invoice.');
      }
      await tx
        .update(sales)
        .set({
          publicTokenHash: token.hash,
          publicTokenExpiresAt: expiresAt,
          // A document sent to a customer carries its invoice number.
          invoiceNumber: sale.invoiceNumber ?? (await nextDocumentNumber(tx, 'INV-')),
          updatedAt: new Date(),
        })
        .where(eq(sales.id, sale.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: sale.hasLink ? 'replaced public invoice link' : 'created public invoice link',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });
      return { number: sale.number };
    });
    const baseUrl = publicAppUrl().replace(/\/$/, '');
    return {
      ...result,
      url: `${baseUrl}/d/invoice/${token.raw}`,
      expiresAt: expiresAt.toISOString(),
    };
  });

/** Switch the shared link off. The customer sees "not found" immediately. */
export const revokePublicInvoiceLink = writeAction
  .metadata({ action: 'revoked', entity: 'public invoice link' })
  .inputSchema(z.object({ saleId: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (!sale.hasLink) throw new ActionError('This invoice has no active link.');
      await tx
        .update(sales)
        .set({ publicTokenHash: null, publicTokenExpiresAt: null, updatedAt: new Date() })
        .where(eq(sales.id, sale.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'revoked public invoice link',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });
      return { number: sale.number };
    });
  });
