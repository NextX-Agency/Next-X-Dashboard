-- T-27 corrective migration: qualify the PL/pgSQL close-gate period variable.
-- No accounting data changes; restores the intended database lock predicate.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_incomplete_month_end_close()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE missing_wallets int;
DECLARE due_subscriptions int;
DECLARE unclassified_expenses int;
DECLARE fx_done boolean;
DECLARE payout_done boolean;
DECLARE target_period_key text;
BEGIN
  IF NEW.status <> 'closed' OR (TG_OP = 'UPDATE' AND OLD.status = 'closed') THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO missing_wallets FROM public.wallets wallet
  WHERE wallet.company_id = NEW.company_id AND NOT EXISTS (
    SELECT 1 FROM public.wallet_reconciliations reconciliation
    WHERE reconciliation.wallet_id = wallet.id AND reconciliation.reconciled_at >= NEW.period_end
  );
  IF missing_wallets > 0 THEN RAISE EXCEPTION 'Cannot close period: % wallet(s) lack a reconciliation at the period end', missing_wallets USING ERRCODE = 'check_violation'; END IF;
  SELECT count(*) INTO due_subscriptions FROM public.recurring_expenses recurring
  JOIN public.wallets wallet ON wallet.id = recurring.wallet_id
  WHERE wallet.company_id = NEW.company_id AND recurring.is_active AND recurring.next_run_on <= NEW.period_end;
  IF due_subscriptions > 0 THEN RAISE EXCEPTION 'Cannot close period: % recurring expense(s) are due but unposted', due_subscriptions USING ERRCODE = 'check_violation'; END IF;
  SELECT count(*) INTO unclassified_expenses FROM public.expenses expense
  WHERE expense.company_id = NEW.company_id AND expense.status = 'posted' AND expense.expense_date BETWEEN NEW.period_start AND NEW.period_end
    AND coalesce(expense.classification, 'unclassified') IN ('', 'unclassified');
  IF unclassified_expenses > 0 THEN RAISE EXCEPTION 'Cannot close period: % posted expense(s) are unclassified', unclassified_expenses USING ERRCODE = 'check_violation'; END IF;
  target_period_key := to_char(NEW.period_end, 'YYYY-MM');
  SELECT EXISTS (SELECT 1 FROM public.fx_revaluation_runs fx WHERE fx.company_id = NEW.company_id AND fx.period_key = target_period_key AND fx.status IN ('baseline', 'posted', 'zero')) INTO fx_done;
  IF NOT fx_done THEN RAISE EXCEPTION 'Cannot close period: USD FX revaluation is not complete for %', target_period_key USING ERRCODE = 'check_violation'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.payout_runs payout WHERE payout.period_key = target_period_key AND payout.status IN ('draft', 'posted')) INTO payout_done;
  IF NOT payout_done THEN RAISE EXCEPTION 'Cannot close period: payout evaluation is not drafted for %', target_period_key USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $$;

COMMIT;
