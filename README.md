# NextX Dashboard 2.0

NextX's self-hosted operations dashboard **and** its public shop in one Next.js application. The shop is
English, SRD-priced and orders through WhatsApp; the dashboard runs sales, stock, purchasing, money and reports.

> **Start with [docs/NEXTX_DASHBOARD_2_0_GUIDE.md](docs/NEXTX_DASHBOARD_2_0_GUIDE.md).** It is the complete
> manual: where everything lives, how to run it, how it is built, how to test it, how to deploy it, what is
> proven and what is not.

## Where this lives

| What | Where |
|---|---|
| **This folder (working copy)** | `D:\NextX-Dashboard-2.0` |
| GitHub | `NextX-Agency/Next-X-Dashboard`, branch `nextx-dashboard-2.0` |
| Staging (new build) | https://nextx.nextxagency.com |
| Live shop today (old app) | https://www.shop-nextx.com |
| Old dashboard (historical, do not edit) | `D:\Next-X-Dashboard` (branch `main`) |
| Upstream codebase this was derived from | `D:\Nextly` |

## Status (23 Oct 2026)

- Code on the branch is complete, tested locally, and pushed. The last verified commit is recorded in
  [docs/NEXTX_PROGRESS.md](docs/NEXTX_PROGRESS.md).
- **Staging:** the deploy needs the owner's sudo on the VPS. **Production: NO-GO** until four owner-side gates
  close ([docs/NEXTX_RELEASE_2026-10-18.md](docs/NEXTX_RELEASE_2026-10-18.md), section 5). Nothing here has moved
  production traffic.

## Quick start (Windows)

Needs Node 20.9+ (24 is used), pnpm 10.15.1 and PostgreSQL 17 at `C:\Program Files\PostgreSQL\17\bin`.

```bash
pnpm install --frozen-lockfile
pnpm db:rehearsal:start                 # local throwaway PostgreSQL on 127.0.0.1:55432
bash scripts/rehearsal/reset-local.sh   # migrate, then load the 15-product fixture and a review owner
pnpm dev                                # http://localhost:3000  (shop at /, staff app at /dashboard)
```

`.env.local` is not in Git. Create it from `.env.example` (guide, section 5). The local rehearsal database signs
the browser in as a review owner; there is no password.

## Daily commands

| Command | Does |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Biome, TypeScript, unit tests (376) |
| `pnpm build` | Production build (needs the self-hosted placeholder env, guide section 6) |
| `pnpm e2e` | Playwright; guide section 11 says which suites need which database state |
| `bash scripts/rehearsal/reset-local.sh` | Rebuild the disposable database (stop the dev server first) |

## Rules that matter

- Real credentials never go in Git. `.env.local`, VPS secrets (`/etc/nextx`) and data snapshots stay out.
- Never point write-tests at staging or production. The write suites refuse without `E2E_DISPOSABLE_DB=1`.
- Money is an integer number of USD cents. Stock and cash are append-only ledgers.
- NextX orange is the interactive colour; charcoal is type and structure (guide, section 9).
- Next.js here is v16 with breaking changes: read `node_modules/next/dist/docs/` before changing framework code
  ([AGENTS.md](AGENTS.md)).

## Documentation map

| Need | Read |
|---|---|
| Everything, in order | [docs/NEXTX_DASHBOARD_2_0_GUIDE.md](docs/NEXTX_DASHBOARD_2_0_GUIDE.md) |
| Current state, blockers, how to resume | [docs/NEXTX_PROGRESS.md](docs/NEXTX_PROGRESS.md) |
| Release, GO / NO-GO, rollback | [docs/NEXTX_RELEASE_2026-10-18.md](docs/NEXTX_RELEASE_2026-10-18.md) |
| Production cutover checklist | [docs/NEXTX_PRODUCTION_CUTOVER.md](docs/NEXTX_PRODUCTION_CUTOVER.md) |
| Browser QA and defect register | [docs/NEXTX_BROWSER_QA.md](docs/NEXTX_BROWSER_QA.md) |
| Storefront redesign and brand polish | [redesign](docs/NEXTX_STOREFRONT_REDESIGN_2026-10-18.md), [brand polish](docs/NEXTX_BRAND_POLISH_2026-10-18.md) |
| Design system | [docs/03-design/design-system.md](docs/03-design/design-system.md) |
| Architecture, data, security | [ARCHITECTURE.md](ARCHITECTURE.md), [docs/README.md](docs/README.md) |
| Data migration from the old app | [docs/NEXTX_MIGRATION_RUNBOOK.md](docs/NEXTX_MIGRATION_RUNBOOK.md) |
