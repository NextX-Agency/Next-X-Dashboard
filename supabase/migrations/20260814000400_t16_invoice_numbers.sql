-- T-16 — Persistent, gapless invoice numbers (F-17)
--
-- STATUS: NOT APPLIED. Apply with the Part 1 protocol, after a backup.
--
-- Invoice numbers were generated in the browser with Math.random() and never
-- stored. The number printed on a customer's invoice exists nowhere in the
-- database, so no invoice can be looked up by its number and no sequence can be
-- shown to be complete.
--
-- ⚠️ READ THIS BEFORE APPLYING — it cannot be undone by software.
-- Historical numbers are reconstructed deterministically by `created_at` order
-- and flagged `invoice_is_reconstructed = true`. They will NOT match the numbers
-- on invoice copies customers already hold, because the originals were random
-- and were never recorded. If that matters for tax, raise it with the
-- accountant BEFORE applying, not after.
--
-- Idempotent.

BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_is_reconstructed BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_number
  ON public.sales (invoice_number) WHERE invoice_number IS NOT NULL;

-- The allocator. A row per prefix holding the last number issued; the sale
-- transaction bumps it under a row lock, so two concurrent sales cannot take
-- the same number and no number is skipped.
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  prefix      TEXT PRIMARY KEY,
  last_number BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.invoice_sequences IS
  'Gapless invoice numbering. A Postgres SEQUENCE is deliberately NOT used: sequences are '
  'non-transactional and leave gaps when a transaction rolls back, and an invoice series with '
  'holes in it is exactly what an auditor asks about.';

-- Backfill historical sales in created_at order, oldest first.
DO $$
DECLARE
  -- Not named `prefix`: that collides with invoice_sequences.prefix inside the
  -- WHERE clause below and Postgres rejects the ambiguous reference.
  seq_prefix CONSTANT text := 'INV';
  n bigint := 0;
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sales WHERE invoice_number IS NULL) THEN
    SELECT COALESCE(s.last_number, 0) INTO n
      FROM public.invoice_sequences s WHERE s.prefix = seq_prefix;
    IF n IS NULL THEN n := 0; END IF;

    FOR r IN
      SELECT id FROM public.sales WHERE invoice_number IS NULL ORDER BY created_at ASC, id ASC
    LOOP
      n := n + 1;
      UPDATE public.sales
         SET invoice_number = seq_prefix || '-' || lpad(n::text, 6, '0'),
             invoice_is_reconstructed = true
       WHERE id = r.id;
    END LOOP;

    INSERT INTO public.invoice_sequences (prefix, last_number)
    VALUES (seq_prefix, n)
    ON CONFLICT (prefix) DO UPDATE SET last_number = EXCLUDED.last_number, updated_at = NOW();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Verification, inside the transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing int; dupes int; total int; reconstructed int; last_n bigint;
  n_wt int; n_ledger int; srd numeric;
BEGIN
  SELECT count(*) INTO missing FROM public.sales WHERE invoice_number IS NULL;
  IF missing <> 0 THEN RAISE EXCEPTION 'T-16 FAILED: % sales still have no invoice number', missing; END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT invoice_number FROM public.sales GROUP BY invoice_number HAVING count(*) > 1
  ) d;
  IF dupes <> 0 THEN RAISE EXCEPTION 'T-16 FAILED: % duplicate invoice number(s)', dupes; END IF;

  SELECT count(*) INTO total FROM public.sales;
  SELECT count(*) INTO reconstructed FROM public.sales WHERE invoice_is_reconstructed;
  IF reconstructed <> total THEN
    RAISE EXCEPTION 'T-16 FAILED: % of % backfilled sales are not flagged reconstructed', total - reconstructed, total;
  END IF;

  -- Gapless: the highest number issued must equal the number of sales.
  SELECT last_number INTO last_n FROM public.invoice_sequences WHERE prefix = 'INV';
  IF last_n <> total THEN
    RAISE EXCEPTION 'T-16 FAILED: sequence at % but % sales exist — the series has a gap', last_n, total;
  END IF;

  IF total <> 149 THEN RAISE EXCEPTION 'T-16 FAILED: sales is %, expected 149', total; END IF;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  SELECT round(sum(balance),2) INTO srd FROM public.wallets WHERE currency='SRD';
  IF n_wt <> 490 OR n_ledger <> 490 OR srd <> 42005.99 THEN
    RAISE EXCEPTION 'T-16 FAILED: baseline moved — wt=% ledger=% SRD=%', n_wt, n_ledger, srd;
  END IF;

  RAISE NOTICE 'T-16 verified: % sales numbered INV-000001..INV-%, all flagged reconstructed.',
    total, lpad(last_n::text, 6, '0');
END $$;

COMMIT;
