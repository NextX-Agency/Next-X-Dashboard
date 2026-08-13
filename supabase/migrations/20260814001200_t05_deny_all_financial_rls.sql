-- T-05 — Replace blanket RLS with deny-all on financial tables (F-04)
--
-- ⛔ STATUS: NOT APPLIED, AND MUST NOT BE APPLIED YET. See the precondition
--    below. Applying this today breaks the dashboard.
--
-- Production carries 36 policies that are `FOR ALL USING (true)` to role
-- `public` — which includes `anon`. The publishable key ships in the browser
-- bundle, so those tables are readable AND writable by anyone who opens dev
-- tools. The audit described this as "any logged-in user"; it is worse than
-- that, and `public.users` was already closed out-of-band on 2026-08-13.
--
-- The correct posture already exists in this database: finance_ledger_entries
-- and wallet_reconciliations have RLS enabled with NO policies — deny-all
-- through PostgREST, reachable only by server routes on a direct connection.
-- Prisma is unaffected: it connects directly and bypasses RLS entirely.
--
-- ============================================================================
-- PRECONDITION — every browser-side write to these tables must be gone first.
-- ============================================================================
-- Audited 2026-08-13. Sale creation (T-11), sale voiding (T-13) and commission
-- payout (T-07) are server-side. These are NOT, and each one breaks the moment
-- this migration runs:
--
--   src/app/reservations/page.tsx  wallets, wallet_transactions, sales,
--                                  sale_items, commissions, stock, items
--   src/app/orders/page.tsx        purchase_orders, purchase_order_items,
--                                  purchase_order_allocations, stock, items
--   src/app/budgets/page.tsx       budgets, budget_categories, goals
--   src/app/items/page.tsx         items, combo_items, categories
--   src/app/exchange/page.tsx      exchange_rates, items
--   src/app/locations/page.tsx     locations, wallets, stock
--   src/app/commissions/page.tsx   seller_category_rates
--   src/app/sales/page.tsx         sellers (read+create), sale_items (read)
--   src/app/catalog/*              items, stock, exchange_rates (READS — these
--                                  are public storefront reads and need a
--                                  read-only policy, not deny-all)
--
-- reservations/page.tsx is the big one: it writes the same five financial
-- tables the old sales page did, by the same pattern, and has never been
-- touched. It needs its own server-side route before this can run.
--
-- The storefront needs public READ on items, stock and exchange_rates or the
-- catalog goes blank. That is why the policies below are split rather than a
-- blanket deny.
--
-- ============================================================================

BEGIN;

DO $$
DECLARE
  offending int;
BEGIN
  -- Refuse to run while the app still writes these tables from the browser.
  -- Set this deliberately once the pages above are migrated.
  IF NOT EXISTS (
    SELECT 1 FROM public.store_settings
     WHERE key = 'finance.rls_lockdown_ready' AND value = 'true'
  ) THEN
    RAISE EXCEPTION
      'T-05 REFUSED: browser-side writes to financial tables still exist. Migrate reservations, orders, budgets, items, exchange and locations pages to server routes, then set store_settings finance.rls_lockdown_ready = true.';
  END IF;
END $$;

-- Deny-all: RLS on, every policy dropped. Server routes use Prisma on a direct
-- connection and are unaffected.
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wallets','wallet_transactions','expenses','sales','sale_items','commissions',
    'finance_obligations','budgets','budget_categories','goals',
    'purchase_orders','purchase_order_items','purchase_order_allocations',
    'seller_category_rates','sellers','wallet_reconciliations','invoice_sequences',
    'recurring_expenses','payout_runs','founders','companies'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;
      -- anon/authenticated are Supabase roles; guarded so this file also runs
      -- against a plain Postgres verification cluster.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Catalog data stays publicly READABLE — the storefront depends on it — but
-- becomes read-only. Writes move to server routes.
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['items','stock','exchange_rates','categories','locations','combo_items'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
      END IF;
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_public_read', t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  writable int; n_sales int; n_wt int; n_ledger int; srd numeric;
BEGIN
  -- No financial table may still carry a permissive write policy.
  SELECT count(*) INTO writable
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('wallets','wallet_transactions','expenses','sales','sale_items','commissions','budgets')
     AND cmd <> 'SELECT';
  IF writable <> 0 THEN
    RAISE EXCEPTION 'T-05 FAILED: % write polic(y/ies) remain on financial tables', writable;
  END IF;

  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 OR srd <> 42005.99 THEN
    RAISE EXCEPTION 'T-05 FAILED: baseline moved — sales=% wt=% ledger=% SRD=%', n_sales, n_wt, n_ledger, srd;
  END IF;

  RAISE NOTICE 'T-05 verified: financial tables deny-all, catalog read-only, baseline unchanged.';
END $$;

COMMIT;

-- After applying: confirm every admin page still loads, and that
-- `SELECT * FROM wallets` through the anon key returns zero rows.
