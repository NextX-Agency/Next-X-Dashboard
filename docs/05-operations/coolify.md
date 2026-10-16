# Coolify self-hosting

Nextly is built as a standalone Next.js 16 Node application and is deployed
from the repository `Dockerfile`. The container listens on port 3000, runs as
an unprivileged user and reports readiness at `/api/health`.

## Required production topology

Production must run the complete Supabase backend on the private Coolify VPS:
PostgreSQL, Auth, PostgREST, Storage, Supavisor and their required supporting
services. Supabase Cloud is permitted only for isolated development or as the
read-only NextX source during migration. Nextly's production startup rejects
Supabase Cloud database poolers and `*.supabase.co` API/Auth/Storage URLs.

Place Nextly, the Supabase API gateway and Supabase internal services on private
Coolify Docker networks. `DATABASE_URL` uses the self-hosted transaction
pooler/service name; `DIRECT_URL` uses the self-hosted direct PostgreSQL service
for Drizzle migrations and controlled migration work. Do not publish
PostgreSQL, Supavisor, or internal service ports 5432 or 6543. If direct access
is temporarily required, use a restricted SSH tunnel or private path and close
it after use.

## Coolify application configuration

Use the prepared Compose bundle at
[`deploy/supabase/docker-compose.yml`](../../deploy/supabase/docker-compose.yml)
as one Compose resource in the isolated `NextX-Migration-Staging` project and
its `staging` environment. The `nextly` service builds from the repository
root `Dockerfile` and shares the Compose network with Supabase. Its internal
port is 3000; its optional host binding is loopback-only on port 13000. Do not
create a separate Nextly app resource that cannot reach the private database
and API services by service name.

Coolify 4.3.23 also offers a source-less Docker Compose resource, but the
prepared file is not self-contained: the app build context is the repository
root (`../..`) and the stack bind-mounts configuration files under
`deploy/supabase/volumes/`. A source-less Compose form cannot build Nextly or
resolve those local files. The exact current working tree was transferred
once to the VPS, with user authorization, to prepare a source-less staging
Compose draft. That draft is separate from this repository-root-based bundle
and is not a repeatable Git deployment source. The final private production
repository remains gated on all readiness checks; do not publish this working
tree to its public origin.

Set the staging hostnames and TLS route only after proxy ownership is verified.
Pass the public Supabase URL, publishable key and app URL as Docker build args;
the Compose file wires them to the Dockerfile. Keep `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_SECRET_KEY`, Postgres credentials and cron secrets in Coolify's
runtime secret store. The `.env.example` file contains no usable secrets and
uses `.invalid` domains; it must not be deployed as-is.

The Dockerfile builder stage uses non-secret self-hosted service aliases for
`DATABASE_URL` and `DIRECT_URL`, plus `NEXTLY_DATABASE_MODE=self-hosted`, because
production environment validation runs during `next build`. These URLs are
validation placeholders only; the build passed locally while both aliases were
unresolvable. The final runner stage is separate and receives the real private
runtime URLs from Coolify. Never pass database passwords or runtime service keys
as build arguments.

| Variable | Purpose |
|---|---|
| `NEXTX_ENVIRONMENT` | Set to `staging` in staging to disable indexing and use the staging canonical origin. Set to `production` only after production host routing is approved. |
| `NEXTLY_DATABASE_MODE=self-hosted` | Required in production runtime. |
| `DATABASE_URL` | Private runtime connection through the self-hosted pooler. |
| `DIRECT_URL` | Private direct connection for Drizzle and controlled migration operations. |
| `NEXT_PUBLIC_SUPABASE_URL` | Self-hosted HTTPS API/Auth/Storage origin. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe key for the self-hosted project. |
| `SUPABASE_SECRET_KEY` | Runtime-only key for signed uploads and server-side Storage actions. |
| `NEXT_PUBLIC_APP_URL` | Exact canonical staging origin. |
| `CRON_SECRET` | Random secret of at least 32 characters. |

For the Coolify staging Service, use `${SERVICE_PASSWORD_64_NEXTX_POSTGRES}`
in every Compose expression that supplies the PostgreSQL password. Coolify
generates one persistent 64-character alphanumeric value for that name and
reuses it across components. The `POSTGRES_PASSWORD` container environment
key remains, but its value comes from this generated variable. Do not enter a
password in source control. Staging has no verified healthy database, but
whether a database volume was initialized during the failed attempt is
unverified. If it was initialized with a different password, use Supabase's documented
[`utils/db-passwd.sh` procedure](https://supabase.com/docs/guides/self-hosting/docker#changing-database-password)
and recreate the services; changing only the Coolify variable does not rotate
the password on an initialized PostgreSQL instance.

## Supabase version and persistent data

Use the official [Supabase self-hosted Docker stack](https://supabase.com/docs/guides/self-hosting/docker).
As reviewed on 2026-09-23, pin release
[`self-hosted/v0.8.2`](https://github.com/supabase/supabase/tree/self-hosted/v0.8.2/docker)
and PostgreSQL image `supabase/postgres:17.6.1.136`. Release 0.8.2 is the
current official Docker snapshot on that date. It includes the Envoy gateway
configuration, the 0.8.0 gateway migration, and the current Postgres
initialization SQL. Use the pinned default Compose file together with its
referenced Envoy, database, pooler and function files; do not mix files from
older tags. Record the resolved Supabase config
commit and every image tag at deployment; never use `latest` or pull a moving
branch in Coolify. The release image versions are recorded in the official
[`versions.md`](https://github.com/supabase/supabase/blob/self-hosted/v0.8.2/docker/versions.md).

The local Compose bundle binds the API gateway, app and optional Supavisor
administrative ports to `127.0.0.1`. Do not deploy the upstream port mappings
unchanged: the official release maps the API gateway to host port 8000 and
publishes Supavisor session/transaction listeners on 5432/6543. On the current
VPS, Coolify already listens on 8000. Nextly and Supabase use the private
Compose service network. Route the API gateway only after the staging host,
TLS and reverse-proxy ownership are verified. On 2026-09-25, a separate
source-less Compose resource named `NextX-Self-Hosted-Staging` was saved in
Coolify from the authorized one-time VPS source transfer. It contains the
Nextly app and reviewed PostgreSQL 17 Supabase stack, with 12 compose resources
total. The first Coolify deployment attempt pulled the pinned images and created
the stack network, then stopped in the Nextly production image build because the
build-time publishable key was absent. Coolify's individual editor can display
a redacted browser-autofilled login value, but Developer view shows the root
`SUPABASE_PUBLISHABLE_KEY` is empty. Build-time and runtime availability are
enabled. A user-authorized deletion attempt for the locked `POSTGRES_PASSWORD`
placeholder did not remove it; after reload Coolify still listed it as locked
with the value masked. Those 13 Compose references were later changed to
`${SERVICE_PASSWORD_64_NEXTX_POSTGRES}`; its actual value remains unverified.
No replacement database password was entered. The app
service remains `Exited`; the last deployment state had all 12 resources
exited, no healthy service and no imported migration data. Local Next.js builds
pass with the non-secret self-hosted builder aliases, but a read-only SSH check
on 2026-09-26 found Dockerfile SHA-256
`bbb04f1832e182c51acf2f3cf2a3da8d3090e969e574e7fc19ccd796c0c2e03f` on the VPS
versus `46A9C7C05AE9B073CF6E72F7561DC2916B2C4F84303BF92F165D58DA99F7B339`
locally, so the builder fix has not reached Coolify. The HTTPS URL variables
are corrected.
No successful Coolify build has verified the key or staging runtime. No
Coolify domains are configured. The repository-root Compose bundle remains
prepared locally and has not completed a deployment.

The Coolify 4.3.23 built-in Supabase template is not the selected stack. It was
inspected on 2026-09-24 and pins PostgreSQL `15.8.1.085` (alongside its own
Kong, Auth, PostgREST, Storage, MinIO and supporting images), while this target
uses the reviewed PostgreSQL 17 stack. Opening the template in the isolated
staging environment created one stopped PostgreSQL 15 catalog draft. It has
not been started or used for migration data. Do not start that draft. The
separate PostgreSQL 17 source-less Compose draft is the selected staging
configuration, but it also remains stopped and unconfigured. The catalog
draft's generated route is an `http://…sslip.io` URL; the Coolify proxy is
stopped and Pangolin owns the public 80/443 ingress, so this route is not an
accepted TLS staging endpoint.
The prepared official `self-hosted/v0.8.2` bundle remains the selected stack.
Keep PostgreSQL data and Storage objects on explicit persistent Coolify/Docker
volumes or stable host mounts. Never keep business data only in replaceable
application containers.

The current local Nextly working tree contains uncommitted NextX migration
changes. Its configured GitHub origin, `LeoRanoe/nextly`, is public, so do not
push this migration tree there. A read-only GitHub CLI preflight by active
organization member `LeoRanoe` could not resolve
`NextX-Agency/NextX-Suite`; the organization listing exposed neither that name
nor `NextX-Platform`. Neither repository is visible
to this account; private-repository existence and contents remain unverified.
Repository creation stays deferred until all readiness gates pass. Coolify's
Sources page shows one connected NextX-Agency GitHub provider, but no private
Git source or Git-connected staging app is configured for these migration changes. The current source-less staging draft
uses a one-time source transfer and cannot establish repeatable Git-based
redeploys. Do not substitute the old public Nextly commit or create the final
private repository before its gates pass.

Staging and production acceptance must demonstrate that all data survives:

1. Coolify app redeploy and Nextly restart.
2. Supabase service restart.
3. Docker daemon restart.

## Backup, restore and monitoring

Back up PostgreSQL logically, protect the database volume, back up Storage
objects separately (including the private `nextly-expense-receipts` bucket),
and back up Coolify configuration. Encrypt backups and
send them to a tested offsite target; same-host copies are not disaster
recovery. Until an offsite destination is selected and tested, the production
gate is `OFFSITE_BACKUP_TARGET_REQUIRED`.

`deploy/backup-staging.sh` prepares these three staging artifacts in one
restricted directory: `postgres.sql.gz`, `storage.tar.gz`, and
`coolify-service-config.tar.gz`, plus `SHA256SUMS`. It must run as root on the
Docker host with `BACKUP_DEST`, `STAGING_DB_CONTAINER`,
`STAGING_STORAGE_VOLUME`, and `COOLIFY_SERVICE_DIR` set to the exact staging
targets. It checks the container's Coolify Service UUID and `db` Compose label,
then checks that the Storage volume shares the same Compose project. Choose
the container and volume from a live Docker inventory; do not guess or
substitute a production resource. The destination must already exist and be
protected. The script never prints credentials. Quiesce Storage writes
for a cutover backup, encrypt the resulting archives before offsite transfer,
and prove a restore independently. Its Bash syntax and staging-file hash were
verified on the VPS, but no backup has run because the staging database is not
running and the deployment account has no root/Docker access. The script backs
up this staging Service's configuration only; a separate encrypted Coolify
instance backup and restore test are still required before production cutover.

Restore a database backup to an isolated database and verify migration
history, Auth users/member relationships, products, inventory, orders,
payments, wallets, ledger and invoices. Restore Storage separately and verify
public product delivery plus private receipt access with a newly issued signed
link. Do not accept production until both restore paths pass.

Use Coolify/container logs and health checks for the first release. Monitor
Postgres health, disk use, database connectivity, pooler health, backup
success/failure and Storage usage. Keep database and backup health checks
independent of the app health check.

The Nextly image health check requests `/api/health` on port 3000. Require
`status: "ready"` after migrations. `degraded` indicates an incomplete runtime
or direct-URL configuration.

## Browser acceptance

Run authenticated or data-backed Playwright flows only against the isolated
staging app with `E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD` and
`E2E_ISOLATED_STAGING=1` supplied through the local test environment. The
storefront checks use existing published fixtures; the cart journey requires
two in-stock variants through `E2E_PUBLIC_PRODUCT_SLUG`,
`E2E_PUBLIC_VARIANT_NAME`, `E2E_PUBLIC_SECOND_PRODUCT_SLUG` and
`E2E_PUBLIC_SECOND_VARIANT_NAME`. Never point these tests at NextX production.
Without `E2E_BASE_URL`, `pnpm e2e` starts a separate local server on port 3100
and runs only database-independent public-page checks.

## Scheduled tasks

Configure the tasks in Coolify only; the Vercel cron manifest has been removed.
Keep `CRON_SECRET` in the Coolify runtime secret store and pass it in the
`Authorization: Bearer <CRON_SECRET>` header. Never expose it in a repository
file, query string or task log.

- Reorder recommendations: `GET /api/cron/reorder`, every Monday at 12:00 UTC.
  Verify its logged run and idempotent business week before enabling it.
- Recurring expenses: `GET /api/cron/recurring-expenses`, once daily. The route
  derives the business date in `America/Paramaribo`; the unique period key keeps
  retries idempotent and the worker limits catch-up to three periods. Verify a
  successful due run and its failure log before enabling the schedule.

Neither task has been scheduled or exercised in Coolify staging yet.

## 2026-09-27 staging update

The source-less staging Service's Compose source was validated and saved with
all 13 `${POSTGRES_PASSWORD}` interpolations replaced by the single Coolify
`${SERVICE_PASSWORD_64_NEXTX_POSTGRES}` reference. Coolify displays
that variable in the staging Service environment list, but its value is empty
in Developer view; generation and database readiness remain unverified. The former
locked `POSTGRES_PASSWORD` variable was not deleted; the revised Compose no
longer references it. This avoids the immutable-field issue in Compose without
exposing or storing a password in this repository.

The corrected Dockerfile was transferred to the existing staging source tree.
Local and VPS SHA-256 are both
`46a9c7c05ae9b073cf6e72f7561dc2916b2c4f84303bf92f165d58da99f7b339`.
The current application source, including migration `0045`, was also synced
to that isolated staging tree from a filtered 450-file archive; the archive
SHA-256 matched after transfer. Three deployment attempts completed without
running containers. The first spent several minutes pulling images; the
second used the refreshed source. The third was captured through Coolify's
Service Startup dialog: Docker reached `RUN pnpm build` and Next.js stopped
with `Production image builds require the self-hosted Supabase publishable
key.` The root `SUPABASE_PUBLISHABLE_KEY` is empty in Coolify Developer view.
The same view shows several other required staging values empty, including
`POSTGRES_HOST`, `POSTGRES_PORT`, `JWT_EXPIRY`, and pooler settings. Browser
autofill can insert unrelated login values into individual variable editors;
do not treat those autofilled fields as saved Service values or click Update.
The missing nonsecret Compose values were subsequently filled from the checked-in
staging example through Coolify Developer view and verified after reload:
`POSTGRES_HOST=db`, `POSTGRES_PORT=5432`, `JWT_EXPIRY=3600`,
`PGRST_DB_SCHEMAS=public,graphql_public`, pooler tenant and sizes, Storage
placeholders, Auth feature flags, mailer paths, and Studio names. Locked
credential rows were preserved. `SUPABASE_PUBLISHABLE_KEY` and
`SERVICE_PASSWORD_64_NEXTX_POSTGRES` still show empty; no deploy was attempted
after this variable-only update.
The Coolify server terminal currently loses its WebSocket connection. Fill
and verify staging variables before the next deployment, then inspect its
first failing command and component health.

## Current VPS and staging state

The authorized host is Ubuntu 24.04.5 with 6 CPU cores, roughly 11 GiB RAM and
a 193 GB root filesystem. The latest read-only inventory showed 2.5 GiB RAM
used, 9.2 GiB available and 181 GB disk free. Coolify metrics are disabled and
the host has no swap. Supabase recommends 8 GB+ RAM, 4+ cores and 80 GB+ SSD
for the full stack. The host meets nominal totals, but a full stack can leave
little memory headroom; resource use must be measured under load before
staging acceptance.

The Coolify account is authenticated through the local SSH tunnel. The isolated
`NextX-Migration-Staging` project and `staging` environment exist. The built-in
Supabase catalog template remains a stopped PostgreSQL `15.8.1.085` draft; do
not start or use it. On 2026-09-25 the separate `NextX-Self-Hosted-Staging`
Compose resource was saved with the reviewed PostgreSQL 17 Supabase stack and
Nextly app. The first deployment attempt stopped in the Nextly image build
because the build-time publishable key was absent; all 12 Compose resources
report `Exited`. The HTTPS URL variables are corrected, but no successful
post-handoff build has verified the root `SUPABASE_PUBLISHABLE_KEY`. Other
staging-only secret values remain stored in Coolify; the locked
`POSTGRES_PASSWORD` placeholder remains unresolved after the failed deletion
attempt, and no new database password was entered. No Coolify domain,
healthy database, verified persistent database volume or scheduled task exists
in staging.

Coolify's instance URL is `https://coolify.nextxagency.com`; DNS for
`staging.nextxagency.com` and `supabase-staging.nextxagency.com` resolves to
the VPS. On 2026-09-24, both hosts returned 404 over HTTP and HTTPS; TLS
presented `TRAEFIK DEFAULT CERT` with an internal-only SAN that matches neither
staging hostname. The server wildcard-domain field is blank. Coolify's managed
proxy is stopped. Read-only Docker labels show that the active `traefik`
container belongs to the existing Pangolin Compose project, and `gerbil` binds
public ports 80/443; the separate Pangolin service and port 8080 are also
present. Pangolin owns active ingress. Starting Coolify's proxy would conflict
with current public port bindings unless ingress is deliberately migrated.
Existing application services also bind ports 3000 and 8055. Do not change the
proxy, network or firewall during this migration staging until the intended
route is planned. Coolify API access is disabled, the staging environment has
no shared variables, Coolify lists no S3 backup destinations, and its instance
backup is not configured. The SSH account still cannot access Docker directly
and non-interactive sudo requires a password; the Coolify server terminal was
used for read-only Docker and capacity checks. The existing Den's Designs
resource and its containers were not changed.

The local SSH key authenticates to the deployment account. A loopback-only SSH
tunnel to the Coolify HTTP listener is available at `127.0.0.1:18080` for a
secure transport path, and the Coolify account is signed in through that
localhost origin. Staging-only Supabase, Storage/Vault/Realtime, Studio and cron
secret rows are present as locked Coolify values, but their contents and
cross-service consistency have not been validated. Staging URLs and auth
restrictions are configured. Keep secret values out of
reports and the repository. Do not enter deployment secrets in the existing
plain-HTTP IP-origin session. The source
database URL was discovered in the legacy repository's ignored environment
file and has only been used inside a read-only migration process. No Coolify
API token or offsite backup destination has been created.

## 2026-09-28 staging readiness update

The latest `NextX-Self-Hosted-Staging` deployment still fails during the
Nextly image build at `RUN pnpm build` with `Production image builds require
the self-hosted Supabase publishable key.` No container starts; all 12 Compose
resources remain `Exited`, so staging database, Auth, API, Storage and pooler
health are still unverified. The effective build argument remains unavailable
to Next.js even after setting the `ANON_KEY` Coolify variable for build and
runtime and wiring the Compose build/runtime mappings directly to `${ANON_KEY}`.
Do not retry an unchanged deployment.

Coolify v4.3.23 identifies the service's `POSTGRES_PASSWORD` as a `Locked
Secret` and states it must be deleted and added again to change it. Normal View
offers view-only controls for the `studio`, `db` and `supavisor` entries.
Developer View also shows `SERVICE_PASSWORD_64_NEXTX_POSTGRES` as empty even
though Compose uses that variable for database-password aliases. The password
has not been changed or re-entered. Per Computer Use's credential handoff rule,
the user must enter and submit a replacement staging-only password in Coolify.
Keep one consistent password across the PostgreSQL components; do not copy it
into this repository or the report. Do not use the existing plaintext-IP
Coolify session for credential entry; use the localhost session over the SSH
tunnel.

The corrected local Dockerfile was previously transferred and hash-verified
against the VPS staging source tree. Local `pnpm build` now succeeds using
disposable non-secret public placeholders and internal self-hosted URL
placeholders; this verifies the source build, not Coolify's unavailable
publishable key or a live database. Current repo checks are: lint pass,
typecheck pass, 213 unit tests pass across 30 files, build pass, Drizzle check
pass, and `git diff --check` pass. Full Playwright runs 2 public tests and
skips the 16 staging-authenticated or data-dependent tests because isolated
staging is not healthy and no staging test credentials are supplied. The
staging app routes, application workflow, scheduled tasks, persistence, and
NextX staging import remain unverified.

Read-only inspection of the Coolify Service also confirms zero scheduled tasks,
zero backup schedules and zero backup executions. Its storage configuration
mounts named database and Storage volumes, but the deployment account cannot
inspect the Docker host to confirm volume existence or contents. Preserve those
volume definitions and do not recreate or remove them until an authorized
Docker inventory confirms the data state.

The read-only migration CLI was retried on 2026-09-28, but this checkout has no
`NEXTX_SOURCE_DATABASE_URL` or `NEXTX_SOURCE_EXPORT` configured, so `inspect`
stopped before opening a source or destination. The latest retained live dry-run
is `nextx-live-dry-run-20260926-131857.json`: validation failed with 227
conflicts (73 fatal, 77 warnings, 77 informational). No staging import ran.
