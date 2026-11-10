-- PROPOSAL — NOT APPLIED. Owner decision required. See docs/OVERNIGHT_RELEASE_2026-11-10.md §3.
--
-- Problem: the historical import wrote each sale's line cost (sale_items.cogs_cents) but left the
-- header columns sales.cogs_cents and sales.gross_profit_cents at 0. The app itself always sets the
-- header to the sum of the lines (src/server/actions/sales.ts). Reports that read the header show a
-- 100% margin on imported sales. The code now reads the lines, so reports are right without this;
-- this script makes the stored header agree with the lines so customer totals, exports and the
-- v_customer_totals view agree too.
--
-- Scope: status = 'confirmed' AND header cogs = 0 AND the lines carry cost > 0.
-- Sales with no cost on any line are left alone (their profit is unknown; the reports flag them).
-- Reversible: the previous values are kept in sale_cost_backfill_audit; see the rollback at the end.
-- Run in one transaction and compare the two checks before COMMIT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sale_cost_backfill_audit (
  sale_id uuid PRIMARY KEY REFERENCES public.sales (id),
  old_cogs_cents bigint NOT NULL,
  old_gross_profit_cents bigint NOT NULL,
  new_cogs_cents bigint NOT NULL,
  new_gross_profit_cents bigint NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_cost_backfill_audit ENABLE ROW LEVEL SECURITY;

WITH target AS (
  SELECT s.id,
         s.cogs_cents AS old_cogs,
         s.gross_profit_cents AS old_gross,
         l.line_cogs AS new_cogs,
         s.total_usd_cents - l.line_cogs AS new_gross
    FROM public.sales s
    JOIN LATERAL (
      SELECT SUM(i.cogs_cents) AS line_cogs FROM public.sale_items i WHERE i.sale_id = s.id
    ) l ON true
   WHERE s.status = 'confirmed' AND s.cogs_cents = 0 AND l.line_cogs > 0
     AND NOT EXISTS (SELECT 1 FROM public.sale_cost_backfill_audit a WHERE a.sale_id = s.id)
), logged AS (
  INSERT INTO public.sale_cost_backfill_audit
    (sale_id, old_cogs_cents, old_gross_profit_cents, new_cogs_cents, new_gross_profit_cents)
  SELECT id, old_cogs, old_gross, new_cogs, new_gross FROM target
  RETURNING sale_id, new_cogs_cents, new_gross_profit_cents
)
UPDATE public.sales s
   SET cogs_cents = logged.new_cogs_cents,
       gross_profit_cents = logged.new_gross_profit_cents
  FROM logged
 WHERE s.id = logged.sale_id;

-- Check 1: every confirmed sale with line cost now has header cost equal to the line sum (expect 0).
SELECT count(*) AS header_still_disagrees
  FROM public.sales s
 WHERE s.status = 'confirmed'
   AND s.cogs_cents <> COALESCE((SELECT SUM(cogs_cents) FROM public.sale_items i WHERE i.sale_id = s.id), 0)
   AND s.cogs_cents <> 0;

-- Check 2: revenue is unchanged and cost moved by exactly the audited amount.
SELECT (SELECT SUM(total_usd_cents) FROM public.sales WHERE status = 'confirmed') AS revenue_usd_cents,
       (SELECT SUM(new_cogs_cents - old_cogs_cents) FROM public.sale_cost_backfill_audit) AS cost_added_cents,
       (SELECT count(*) FROM public.sale_cost_backfill_audit) AS sales_updated;

-- COMMIT;   -- only if check 1 is 0 and check 2 matches the expected figures in the release note
ROLLBACK;    -- default: a dry run that changes nothing

-- To undo a committed run later:
--   UPDATE public.sales s SET cogs_cents = a.old_cogs_cents, gross_profit_cents = a.old_gross_profit_cents
--     FROM public.sale_cost_backfill_audit a WHERE a.sale_id = s.id;
