import { config as loadDotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ quiet: true });

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const reportPath = resolve(process.env.REHEARSAL_CONCURRENCY_REPORT ?? 'migration-reports/local-rehearsal-concurrency.json');
if (!databaseUrl) throw new Error('DIRECT_URL or DATABASE_URL is required for concurrency rehearsal');

type Check = { name: string; expected: unknown; actual: unknown; pass: boolean; details?: string };
const checks: Check[] = [];
const wait = (milliseconds: number) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

function check(name: string, expected: unknown, actual: unknown, details?: string): void {
  checks.push({ name, expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual), ...(details ? { details } : {}) });
}

function open(): postgres.Sql {
  return postgres(databaseUrl!, { prepare: false, max: 1, connect_timeout: 10 });
}

async function rollbackAndClose(db: postgres.Sql): Promise<void> {
  await db.end({ timeout: 5 });
}

async function main(): Promise<void> {
  const admin = open();
  let reservationId = randomUUID();
  let paymentId = randomUUID();
  let transferId = randomUUID();
  let targetOrderId = '';
  try {
    const [target] = await admin.unsafe(
      `SELECT s.id AS sale_id, s.workflow_status::text AS workflow_status, s.currency::text AS currency,
              si.id AS sale_item_id, v.id AS variant_id, l.id AS location_id,
              w.id AS wallet_id, w2.id AS wallet_2_id
       FROM public.sales s
       JOIN public.sale_items si ON si.sale_id = s.id
       JOIN public.product_variants v ON v.id = si.variant_id
       JOIN public.locations l ON l.slug = 'watch-counter'
       CROSS JOIN LATERAL (SELECT id FROM public.wallets WHERE currency = 'SRD' ORDER BY id LIMIT 1) w
       CROSS JOIN LATERAL (SELECT id FROM public.wallets WHERE currency = 'SRD' ORDER BY id OFFSET 1 LIMIT 1) w2
       WHERE v.sku = 'WATCH-001'
       ORDER BY s.created_at LIMIT 1`,
    );
    if (!target) throw new Error('Concurrency fixture rows are missing');
    targetOrderId = String(target.sale_id);
    const variantId = String(target.variant_id);
    const locationId = String(target.location_id);
    const saleItemId = String(target.sale_item_id);
    const currency = String(target.currency);

    // This follows confirmOrder's actual lock → availability → insert protocol.
    const a = open();
    const b = open();
    let bRejected = false;
    let bWaitedForLock = false;
    try {
      await a.unsafe('BEGIN');
      await a.unsafe(`SELECT id FROM public.product_variants WHERE id = $1::uuid FOR UPDATE`, [variantId]);
      const aAvailability = await a.unsafe(
        `SELECT COALESCE(sum(m.quantity), 0)::int - COALESCE((SELECT sum(quantity) FROM public.inventory_reservations WHERE variant_id = $1::uuid AND location_id = $2::uuid AND status = 'active'), 0)::int AS available
         FROM public.inventory_movements m WHERE m.variant_id = $1::uuid AND m.location_id = $2::uuid`,
        [variantId, locationId],
      );
      check('reservation race initial availability', 5, Number(aAvailability[0]?.available ?? 0));
      await a.unsafe(
        `INSERT INTO public.inventory_reservations (id, order_id, order_item_id, variant_id, location_id, quantity, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 5, 'active')`,
        [reservationId, targetOrderId, saleItemId, variantId, locationId],
      );

      const started = Date.now();
      const bResult = (async () => {
        await b.unsafe('BEGIN');
        await b.unsafe(`SELECT id FROM public.product_variants WHERE id = $1::uuid FOR UPDATE`, [variantId]);
        bWaitedForLock = Date.now() - started >= 50;
        const availability = await b.unsafe(
          `SELECT COALESCE(sum(m.quantity), 0)::int - COALESCE((SELECT sum(quantity) FROM public.inventory_reservations WHERE variant_id = $1::uuid AND location_id = $2::uuid AND status = 'active'), 0)::int AS available
           FROM public.inventory_movements m WHERE m.variant_id = $1::uuid AND m.location_id = $2::uuid`,
          [variantId, locationId],
        );
        if (Number(availability[0]?.available ?? 0) < 1) {
          bRejected = true;
          await b.unsafe('ROLLBACK');
          return;
        }
        await b.unsafe('ROLLBACK');
      })();
      await wait(100);
      await a.unsafe('COMMIT');
      await bResult;
      check('reservation race serializes on variant lock', true, bWaitedForLock);
      check('reservation race rejects second last-unit claim', true, bRejected);
    } finally {
      await rollbackAndClose(a);
      await rollbackAndClose(b);
      await admin.unsafe(`DELETE FROM public.inventory_reservations WHERE id = $1::uuid`, [reservationId]);
    }

    // A retry with the same client key must result in one payment row.
    const paymentA = open();
    const paymentB = open();
    let paymentRejected = false;
    try {
      const key = randomUUID();
      await paymentA.unsafe('BEGIN');
      await paymentA.unsafe(
        `INSERT INTO public.sale_payments (id, sale_id, amount_cents, currency, fx_rate_micros, method, idempotency_key)
         VALUES ($1::uuid, $2::uuid, 1, $3::currency_code, 1000000, 'cash', $4::uuid)`,
        [paymentId, targetOrderId, currency, key],
      );
      const secondInsert = (async () => {
        await paymentB.unsafe('BEGIN');
        try {
          await paymentB.unsafe(
            `INSERT INTO public.sale_payments (id, sale_id, amount_cents, currency, fx_rate_micros, method, idempotency_key)
             VALUES ($1::uuid, $2::uuid, 1, $3::currency_code, 1000000, 'cash', $4::uuid)`,
            [randomUUID(), targetOrderId, currency, key],
          );
        } catch {
          paymentRejected = true;
        } finally {
          await paymentB.unsafe('ROLLBACK');
        }
      })();
      await wait(100);
      await paymentA.unsafe('COMMIT');
      await secondInsert;
      check('payment idempotency rejects concurrent duplicate', true, paymentRejected);
      const paymentCount = await admin.unsafe(`SELECT count(*)::int AS count FROM public.sale_payments WHERE id = $1::uuid`, [paymentId]);
      check('payment idempotency leaves one payment row', 1, Number(paymentCount[0]?.count ?? 0));
    } finally {
      await rollbackAndClose(paymentA);
      await rollbackAndClose(paymentB);
      await admin.unsafe(`DELETE FROM public.sale_payments WHERE id = $1::uuid`, [paymentId]);
    }

    // Transfers use the same unique-key guarantee; the application action is
    // not present in this chain, so this tests the durable database contract.
    const transferA = open();
    const transferB = open();
    let transferRejected = false;
    try {
      const key = `rehearsal-${randomUUID()}`;
      await transferA.unsafe('BEGIN');
      await transferA.unsafe(
        `INSERT INTO public.wallet_transfers (id, source_wallet_id, destination_wallet_id, amount_cents, currency, idempotency_key)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'SRD', $4)`,
        [transferId, String(target.wallet_id), String(target.wallet_2_id), key],
      );
      const secondInsert = (async () => {
        await transferB.unsafe('BEGIN');
        try {
          await transferB.unsafe(
            `INSERT INTO public.wallet_transfers (id, source_wallet_id, destination_wallet_id, amount_cents, currency, idempotency_key)
             VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'SRD', $4)`,
            [randomUUID(), String(target.wallet_id), String(target.wallet_2_id), key],
          );
        } catch {
          transferRejected = true;
        } finally {
          await transferB.unsafe('ROLLBACK');
        }
      })();
      await wait(100);
      await transferA.unsafe('COMMIT');
      await secondInsert;
      check('transfer idempotency rejects concurrent duplicate', true, transferRejected);
      const transferCount = await admin.unsafe(`SELECT count(*)::int AS count FROM public.wallet_transfers WHERE id = $1::uuid`, [transferId]);
      check('transfer idempotency leaves one transfer row', 1, Number(transferCount[0]?.count ?? 0));
    } finally {
      await rollbackAndClose(transferA);
      await rollbackAndClose(transferB);
      await admin.unsafe(`DELETE FROM public.wallet_transfers WHERE id = $1::uuid`, [transferId]);
    }

    // The completion action locks the order before checking the state. Two
    // callers therefore cannot both cross the confirmed -> completed edge.
    await admin.unsafe(`UPDATE public.sales SET workflow_status = 'confirmed' WHERE id = $1::uuid`, [targetOrderId]);
    const completionA = open();
    const completionB = open();
    let secondCompletionRejected = false;
    try {
      await completionA.unsafe('BEGIN');
      const [locked] = await completionA.unsafe(`SELECT workflow_status::text AS workflow_status FROM public.sales WHERE id = $1::uuid FOR UPDATE`, [targetOrderId]);
      check('completion race starts confirmed', 'confirmed', String(locked?.workflow_status));
      await completionA.unsafe(`UPDATE public.sales SET workflow_status = 'completed' WHERE id = $1::uuid`, [targetOrderId]);
      const secondCompletion = (async () => {
        await completionB.unsafe('BEGIN');
        const [row] = await completionB.unsafe(`SELECT workflow_status::text AS workflow_status FROM public.sales WHERE id = $1::uuid FOR UPDATE`, [targetOrderId]);
        if (String(row?.workflow_status) !== 'confirmed' && String(row?.workflow_status) !== 'ready') {
          secondCompletionRejected = true;
          await completionB.unsafe('ROLLBACK');
          return;
        }
        await completionB.unsafe('ROLLBACK');
      })();
      await wait(100);
      await completionA.unsafe('COMMIT');
      await secondCompletion;
      check('completion race rejects second state transition', true, secondCompletionRejected);
    } finally {
      await rollbackAndClose(completionA);
      await rollbackAndClose(completionB);
      await admin.unsafe(`UPDATE public.sales SET workflow_status = 'completed' WHERE id = $1::uuid`, [targetOrderId]);
    }

    // A commission payout locks the wallet and the seller's open commission
    // rows before it creates the expense, payout record, ledger entry, and
    // paid state in one transaction. Two callers must not pay the same row.
    const commissionSellerId = randomUUID();
    const commissionId = randomUUID();
    const commissionDescription = `Concurrency commission payout ${randomUUID()}`;
    const payoutAId = randomUUID();
    const payoutBId = randomUUID();
    const payoutA = open();
    const payoutB = open();
    let secondPayoutRejected = false;
    let payoutBWaitedForLock = false;
    let payoutSeeded = false;
    try {
      const locationId = String(target.location_id);
      const saleFxRows = await admin.unsafe(`SELECT fx_rate_micros FROM public.sales WHERE id = $1::uuid`, [targetOrderId]);
      const saleFx = Number(saleFxRows[0]?.fx_rate_micros ?? 1_000_000);
      await admin.unsafe(
        `INSERT INTO public.sellers (id, name, location_id) VALUES ($1::uuid, $2, $3::uuid)`,
        [commissionSellerId, commissionDescription, locationId],
      );
      await admin.unsafe(
        `INSERT INTO public.commissions (id, seller_id, sale_id, location_id, group_key, basis_cents,
           amount_cents, amount_usd_cents, rate_bps, currency, fx_rate_micros)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 200, 100, 1, 500, $6::currency_code, $7::bigint)`,
        [commissionId, commissionSellerId, targetOrderId, locationId, `concurrency-${commissionId}`, currency, saleFx],
      );
      payoutSeeded = true;

      await payoutA.unsafe('BEGIN');
      await payoutA.unsafe(`SELECT id FROM public.wallets WHERE id = $1::uuid FOR UPDATE`, [String(target.wallet_id)]);
      const lockedA = await payoutA.unsafe(
        `SELECT id FROM public.commissions WHERE seller_id = $1::uuid AND status = 'open' ORDER BY id FOR UPDATE`,
        [commissionSellerId],
      );
      check('commission payout race begins with one open commission', 1, lockedA.length);
      await payoutA.unsafe(
        `INSERT INTO public.expenses (id, description, currency, fx_rate_micros, amount_cents,
           amount_usd_cents, payment_method, wallet_id, location_id)
         VALUES ($1::uuid, $2, 'SRD', 1000000, 100, 1, 'other', $3::uuid, $4::uuid)`,
        [payoutAId, commissionDescription, String(target.wallet_id), locationId],
      );
      const correlationId = randomUUID();
      const [createdPayout] = await payoutA.unsafe(
        `INSERT INTO public.commission_payouts (seller_id, wallet_id, expense_id, amount_cents,
           amount_usd_cents, currency, fx_rate_micros, correlation_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 100, 1, 'SRD', 1000000, $4::uuid)
         RETURNING id`,
        [commissionSellerId, String(target.wallet_id), payoutAId, correlationId],
      );
      await payoutA.unsafe(
        `INSERT INTO public.ledger_entries (direction, category, description, currency, fx_rate_micros,
           amount_cents, amount_usd_cents, wallet_id, location_id, correlation_id, event_type,
           source_kind, source_id, payment_method)
         VALUES ('out', 'operating', $1, 'SRD', 1000000, 100, 1, $2::uuid, $3::uuid,
           $4::uuid, 'commission_payout', 'expense', $5::uuid, 'other')`,
        [commissionDescription, String(target.wallet_id), locationId, correlationId, payoutAId],
      );
      await payoutA.unsafe(
        `UPDATE public.commissions SET status = 'paid', paid_at = now(), payout_id = $2::uuid
         WHERE id = $1::uuid AND status = 'open'`,
        [commissionId, String(createdPayout?.id)],
      );

      const payoutStarted = Date.now();
      const secondPayout = (async () => {
        await payoutB.unsafe('BEGIN');
        await payoutB.unsafe(`SELECT id FROM public.wallets WHERE id = $1::uuid FOR UPDATE`, [String(target.wallet_id)]);
        payoutBWaitedForLock = Date.now() - payoutStarted >= 50;
        const lockedB = await payoutB.unsafe(
          `SELECT id FROM public.commissions WHERE seller_id = $1::uuid AND status = 'open' ORDER BY id FOR UPDATE`,
          [commissionSellerId],
        );
        if (lockedB.length === 0) {
          secondPayoutRejected = true;
          await payoutB.unsafe('ROLLBACK');
          return;
        }
        await payoutB.unsafe(
          `INSERT INTO public.expenses (id, description, currency, fx_rate_micros, amount_cents,
             amount_usd_cents, payment_method, wallet_id, location_id)
           VALUES ($1::uuid, $2, 'SRD', 1000000, 100, 1, 'other', $3::uuid, $4::uuid)`,
          [payoutBId, commissionDescription, String(target.wallet_id), locationId],
        );
        await payoutB.unsafe('ROLLBACK');
      })();
      await wait(100);
      await payoutA.unsafe('COMMIT');
      await secondPayout;

      check('commission payout race serializes on wallet lock', true, payoutBWaitedForLock);
      check('second payout finds no open commission after lock', true, secondPayoutRejected);
      const paidRows = await admin.unsafe(
        `SELECT status::text AS status, payout_id::text AS payout_id
           FROM public.commissions WHERE id = $1::uuid`, [commissionId],
      );
      check('commission payout race marks the commission paid once', {
        status: 'paid',
        payout_id: String(createdPayout?.id),
      }, {
        status: String(paidRows[0]?.status),
        payout_id: String(paidRows[0]?.payout_id),
      });
      const payoutCount = await admin.unsafe(`SELECT count(*)::int AS count FROM public.commission_payouts WHERE seller_id = $1::uuid`, [commissionSellerId]);
      const ledgerCount = await admin.unsafe(`SELECT count(*)::int AS count FROM public.ledger_entries WHERE source_id = $1::uuid AND event_type = 'commission_payout'`, [payoutAId]);
      check('commission payout race creates one payout', 1, Number(payoutCount[0]?.count ?? 0));
      check('commission payout race creates one ledger debit', 1, Number(ledgerCount[0]?.count ?? 0));
    } finally {
      await rollbackAndClose(payoutA);
      await rollbackAndClose(payoutB);
      if (payoutSeeded) {
        await admin.unsafe(`DELETE FROM public.commissions WHERE id = $1::uuid`, [commissionId]);
        await admin.unsafe(`DELETE FROM public.commission_payouts WHERE seller_id = $1::uuid`, [commissionSellerId]);
        await admin.unsafe(`DELETE FROM public.ledger_entries WHERE source_id = ANY($1::uuid[]) AND event_type = 'commission_payout'`, [[payoutAId, payoutBId]]);
        await admin.unsafe(`DELETE FROM public.expenses WHERE id = ANY($1::uuid[])`, [[payoutAId, payoutBId]]);
        await admin.unsafe(`DELETE FROM public.sellers WHERE id = $1::uuid`, [commissionSellerId]);
      }
    }

    const result = {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      database: 'nextly_migration_rehearsal',
      checks,
      status: checks.every((entry) => entry.pass) ? 'pass' : 'fail',
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Concurrency report: ${reportPath}`);
    console.log(`Checks: ${checks.filter((entry) => entry.pass).length}/${checks.length} passed`);
    if (result.status !== 'pass') {
      for (const entry of checks.filter((item) => !item.pass)) console.error(`FAIL ${entry.name}: expected ${JSON.stringify(entry.expected)} got ${JSON.stringify(entry.actual)}`);
      process.exitCode = 1;
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}

await main();
