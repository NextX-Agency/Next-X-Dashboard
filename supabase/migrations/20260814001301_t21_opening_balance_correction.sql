-- T-21 corrective journal: the first production application created one opening
-- entry per currency, then attached every currency position to every entry.
-- Preserve that immutable history and neutralise each duplicate with a balanced
-- contra entry. On a clean database this migration is a no-op.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_journal_entries_company_date
  ON public.journal_entries (company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source
  ON public.journal_entries (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON public.journal_lines (account_id);

WITH ranked_openings AS (
  SELECT id, company_id,
         row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) AS opening_rank
  FROM public.journal_entries
  WHERE source_type = 'opening_balance'
    AND description = 'T-21 opening cash position'
), corrections AS (
  INSERT INTO public.journal_entries (
    company_id, entry_date, description, source_type, source_id, status, posted_at
  )
  SELECT opening.company_id,
         CURRENT_DATE,
         'T-21 correction: reverse duplicate opening cash position',
         'opening_balance_correction',
         opening.id,
         'posted',
         NOW()
  FROM ranked_openings opening
  WHERE opening.opening_rank > 1
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_entries existing
      WHERE existing.source_type = 'opening_balance_correction'
        AND existing.source_id = opening.id
    )
  RETURNING id, source_id
)
INSERT INTO public.journal_lines (journal_entry_id, account_id, currency, debit, credit)
SELECT correction.id, line.account_id, line.currency, line.credit, line.debit
FROM corrections correction
JOIN public.journal_lines line ON line.journal_entry_id = correction.source_id;

DO $$
DECLARE unbalanced int; n_sales int; n_wt int; n_ledger int;
BEGIN
  SELECT count(*) INTO unbalanced FROM (
    SELECT journal_entry_id, currency, round(sum(debit-credit),4) diff
    FROM public.journal_lines GROUP BY journal_entry_id,currency
  ) x WHERE diff <> 0;
  IF unbalanced <> 0 THEN RAISE EXCEPTION 'T-21 correction FAILED: % unbalanced journal groups', unbalanced; END IF;

  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 THEN
    RAISE EXCEPTION 'T-21 correction FAILED: financial baseline moved';
  END IF;
END $$;

COMMIT;
