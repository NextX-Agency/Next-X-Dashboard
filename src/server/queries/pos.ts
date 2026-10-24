import { sql } from 'drizzle-orm';
import { businessDateInput } from '@/lib/business-date';
import { isDatabaseConfigured } from '@/lib/env';
import type { CurrencyCode } from '@/lib/money';
import type { PosCustomer, Sellable } from '@/lib/pos/types';
import { optionLabel } from '@/lib/sale-picker';
import { db } from '../db/client';
import { listBundleOptions, listSaleVariantOptions } from './pickers';
import { maybe, num, text } from './row';

/**
 * Read models for the counter screen (/pos). Every one is live (never cached): they carry stock,
 * prices and takings, and a counter that shows yesterday's stock is worse than a slow one.
 *
 * Nothing here writes. Recording a sale, taking a payment and voiding go through the existing sale
 * actions; see `server/actions/pos.ts` for the one small wrapper this screen adds.
 */

/**
 * Everything sellable, flattened for the grid: active variants and active bundles.
 *
 * Built on the same two read models the full sale form uses (`listSaleVariantOptions`,
 * `listBundleOptions`), so a price or a stock figure cannot differ between the two screens. Only the
 * shape is slimmed: no per-location stock, no storefront copy.
 */
export async function getPosCatalog(): Promise<Sellable[]> {
  if (!isDatabaseConfigured()) return [];
  const [variants, bundles] = await Promise.all([
    listSaleVariantOptions(),
    listBundleOptions(),
  ]);

  const sellables: Sellable[] = [];
  const byVariant = new Map<string, Sellable>();
  for (const variant of variants) {
    if (!variant.isActive) continue;
    const sellable: Sellable = {
      key: `v:${variant.id}`,
      kind: 'variant',
      variantId: variant.id,
      bundleId: null,
      productId: variant.productId || variant.id,
      name: variant.productName,
      option: optionLabel(variant),
      sku: variant.sku,
      brand: variant.brandName,
      category: variant.categoryName,
      model: variant.modelNumber,
      attributes: Object.values(variant.attributes),
      listPriceCents: variant.listPriceCents,
      onHand: variant.onHand,
      reserved: variant.reserved,
      valueCents: variant.valueCents,
      referenceCostCents: variant.referenceCostCents,
      bundleCostCents: 0,
      image: variant.image,
      components: [],
    };
    sellables.push(sellable);
    byVariant.set(variant.id, sellable);
  }

  for (const bundle of bundles) {
    const first = bundle.components[0];
    if (!first) continue;
    sellables.push({
      key: `b:${bundle.id}`,
      kind: 'bundle',
      variantId: first.variantId,
      bundleId: bundle.id,
      productId: `b:${bundle.id}`,
      name: bundle.name,
      option: null,
      sku: bundle.sku,
      brand: null,
      category: 'Bundles',
      model: null,
      attributes: bundle.components.map((component) => component.productName),
      listPriceCents: bundle.priceCents,
      onHand: bundle.availability,
      reserved: 0,
      valueCents: 0,
      referenceCostCents: 0,
      bundleCostCents: bundle.landedCostCents,
      // The photograph of the first component: the same picture the sale picker would show for it.
      image: byVariant.get(first.variantId)?.image ?? null,
      components: bundle.components.map((component) => ({
        variantId: component.variantId,
        quantity: component.quantity,
        label: `${component.productName} · ${component.variantName}`,
      })),
    });
  }
  return sellables;
}

/** Customers with the phone the receipt goes to. Small shop, so the whole list is sent. */
export async function listPosCustomers(): Promise<PosCustomer[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(
    sql`SELECT id, name, code, phone FROM customers ORDER BY name`,
  );
  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    code: text(row.code),
    phone: maybe(row.phone),
  }));
}

/* ── Today ───────────────────────────────────────────────────────────────── */

export type PosTodayItem = {
  name: string;
  option: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type PosTodaySale = {
  id: string;
  number: string;
  status: 'confirmed' | 'void';
  currency: CurrencyCode;
  totalCents: number;
  discountCents: number;
  paidCents: number;
  /** When it was recorded, epoch milliseconds (the clock the undo window runs on). */
  createdAtMs: number;
  createdById: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: PosTodayItem[];
};

export type PosTodayWallet = {
  id: string;
  name: string;
  kind: string;
  currency: CurrencyCode;
  receivedCents: number;
  refundedCents: number;
  /** The ledger balance right now (what should be in the till or the account). */
  balanceCents: number;
};

export type PosToday = {
  /** The business date (Paramaribo) this describes, YYYY-MM-DD. */
  date: string;
  generatedAtMs: number;
  salesCount: number;
  voidedCount: number;
  units: number;
  revenue: { currency: CurrencyCode; totalCents: number; count: number }[];
  /** Money still owed on today's sales, by currency. */
  owed: { currency: CurrencyCode; cents: number }[];
  wallets: PosTodayWallet[];
  topItems: { name: string; quantity: number; revenueUsdCents: number }[];
  recent: PosTodaySale[];
};

const asCurrency = (value: string | null | undefined): CurrencyCode =>
  value === 'SRD' ? 'SRD' : 'USD';

/**
 * Today at the counter.
 *
 * "Today" is the Paramaribo calendar day (`lib/business-date.ts`). A sale belongs to the day it is
 * dated: sale dates are stored as UTC midnight of their calendar day, so the day is read with
 * `AT TIME ZONE 'UTC'`, the same way the rest of the dashboard reads it. Money received is different:
 * it is what actually changed hands at the counter today, so payments and refunds are counted by the
 * moment they were recorded, in Paramaribo time. That is what the person counting the till needs,
 * and it includes a deposit taken today on an older sale.
 */
export async function getPosToday(now: Date = new Date()): Promise<PosToday> {
  const date = businessDateInput(now);
  const empty: PosToday = {
    date,
    generatedAtMs: now.getTime(),
    salesCount: 0,
    voidedCount: 0,
    units: 0,
    revenue: [],
    owed: [],
    wallets: [],
    topItems: [],
    recent: [],
  };
  if (!isDatabaseConfigured()) return empty;

  const [totals, owed, units, wallets, top, recent] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT currency::text AS currency, status::text AS status,
             COUNT(*)::text AS n, COALESCE(SUM(total_cents), 0)::text AS total
        FROM sales
       WHERE (sold_at AT TIME ZONE 'UTC')::date = ${date}::date
         AND status IN ('confirmed', 'void')
       GROUP BY 1, 2
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT s.currency::text AS currency,
             COALESCE(SUM(GREATEST(s.total_cents - COALESCE(p.paid, 0), 0)), 0)::text AS owed
        FROM sales s
        LEFT JOIN LATERAL (
          SELECT SUM(amount_cents) AS paid FROM sale_payments
           WHERE sale_id = s.id AND status = 'confirmed'
        ) p ON true
       WHERE (s.sold_at AT TIME ZONE 'UTC')::date = ${date}::date AND s.status = 'confirmed'
       GROUP BY 1
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT COALESCE(SUM(i.quantity - i.quantity_returned), 0)::text AS units
        FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE (s.sold_at AT TIME ZONE 'UTC')::date = ${date}::date AND s.status = 'confirmed'
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT w.id, w.name, w.kind, w.currency::text AS currency,
             COALESCE(b.balance_cents, 0)::text AS balance,
             COALESCE((
               SELECT SUM(p.amount_cents) FROM sale_payments p
                WHERE p.wallet_id = w.id AND p.status = 'confirmed'
                  AND (p.created_at AT TIME ZONE 'America/Paramaribo')::date = ${date}::date
             ), 0)::text AS received,
             COALESCE((
               SELECT SUM(r.amount_cents) FROM sale_refunds r
                WHERE r.wallet_id = w.id
                  AND (r.created_at AT TIME ZONE 'America/Paramaribo')::date = ${date}::date
             ), 0)::text AS refunded
        FROM wallets w
        LEFT JOIN v_wallet_balances b ON b.wallet_id = w.id
       WHERE w.active = true
       ORDER BY w.currency, w.created_at
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT COALESCE(i.bundle_name, i.product_name_snapshot, 'Item') AS name,
             SUM(i.quantity - i.quantity_returned)::text AS qty,
             SUM(i.line_total_usd_cents)::text AS revenue
        FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE (s.sold_at AT TIME ZONE 'UTC')::date = ${date}::date AND s.status = 'confirmed'
       GROUP BY 1
      HAVING SUM(i.quantity - i.quantity_returned) > 0
       ORDER BY SUM(i.quantity - i.quantity_returned) DESC, SUM(i.line_total_usd_cents) DESC
       LIMIT 5
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT s.id, s.number, s.status::text AS status, s.currency::text AS currency,
             s.total_cents::text AS total, s.discount_cents::text AS discount,
             (extract(epoch from s.created_at) * 1000)::bigint::text AS created_ms,
             s.created_by_id::text AS created_by_id,
             c.name AS customer_name, c.phone AS customer_phone,
             COALESCE((
               SELECT SUM(p.amount_cents) FROM sale_payments p
                WHERE p.sale_id = s.id AND p.status = 'confirmed'
             ), 0)::text AS paid
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
       WHERE (s.sold_at AT TIME ZONE 'UTC')::date = ${date}::date
         AND s.status IN ('confirmed', 'void')
       ORDER BY s.created_at DESC
       LIMIT 30
    `),
  ]);

  const revenueByCurrency = new Map<CurrencyCode, { totalCents: number; count: number }>();
  let salesCount = 0;
  let voidedCount = 0;
  for (const row of totals) {
    const count = num(row.n);
    if (row.status === 'void') {
      voidedCount += count;
      continue;
    }
    salesCount += count;
    const currency = asCurrency(row.currency);
    const current = revenueByCurrency.get(currency) ?? { totalCents: 0, count: 0 };
    revenueByCurrency.set(currency, {
      totalCents: current.totalCents + num(row.total),
      count: current.count + count,
    });
  }

  const ids = recent.map((row) => text(row.id));
  const itemRows =
    ids.length === 0
      ? []
      : await db.execute<Record<string, string | null>>(sql`
          SELECT sale_id::text AS sale_id,
                 COALESCE(bundle_name, product_name_snapshot, 'Item') AS name,
                 CASE WHEN bundle_name IS NULL THEN variant_name_snapshot END AS option,
                 quantity::text AS quantity, unit_price_cents::text AS unit,
                 line_total_cents::text AS line
            FROM sale_items
           WHERE sale_id IN (${sql.join(
             ids.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})
           ORDER BY sale_id, position
        `);
  const itemsBySale = new Map<string, PosTodayItem[]>();
  for (const row of itemRows) {
    const list = itemsBySale.get(text(row.sale_id)) ?? [];
    const option = maybe(row.option);
    list.push({
      name: text(row.name, 'Item'),
      option:
        option && !/^(default|standaard|standard|std)$/i.test(option.trim()) ? option : null,
      quantity: num(row.quantity),
      unitPriceCents: num(row.unit),
      lineTotalCents: num(row.line),
    });
    itemsBySale.set(text(row.sale_id), list);
  }

  return {
    date,
    generatedAtMs: now.getTime(),
    salesCount,
    voidedCount,
    units: num(units[0]?.units),
    revenue: [...revenueByCurrency.entries()]
      .map(([currency, value]) => ({ currency, ...value }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    owed: owed
      .map((row) => ({ currency: asCurrency(row.currency), cents: num(row.owed) }))
      .filter((row) => row.cents > 0),
    wallets: wallets.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      kind: text(row.kind, 'cash'),
      currency: asCurrency(row.currency),
      receivedCents: num(row.received),
      refundedCents: num(row.refunded),
      balanceCents: num(row.balance),
    })),
    topItems: top.map((row) => ({
      name: text(row.name, 'Item'),
      quantity: num(row.qty),
      revenueUsdCents: num(row.revenue),
    })),
    recent: recent.map((row) => ({
      id: text(row.id),
      number: text(row.number),
      status: row.status === 'void' ? 'void' : 'confirmed',
      currency: asCurrency(row.currency),
      totalCents: num(row.total),
      discountCents: num(row.discount),
      paidCents: num(row.paid),
      createdAtMs: num(row.created_ms),
      createdById: maybe(row.created_by_id),
      customerName: maybe(row.customer_name),
      customerPhone: maybe(row.customer_phone),
      items: itemsBySale.get(text(row.id)) ?? [],
    })),
  };
}

/** The shop name printed on the receipt. */
export async function getReceiptIdentity(): Promise<{ businessName: string }> {
  if (!isDatabaseConfigured()) return { businessName: 'NextX' };
  const [row] = await db.execute<Record<string, string | null>>(
    sql`SELECT business_name FROM settings LIMIT 1`,
  );
  return { businessName: text(row?.business_name, 'NextX') };
}
