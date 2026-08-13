-- T-04 — Harden the ledger guard functions (F-22)
--
-- STATUS: NOT APPLIED.
--
-- Half of this is already live: `capture_wallet_transaction_ledger` already
-- carries `SET search_path TO 'public'` and is SECURITY DEFINER.
-- `prevent_finance_ledger_mutation` does not, and neither REVOKE has been done.
-- Written idempotently so it does the remaining work and nothing else.
--
-- A SECURITY DEFINER function without a pinned search_path can be hijacked by a
-- caller who puts a malicious schema earlier in their own search_path. These two
-- functions are what keeps the ledger append-only, so they are the last place
-- that should be reachable that way.

BEGIN;

DO $$
DECLARE
  fn text;
  role_name text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['capture_wallet_transaction_ledger','prevent_finance_ledger_mutation'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname='public' AND p.proname=fn) THEN
      EXECUTE format('ALTER FUNCTION public.%I() SET search_path = public', fn);

      -- anon and authenticated are Supabase roles. Guarded so this same file
      -- runs against a plain Postgres (the local verification cluster), where
      -- they do not exist.
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM %I', fn, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  unpinned int;
  n_wt int; n_ledger int;
BEGIN
  SELECT count(*) INTO unpinned
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('capture_wallet_transaction_ledger','prevent_finance_ledger_mutation')
     AND NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%'
     );
  IF unpinned <> 0 THEN
    RAISE EXCEPTION 'T-04 FAILED: % ledger function(s) still have no pinned search_path', unpinned;
  END IF;

  -- The trigger must still work. Revoking EXECUTE from anon/authenticated must
  -- not stop the trigger firing: it runs as the table owner, not as the caller.
  SELECT count(*) INTO n_wt FROM public.wallet_transactions;
  SELECT count(*) INTO n_ledger FROM public.finance_ledger_entries;
  IF n_wt <> n_ledger THEN
    RAISE EXCEPTION 'T-04 FAILED: wallet_transactions % <> ledger %', n_wt, n_ledger;
  END IF;

  RAISE NOTICE 'T-04 verified: both ledger functions pin search_path; ledger pairs 1:1 at %.', n_ledger;
END $$;

COMMIT;

-- After committing, confirm with mcp__Supabase__get_advisors (type: security)
-- that neither function is reported, then insert a wallet transaction inside a
-- rolled-back transaction and confirm a ledger entry still appears.
