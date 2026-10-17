# Dashboard 2.0 — progress and blockers (resume here)

## DESIGN: DECIDED AND IMPLEMENTED (third session, 2026-10-17)

Owner chose **concept C "Rustig"** and said the current product photos are theirs to use (reshoot later).
It is built on the real shop and dashboard code: `/`, `/shop`, `/products/[slug]`, `/setups/[slug]`,
`/cart`, the 8-group dashboard navigation (Sales added), Home with action tiles and "Needs attention",
black primary buttons, Manrope. Design system documented in `docs/03-design/design-system.md`; decision
record in `docs/design-review/CREATIVE_DIRECTION.md` section 10. Local-only previews of the other two
concepts stay under `/preview`. Captures are local (gitignored: they contain the shop's photographs).

Checks run: Biome, typecheck, 237 unit tests, production build, 15 browser tests against the real
15-product catalogue in the local rehearsal DB (`scripts/rehearsal/visual-seed.sql`), keyboard focus walk.
**Not on staging.** Remaining: dashboard pages beyond Home, Products, Sales and Record a sale were
re-skinned through tokens but not each reviewed; the shop's category names are English data; photography.


Last updated 2026-10-17 (second session). Update this file at the end of every session.

## Where things are

| Item | State | Evidence |
|---|---|---|
| Source of truth | Worktree `C:/Users/lrano/Documents/Codex/2026-10-16/i-w/work/nextx-dashboard-2.0`, branch `nextx-dashboard-2.0`. `D:/Nextly` is the upstream starting point and `D:/Next-X-Dashboard` is the old `main` (both untouched). | `git worktree list` |
| GitHub `origin/nextx-dashboard-2.0` | `e4722d7` (pushed 2026-10-17 with owner approval, fast-forward). Includes the design reset below. | `git status -sb` |
| Staging build | **Not 85e04b9 and not this work.** Still an older build that renders removed copy. Nothing in this session has been observed on staging. | Browser check 2026-10-17 |
| Typecheck, Biome, unit tests | Clean; 234 of 234 tests | Run 2026-10-17 |
| Production build | Passes with synthetic self-hosted env (non-secret placeholders) | `pnpm build` |
| Local browser tests | `tests/e2e/store-local.spec.ts`: 13 of 13 pass, plus 2 of 2 in `public.spec.ts`, against the synthetic fixture | Playwright, 2026-10-17 |

## What this session changed (design reset, routing, UI fixes)

**Public URLs are now category-neutral** (`docs/NEXTX_URL_MIGRATION.md` has the full matrix):
`/` home, `/shop`, `/products/[slug]`, `/setups/[slug]`, `/cart`. The root no longer redirects to
`/audio`. Old `/audio*`, `/catalog*`, `/p/*` URLs are single-hop 308s. Retired Watches stay 410, and
the retired storefront can never be selected as the request storefront. Unknown products are a real 404.
Staff product pages moved `/products` to `/items` to free `/products/[slug]` for the public page.

**Storefront redesigned, not polished**: charcoal header and footer with the real dark logo, a first
screen built around one real product (data-driven; no slogan), category tiles only when there is a
real choice, a curated product grid, a catalogue with a filter column and mobile filter sheet, a product
page with gallery, quantity stepper, SRD price and stock, and a restyled cart. SRD is written `SRD 4.850`.

**Dashboard re-skinned and fixed**: warm neutral tokens replace the blue ramp, a charcoal navigation
rail, display-face page titles, tighter radii, orange only for primary actions. Real bugs fixed on the way:
nested `<button>` in every row-action menu (hydration failure on list pages), a stray grid cell that
crushed the product picker on Record a sale, random ids in the sale and order forms that failed
hydration, and an always-on black outline on the setup checklist.

**Design system** documented as built in `docs/03-design/design-system.md`; ADR-0008 marked superseded.
Evidence images in `docs/design-review/`.

## How to run the design review locally (no Docker needed)

Needs the native PostgreSQL 17 install. The rehearsal script had two bugs on this machine, now fixed
(`initdb` superuser was the Windows user, so `postgres` did not exist; `createdb` with a URI hangs).

```powershell
# one time: initialise, create the database, apply compat + migrations (see scripts/rehearsal/rehearsal.ps1)
pnpm db:rehearsal:migrate        # if it hangs after "DO", create the DB with psql and run drizzle-kit migrate
psql postgresql://postgres@127.0.0.1:55432/nextly_migration_rehearsal -f scripts/rehearsal/visual-seed.sql
# .env.local (gitignored) points DATABASE_URL at the rehearsal DB and sets NEXTLY_LOCAL_REHEARSAL_AUTH_USER_ID
pnpm dev
E2E_VISUAL_FIXTURES=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public store-local
```

`visual-seed.sql` is synthetic and only for that disposable cluster. Never run it elsewhere.

## Blockers (need the owner)

1. **Staging deploy.** `deploy/vps/deploy-pinned.sh` must run as root on the VPS at an exact pushed
   commit, with the owner entering the sudo password. Nothing since 8899c82 is on staging. The commits are now
   on GitHub (e4722d7); only the operator-run deploy is missing.
2. **Authenticated staging testing and role sessions** are still unavailable. Local dashboard checks
   used the project's own local-rehearsal auth hook as an owner on the disposable database only.
3. **Real product photography.** Hero and card quality depend on the real images. They are not mapped to
   self-hosted storage on staging yet (migration media gate), so the design has only been judged on fixtures.
   Downloading the live shop's images for review needs the owner's go-ahead.

## Owner decisions still open

- **Watches:** keep retired (current) or plan a relaunch. The structure now supports either.
- Keep three branches or one pickup point; pickup text still contradicts itself (Paramaribo vs Commewijne).
- Sellers log in? Month-end period lock, bill inbox, budgets and goals at day one? (parity matrix rows 17, 21, 22, 23)
- Currency label: `SRD 4.850` is implemented; confirm.
- The 80 migration worksheet findings (unchanged, untouched).
- Dashboard language: the staff app is English, the shop is Dutch. Confirm that is intended.

## Not done / not verified (do not claim)

- Dashboard pages beyond the shell, tables, Record a sale form and Overview were only spot-checked on
  empty fixture data: orders, wallets, finance, ledger, customers, purchasing, reports, settings are
  re-skinned through tokens but not individually reviewed. Dense layouts such as the inventory table
  (wide, horizontal scroll at 1440) still want a pass.
- No hover, focus or keyboard-path review; no automated accessibility audit; contrast was designed to AA, not measured.
- Financial reconciliation, backups and restore, email, role permissions: unchanged and unverified.
- Staff-facing copy was not translated and was not reviewed for the Dutch-speaking team.
- Parity-matrix gaps from the first pass (stock transfer, activity log page, month-end close) are still open.

## Next actions

1. Owner runs the pinned deploy of `e4722d7` (full SHA); then re-run the redirect table and the
   storefront checklist on staging.
2. Review the remaining dashboard pages with real migrated data after the staging import.
3. Build the owner-only activity log page, then stock transfers.
