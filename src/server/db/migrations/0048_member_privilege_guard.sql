-- Close a privilege-escalation path through the PostgREST surface.
--
-- `members_update_self` (0001, corrected in 0032) lets any signed-in member UPDATE their own row so
-- they can edit their display name. Row Level Security is row-scoped, not column-scoped, so the same
-- policy also let a viewer PATCH `/rest/v1/members?auth_user_id=eq.<me>` with {"role":"owner"} using
-- nothing but their own session token and the public publishable key, then use the new role against
-- every owner-only policy (and, through the app, every owner action) afterwards.
--
-- The application itself connects as `postgres`, where `auth.uid()` is NULL, and does its own
-- authorisation (`requireOwner`), so it is unaffected. Only requests that arrive as an end-user JWT
-- are restricted: a non-owner may no longer change the privilege-bearing columns of any member row.
--
-- Additive and idempotent: one function and one trigger. No table, column or existing policy
-- changes, and no data is touched.

CREATE OR REPLACE FUNCTION private.guard_member_privileges()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  -- Server-side connections (postgres, service_role) have no end-user identity: not our concern.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Owners administer the team.
  IF private.is_owner() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_principal IS DISTINCT FROM OLD.is_principal
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email) THEN
    RAISE EXCEPTION 'Only an owner can change a member''s role, email or equity flag.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS members_guard_privileges ON public.members;
--> statement-breakpoint

CREATE TRIGGER members_guard_privileges
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION private.guard_member_privileges();
