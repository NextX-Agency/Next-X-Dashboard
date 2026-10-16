-- Persisted in-app notifications. Ownership is structural: every row belongs
-- to exactly one Nextly member. Metadata is contextual only; trusted callers
-- must never place secrets or full sensitive payloads in it.

CREATE OR REPLACE FUNCTION private.current_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT m.id
         FROM public.members m
        WHERE m.auth_user_id = (SELECT auth.uid())
        LIMIT 1; $$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION private.current_member_id() TO authenticated;--> statement-breakpoint

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (length(trim(type)) > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  message text NOT NULL CHECK (length(trim(message)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX notifications_member_created_idx
  ON public.notifications(member_id, created_at DESC);--> statement-breakpoint
CREATE INDEX notifications_member_unread_idx
  ON public.notifications(member_id, read_at, created_at DESC);--> statement-breakpoint
CREATE UNIQUE INDEX notifications_member_dedupe_key
  ON public.notifications(member_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;--> statement-breakpoint

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON public.notifications FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, UPDATE ON public.notifications TO authenticated;--> statement-breakpoint

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (member_id = (SELECT private.current_member_id()));--> statement-breakpoint

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (member_id = (SELECT private.current_member_id()))
  WITH CHECK (member_id = (SELECT private.current_member_id()));
