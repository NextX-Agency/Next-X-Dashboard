import { config as loadDotenv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

loadDotenv({ path: '.env.local', quiet: true });
loadDotenv({ quiet: true });

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const reportPath = resolve(process.env.REHEARSAL_RLS_REPORT ?? 'migration-reports/local-rehearsal-rls.json');
if (!databaseUrl) throw new Error('DIRECT_URL or DATABASE_URL is required for RLS rehearsal');

type Check = { name: string; expected: unknown; actual: unknown; pass: boolean; details?: string };
const checks: Check[] = [];

function check(name: string, expected: unknown, actual: unknown, details?: string): void {
  checks.push({ name, expected, actual, pass: stableJson(expected) === stableJson(actual), ...(details ? { details } : {}) });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

type TestRole = 'owner' | 'staff' | 'viewer-a' | 'viewer-b' | 'anon';

const identities = {
  owner: '10000000-0000-4000-8000-000000000001',
  staff: '10000000-0000-4000-8000-000000000002',
  'viewer-a': '10000000-0000-4000-8000-000000000003',
  'viewer-b': '10000000-0000-4000-8000-000000000004',
};

const roleName = (role: TestRole): 'authenticated' | 'anon' => role === 'anon' ? 'anon' : 'authenticated';

async function asRole(
  role: TestRole,
  action: (db: postgres.Sql) => Promise<void>,
): Promise<void> {
  const db = postgres(databaseUrl!, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    await db.unsafe('BEGIN');
    await db.unsafe(`SET LOCAL ROLE ${roleName(role)}`);
    await db.unsafe(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [role === 'anon' ? '' : identities[role]]);
    await action(db);
    await db.unsafe('ROLLBACK');
  } finally {
    await db.end({ timeout: 5 });
  }
}

async function count(db: postgres.Sql, table: string): Promise<number> {
  const rows = await db.unsafe(`SELECT count(*)::int AS count FROM public.${table}`);
  return Number(rows[0]?.count ?? 0);
}

async function expectsError(db: postgres.Sql, action: () => Promise<unknown>): Promise<string> {
  await db.unsafe('SAVEPOINT rls_expected_error');
  try {
    await action();
    await db.unsafe('RELEASE SAVEPOINT rls_expected_error');
    return 'no error';
  } catch (error) {
    await db.unsafe('ROLLBACK TO SAVEPOINT rls_expected_error');
    await db.unsafe('RELEASE SAVEPOINT rls_expected_error');
    return error instanceof Error ? error.message : String(error);
  }
}

async function commissionRls(): Promise<void> {
  const admin = postgres(databaseUrl!, { prepare: false, max: 1, connect_timeout: 10 });
  const suffix = randomUUID();
  const ids = {
    seller: randomUUID(),
    ownerSeller: randomUUID(),
    commission: randomUUID(),
    payoutExpenses: [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
  };
  let seeded = false;
  try {
    const references = await admin.unsafe(
      `SELECT
         (SELECT id FROM public.locations ORDER BY id LIMIT 1) AS location_id,
         (SELECT id FROM public.categories ORDER BY id LIMIT 1) AS category_id,
         (SELECT id FROM public.categories ORDER BY id OFFSET 1 LIMIT 1) AS second_category_id,
         (SELECT id FROM public.sales ORDER BY id LIMIT 1) AS sale_id,
         (SELECT currency::text FROM public.sales ORDER BY id LIMIT 1) AS sale_currency,
         (SELECT fx_rate_micros FROM public.sales ORDER BY id LIMIT 1) AS sale_fx,
         (SELECT id FROM public.wallets ORDER BY id LIMIT 1) AS wallet_id,
         (SELECT currency::text FROM public.wallets ORDER BY id LIMIT 1) AS wallet_currency`,
    );
    const ref = references[0];
    if (!ref?.location_id || !ref.category_id || !ref.second_category_id || !ref.sale_id || !ref.wallet_id) {
      throw new Error('Rehearsal needs a location, two categories, a sale, and a wallet for commission RLS checks');
    }

    seeded = true;
    await admin.unsafe(
      `INSERT INTO public.sellers (id, name, location_id, default_rate_bps)
       VALUES ($1::uuid, $2, $3::uuid, 500)`,
      [ids.seller, `RLS commission seller ${suffix}`, ref.location_id],
    );
    await admin.unsafe(
      `INSERT INTO public.seller_category_rates (seller_id, category_id, rate_bps)
       VALUES ($1::uuid, $2::uuid, 750)`,
      [ids.seller, ref.category_id],
    );
    await admin.unsafe(
      `INSERT INTO public.commissions (id, seller_id, sale_id, location_id, category_id, group_key,
         basis_cents, amount_cents, amount_usd_cents, rate_bps, currency, fx_rate_micros)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 1000, 50, 1, 500,
         $7::currency_code, $8::bigint)`,
      [ids.commission, ids.seller, ref.sale_id, ref.location_id, ref.category_id, `rls-baseline-${suffix}`, ref.sale_currency, ref.sale_fx],
    );
    for (const expenseId of ids.payoutExpenses) {
      await admin.unsafe(
        `INSERT INTO public.expenses (id, description, currency, fx_rate_micros, amount_cents, amount_usd_cents)
         VALUES ($1::uuid, $2, $3::currency_code, 1000000, 100, 1)`,
        [expenseId, `RLS commission payout fixture ${suffix}`, ref.wallet_currency],
      );
    }
    const policyRows = await admin.unsafe(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
              c.relforcerowsecurity AS rls_forced, count(p.polname)::int AS policy_count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
        GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity`,
      [['sellers', 'seller_category_rates', 'commissions', 'commission_payouts']],
    );
    const expectedPolicyCounts: Record<string, number> = {
      sellers: 4,
      seller_category_rates: 2,
      commissions: 2,
      commission_payouts: 2,
    };
    const actualPolicies = Object.fromEntries(policyRows.map((row) => [String(row.table_name), {
      enabled: Boolean(row.rls_enabled),
      forced: Boolean(row.rls_forced),
      policyCount: Number(row.policy_count),
    }]));
    const expectedPolicies = Object.fromEntries(Object.entries(expectedPolicyCounts).map(([table, policyCount]) => [table, {
      enabled: true,
      forced: true,
      policyCount,
    }]));
    check('commission tables have forced RLS and expected policies', expectedPolicies, actualPolicies);

    const payout = async (db: postgres.Sql, expenseId: string) => db.unsafe(
      `INSERT INTO public.commission_payouts (seller_id, wallet_id, expense_id, amount_cents,
         amount_usd_cents, currency, fx_rate_micros)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 100, 1, $4::currency_code, 1000000)
       RETURNING id`,
      [ids.seller, ref.wallet_id, expenseId, ref.wallet_currency],
    );
    const insertCommission = async (db: postgres.Sql, groupKey: string) => db.unsafe(
      `INSERT INTO public.commissions (seller_id, sale_id, location_id, category_id, group_key,
         basis_cents, amount_cents, amount_usd_cents, rate_bps, currency, fx_rate_micros)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 1000, 50, 1, 500,
         $6::currency_code, $7::bigint)
       RETURNING id`,
      [ids.seller, ref.sale_id, ref.location_id, ref.category_id, groupKey, ref.sale_currency, ref.sale_fx],
    );

    await asRole('owner', async (db) => {
      check('owner reads seller profiles', 1, await countById(db, 'sellers', ids.seller));
      const seller = await db.unsafe(
        `INSERT INTO public.sellers (id, name, location_id, default_rate_bps)
         VALUES ($1::uuid, $2, $3::uuid, 100) RETURNING id`,
        [ids.ownerSeller, `RLS owner seller ${suffix}`, ref.location_id],
      );
      check('owner creates seller profile', 1, seller.length);
      const rate = await db.unsafe(
        `INSERT INTO public.seller_category_rates (seller_id, category_id, rate_bps)
         VALUES ($1::uuid, $2::uuid, 600) RETURNING seller_id`,
        [ids.ownerSeller, ref.second_category_id],
      );
      check('owner creates category rate', 1, rate.length);
      check('owner inserts commission record', 1, (await insertCommission(db, `rls-owner-${suffix}`)).length);
      const updateRows = await db.unsafe(
        `UPDATE public.commissions SET status = 'paid' WHERE id = $1::uuid RETURNING id`, [ids.commission],
      );
      check('owner cannot update immutable commission status', 0, updateRows.length);
      check('owner records commission payout', 1, (await payout(db, ids.payoutExpenses[0]!)).length);
    });

    await asRole('staff', async (db) => {
      check('staff reads seller profiles', 1, await countById(db, 'sellers', ids.seller));
      const sellerError = await expectsError(db, () => db.unsafe(
        `INSERT INTO public.sellers (id, name) VALUES ($1::uuid, $2)`,
        [ids.ownerSeller, `RLS staff seller ${suffix}`],
      ));
      check('staff cannot create seller profiles', true, sellerError !== 'no error');
      const rateError = await expectsError(db, () => db.unsafe(
        `INSERT INTO public.seller_category_rates (seller_id, category_id, rate_bps)
         VALUES ($1::uuid, $2::uuid, 600)`,
        [ids.seller, ref.second_category_id],
      ));
      check('staff cannot create category rates', true, rateError !== 'no error');
      check('staff can append commission records', 1, (await insertCommission(db, `rls-staff-${suffix}`)).length);
      const updateRows = await db.unsafe(
        `UPDATE public.commissions SET status = 'paid' WHERE id = $1::uuid RETURNING id`, [ids.commission],
      );
      check('staff cannot update commission status', 0, updateRows.length);
      const payoutError = await expectsError(db, () => payout(db, ids.payoutExpenses[1]!));
      check('staff cannot record commission payouts', true, payoutError !== 'no error');
    });

    await asRole('viewer-a', async (db) => {
      check('viewer reads seller profiles', 1, await countById(db, 'sellers', ids.seller));
      const sellerError = await expectsError(db, () => db.unsafe(
        `INSERT INTO public.sellers (id, name) VALUES ($1::uuid, $2)`,
        [ids.ownerSeller, `RLS viewer seller ${suffix}`],
      ));
      check('viewer cannot create seller profiles', true, sellerError !== 'no error');
      const rateError = await expectsError(db, () => db.unsafe(
        `INSERT INTO public.seller_category_rates (seller_id, category_id, rate_bps)
         VALUES ($1::uuid, $2::uuid, 600)`,
        [ids.seller, ref.second_category_id],
      ));
      check('viewer cannot create category rates', true, rateError !== 'no error');
      const commissionError = await expectsError(db, () => insertCommission(db, `rls-viewer-${suffix}`));
      check('viewer cannot append commission records', true, commissionError !== 'no error');
      const payoutError = await expectsError(db, () => payout(db, ids.payoutExpenses[2]!));
      check('viewer cannot record commission payouts', true, payoutError !== 'no error');
    });

    await asRole('anon', async (db) => {
      check('anonymous cannot read sellers', 0, await countById(db, 'sellers', ids.seller));
      check('anonymous cannot read commissions', 0, await countById(db, 'commissions', ids.commission));
      const sellerError = await expectsError(db, () => db.unsafe(
        `INSERT INTO public.sellers (id, name) VALUES ($1::uuid, $2)`,
        [ids.ownerSeller, `RLS anonymous seller ${suffix}`],
      ));
      check('anonymous cannot create seller profiles', true, sellerError !== 'no error');
      const rateError = await expectsError(db, () => db.unsafe(
        `INSERT INTO public.seller_category_rates (seller_id, category_id, rate_bps)
         VALUES ($1::uuid, $2::uuid, 600)`,
        [ids.seller, ref.second_category_id],
      ));
      check('anonymous cannot create category rates', true, rateError !== 'no error');
      const commissionError = await expectsError(db, () => insertCommission(db, `rls-anon-${suffix}`));
      check('anonymous cannot append commission records', true, commissionError !== 'no error');
      const payoutError = await expectsError(db, () => payout(db, ids.payoutExpenses[3]!));
      check('anonymous cannot record commission payouts', true, payoutError !== 'no error');
    });
  } finally {
    if (seeded) {
      await admin.unsafe(`DELETE FROM public.commission_payouts WHERE seller_id = $1::uuid`, [ids.seller]);
      await admin.unsafe(`DELETE FROM public.commissions WHERE seller_id = $1::uuid`, [ids.seller]);
      await admin.unsafe(`DELETE FROM public.seller_category_rates WHERE seller_id = $1::uuid`, [ids.seller]);
      await admin.unsafe(`DELETE FROM public.expenses WHERE id = ANY($1::uuid[])`, [ids.payoutExpenses]);
      await admin.unsafe(`DELETE FROM public.sellers WHERE id = $1::uuid`, [ids.seller]);
    }
    await admin.end({ timeout: 5 });
  }
}

async function obligationRls(): Promise<void> {
  const admin = postgres(databaseUrl!, { prepare: false, max: 1, connect_timeout: 10 });
  const ids = { obligation: randomUUID(), payment: randomUUID(), wallet: '' };
  let seeded = false;
  try {
    const references = await admin.unsafe(
      `SELECT id, currency::text AS currency FROM public.wallets WHERE active ORDER BY id LIMIT 1`,
    );
    const wallet = references[0];
    if (!wallet) throw new Error('Rehearsal needs an active wallet for obligation RLS checks');
    ids.wallet = String(wallet.id);
    await admin.unsafe(
      `INSERT INTO public.finance_obligations (id, direction, counterparty_name, currency,
         original_amount_cents, paid_amount_cents, status)
       VALUES ($1::uuid, 'receivable', 'RLS obligation fixture', $2::currency_code, 1000, 0, 'open')`,
      [ids.obligation, wallet.currency],
    );
    seeded = true;
    await admin.unsafe(
      `INSERT INTO public.finance_obligation_payments (id, obligation_id, wallet_id, amount_cents,
         currency, payment_method, occurred_at, idempotency_key)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 100, $4::currency_code, 'cash', now(), $5)`,
      [ids.payment, ids.obligation, ids.wallet, wallet.currency, `rls-${randomUUID()}`],
    );
    const policyRows = await admin.unsafe(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
              c.relforcerowsecurity AS rls_forced, count(p.polname)::int AS policy_count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
        GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity`,
      [['finance_obligations', 'finance_obligation_payments', 'legacy_store_settings', 'legacy_catalog_price_archive', 'legacy_payout_run_archive', 'legacy_stock_transfer_archive', 'legacy_reservation_archive']],
    );
    const expected = {
      finance_obligations: { enabled: true, forced: true, policyCount: 1 },
      finance_obligation_payments: { enabled: true, forced: true, policyCount: 1 },
      legacy_store_settings: { enabled: true, forced: true, policyCount: 0 },
      legacy_catalog_price_archive: { enabled: true, forced: true, policyCount: 0 },
      legacy_payout_run_archive: { enabled: true, forced: true, policyCount: 0 },
      legacy_stock_transfer_archive: { enabled: true, forced: true, policyCount: 0 },
      legacy_reservation_archive: { enabled: true, forced: true, policyCount: 0 },
    };
    const actual = Object.fromEntries(policyRows.map((row) => [String(row.table_name), {
      enabled: Boolean(row.rls_enabled), forced: Boolean(row.rls_forced), policyCount: Number(row.policy_count),
    }]));
    check('finance obligations and legacy settings have forced RLS', expected, actual);
    const serviceRolePayoutArchivePrivilege = await admin.unsafe(
      `SELECT has_table_privilege('service_role', 'public.legacy_payout_run_archive', 'SELECT') AS can_select`,
    );
    check('service role cannot read archived legacy payout runs', false, Boolean(serviceRolePayoutArchivePrivilege[0]?.can_select));

    for (const role of ['owner', 'staff', 'viewer-a', 'viewer-b'] as const) {
      await asRole(role, async (db) => {
        check(`${role} can read obligation`, 1, await countById(db, 'finance_obligations', ids.obligation));
        check(`${role} can read obligation payment`, 1, await countById(db, 'finance_obligation_payments', ids.payment));
        const insertError = await expectsError(db, () => db.unsafe(
          `INSERT INTO public.finance_obligations (direction, counterparty_name, currency, original_amount_cents)
           VALUES ('payable', 'direct API write', $1::currency_code, 1000)`,
          [wallet.currency],
        ));
        check(`${role} cannot bypass settlement action to create obligations`, true, insertError !== 'no error');
        const updateError = await expectsError(db, () => db.unsafe(
          `UPDATE public.finance_obligations SET paid_amount_cents = 100 WHERE id = $1::uuid`,
          [ids.obligation],
        ));
        check(`${role} cannot mutate an obligation balance directly`, true, updateError !== 'no error');
        const paymentError = await expectsError(db, () => db.unsafe(
          `INSERT INTO public.finance_obligation_payments (obligation_id, wallet_id, amount_cents,
             currency, payment_method, occurred_at, idempotency_key)
           VALUES ($1::uuid, $2::uuid, 100, $3::currency_code, 'cash', now(), $4)`,
          [ids.obligation, ids.wallet, wallet.currency, `direct-${randomUUID()}`],
        ));
        check(`${role} cannot write an unpaired obligation payment`, true, paymentError !== 'no error');
        const settingsError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_store_settings'));
        check(`${role} cannot read archived legacy settings`, true, settingsError !== 'no error');
        const catalogArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_catalog_price_archive'));
        check(`${role} cannot read archived exact catalog prices`, true, catalogArchiveError !== 'no error');
        const stockTransferArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_stock_transfer_archive'));
        check(`${role} cannot read archived legacy stock transfers`, true, stockTransferArchiveError !== 'no error');
        const payoutRunArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_payout_run_archive'));
        check(`${role} cannot read archived legacy payout runs`, true, payoutRunArchiveError !== 'no error');
        const reservationArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_reservation_archive'));
        check(`${role} cannot read archived legacy reservations`, true, reservationArchiveError !== 'no error');
      });
    }

    await asRole('anon', async (db) => {
      const obligationError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.finance_obligations'));
      const paymentError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.finance_obligation_payments'));
      const settingsError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_store_settings'));
      const catalogArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_catalog_price_archive'));
      const stockTransferArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_stock_transfer_archive'));
      const payoutRunArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_payout_run_archive'));
      check('anonymous cannot read finance obligations', true, obligationError !== 'no error');
      check('anonymous cannot read obligation payments', true, paymentError !== 'no error');
      check('anonymous cannot read archived legacy settings', true, settingsError !== 'no error');
      check('anonymous cannot read archived exact catalog prices', true, catalogArchiveError !== 'no error');
      check('anonymous cannot read archived legacy stock transfers', true, stockTransferArchiveError !== 'no error');
      check('anonymous cannot read archived legacy payout runs', true, payoutRunArchiveError !== 'no error');
      const reservationArchiveError = await expectsError(db, () => db.unsafe('SELECT count(*) FROM public.legacy_reservation_archive'));
      check('anonymous cannot read archived legacy reservations', true, reservationArchiveError !== 'no error');
    });
  } finally {
    if (seeded) {
      await admin.unsafe('DELETE FROM public.finance_obligation_payments WHERE id = $1::uuid', [ids.payment]);
      await admin.unsafe('DELETE FROM public.finance_obligations WHERE id = $1::uuid', [ids.obligation]);
    }
    await admin.end({ timeout: 5 });
  }
}

async function countById(db: postgres.Sql, table: string, id: string): Promise<number> {
  const rows = await db.unsafe(`SELECT count(*)::int AS count FROM public.${table} WHERE id = $1::uuid`, [id]);
  return Number(rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const requiredRows = ['products', 'sales', 'ledger_entries', 'storefronts'];
  for (const role of ['owner', 'staff', 'viewer-a', 'viewer-b'] as const) {
    await asRole(role, async (db) => {
      for (const table of requiredRows) {
        check(`${role} can read ${table}`, true, (await count(db, table)) > 0);
      }
      check(`${role} can read stock view`, true, (await count(db, 'v_stock_levels')) > 0);
      check(`${role} cannot read integration credentials`, 0, await count(db, 'integration_credentials'));

      const testLocation = '20000000-0000-4000-8000-000000000001';
      const insertError = await expectsError(db, () => db.unsafe(
        `INSERT INTO public.locations (id, name, slug) VALUES ($1::uuid, 'RLS temporary location', 'rls-temporary-${role}')`,
        [testLocation],
      ));
      const canWrite = role === 'owner' || role === 'staff';
      check(`${role} location write policy`, canWrite, insertError === 'no error');

      if (canWrite) {
        const updateError = await expectsError(db, () => db.unsafe(
          `UPDATE public.locations SET name = 'RLS updated location' WHERE id = $1::uuid`,
          [testLocation],
        ));
        check(`${role} location update policy`, true, updateError === 'no error');
      }
    });
  }

  await commissionRls();
  await obligationRls();

  await asRole('anon', async (db) => {
    for (const table of ['products', 'sales', 'ledger_entries', 'storefronts', 'v_stock_levels']) {
      check(`anon sees no ${table}`, 0, await count(db, table));
    }
    const insertError = await expectsError(db, () => db.unsafe(
      `INSERT INTO public.locations (id, name, slug) VALUES ('20000000-0000-4000-8000-000000000002', 'anon', 'anon-temporary')`,
    ));
    check('anon cannot write locations', true, insertError !== 'no error');
  });

  await asRole('owner', async (db) => {
    const temporaryMember = '20000000-0000-4000-8000-000000000010';
    await db.unsafe(
      `INSERT INTO public.members (id, auth_user_id, email, full_name, role)
       VALUES ($1::uuid, '20000000-0000-4000-8000-000000000011', 'temporary.owner@example.invalid', 'Temporary owner test', 'viewer')`,
      [temporaryMember],
    );
    const deleteError = await expectsError(db, () => db.unsafe(`DELETE FROM public.members WHERE id = $1::uuid`, [temporaryMember]));
    check('owner can delete members', true, deleteError === 'no error');
  });

  await asRole('staff', async (db) => {
    const before = await db.unsafe(`SELECT count(*)::int AS count FROM public.members WHERE id = '00000000-0000-4000-8000-000000000003'`);
    await db.unsafe(`DELETE FROM public.members WHERE id = '00000000-0000-4000-8000-000000000003'`);
    const after = await db.unsafe(`SELECT count(*)::int AS count FROM public.members WHERE id = '00000000-0000-4000-8000-000000000003'`);
    check('staff cannot delete members', Number(before[0]?.count ?? 0), Number(after[0]?.count ?? 0), 'RLS may deny a delete by filtering it rather than raising an error');
  });

  const admin = postgres(databaseUrl!, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const rows = await admin.unsafe(
      `SELECT to_regclass('public.notifications') AS notifications`,
    );
    const notificationTable = Boolean(rows[0]?.notifications);
    check('notifications table exists', true, notificationTable);

    if (notificationTable) {
      const policyRows = await admin.unsafe(
        `SELECT c.relrowsecurity AS rls_enabled,
                c.relforcerowsecurity AS rls_forced,
                count(p.polname)::int AS policy_count
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_policy p ON p.polrelid = c.oid
          WHERE n.nspname = 'public' AND c.relname = 'notifications'
          GROUP BY c.relrowsecurity, c.relforcerowsecurity`,
      );
      check('notifications RLS is enabled and forced', { enabled: true, forced: true }, {
        enabled: Boolean(policyRows[0]?.rls_enabled),
        forced: Boolean(policyRows[0]?.rls_forced),
      });
      check('notifications have select/update policies', true, Number(policyRows[0]?.policy_count ?? 0) >= 2);

      const ids = {
        viewerAOne: '30000000-0000-4000-8000-000000000001',
        viewerATwo: '30000000-0000-4000-8000-000000000002',
        viewerAThree: '30000000-0000-4000-8000-000000000003',
        viewerBOne: '30000000-0000-4000-8000-000000000004',
        viewerBTwo: '30000000-0000-4000-8000-000000000005',
      };
      await admin.unsafe(`DELETE FROM public.notifications WHERE id = ANY($1::uuid[])`, [Object.values(ids)]);
      await admin.unsafe(
        `INSERT INTO public.notifications (id, member_id, type, title, message, metadata)
         VALUES
           ($1::uuid, '00000000-0000-4000-8000-000000000003', 'test', 'Viewer A one', 'A one', '{"orderId":"a-1"}'::jsonb),
           ($2::uuid, '00000000-0000-4000-8000-000000000003', 'test', 'Viewer A two', 'A two', '{}'::jsonb),
           ($3::uuid, '00000000-0000-4000-8000-000000000003', 'test', 'Viewer A three', 'A three', '{}'::jsonb),
           ($4::uuid, '00000000-0000-4000-8000-000000000004', 'test', 'Viewer B one', 'B one', '{}'::jsonb),
           ($5::uuid, '00000000-0000-4000-8000-000000000004', 'test', 'Viewer B two', 'B two', '{}'::jsonb)`,
        Object.values(ids),
      );

      await asRole('viewer-a', async (db) => {
        check('viewer A reads own notifications', 3, await countForMember(db, '00000000-0000-4000-8000-000000000003'));
        check('viewer A cannot read viewer B notifications', 0, await countForMember(db, '00000000-0000-4000-8000-000000000004'));
        check('viewer A unread count is exact', 3, await unreadCountForMember(db, '00000000-0000-4000-8000-000000000003'));
        const ownUpdate = await db.unsafe(
          `UPDATE public.notifications SET read_at = now() WHERE id = $1::uuid RETURNING id`,
          [ids.viewerAOne],
        );
        check('viewer A marks own notification read', 1, ownUpdate.length);
        const crossUpdate = await db.unsafe(
          `UPDATE public.notifications SET read_at = now() WHERE id = $1::uuid RETURNING id`,
          [ids.viewerBOne],
        );
        check('viewer A cannot mutate viewer B notification', 0, crossUpdate.length);
        const crossDeleteError = await expectsError(db, () => db.unsafe(
          `DELETE FROM public.notifications WHERE id = $1::uuid RETURNING id`,
          [ids.viewerBOne],
        ));
        check('viewer A cannot delete viewer B notification', true, crossDeleteError !== 'no error');
        const markAll = await db.unsafe(
          `UPDATE public.notifications SET read_at = now()
            WHERE member_id = '00000000-0000-4000-8000-000000000003' AND read_at IS NULL
            RETURNING id`,
        );
        check('viewer A markAll updates only own unread rows', 2, markAll.length);
        check('viewer A cannot observe viewer B unread rows', 0, await unreadCountForMember(db, '00000000-0000-4000-8000-000000000004'));
        const insertError = await expectsError(db, () => db.unsafe(
          `INSERT INTO public.notifications (member_id, type, title, message)
           VALUES ('00000000-0000-4000-8000-000000000004', 'test', 'forbidden', 'forbidden')`,
        ));
        check('viewer A cannot create arbitrary notifications', true, insertError !== 'no error');
      });

      await asRole('viewer-b', async (db) => {
        check('viewer B reads own notifications', 2, await countForMember(db, '00000000-0000-4000-8000-000000000004'));
        check('viewer B cannot read viewer A notifications', 0, await countForMember(db, '00000000-0000-4000-8000-000000000003'));
        check('viewer B unread count is exact', 2, await unreadCountForMember(db, '00000000-0000-4000-8000-000000000004'));
        const crossUpdate = await db.unsafe(
          `UPDATE public.notifications SET read_at = now() WHERE id = $1::uuid RETURNING id`,
          [ids.viewerAOne],
        );
        check('viewer B cannot mutate viewer A notification', 0, crossUpdate.length);
        const crossDeleteError = await expectsError(db, () => db.unsafe(
          `DELETE FROM public.notifications WHERE id = $1::uuid RETURNING id`,
          [ids.viewerAOne],
        ));
        check('viewer B cannot delete viewer A notification', true, crossDeleteError !== 'no error');
      });

      for (const role of ['staff', 'owner'] as const) {
        await asRole(role, async (db) => {
          check(`${role} reads no other member notifications`, 0, await count(db, 'notifications'));
        });
      }

      await asRole('anon', async (db) => {
        check('anonymous reads no notifications', 0, await count(db, 'notifications'));
        const updateError = await expectsError(db, () => db.unsafe(
          `UPDATE public.notifications SET read_at = now() WHERE id = $1::uuid RETURNING id`,
          [ids.viewerAOne],
        ));
        check('anonymous cannot mutate notifications', true, updateError !== 'no error');
      });

      const remaining = await admin.unsafe(
        `SELECT member_id::text AS member_id,
                count(*)::int AS total,
                count(*) FILTER (WHERE read_at IS NULL)::int AS unread
           FROM public.notifications
          WHERE id = ANY($1::uuid[])
          GROUP BY member_id
          ORDER BY member_id`,
        [Object.values(ids)],
      );
      check('notification rows remain isolated after attempts', [
        { member_id: '00000000-0000-4000-8000-000000000003', total: 3, unread: 3 },
        { member_id: '00000000-0000-4000-8000-000000000004', total: 2, unread: 2 },
      ], remaining.map((row) => ({
        member_id: row.member_id,
        total: Number(row.total),
        unread: Number(row.unread),
      })));
      await admin.unsafe(`DELETE FROM public.notifications WHERE id = ANY($1::uuid[])`, [Object.values(ids)]);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  const result = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    database: 'nextly_migration_rehearsal',
    identities: 'synthetic auth claims only',
    checks,
    status: checks.every((entry) => entry.pass) ? 'pass' : 'fail',
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`RLS report: ${reportPath}`);
  console.log(`Checks: ${checks.filter((entry) => entry.pass).length}/${checks.length} passed`);
  if (result.status !== 'pass') {
    for (const entry of checks.filter((item) => !item.pass)) console.error(`FAIL ${entry.name}: expected ${JSON.stringify(entry.expected)} got ${JSON.stringify(entry.actual)}`);
    process.exitCode = 1;
  }
}

async function countForMember(db: postgres.Sql, memberId: string): Promise<number> {
  const rows = await db.unsafe(
    `SELECT count(*)::int AS count FROM public.notifications WHERE member_id = $1::uuid`,
    [memberId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function unreadCountForMember(db: postgres.Sql, memberId: string): Promise<number> {
  const rows = await db.unsafe(
    `SELECT count(*)::int AS count FROM public.notifications WHERE member_id = $1::uuid AND read_at IS NULL`,
    [memberId],
  );
  return Number(rows[0]?.count ?? 0);
}

await main();
