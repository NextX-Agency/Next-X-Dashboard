-- Read-only Customer Agent credentials. Raw bearer secrets are never stored.
-- This table is intentionally service-side only: the API uses the database
-- service role and no Supabase authenticated policy is granted.

CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_id text NOT NULL,
  secret_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  disabled_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_credentials_key_id_key
  ON public.integration_credentials(key_id);
CREATE INDEX IF NOT EXISTS integration_credentials_active_idx
  ON public.integration_credentials(active);

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials FORCE ROW LEVEL SECURITY;
