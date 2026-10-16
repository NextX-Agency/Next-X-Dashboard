# NextX Dashboard 2.0

NextX's self-hosted operations dashboard and audio storefront, derived from the Nextly codebase. The legacy Next-X-Dashboard repository's main branch remains the historical source.

## Current status

This branch is a migration baseline for review and staging. It does not indicate that historical data has been imported or that production traffic has moved. Watches are retained for staff history but the new public storefront is audio only.

Read [the dated audit](docs/NEXTX_DASHBOARD_2_0_AUDIT.md) and [the handoff prompt](docs/NEXTX_DASHBOARD_2_0_HANDOFF.md) before continuing. The migration scripts and older runbooks live in scripts/migrate-nextx and docs/.

## Local checks

Install dependencies with pnpm, then run:

- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build with a self-hosted staging build environment

Production builds require the HTTPS self-hosted Supabase API URL, public app URL and a publishable key. Keep real credentials in the deployment environment, outside Git.
