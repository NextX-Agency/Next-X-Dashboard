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

## VPS (partially verified)

SSH with the existing ed25519 key works. Host `vmi3600025`, up 24 days, disk 17% used,
RAM 5.6 of 11 GiB used. The account has no `docker` group access and `sudo` needs a
password. Therefore these are **UNVERIFIED**: container list and health, image digest and
release, Coolify config, target DB counts, watch-storefront flag, backups, cron, TLS
details, logs.

Listening ports seen: public 22, 80, 443, 3000, 6001, 6002, 8000, 8055. Ports 3000, 8000,
8055 and 6001/6002 are bound to all interfaces; whether each is firewalled is not yet
checked. Confirm that Postgres (5433, 15432) stays on 127.0.0.1 only, as observed.

## Open items

1. Privileged read access on the VPS (docker group or scoped sudo) to identify the
   deployed image and query the target database.
2. Target DB counts (products, wallets, sales, ledger) must be re-queried; the earlier
   34/8/0/0 snapshot is historical.
3. Watch storefront must be checked in the target DB; it was active at the earlier audit.
4. Fresh read-only legacy snapshot, backups, and restore drill before any import.
5. Owner decisions for the 77 warnings and the 30 archived reservations.
