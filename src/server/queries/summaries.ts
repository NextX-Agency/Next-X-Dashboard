import { sql } from 'drizzle-orm';
import { connection } from 'next/server';
import { businessDateInput } from '@/lib/business-date';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { num, text } from './row';

/**
 * The few figures each list page opens with: what a person wants to know before they start reading
 * rows. One small aggregate per page, always measured against the business day (Paramaribo), with
 * document dates read as UTC calendar days like everywhere else in the dashboard.
 */

type Row = Record<string, string | null>;

async function one(query: ReturnType<typeof sql>): Promise<Row> {
  const [row] = await db.execute<Row>(query);
  return row ?? {};
}

export type PeriodFigure = { count: number; cents: Cents };

export type SalesPulse = {
  today: PeriodFigure;
  week: PeriodFigure;
  month: PeriodFigure;
  /** Confirmed sales this month with no cost recorded, so margin on them is not real yet. */
  drafts: number;
};

const EMPTY: PeriodFigure = { count: 0, cents: 0 };

/** Confirmed revenue (USD) today, in the last 7 days and this calendar month. */
export async function getSalesPulse(): Promise<SalesPulse> {
  if (!isDatabaseConfigured()) return { today: EMPTY, week: EMPTY, month: EMPTY, drafts: 0 };
  // "Today" is request-time data: never prerendered (see next.config.ts on cacheComponents).
  await connection();
  const today = businessDateInput();
  const row = await one(sql`
    WITH s AS (
      SELECT (sold_at AT TIME ZONE 'UTC')::date AS day, total_usd_cents, status
        FROM sales
       WHERE (sold_at AT TIME ZONE 'UTC')::date >= date_trunc('month', ${today}::date) - interval '7 days'
          OR status = 'draft'
    )
    SELECT
      COUNT(*) FILTER (WHERE status = 'confirmed' AND day = ${today}::date)::text AS today_count,
      COALESCE(SUM(total_usd_cents) FILTER (WHERE status = 'confirmed' AND day = ${today}::date), 0)::text AS today_cents,
      COUNT(*) FILTER (WHERE status = 'confirmed' AND day > ${today}::date - 7 AND day <= ${today}::date)::text AS week_count,
      COALESCE(SUM(total_usd_cents) FILTER (WHERE status = 'confirmed' AND day > ${today}::date - 7 AND day <= ${today}::date), 0)::text AS week_cents,
      COUNT(*) FILTER (WHERE status = 'confirmed' AND day >= date_trunc('month', ${today}::date) AND day <= ${today}::date)::text AS month_count,
      COALESCE(SUM(total_usd_cents) FILTER (WHERE status = 'confirmed' AND day >= date_trunc('month', ${today}::date) AND day <= ${today}::date), 0)::text AS month_cents,
      COUNT(*) FILTER (WHERE status = 'draft')::text AS drafts
    FROM s
  `);
  return {
    today: { count: num(row.today_count), cents: num(row.today_cents) },
    week: { count: num(row.week_count), cents: num(row.week_cents) },
    month: { count: num(row.month_count), cents: num(row.month_cents) },
    drafts: num(row.drafts),
  };
}

export type StageCount<T extends string> = { stage: T; count: number; cents: Cents };

const ORDER_STAGES = ['draft', 'confirmed', 'ready', 'completed', 'cancelled'] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

/** How many customer orders sit at each step, and what they are worth (USD). */
export async function getOrderPipeline(): Promise<StageCount<OrderStage>[]> {
  if (!isDatabaseConfigured())
    return ORDER_STAGES.map((stage) => ({ stage, count: 0, cents: 0 }));
  const rows = await db.execute<Row>(sql`
    SELECT workflow_status::text AS stage, COUNT(*)::text AS count,
           COALESCE(SUM(total_usd_cents), 0)::text AS cents
      FROM sales
     WHERE number LIKE 'ORD-%'
     GROUP BY workflow_status
  `);
  return ORDER_STAGES.map((stage) => {
    const row = rows.find((candidate) => text(candidate.stage) === stage);
    return { stage, count: num(row?.count), cents: num(row?.cents) };
  });
}

const PURCHASE_STAGES = ['draft', 'ordered', 'shipped', 'received', 'cancelled'] as const;
export type PurchaseStage = (typeof PURCHASE_STAGES)[number];

export type PurchasePipeline = {
  stages: (StageCount<PurchaseStage> & { units: number })[];
  /** Ordered or shipped, expected date already passed. */
  overdue: number;
};

/** Purchase orders by step, with the units still on their way. Goods value is in each order's own currency, so it is not summed here. */
export async function getPurchasePipeline(): Promise<PurchasePipeline> {
  const empty = PURCHASE_STAGES.map((stage) => ({ stage, count: 0, cents: 0, units: 0 }));
  if (!isDatabaseConfigured()) return { stages: empty, overdue: 0 };
  // "Today" is request-time data: never prerendered (see next.config.ts on cacheComponents).
  await connection();
  const today = businessDateInput();
  const rows = await db.execute<Row>(sql`
    SELECT p.status::text AS stage, COUNT(*)::text AS count,
           COALESCE(SUM((SELECT SUM(i.quantity - i.quantity_received)
                           FROM purchase_order_items i WHERE i.purchase_order_id = p.id)), 0)::text AS units,
           COUNT(*) FILTER (
             WHERE p.status IN ('ordered', 'shipped')
               AND p.expected_at IS NOT NULL
               AND (p.expected_at AT TIME ZONE 'UTC')::date < ${today}::date
           )::text AS overdue
      FROM purchase_orders p
     GROUP BY p.status
  `);
  return {
    stages: PURCHASE_STAGES.map((stage) => {
      const row = rows.find((candidate) => text(candidate.stage) === stage);
      return { stage, count: num(row?.count), cents: 0, units: Math.max(0, num(row?.units)) };
    }),
    overdue: rows.reduce((sum, row) => sum + num(row.overdue), 0),
  };
}

export type ExpensePulse = {
  month: PeriodFigure;
  lastMonth: PeriodFigure;
  /** This month's spend by category, largest first. */
  categories: { name: string; cents: Cents }[];
  needsReview: number;
};

/** What was spent this month against last month, and on what. Voided expenses never count. */
export async function getExpensePulse(): Promise<ExpensePulse> {
  if (!isDatabaseConfigured())
    return { month: EMPTY, lastMonth: EMPTY, categories: [], needsReview: 0 };
  // "Today" is request-time data: never prerendered (see next.config.ts on cacheComponents).
  await connection();
  const today = businessDateInput();
  const [totals, categories] = await Promise.all([
    one(sql`
      WITH e AS (
        SELECT (occurred_at AT TIME ZONE 'UTC')::date AS day, amount_usd_cents, needs_review
          FROM expenses WHERE voided_at IS NULL
      )
      SELECT
        COUNT(*) FILTER (WHERE day >= date_trunc('month', ${today}::date))::text AS month_count,
        COALESCE(SUM(amount_usd_cents) FILTER (WHERE day >= date_trunc('month', ${today}::date)), 0)::text AS month_cents,
        COUNT(*) FILTER (WHERE day >= date_trunc('month', ${today}::date) - interval '1 month'
                           AND day < date_trunc('month', ${today}::date))::text AS last_count,
        COALESCE(SUM(amount_usd_cents) FILTER (WHERE day >= date_trunc('month', ${today}::date) - interval '1 month'
                           AND day < date_trunc('month', ${today}::date)), 0)::text AS last_cents,
        COUNT(*) FILTER (WHERE needs_review)::text AS needs_review
      FROM e
    `),
    db.execute<Row>(sql`
      SELECT COALESCE(c.name, 'Uncategorised') AS name, SUM(e.amount_usd_cents)::text AS cents
        FROM expenses e
        LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.voided_at IS NULL
         AND (e.occurred_at AT TIME ZONE 'UTC')::date >= date_trunc('month', ${today}::date)
       GROUP BY 1
       ORDER BY SUM(e.amount_usd_cents) DESC
       LIMIT 5
    `),
  ]);
  return {
    month: { count: num(totals.month_count), cents: num(totals.month_cents) },
    lastMonth: { count: num(totals.last_count), cents: num(totals.last_cents) },
    categories: categories.map((row) => ({ name: text(row.name), cents: num(row.cents) })),
    needsReview: num(totals.needs_review),
  };
}

export type LedgerPulse = {
  inCents: Cents;
  outCents: Cents;
  balanceCents: Cents;
  entries: number;
};

/** Money in and out this calendar month (USD), and the balance the ledger closes on. */
export async function getLedgerPulse(): Promise<LedgerPulse> {
  if (!isDatabaseConfigured()) return { inCents: 0, outCents: 0, balanceCents: 0, entries: 0 };
  // "Today" is request-time data: never prerendered (see next.config.ts on cacheComponents).
  await connection();
  const today = businessDateInput();
  const row = await one(sql`
    SELECT
      COALESCE(SUM(net_usd_cents) FILTER (
        WHERE net_usd_cents > 0 AND (occurred_at AT TIME ZONE 'UTC')::date >= date_trunc('month', ${today}::date)), 0)::text AS in_cents,
      COALESCE(-SUM(net_usd_cents) FILTER (
        WHERE net_usd_cents < 0 AND (occurred_at AT TIME ZONE 'UTC')::date >= date_trunc('month', ${today}::date)), 0)::text AS out_cents,
      COUNT(*) FILTER (
        WHERE (occurred_at AT TIME ZONE 'UTC')::date >= date_trunc('month', ${today}::date))::text AS entries,
      COALESCE(SUM(net_usd_cents), 0)::text AS balance_cents
    FROM v_cash_ledger
  `);
  return {
    inCents: num(row.in_cents),
    outCents: num(row.out_cents),
    balanceCents: num(row.balance_cents),
    entries: num(row.entries),
  };
}
