# Production readiness

Nextly is not approved to replace the legacy NextX production system. See the
current [cutover gate](NEXTX_PRODUCTION_CUTOVER.md) and
[feature/content parity audit](NEXTX_FEATURE_PARITY.md). They are authoritative
for the live source counts and blockers.

## Required environment

- Isolated Coolify staging application built from the checked-in Dockerfile.
- The complete self-hosted Supabase stack on the private VPS: PostgreSQL, Auth,
  PostgREST API, Storage, Supavisor and required supporting services. Supabase
  Cloud is allowed only for isolated development or as a read-only migration
  source.
- Pinned Supabase release/config revision and pinned database image version;
  never use uncontrolled `latest` tags or auto-upgrade a PostgreSQL major.
- Durable database and object-storage volumes on a private Docker network.
- Runtime secrets in Coolify: database URLs, Supabase secret key and
  `CRON_SECRET` (at least 32 random characters).
- Explicit `NEXT_PUBLIC_APP_URL` and public Supabase URL. The public Supabase
  URL must also be passed as a Docker build argument for the Next image allow-
  list.
- PostgreSQL logical backups, database-volume protection, Supabase Storage
  object backups and Coolify configuration backups.
- Tested isolated restore of the database and media.
- Tested encrypted offsite copies. Until an offsite target is configured and
  verified, `OFFSITE_BACKUP_TARGET_REQUIRED` is a production blocker.
- Verified that public TCP ports 5432 and 6543 are closed; app runtime connects
  over internal service networking.
- Persistence tests across Coolify redeploy, Nextly restart, Supabase restart
  and Docker daemon restart.

## Validation sequence

1. Read the local Next.js 16 deployment guide and apply the versioned migrations
   to a disposable rehearsal database.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
   `pnpm exec drizzle-kit check`, and the import/rehearsal scripts.
3. Confirm `/api/health` returns `ready`, validate RLS, role boundaries, the
   signed image upload and image-read paths, Auth invitation/reset, invoices,
   reports, cron and application logs in isolated staging.
4. Rehearse the full source migration using read-only NextX access. Resolve all
   fatal source gaps and compare counts and financial balances before and after
   the import.
5. Complete the public cart, audio/watch brand pages, redirects and media
   migration, then run mobile and desktop browser checks.
6. Restore both the database and Storage objects to a separate isolated target.
7. Verify health, disk usage, connection-pool status, backup results and
   Storage usage in Coolify/container logs.

The importer does not write to NextX and rejects production destinations. A
staging import remains blocked while any fatal source conflict is present.

## Weekly reorder schedule

`vercel.json` is not used by the self-hosted deployment. Configure Coolify's
scheduler to request `GET /api/cron/reorder` every Monday at 12:00 UTC, with
`Authorization: Bearer <CRON_SECRET>`. Confirm an idempotent run in application
logs before activating the schedule.

## Go / no-go

Do not release while any current gate in `NEXTX_PRODUCTION_CUTOVER.md` is
unchecked. Production database import, DNS changes and NextX shutdown require a
separate explicit business release decision after staging acceptance.
