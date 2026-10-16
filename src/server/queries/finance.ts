import { asc, desc, sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents, CurrencyCode } from '@/lib/money';
import { db } from '../db/client';
import {
  expenseCategories,
  financeObligations,
  recurringExpenses,
  wallets,
} from '../db/schema';
import { maybe, num, text } from './row';

export type WalletRow = {
  id: string;
  name: string;
  kind: string;
  currency: CurrencyCode;
  locationId: string | null;
  active: boolean;
  balanceCents: Cents;
  entryCount: number;
};

export async function listWallets(): Promise<WalletRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT wallet_id, name, kind, currency::text, location_id,
           active::text, balance_cents::text, entry_count::text
      FROM v_wallet_balances
     ORDER BY active DESC, currency, name
  `);
  return rows.map((row) => ({
    id: text(row.wallet_id),
    name: text(row.name),
    kind: text(row.kind),
    currency: text(row.currency, 'USD') as CurrencyCode,
    locationId: maybe(row.location_id),
    active: text(row.active) === 'true',
    balanceCents: num(row.balance_cents),
    entryCount: num(row.entry_count),
  }));
}

export type FinanceObligationRow = {
  id: string;
  direction: 'receivable' | 'payable';
  counterpartyName: string;
  currency: CurrencyCode;
  originalAmountCents: Cents;
  paidAmountCents: Cents;
  outstandingCents: Cents;
  status: 'open' | 'partial' | 'paid' | 'cancelled';
  dueDate: string | null;
  issuedAt: string;
  notes: string | null;
};

export async function listFinanceObligations(): Promise<FinanceObligationRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db
    .select({
      id: financeObligations.id,
      direction: financeObligations.direction,
      counterpartyName: financeObligations.counterpartyName,
      currency: financeObligations.currency,
      originalAmountCents: financeObligations.originalAmountCents,
      paidAmountCents: financeObligations.paidAmountCents,
      status: financeObligations.status,
      dueDate: financeObligations.dueDate,
      issuedAt: financeObligations.issuedAt,
      notes: financeObligations.notes,
    })
    .from(financeObligations)
    .orderBy(desc(financeObligations.issuedAt), asc(financeObligations.counterpartyName))
    .limit(500);
  return rows.map((row) => ({
    id: row.id,
    direction: row.direction as FinanceObligationRow['direction'],
    counterpartyName: row.counterpartyName,
    currency: row.currency,
    originalAmountCents: row.originalAmountCents,
    paidAmountCents: row.paidAmountCents,
    outstandingCents: Math.max(0, row.originalAmountCents - row.paidAmountCents),
    status: row.status as FinanceObligationRow['status'],
    dueDate: row.dueDate,
    issuedAt: row.issuedAt.toISOString(),
    notes: row.notes,
  }));
}

export async function listRecurringExpenses() {
  if (!isDatabaseConfigured()) return [];
  return db
    .select({
      id: recurringExpenses.id,
      name: recurringExpenses.name,
      vendorName: recurringExpenses.vendorName,
      amountCents: recurringExpenses.amountCents,
      currency: recurringExpenses.currency,
      cadence: recurringExpenses.cadence,
      anchorDay: recurringExpenses.anchorDay,
      walletId: recurringExpenses.walletId,
      walletName: wallets.name,
      categoryId: recurringExpenses.categoryId,
      categoryName: expenseCategories.name,
      locationId: recurringExpenses.locationId,
      nextRunOn: recurringExpenses.nextRunOn,
      lastPostedAt: recurringExpenses.lastPostedAt,
      lastAttemptAt: recurringExpenses.lastAttemptAt,
      lastError: recurringExpenses.lastError,
      isActive: recurringExpenses.isActive,
      autoPost: recurringExpenses.autoPost,
      amountIsEstimated: recurringExpenses.amountIsEstimated,
      anchorDayIsEstimated: recurringExpenses.anchorDayIsEstimated,
    })
    .from(recurringExpenses)
    .leftJoin(wallets, sql`${wallets.id} = ${recurringExpenses.walletId}`)
    .leftJoin(expenseCategories, sql`${expenseCategories.id} = ${recurringExpenses.categoryId}`)
    .orderBy(
      desc(recurringExpenses.isActive),
      asc(recurringExpenses.nextRunOn),
      asc(recurringExpenses.name),
    );
}

export type ReconciliationRow = {
  id: string;
  walletId: string;
  walletName: string;
  currency: CurrencyCode;
  periodEnd: string;
  statementBalanceCents: Cents;
  ledgerBalanceCents: Cents;
  differenceCents: Cents;
  status: 'open' | 'completed';
  notes: string | null;
};

export async function listReconciliations(): Promise<ReconciliationRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT r.id, r.wallet_id, w.name AS wallet_name, w.currency::text,
           r.period_end::text, r.statement_balance_cents::text,
           COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                       FROM ledger_entries l WHERE l.wallet_id = r.wallet_id
                         AND l.occurred_at <= r.period_end), 0)::text AS ledger_balance_cents,
           r.status, r.notes
      FROM reconciliations r
      JOIN wallets w ON w.id = r.wallet_id
     ORDER BY r.period_end DESC, r.created_at DESC
     LIMIT 100
  `);
  return rows.map((row) => {
    const statement = num(row.statement_balance_cents);
    const ledger = num(row.ledger_balance_cents);
    return {
      id: text(row.id),
      walletId: text(row.wallet_id),
      walletName: text(row.wallet_name),
      currency: text(row.currency, 'USD') as CurrencyCode,
      periodEnd: text(row.period_end),
      statementBalanceCents: statement,
      ledgerBalanceCents: ledger,
      differenceCents: statement - ledger,
      status: text(row.status, 'open') as 'open' | 'completed',
      notes: maybe(row.notes),
    };
  });
}

export type FinanceSummary = {
  usdBalanceCents: Cents;
  srdBalanceCents: Cents;
  openReconciliations: number;
  outstandingInvoices: number;
  outstandingUsdCents: Cents;
};

export async function getFinanceSummary(): Promise<FinanceSummary> {
  if (!isDatabaseConfigured()) {
    return {
      usdBalanceCents: 0,
      srdBalanceCents: 0,
      openReconciliations: 0,
      outstandingInvoices: 0,
      outstandingUsdCents: 0,
    };
  }
  const [row] = await db.execute<Record<string, string | null>>(sql`
    WITH paid AS (
      SELECT s.id,
             GREATEST(
               COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_usd_cents ELSE -l.amount_usd_cents END)
                           FROM sale_payments sp JOIN ledger_entries l
                             ON l.source_kind = 'sale' AND l.source_id = sp.id
                          WHERE sp.sale_id = s.id), 0),
               COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_usd_cents ELSE -l.amount_usd_cents END)
                           FROM ledger_entries l
                          WHERE l.source_kind = 'sale'
                            AND l.source_id = s.id
                            AND l.category IN ('sales_receipt', 'refund')), 0)
             ) AS paid_usd
        FROM sales s WHERE s.status = 'confirmed'
    )
    SELECT
      COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                  FROM ledger_entries l WHERE l.currency = 'USD'), 0)::text AS usd_balance,
      COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                  FROM ledger_entries l WHERE l.currency = 'SRD'), 0)::text AS srd_balance,
      (SELECT COUNT(*) FROM reconciliations WHERE status = 'open')::text AS open_reconciliations,
      (SELECT COUNT(*) FROM paid WHERE paid_usd < (SELECT total_usd_cents FROM sales WHERE sales.id = paid.id))::text AS outstanding_invoices,
      COALESCE((SELECT SUM(GREATEST(s.total_usd_cents - paid.paid_usd, 0))
                  FROM paid JOIN sales s ON s.id = paid.id), 0)::text AS outstanding_usd
  `);
  return {
    usdBalanceCents: num(row?.usd_balance),
    srdBalanceCents: num(row?.srd_balance),
    openReconciliations: num(row?.open_reconciliations),
    outstandingInvoices: num(row?.outstanding_invoices),
    outstandingUsdCents: num(row?.outstanding_usd),
  };
}

export type InvoiceRow = {
  id: string;
  number: string;
  invoiceNumber: string | null;
  customerName: string | null;
  currency: CurrencyCode;
  totalCents: Cents;
  paidCents: Cents;
  outstandingCents: Cents;
  soldAt: string;
  dueAt: string | null;
  status: 'paid' | 'partial' | 'outstanding';
};

/** Invoices are a read model over canonical sales and append-only payments. */
export async function listInvoices(): Promise<InvoiceRow[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id, s.number, s.invoice_number, c.name AS customer_name,
           s.currency::text, s.total_cents::text, s.sold_at::text, s.due_at::text,
           GREATEST(
             COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                         FROM sale_payments sp JOIN ledger_entries l
                           ON l.source_kind = 'sale' AND l.source_id = sp.id
                        WHERE sp.sale_id = s.id AND sp.status = 'confirmed'), 0),
             COALESCE((SELECT SUM(CASE WHEN l.direction = 'in' THEN l.amount_cents ELSE -l.amount_cents END)
                         FROM ledger_entries l
                        WHERE l.source_kind = 'sale'
                          AND l.source_id = s.id
                          AND l.category IN ('sales_receipt', 'refund')), 0)
           )::text AS paid_cents
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.status = 'confirmed'
     ORDER BY s.sold_at DESC, s.number DESC
     LIMIT 200
  `);
  return rows.map((row) => {
    const total = num(row.total_cents);
    const paid = Math.min(total, num(row.paid_cents));
    const outstanding = Math.max(0, total - paid);
    return {
      id: text(row.id),
      number: text(row.number),
      invoiceNumber: maybe(row.invoice_number),
      customerName: maybe(row.customer_name),
      currency: text(row.currency, 'USD') as CurrencyCode,
      totalCents: total,
      paidCents: paid,
      outstandingCents: outstanding,
      soldAt: text(row.sold_at),
      dueAt: maybe(row.due_at),
      status: outstanding === 0 ? 'paid' : paid > 0 ? 'partial' : 'outstanding',
    };
  });
}
