import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents, CurrencyCode } from '@/lib/money';
import { db } from '../db/client';
import { maybe, num, text } from './row';

export type CommissionSellerRow = {
  id: string;
  name: string;
  locationId: string | null;
  locationName: string | null;
  defaultRateBps: number;
  active: boolean;
  openCount: number;
  openUsdCents: Cents;
  openSrdCents: Cents;
  categoryRates: { categoryId: string; categoryName: string; rateBps: number }[];
};

export type CommissionHistoryRow = {
  id: string;
  sellerName: string;
  saleNumber: string;
  categoryName: string | null;
  basisCents: Cents | null;
  basisIsEstimated: boolean;
  amountCents: Cents;
  currency: CurrencyCode;
  rateBps: number;
  status: 'open' | 'paid' | 'cancelled';
  paidAt: string | null;
  payoutId: string | null;
  createdAt: string;
};

export type CommissionLocationRow = {
  id: string;
  name: string;
  rateBps: number;
};

export async function getCommissionWorkspace(): Promise<{
  sellers: CommissionSellerRow[];
  history: CommissionHistoryRow[];
  categories: { id: string; name: string }[];
  locations: CommissionLocationRow[];
}> {
  if (!isDatabaseConfigured())
    return { sellers: [], history: [], categories: [], locations: [] };

  const [sellerRows, rateRows, commissionRows, categoryRows, locationRows] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT s.id, s.name, s.location_id, l.name AS location_name,
             s.default_rate_bps::text, s.active::text,
             COUNT(c.id) FILTER (WHERE c.status = 'open')::text AS open_count,
             COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'open' AND c.currency = 'USD'), 0)::text AS open_usd_cents,
             COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'open' AND c.currency = 'SRD'), 0)::text AS open_srd_cents
        FROM sellers s
        LEFT JOIN locations l ON l.id = s.location_id
        LEFT JOIN commissions c ON c.seller_id = s.id
       GROUP BY s.id, l.name
       ORDER BY s.active DESC, s.name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT r.seller_id, r.category_id, c.name AS category_name, r.rate_bps::text
        FROM seller_category_rates r
        JOIN categories c ON c.id = r.category_id
       ORDER BY c.position, c.name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT c.id, s.name AS seller_name, sale.number AS sale_number,
             category.name AS category_name, c.basis_cents::text, c.basis_is_estimated::text,
             c.amount_cents::text, c.currency::text, c.rate_bps::text,
             c.status::text, c.paid_at::text, c.payout_id, c.created_at::text
        FROM commissions c
        JOIN sellers s ON s.id = c.seller_id
        JOIN sales sale ON sale.id = c.sale_id
        LEFT JOIN categories category ON category.id = c.category_id
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT 300
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, name FROM categories ORDER BY position, name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT id, name, commission_rate_bps::text FROM locations WHERE active ORDER BY name
    `),
  ]);

  const ratesBySeller = new Map<string, CommissionSellerRow['categoryRates']>();
  for (const row of rateRows) {
    const sellerId = text(row.seller_id);
    ratesBySeller.set(sellerId, [
      ...(ratesBySeller.get(sellerId) ?? []),
      {
        categoryId: text(row.category_id),
        categoryName: text(row.category_name),
        rateBps: num(row.rate_bps),
      },
    ]);
  }

  return {
    sellers: sellerRows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      locationId: maybe(row.location_id),
      locationName: maybe(row.location_name),
      defaultRateBps: num(row.default_rate_bps),
      active: text(row.active) === 'true',
      openCount: num(row.open_count),
      openUsdCents: num(row.open_usd_cents),
      openSrdCents: num(row.open_srd_cents),
      categoryRates: ratesBySeller.get(text(row.id)) ?? [],
    })),
    history: commissionRows.map((row) => ({
      id: text(row.id),
      sellerName: text(row.seller_name),
      saleNumber: text(row.sale_number),
      categoryName: maybe(row.category_name),
      basisCents: row.basis_cents === null ? null : num(row.basis_cents),
      basisIsEstimated: text(row.basis_is_estimated) === 'true',
      amountCents: num(row.amount_cents),
      currency: text(row.currency, 'USD') as CurrencyCode,
      rateBps: num(row.rate_bps),
      status: text(row.status, 'open') as CommissionHistoryRow['status'],
      paidAt: maybe(row.paid_at),
      payoutId: maybe(row.payout_id),
      createdAt: text(row.created_at),
    })),
    categories: categoryRows.map((row) => ({ id: text(row.id), name: text(row.name) })),
    locations: locationRows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      rateBps: num(row.commission_rate_bps),
    })),
  };
}
