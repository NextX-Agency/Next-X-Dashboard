# Upstream pin and local differences

The Supabase service configuration and initial database/storage files are
derived from the official Supabase repository's
[`self-hosted/v0.8.2/docker`](https://github.com/supabase/supabase/tree/self-hosted/v0.8.2/docker)
release. The checked-out source commit was
`564eab8ad7840b13324f68b1bfac074ef8d51c21`. The upstream release uses
`supabase/postgres:17.6.1.136`; the full image pins are in the vendored
[`versions.md`](versions.md). The upstream code is Apache-2.0; see
[`UPSTREAM-LICENSE.txt`](UPSTREAM-LICENSE.txt).

Local changes in `docker-compose.yml`:

- Names the default project `nextx-staging` and supports separate project and
  Realtime tenant names.
- Binds API gateway, Supavisor and Nextly host ports to `127.0.0.1` only. The
  API host port defaults to 18000 to avoid Coolify's existing 8000 listener;
  database access remains private to the Compose network.
- Stores Postgres data, Storage objects, and Supabase runtime caches in named
  volumes with explicit project-scoped names.
- Adds the Nextly container to the same private Compose network, using
  Supavisor for runtime connections and direct Postgres for migrations.
- Removes public webhook secret examples from comments and blanks
  credential-like values in `.env.example`.
- Changes the pinned key helpers to refuse secret-output mode; with
  `--update-env` they write generated values to the ignored local `.env` only.

The following upstream files are intentionally not included: reset helpers,
upgrade automation, optional external S3/analytics/proxy overrides, and
upstream demo JWT credentials. Review changes from a future Supabase release
against the new release's changelog before updating this pinned copy. Never
replace the pins with `latest`.
