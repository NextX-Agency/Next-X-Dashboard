# Dashboard 2.0 — progress and blockers (resume here)

Last updated 2026-10-17. Update this file at the end of every session.

## Where things are

| Item | State | Evidence |
|---|---|---|
| Source of truth | Worktree `C:/Users/lrano/Documents/Codex/2026-10-16/i-w/work/nextx-dashboard-2.0`, branch `nextx-dashboard-2.0`. `D:/Nextly` is the upstream starting point and `D:/Next-X-Dashboard` is the old `main` (untouched). | `git worktree list` |
| Local HEAD | 85e04b9 plus the docs commit(s) after it | `git log` |
| GitHub `origin/nextx-dashboard-2.0` | 8899c82. Pushed to ee0e409 on 2026-10-17 with owner approval (fast-forward, no force). | `git ls-remote` |
| Staging build | **Not 85e04b9.** Rendered `/audio` still has strings removed in 85e04b9. Exact deployed commit unknown. | Browser check 2026-10-17 |
| Typecheck / unit tests | `tsc` clean, 232 of 232 tests pass | Run 2026-10-17 |
| Lint / production build / e2e | Not re-run this session | |

## Blockers (need the owner)

1. **Staging deploy.** `deploy/vps/deploy-pinned.sh` must run as root on the VPS, and refuses to run unless
   `~/nextx` is checked out at the exact commit. The commits are now on GitHub, so that needs only the owner entering the sudo password in their
   own terminal. The old terminal tab `c6` no longer exists. No VPS username is recorded in the repo, so
   no SSH was attempted beyond a single key-auth probe, which was refused (tried with the local Windows username, which is probably not the VPS account).
2. **Authenticated testing.** No staging login or role sessions are available, so no role testing, no
   dashboard browser pass, and no workflow tests against real screens have been done.
3. **Local database.** Docker Desktop is not running here, so the rehearsal database
   (`pnpm db:rehearsal:*`) cannot be started. Start Docker Desktop to unblock migrations, RLS, constraint
   and concurrency runs.

## Not verified (do not claim)

Backups and restore, email delivery, role permissions, reconciliation against the live source, any
dashboard workflow in a browser, the cutover plan's rehearsal.

## Owner decisions still open

- Keep three branches, or one pickup point? Pickup text currently contradicts itself (Paramaribo vs Commewijne).
- Do sellers log in? Is month-end period locking wanted at day one? Bill inbox? Budgets and goals?
- Currency label for SRD prices (`SRD` is recommended: `$` is ambiguous next to USD).
- The 80 worksheet findings: see `migration-reports/` and `NEXTX_DASHBOARD_2_0_AUDIT.md`.
- Soft 404s: unknown product URLs return 200 + noindex. Not yet investigated.

## Next actions

1. Owner approves push, and runs the pinned deploy with sudo, or tells me another route.
2. Re-run the storefront browser checklist on staging once the label matches.
3. Build the owner-only activity log page (read-only), then stock transfers.
