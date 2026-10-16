-- RLS identity correction: Supabase auth.uid() is the external auth user id,
-- while members.id is the application's durable business key.

CREATE OR REPLACE FUNCTION private.is_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.members m WHERE m.auth_user_id = (SELECT auth.uid())
); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.member_role()
RETURNS public.member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT m.role FROM public.members m WHERE m.auth_user_id = (SELECT auth.uid()); $$;--> statement-breakpoint

DROP POLICY IF EXISTS members_update_self ON public.members;--> statement-breakpoint
CREATE POLICY members_update_self ON public.members
  FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) OR private.is_owner())
  WITH CHECK (auth_user_id = (SELECT auth.uid()) OR private.is_owner());--> statement-breakpoint
