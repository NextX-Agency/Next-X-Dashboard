import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { hashPublicToken } from '@/lib/public-token';
import { db } from '../db/client';
import { maybe, num, text } from './row';

/**
 * What a customer may see. Nothing here may carry cost, margin, commission,
 * seller, serials, internal notes or any database identifier beyond the
 * invoice's own number: the object is serialised straight into a page that
 * anyone holding the link can open. Add a field only after asking whether the
 * customer should read it.
 */
export type PublicInvoice = {
  number: string;
  invoiceNumber: string | null;
  status: 'confirmed';
  customerName: string | null;
  currency: 'USD' | 'SRD';
  fxRateMicros: number;
  totalCents: Cents;
  paidCents: Cents;
  discountCents: Cents;
  discountReason: string | null;
  paymentMethod: string;
  soldAt: string;
  dueAt: string | null;
  items: {
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPriceCents: Cents;
  }[];
};

/** Resolve only a live, confirmed invoice by its SHA-256 token hash. */
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  if (!isDatabaseConfigured() || !token || token.length < 32 || token.length > 128) return null;
  const hash = hashPublicToken(token);
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id::text, s.number, s.invoice_number, s.status::text,
           c.name AS customer_name, s.currency::text, s.fx_rate_micros::text,
           s.total_cents::text, s.discount_cents::text, s.discount_reason,
           s.payment_method::text, s.sold_at::text, s.due_at::text,
           (
             COALESCE((
               SELECT SUM(p.amount_cents) FROM sale_payments p
                WHERE p.sale_id = s.id AND p.status = 'confirmed'
             ), 0)
             + COALESCE((
               SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                 FROM ledger_entries l
                WHERE l.source_kind = 'sale' AND l.source_id = s.id AND l.category = 'sales_receipt'
             ), 0)
           )::text AS paid_cents
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.public_token_hash = ${hash}
       AND s.status = 'confirmed'
       AND (s.public_token_expires_at IS NULL OR s.public_token_expires_at > now())
     LIMIT 1
  `);
  if (!row) return null;

  const items = await db.execute<Record<string, string | null>>(sql`
    SELECT COALESCE(si.bundle_name, si.product_name_snapshot, p.name) AS product_name,
           si.id::text AS id,
           CASE WHEN si.bundle_id IS NOT NULL THEN 'Bundle'
                ELSE COALESCE(si.variant_name_snapshot, v.name) END AS variant_name,
           COALESCE(si.bundle_sku, si.sku_snapshot, v.sku) AS sku,
           si.quantity::text, si.unit_price_cents::text
      FROM sale_items si
      JOIN product_variants v ON v.id = si.variant_id
      JOIN products p ON p.id = v.product_id
     WHERE si.sale_id = ${row.id}
     ORDER BY si.position
  `);

  return {
    number: text(row.number),
    invoiceNumber: maybe(row.invoice_number),
    status: 'confirmed',
    customerName: maybe(row.customer_name),
    currency: text(row.currency, 'USD') as 'USD' | 'SRD',
    fxRateMicros: num(row.fx_rate_micros, 1_000_000),
    totalCents: num(row.total_cents),
    paidCents: num(row.paid_cents),
    discountCents: num(row.discount_cents),
    discountReason: maybe(row.discount_reason),
    paymentMethod: text(row.payment_method),
    soldAt: text(row.sold_at),
    dueAt: maybe(row.due_at),
    items: items.map((item) => ({
      id: text(item.id),
      productName: text(item.product_name),
      variantName: text(item.variant_name),
      sku: text(item.sku),
      quantity: num(item.quantity),
      unitPriceCents: num(item.unit_price_cents),
    })),
  };
}

export type InvoiceLinkState = {
  active: boolean;
  expiresAt: string | null;
  expired: boolean;
};

/** Staff-side: is there a shared link on this sale, and is it still live? */
export async function getInvoiceLinkState(saleId: string): Promise<InvoiceLinkState> {
  const [row] = await db.execute<{ has_link: boolean; expires_at: string | null }>(sql`
    SELECT (public_token_hash IS NOT NULL) AS has_link, public_token_expires_at::text AS expires_at
      FROM sales WHERE id = ${saleId}
  `);
  if (!row?.has_link) return { active: false, expiresAt: null, expired: false };
  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
  return { active: !expired, expiresAt: row.expires_at, expired };
}
