# Environments and setup

Nextly can use managed Supabase only for isolated local development or as a
read-only legacy source during migration. Production must use a complete
self-hosted Supabase stack on the private Coolify VPS for PostgreSQL, Auth, API,
Storage and connection pooling. Production runtime validation rejects
`*.supabase.co` database and API endpoints.

## Local development

1. Install the repository's locked dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and set public Supabase URL/key values,
   `DATABASE_URL`, `DIRECT_URL` and `NEXT_PUBLIC_APP_URL` for an isolated
   development project.
3. Use `NEXTLY_DATABASE_MODE=managed` only for an isolated development project,
   or use `NEXTLY_DATABASE_MODE=self-hosted` for a private PostgreSQL URL.
4. Apply migrations only to the isolated development database with
   `pnpm db:migrate`, then run `pnpm dev`.

Never point local scripts at the source NextX database for writes. The NextX
source URL is accepted only by the read-only migration-source reader.

## Runtime configuration

| Variable | Purpose |
|---|---|
| `NEXTLY_DATABASE_MODE` | Production must be `self-hosted`; `managed` is development/source-only. |
| `DATABASE_URL` | Runtime connection through the self-hosted pooler on the private Coolify network. |
| `DIRECT_URL` | Direct PostgreSQL path for Drizzle migrations and migration tooling, private to the Coolify network. |
| `NEXT_PUBLIC_SUPABASE_URL` | Self-hosted API/Auth/Storage origin; also used for the Next Image allow-list. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase Auth key. |
| `SUPABASE_SECRET_KEY` | Server-only key for signed Storage uploads and admin-only Auth tasks. |
| `NEXT_PUBLIC_APP_URL` | Explicit canonical origin for links and metadata. |
| `CRON_SECRET` | At least 32 random characters for scheduled endpoints. |

Do not pass `SUPABASE_SECRET_KEY`, database passwords or `CRON_SECRET` as Docker
build arguments. Keep them in the runtime secret manager.

## Schema migrations

Run additive migrations using `pnpm db:migrate`; Drizzle reads `DIRECT_URL`.
Never rewrite an already-applied migration or use `db:push` against a shared
staging or production database. Current worktree migration `0034_self_hosted_media`
adds an upload retry key and provisions two Supabase Storage buckets when the
Storage schema is present. The local PostgreSQL rehearsal does not include the
Storage service and skips bucket provisioning.

After applying to a Supabase environment, verify migration history, RLS on all
public tables, both image buckets, Auth redirect URLs, and the storage upload
and public-read paths. See [the media pipeline](../04-engineering/media-pipeline.md).

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm db:rehearsal:run
```

For Next.js 16, stop the dev server before a production build if its generated
route types are stale. If route types conflict, remove the ignored `.next`
output and rebuild; do not delete workspace source data.

## Coolify deployment

Build from the repository `Dockerfile`. Set the application port to 3000 and
provide `NEXT_PUBLIC_SUPABASE_URL` as a public build argument. Set all database,
Auth and cron secrets at runtime. The image includes a health check for
`/api/health`; staging acceptance requires HTTP 200 with `status: "ready"`.

Keep PostgreSQL, Supavisor and internal Supabase services on a private Docker
network. Do not publish ports 5432 or 6543. Expose only the app and Supabase API
through TLS. Pin the official Supabase self-hosted release and its image tags,
retain persistent volumes, schedule the weekly reorder endpoint, and test
database and media restore procedures. See [Coolify operations](coolify.md) and
[production cutover readiness](../NEXTX_PRODUCTION_CUTOVER.md).

## Backups

Back up PostgreSQL logically, protect its persistent volume, back up Storage
objects and Coolify configuration, and verify a restore into a separate
isolated environment. Keep encrypted copies away from the host. Until an
offsite destination is identified and tested, record
`OFFSITE_BACKUP_TARGET_REQUIRED` as a production blocker. A Coolify volume is
persistent storage, not a backup or disaster recovery copy.
