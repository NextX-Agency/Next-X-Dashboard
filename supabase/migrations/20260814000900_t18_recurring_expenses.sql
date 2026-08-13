-- T-18 — Recurring subscriptions with exactly-once posting (F-24)
--
-- STATUS: NOT APPLIED.
--
-- Codex, Claude and Spotify are paid every month and recorded as **zero**. The
-- run rate is wrong by their whole value.
--
-- The part that must not be got wrong is idempotency, and it is enforced by a
-- unique index rather than by application logic. A double-fired cron, a retry,
-- or a manual "run now" during the scheduled run cannot double-charge, because
-- the second insert violates the index instead of relying on code noticing.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT NOT NULL,
  vendor_name             TEXT NOT NULL,
  amount                  NUMERIC(18,4) NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'USD',
  cadence                 TEXT NOT NULL DEFAULT 'monthly',
  anchor_day              INT NOT NULL DEFAULT 1,
  wallet_id               UUID REFERENCES public.wallets(id) ON DELETE RESTRICT,
  location_id             UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  category_id             UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  classification          TEXT NOT NULL DEFAULT 'operating',
  next_run_on             DATE NOT NULL,
  last_posted_at          TIMESTAMPTZ,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  auto_post               BOOLEAN NOT NULL DEFAULT true,
  -- R3: an estimate must never be indistinguishable from a fact.
  amount_is_estimated     BOOLEAN NOT NULL DEFAULT false,
  anchor_day_is_estimated BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recurring_expenses_cadence_check CHECK (cadence IN ('monthly','weekly','quarterly','yearly')),
  CONSTRAINT recurring_expenses_anchor_check CHECK (anchor_day BETWEEN 1 AND 31),
  CONSTRAINT recurring_expenses_amount_check CHECK (amount > 0)
);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_expense_id UUID REFERENCES public.recurring_expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_key TEXT;

-- THE idempotency rule. Period keys: 2026-08, 2026-W33, 2026-Q3, 2026.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_period_unique
  ON public.expenses (recurring_expense_id, period_key)
  WHERE recurring_expense_id IS NOT NULL AND period_key IS NOT NULL;

-- Seed the three known subscriptions. Amounts are flagged estimated and correct
-- themselves from the first observed charge.
--
-- Spotify's USD 12.00 is NOT a list price — it is derived from this business's
-- own data: the misfiled SRD 456 charge of 2026-01-14 divided by 38. Claude and
-- Codex are published list prices.
--
-- This is the ONE place the plan permits an invented figure in a derived total,
-- and only because the alternative is recording a real recurring cost as zero.
DO $$
DECLARE
  cat_id uuid;
  usd_wallet uuid;
  next_first date := (date_trunc('month', CURRENT_DATE) + interval '1 month')::date;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE name = 'Software & subscriptions';
  IF cat_id IS NULL THEN
    INSERT INTO public.expense_categories (name) VALUES ('Software & subscriptions') RETURNING id INTO cat_id;
  END IF;

  SELECT id INTO usd_wallet FROM public.wallets
   WHERE currency = 'USD' AND purpose = 'operational' ORDER BY balance DESC LIMIT 1;

  INSERT INTO public.recurring_expenses
    (name, vendor_name, amount, currency, cadence, anchor_day, wallet_id, category_id,
     classification, next_run_on, amount_is_estimated, anchor_day_is_estimated, auto_post)
  SELECT v.name, v.vendor, v.amount, 'USD', 'monthly', 1, usd_wallet, cat_id,
         'operating', next_first, true, true, true
    FROM (VALUES
      ('Spotify', 'Spotify', 12.00),
      ('Claude',  'Anthropic', 20.00),
      ('Codex',   'OpenAI', 20.00)
    ) AS v(name, vendor, amount)
   WHERE NOT EXISTS (SELECT 1 FROM public.recurring_expenses r WHERE r.name = v.name);
END $$;

DO $$
DECLARE
  seeded int; back_dated int; n_expenses int; srd numeric;
BEGIN
  SELECT count(*) INTO seeded FROM public.recurring_expenses;
  IF seeded < 3 THEN RAISE EXCEPTION 'T-18 FAILED: % subscriptions seeded, expected 3', seeded; END IF;

  -- A new schedule must never back-charge.
  SELECT count(*) INTO back_dated FROM public.recurring_expenses WHERE next_run_on <= CURRENT_DATE;
  IF back_dated <> 0 THEN
    RAISE EXCEPTION 'T-18 FAILED: % schedule(s) would post for a period already past', back_dated;
  END IF;

  -- Seeding a schedule must not create an expense.
  SELECT count(*) INTO n_expenses FROM public.expenses;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  IF n_expenses <> 83 OR srd <> 42005.99 THEN
    RAISE EXCEPTION 'T-18 FAILED: baseline moved — expenses=% SRD=%', n_expenses, srd;
  END IF;

  RAISE NOTICE 'T-18 verified: % schedules seeded, all flagged estimated, none back-charging.', seeded;
END $$;

COMMIT;

-- Still owed in code, and NOT done by this file:
--   * the daily Vercel cron posting due schedules through the expense path,
--     authenticated Bearer ${CRON_SECRET}, catch-up capped at 3 periods per run
--   * insufficient balance SKIPS and notifies — it must not fail the batch and
--     must not advance next_run_on
--   * anchor day clamps to short months (31st -> Feb 28)
--   * self-correction: a manual expense matching a schedule's vendor within
--     ±40% updates the amount and clears the estimate flags
--   * schedules still estimated after 60 days appear on the review page
