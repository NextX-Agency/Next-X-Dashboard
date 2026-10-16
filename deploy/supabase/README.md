# NextX self-hosted staging stack

This directory contains the pinned Supabase Docker stack and the Nextly app in
one Compose project. It is intended for the isolated Coolify project
`NextX-Migration-Staging`, environment `staging`.

## Safety defaults

- Postgres, Supavisor and the API gateway have no public host binding. Their
  optional administrative/API host bindings use `127.0.0.1` only.
- The Nextly app host binding is also loopback-only. Coolify must provide the
  verified HTTPS route through a reviewed proxy path.
- Postgres data and Storage objects use explicitly named Docker volumes whose
  names include `COMPOSE_PROJECT_NAME`; container recreation does not remove
  them.
- This stack does not include a reset or volume deletion helper.
- `.env.example` is a variable inventory only. Secrets are blank, and the
  `.invalid` URLs must be replaced with the real staging HTTPS hostnames.

The VPS currently uses port 8000 for Coolify. This stack's loopback-only API
port defaults to 18000. Do not publish database ports 5432 or 6543 to the
internet. Nextly connects to `supavisor:6543` and `db:5432` over the Compose
network.

## Prepare the Coolify environment

Set the following in the Coolify resource's secret/environment configuration:

- A unique `COMPOSE_PROJECT_NAME` and matching `REALTIME_CONTAINER_NAME`.
- A valid `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL` ending in `/auth/v1`, and
  `NEXTX_STAGING_APP_URL`, all using the verified staging HTTPS domain.
- All blank credentials from `.env.example`, including `POSTGRES_PASSWORD`,
  `JWT_SECRET`, legacy API keys, asymmetric/JWKS keys, `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `DASHBOARD_PASSWORD` and `NEXTLY_CRON_SECRET`.
- Keep `NEXTLY_CRON_SECRET` at least 32 characters. Use an alphanumeric
  `POSTGRES_PASSWORD` so PostgreSQL URLs do not need ambiguous escaping.

The pinned upstream key helpers are in `utils/`. Their local safety changes
refuse to emit secret values and write them only to the ignored local `.env`
when `--update-env` is specified. On a trusted Linux/WSL host, create a
private `.env` copy, then transfer its values to Coolify's secret store through
an approved secure path:

```sh
umask 077
cp .env.example .env
sh ./utils/generate-keys.sh --update-env >/dev/null 2>&1
sh ./utils/add-new-auth-keys.sh --update-env >/dev/null 2>&1
```

Do not run either helper with terminal logging, shell tracing, `tee`, or a
captured output. Do not put `.env` or generated keys in Git, reports, or issue
attachments.

## Validate without starting containers

From the repository root, validate Compose interpolation and inspect the
resolved service bindings before deployment:

```powershell
docker compose --project-directory deploy/supabase `
  --env-file deploy/supabase/.env.example `
  -f deploy/supabase/docker-compose.yml config --quiet
```

This checks configuration only; it does not pull images or start services.
Before deployment, replace every `.invalid` URL and blank secret. Verify the
resolved config still binds host ports only to `127.0.0.1` and retains the
named Postgres and Storage volumes.

## Current deployment status

The first Coolify deployment attempt on 2026-09-25 pulled the pinned images and
created the stack network, then stopped in the Nextly production image build
because Coolify did not supply a usable publishable key. All 12 resources remain
`Exited`; no service is healthy and no migration data has been imported. The
HTTPS URL variables have been corrected, but `SUPABASE_PUBLISHABLE_KEY` still
needs a valid generated value. Staging-only secrets remain in Coolify with
secret values locked and runtime-only; no Coolify domain is configured. The
separate stopped PostgreSQL 15 Coolify catalog draft is not part of this stack.
Coolify's managed proxy is stopped, Pangolin owns public ingress, and TLS
routing is unresolved. The stack is not ready for migration. The database and
storage acceptance gates still require fresh migrations, RLS, media,
backup/restore and restart-persistence checks.

See [Coolify operations](../../docs/05-operations/coolify.md) and
[upstream pin and local differences](UPSTREAM.md).
