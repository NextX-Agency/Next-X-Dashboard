# NextX authentication migration

NextX has one application user in the source database. Password hashes,
sessions, reset tokens and old auth-provider identifiers are not imported.
They are provider-specific secrets and do not establish that the operator still
controls the corresponding mailbox.

## Staging procedure

1. Confirm the current business owner and a working email address out of band.
2. Create the owner member record using Nextly's normal setup path; link it to a
   new user in the self-hosted Supabase Auth service with the supported
   invitation flow.
3. Have the owner accept the invite, set a new password, and verify login,
   sign-out, password reset and any configured MFA.
4. Test viewer, staff and owner boundaries in the isolated staging environment.
   Do not assign source users access by matching an unverified email or name.
5. Record the destination member id, role, invitation acceptance and test
   evidence in the release record. Keep credentials in Coolify's secret store.

The importer's refusal to copy auth credentials is intentional. Production
access and role assignment remain a separate reviewed release gate.
