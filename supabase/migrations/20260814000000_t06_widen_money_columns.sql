-- T-06 — Widen money columns (F-09)
--
-- STATUS: NOT APPLIED. Written by a session with no database access; nothing
-- here has run against production. Apply it with the Part 1 transactional
-- protocol, taking a backup first (T-02).
--
-- 26 amount columns are NUMERIC(10,2) and cap at 99,999,999.99. Three FX rate
-- columns are NUMERIC(10,4). Amounts go to NUMERIC(18,4), rates to
-- NUMERIC(18,8), per the runbook.
--
-- Deliberately NOT widened: the four commission_rate columns
-- (commissions, locations, seller_category_rates, sellers). Those are
-- percentages, not money and not FX rates — NUMERIC(5,2) already allows
-- 999.99%, and widening them would blur the distinction between a rate and an
-- amount. If that is wrong, it is a separate decision, not a silent one here.
--
-- Note on locking: this changes scale, not just precision, so Postgres rewrites
-- each table under an ACCESS EXCLUSIVE lock. At these row counts (largest is
-- 490 rows) it is effectively instant, but it is a rewrite, not a metadata-only
-- change.
--
-- Idempotent: every statement checks the current type first, so a partial
-- earlier run is fine.

BEGIN;

DO $$
DECLARE
  amount_cols CONSTANT text[][] := ARRAY[
    ['budgets','amount_allowed'], ['budgets','amount_spent'],
    ['commissions','commission_amount'],
    ['expenses','amount'],
    ['finance_ledger_entries','amount'],
    ['finance_obligations','original_amount'], ['finance_obligations','paid_amount'],
    ['goals','current_amount'], ['goals','target_amount'],
    ['items','purchase_price_usd'], ['items','selling_price_srd'], ['items','selling_price_usd'],
    ['purchase_order_items','subtotal'], ['purchase_order_items','unit_cost'],
    ['purchase_orders','total_amount'],
    ['reservations','combo_price'], ['reservations','original_price'],
    ['sale_items','original_price'], ['sale_items','subtotal'], ['sale_items','unit_price'],
    ['sales','total_amount'],
    ['wallet_reconciliations','confirmed_balance'],
    ['wallet_transactions','amount'], ['wallet_transactions','balance_after'],
    ['wallet_transactions','balance_before'],
    ['wallets','balance']
  ];
  rate_cols CONSTANT text[][] := ARRAY[
    ['exchange_rates','usd_to_srd'],
    ['purchase_orders','exchange_rate'],
    ['sales','exchange_rate']
  ];
  pair text[];
  changed int := 0;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY amount_cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=pair[1] AND column_name=pair[2]
        AND NOT (numeric_precision = 18 AND numeric_scale = 4)
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE NUMERIC(18,4)', pair[1], pair[2]);
      changed := changed + 1;
    END IF;
  END LOOP;

  FOREACH pair SLICE 1 IN ARRAY rate_cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=pair[1] AND column_name=pair[2]
        AND NOT (numeric_precision = 18 AND numeric_scale = 8)
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE NUMERIC(18,8)', pair[1], pair[2]);
      changed := changed + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'T-06: widened % column(s)', changed;
END $$;

-- ---------------------------------------------------------------------------
-- Verification, inside the transaction. Any failure aborts and nothing commits.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  wrong_amount int;
  wrong_rate int;
  srd numeric;
  usd numeric;
  n_sales int; n_items int; n_wt int; n_ledger int; n_expenses int;
BEGIN
  SELECT count(*) INTO wrong_amount FROM information_schema.columns
   WHERE table_schema='public'
     AND (table_name, column_name) IN (
       ('budgets','amount_allowed'),('budgets','amount_spent'),('commissions','commission_amount'),
       ('expenses','amount'),('finance_ledger_entries','amount'),('finance_obligations','original_amount'),
       ('finance_obligations','paid_amount'),('goals','current_amount'),('goals','target_amount'),
       ('items','purchase_price_usd'),('items','selling_price_srd'),('items','selling_price_usd'),
       ('purchase_order_items','subtotal'),('purchase_order_items','unit_cost'),
       ('purchase_orders','total_amount'),('reservations','combo_price'),('reservations','original_price'),
       ('sale_items','original_price'),('sale_items','subtotal'),('sale_items','unit_price'),
       ('sales','total_amount'),('wallet_reconciliations','confirmed_balance'),
       ('wallet_transactions','amount'),('wallet_transactions','balance_after'),
       ('wallet_transactions','balance_before'),('wallets','balance'))
     AND NOT (numeric_precision = 18 AND numeric_scale = 4);
  IF wrong_amount <> 0 THEN
    RAISE EXCEPTION 'T-06 FAILED: % amount column(s) are not NUMERIC(18,4)', wrong_amount;
  END IF;

  SELECT count(*) INTO wrong_rate FROM information_schema.columns
   WHERE table_schema='public'
     AND (table_name, column_name) IN (
       ('exchange_rates','usd_to_srd'),('purchase_orders','exchange_rate'),('sales','exchange_rate'))
     AND NOT (numeric_precision = 18 AND numeric_scale = 8);
  IF wrong_rate <> 0 THEN
    RAISE EXCEPTION 'T-06 FAILED: % rate column(s) are not NUMERIC(18,8)', wrong_rate;
  END IF;

  -- Widening must not move a single number. Baseline of 2026-08-12.
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  SELECT round(sum(balance),2) INTO usd FROM public.wallets WHERE currency='USD';
  IF srd <> 42005.99 THEN RAISE EXCEPTION 'T-06 FAILED: SRD total is %, expected 42005.99', srd; END IF;
  IF usd <> 534.00   THEN RAISE EXCEPTION 'T-06 FAILED: USD total is %, expected 534.00', usd; END IF;

  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_items FROM public.sale_items;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT count(*) INTO n_expenses FROM public.expenses;
  IF n_sales <> 149 OR n_items <> 306 OR n_wt <> 490 OR n_ledger <> 490 OR n_expenses <> 83 THEN
    RAISE EXCEPTION 'T-06 FAILED: counts moved — sales=% sale_items=% wt=% ledger=% expenses=%',
      n_sales, n_items, n_wt, n_ledger, n_expenses;
  END IF;

  IF n_wt <> n_ledger THEN
    RAISE EXCEPTION 'T-06 FAILED: wallet_transactions % <> ledger entries %', n_wt, n_ledger;
  END IF;

  RAISE NOTICE 'T-06 verified: 26 amounts at (18,4), 3 rates at (18,8), all counts and balances unchanged.';
END $$;

COMMIT;

-- After committing, update prisma/schema.prisma to @db.Decimal(18, 4) and
-- @db.Decimal(18, 8) to match, then run ./node_modules/.bin/prisma generate.
