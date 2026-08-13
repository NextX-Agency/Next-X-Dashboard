-- Close anonymous access to public.users.
--
-- Production carried three policies on this table, two of them permissive to
-- role `public` with a USING expression of `true`:
--
--   "Allow authenticated access"  ALL     public  USING true  WITH CHECK true
--   "Allow login queries"         SELECT  public  USING true
--   "Allow authenticated users"   ALL     public  USING auth.role() = 'authenticated'
--
-- Role `public` includes `anon`, and `anon` held SELECT/INSERT/UPDATE/DELETE
-- grants. The anon key ships in the browser bundle of the public webshop, so
-- any visitor could read every password hash, insert their own admin account,
-- or overwrite the existing admin's credentials — without logging in.
--
-- This is safe to apply with no application change: authentication runs through
-- Prisma on a direct connection (src/app/api/auth/login/route.ts), which is not
-- subject to PostgREST grants or RLS. Nothing legitimate reaches this table
-- through the anon key.
--
-- Applied to production 2026-08-13 ahead of the full RLS rework in T-05, because
-- the exposure was live and unauthenticated. T-05 still owns the remaining 35
-- tables, which cannot be closed until T-11 moves the browser's financial writes
-- server-side.
BEGIN;

DROP POLICY IF EXISTS "Allow authenticated access" ON public.users;
DROP POLICY IF EXISTS "Allow login queries"        ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users"  ON public.users;

REVOKE ALL ON public.users FROM anon, authenticated;

-- RLS stays enabled with zero policies: deny-all through PostgREST, matching the
-- posture already used for finance_ledger_entries and app_sessions.

COMMIT;
