-- T-27 — Database enforcement for the complete month-end close checklist.

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

  SELECT count(*) INTO missing_wallets
  FROM public.wallets wallet
  WHERE wallet.company_id = NEW.company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.wallet_reconciliations reconciliation
      WHERE reconciliation.wallet_id = wallet.id
        AND reconciliation.reconciled_at >= NEW.period_end
    );
  IF missing_wallets > 0 THEN
    RAISE EXCEPTION 'Cannot close period: % wallet(s) lack a reconciliation at the period end', missing_wallets USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO due_subscriptions
  FROM public.recurring_expenses recurring
  JOIN public.wallets wallet ON wallet.id = recurring.wallet_id
  WHERE wallet.company_id = NEW.company_id
    AND recurring.is_active AND recurring.next_run_on <= NEW.period_end;
  IF due_subscriptions > 0 THEN
    RAISE EXCEPTION 'Cannot close period: % recurring expense(s) are due but unposted', due_subscriptions USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO unclassified_expenses
  FROM public.expenses expense
  WHERE expense.company_id = NEW.company_id
    AND expense.status = 'posted'
    AND expense.expense_date BETWEEN NEW.period_start AND NEW.period_end
    AND coalesce(expense.classification, 'unclassified') IN ('', 'unclassified');
  IF unclassified_expenses > 0 THEN
    RAISE EXCEPTION 'Cannot close period: % posted expense(s) are unclassified', unclassified_expenses USING ERRCODE = 'check_violation';
  END IF;

  target_period_key := to_char(NEW.period_end, 'YYYY-MM');
  SELECT EXISTS (
    SELECT 1 FROM public.fx_revaluation_runs fx
    WHERE fx.company_id = NEW.company_id AND fx.period_key = target_period_key
      AND fx.status IN ('baseline', 'posted', 'zero')
  ) INTO fx_done;
  IF NOT fx_done THEN
    RAISE EXCEPTION 'Cannot close period: USD FX revaluation is not complete for %', target_period_key USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payout_runs payout
    WHERE payout.period_key = target_period_key AND payout.status IN ('draft', 'posted')
  ) INTO payout_done;
  IF NOT payout_done THEN
    RAISE EXCEPTION 'Cannot close period: payout evaluation is not drafted for %', target_period_key USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reject_incomplete_month_end_close ON public.accounting_periods;
CREATE TRIGGER reject_incomplete_month_end_close
BEFORE INSERT OR UPDATE OF status ON public.accounting_periods
FOR EACH ROW EXECUTE FUNCTION public.reject_incomplete_month_end_close();

DO $$
DECLARE n_sales int; n_wt int; n_ledger int;
BEGIN
  SELECT count(*) INTO n_sales FROM public.sales;
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  IF n_sales <> 149 OR n_wt <> 490 OR n_ledger <> 490 THEN
    RAISE EXCEPTION 'T-27 FAILED: financial baseline moved';
  END IF;
END $$;

COMMIT;
