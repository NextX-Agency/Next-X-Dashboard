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
- **Deployed web release:** container `nextx-web-1`, image `nextx-web` (a locally built image, not a
  registry tag), image ID `sha256:b708d5782ee2fc615907bb05f974bd23746fa02b039257aa7886884f6e4e01d8`,
  container created `2026-10-16T16:52:26Z`, **Next.js 16.3.4**. The image carries no commit label,
  so the source commit is **still unidentified**. Earlier audits saw 16.2.11, so the app was rebuilt
  after them, yet staging still serves the pre-brand output (see above). The branch was not what got built.
- **Health endpoint:** `/api/health` returns `{"ok":true,"status":"ready"}` with environment,
  database and migrations checks true.
- **Ports:** Postgres is bound to `127.0.0.1` only (5433, 15432), as it should be. Publicly bound:
  22, 80, 443, 3000 (Coolify dashboard), 8000 (Supabase API gateway), 8055 (Directus),
  6001 and 6002 (Coolify realtime). Closing 3000, 6001/6002 and 8055 to the internet (or
  restricting by IP) should be decided before go-live.
- **Backups:** `/var/backups/nextx` exists (root-only, modified 16 Oct 18:55) but its contents were
  not listed. The only cron backup entry is `nextx-assist-staging-backup`; **no scheduled backup of the
  NextX Supabase database was found, and no offsite or encrypted copy was seen.**

Still **UNVERIFIED** (the second audit run failed because `sudo` rejected the password):
target database row counts, the `storefronts` status flags, the Coolify record of the source
commit, backup directory contents, resource use per container.

## Open items

1. Re-run the VPS audit with a correct `sudo` password to get target DB counts, storefront
   flags, the Coolify source commit and the backup contents.
2. Target DB counts (products, wallets, sales, ledger) must be re-queried; the earlier
   34/8/0/0 snapshot is historical.
3. Watch storefront must be checked in the target DB; it was active at the earlier audit.
4. Fresh read-only legacy snapshot, backups, and restore drill before any import.
5. Owner decisions for the 77 warnings and the 30 archived reservations.
