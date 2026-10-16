# NextX Dashboard 2.0 — current-state audit, 16 October 2026

Evidence gathered this session. Anything marked **UNVERIFIED** could not be checked and
must not be treated as passing.

## Source control (verified)

| Location | Branch | State |
|---|---|---|
| `D:/Nextly` | `main` @ `66d2bc1` (origin `LeoRanoe/nextly`) | 246 uncommitted paths, preserved untouched |
| `D:/Next-X-Dashboard` | `main` @ `28a4d26` (origin `NextX-Agency/Next-X-Dashboard`) | clean, untouched |
| worktree `nextx-dashboard-2.0` | `c344860`, equal to `origin/nextx-dashboard-2.0` | clean |

The branch matches the `D:/Nextly` working tree. Differences found:
`api/blob/upload` (deleted in Nextly, absent on the branch), `src/server/exports` (empty
directory), and a trailing blank line in migrations `0031` and `0039` (whitespace only).

## Local verification on `c344860` (verified)

- `tsc --noEmit`: exit 0
- `biome check .`: exit 0, 353 files
- `vitest run`: 30 files, 215 tests passed
- `next build`: **not re-run this session**
- Authenticated browser journeys, RLS, constraints, concurrency, restore: **UNVERIFIED**

## Public and staging endpoints (verified by HTTP, 16 Oct 2026)

- `https://www.shop-nextx.com/` returns 200 (legacy site still live).
- `https://nextx.nextxagency.com/audio` returns 200. `/` and `/watches` return 307 to `/audio`.
- Staging `<title>` is `NEXT X Audio · Nextly`. The branch root layout template is
  `%s · NextX Dashboard 2.0`, so **staging is not running the branch tip**. The deployed
  commit or image digest is still unknown (see below).
- `https://nextx-api.nextxagency.com/` returns 401 without a key (expected).

## VPS (verified by `scripts/ops/vps-readonly-audit.sh`, run 16 Oct 2026 22:58 UTC)

Host `vmi3600025`: 193 GB disk 17% used, 11 GiB RAM with about 6 GiB available.

- **Containers:** all 12 NextX Supabase containers and `nextx-web-1` were `healthy`, up 6 hours.
  Coolify 4.4.6 was healthy, up 3 days. The box is **shared**: it also runs Traefik, Pangolin and
  Gerbil, a Directus CMS, a Chatwoot stack (`nextx-staging-*`), and a Coolify railpack builder.
  Resource headroom must account for those.
- **Deployed web release:** container `nextx-web-1`, image `nextx-web` (compose-built on the VPS,
  no registry tag), image ID `sha256:b708d5782ee2fc615907bb05f974bd23746fa02b039257aa7886884f6e4e01d8`,
  built `2026-10-16T18:52:15+02:00`, **Next.js 16.3.4**, `.next/BUILD_ID` `0Eq49lt4xXgcI7FdGE8u9`.
  It was built from the VPS-local Git repo `/home/lranoesendjojo/nextx` (branch `main`, **no remote**,
  clean working tree). Commits there: `48ea181` snapshot 18:31, `26beaa4` 18:46, `de7c5df` 18:47,
  `c4c9f56` 18:53, `9f2eb0b` 19:14 (all +02:00). The image predates `c4c9f56`, so it was built
  from **`de7c5df`** (inferred from timestamps; the image has no commit label).
  That source still has root title `'Nextly'`, which explains the staging title. The Coolify app list
  contains only an unrelated landing page; **NextX web is not managed by Coolify**, so a Git push
  cannot change it (good), but the deploy path is a manual compose build on the VPS.
- **VPS-only commits are not on GitHub.** Compared with the pushed branch baseline `c344860`: deploy
  scripts are byte-identical; `transform.ts` differs only because the VPS lacks the branch's
  audio-only rules (watch storefront `inactive`, products hidden). So the branch contains
  everything the VPS has, plus those rules.
- **Target database (staging, direct query):** 47 migrations applied. Rows: products 34,
  variants 34, wallets 8, locations 4, bundles 5, price lists 3, storefronts 3, sellers 3,
  legacy_store_settings 34. **sales 0, sale_items 0, sale_payments 0, sale_refunds 0,
  ledger_entries 0, customers 0, expenses 0, commissions 0, members 0, fx_rates 0,
  inventory_movements 0.** The historical import is **not** present, and no staff members exist.
- **Watch storefront is active.** Storefronts: `NEXT X` active, `NEXT X Audio` active,
  `NEXT X Watches` **active**. Black-box probes of the old staging build found no watch
  product reachable (`/watches*` redirects, product API returns an empty list), but the flag
  must be set inactive by a re-import of the branch code or an approved SQL update.
- **Health endpoint:** `/api/health` returns `{"ok":true,"status":"ready"}` with environment,
  database and migrations checks true.
- **Ports:** Postgres is bound to `127.0.0.1` only (5433, 15432), as it should be. Publicly bound:
  22, 80, 443, 3000 (Coolify dashboard), 8000 (Supabase API gateway), 8055 (Directus),
  6001 and 6002 (Coolify realtime). Closing 3000, 6001/6002 and 8055 to the internet (or
  restricting by IP) should be decided before go-live.
- **Backups:** `/var/backups/nextx` holds two root-only dumps, `nextx-pre-import-20261016T165240Z.dump`
  (352 KB) and `...T165518Z.dump` (358 KB), taken before an import attempt that left no sales or
  ledger rows. Their restore has **not** been tested. The only cron backup is
  `nextx-assist-staging-backup` (Chatwoot stack, 03:17 daily). **No scheduled backup of the NextX
  Supabase database and no offsite or encrypted copy exists.**
- **Resources:** all containers idle, `nextx-web-1` 151 MiB; the shared box has headroom
  (about 6 GiB available).

Still **UNVERIFIED**: restore of the pre-import dumps, why the 16:52 import left no rows,
media (Storage) contents and backup, TLS and certificate details, cron jobs inside the app,
email delivery, Supabase auth user list, offsite backup.

## Open items

1. Decide how staging gets the branch: a pinned-commit build on the VPS (see runbook TBD).
2. Set the watch storefront inactive and its products hidden (re-import or approved SQL).
3. Find out why the 16:52 import wrote no sales rows before running it again.
4. Fresh read-only legacy snapshot, backups, and restore drill before any import.
5. Owner decisions for the 77 warnings and the 30 archived reservations.
