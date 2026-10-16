-- Synthetic identities only. These UUIDs are not real user accounts.
INSERT INTO public.members (id, auth_user_id, email, full_name, role, is_principal)
VALUES
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner.rehearsal@example.invalid', 'Rehearsal Owner', 'owner', true),
  ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'staff.rehearsal@example.invalid', 'Rehearsal Staff', 'staff', false),
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'viewer.a.rehearsal@example.invalid', 'Rehearsal Viewer A', 'viewer', false),
  ('00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'viewer.b.rehearsal@example.invalid', 'Rehearsal Viewer B', 'viewer', false)
ON CONFLICT (id) DO NOTHING;

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
REVOKE INSERT, DELETE ON public.notifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.finance_obligations FROM authenticated;
REVOKE ALL ON public.finance_obligations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.finance_obligation_payments FROM authenticated;
REVOKE ALL ON public.finance_obligation_payments FROM anon;
REVOKE ALL ON public.legacy_store_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.legacy_catalog_price_archive FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.legacy_payout_run_archive FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.legacy_stock_transfer_archive FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.legacy_reservation_archive FROM PUBLIC, anon, authenticated, service_role;
