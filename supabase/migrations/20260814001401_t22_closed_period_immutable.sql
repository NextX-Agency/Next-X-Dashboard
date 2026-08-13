-- T-22 follow-up: closed periods are append-only accounting evidence.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_closed_period_reopen()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'A closed accounting period cannot be changed or reopened; post a correcting entry in an open period'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'closed' AND (NEW.closed_at IS NULL OR NEW.closed_by IS NULL) THEN
    RAISE EXCEPTION 'A closed accounting period requires close metadata'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS accounting_period_closed_is_immutable ON public.accounting_periods;
CREATE TRIGGER accounting_period_closed_is_immutable
BEFORE INSERT OR UPDATE ON public.accounting_periods
FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_period_reopen();

COMMIT;
