ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS actor_user_id UUID,
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS operator_id TEXT,
  ADD COLUMN IF NOT EXISTS operator_name TEXT,
  ADD COLUMN IF NOT EXISTS operator_source TEXT,
  ADD COLUMN IF NOT EXISTS operator_session TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS request_method TEXT,
  ADD COLUMN IF NOT EXISTS request_path TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS user_agent_hash TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS checksum TEXT,
  ADD COLUMN IF NOT EXISTS previous_checksum TEXT;

UPDATE public.activity_logs
SET actor_user_id = user_id
WHERE actor_user_id IS NULL
  AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_user
  ON public.activity_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_operator_created
  ON public.activity_logs (operator_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_request_created
  ON public.activity_logs (request_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_checksum
  ON public.activity_logs (checksum);
