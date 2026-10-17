# Dashboard 2.0 — progress and blockers (resume here)

Last updated 2026-10-17 (fourth session: English shop, polish, dashboard review). Update this file at the
end of every session. Earlier sessions' detail is in git history and the linked documents.

## State at a glance

| Item | State | Evidence |
|---|---|---|
| Source of truth | Worktree `C:/Users/lrano/Documents/Codex/2026-10-16/i-w/work/nextx-dashboard-2.0`, branch `nextx-dashboard-2.0`. `D:/Nextly` (upstream) and `D:/Next-X-Dashboard` (old `main`) are untouched. | `git worktree list` |
| GitHub `origin/nextx-dashboard-2.0` | Run `git log origin/nextx-dashboard-2.0 -1` for the pushed SHA; the owner deploys that full SHA. | |
| Staging | **Still an older build.** Nothing from the last three sessions has been observed there. The owner runs `deploy/vps/deploy-pinned.sh` at an exact SHA. | |
| Design | **Rustig** (owner's choice), implemented. `docs/03-design/design-system.md`, `docs/design-review/CREATIVE_DIRECTION.md` §10. | |
| Public language | **English throughout** (owner decision 2026-10-17). `docs/NEXTX_ENGLISH_CONTENT.md`. | guard tests below |

## Checks run this session (local, against the disposable rehearsal database)

| Check | Result | Baseline before |
|---|---|---|
| Biome | clean | clean |
| TypeScript | clean | clean |
| Unit tests (vitest) | 313 of 313 | 237 |
| Browser, storefront (`store-local`) | 15 of 15 | 15 (13 + 2) |
| Browser, accessibility (`store-a11y`) | 21 of 21 (new) | – |
| Browser, dashboard workflows (`dashboard-local`) | 5 of 5 (new; writes data, see below) | – |
| Production build (`next build`, placeholder self-hosted env) | passes | passes |

Run commands are in the header of each spec. `store-local` and `store-a11y` need
`E2E_VISUAL_FIXTURES=1`; `dashboard-local` writes rows and needs `E2E_DISPOSABLE_DB=1` on a localhost URL,
then `bash scripts/rehearsal/reset-local.sh` afterwards (stop the dev server first).

## What changed this session

- **English shop.** Every public page, the metadata, `lang="en-SR"`, the share image, the 404/410 pages, the
  two customer forms and the quote page. Prices `SRD 4,850`. WhatsApp messages are built in one module
  (`src/lib/store-messages.ts`) and asserted verbatim in tests. Stored Dutch records are shown in English at
  display time without touching the database (`src/lib/english-content.ts`). A source scan, a rendered-page
  scan and a records audit keep Dutch out (`tests/unit/storefront-english.test.ts`, "English throughout" in
  `store-local`, `scripts/audit/storefront-language.ts`).
- **Rustig polish.** Card prices align at the card foot; the product photo opens in a dialog; the quote
  toggle looks like a control; tap targets are at least 40 px; the cart line no longer crushes the product
  name on a phone; the cart reserves its height so it no longer shifts (CLS 0.24 to 0).
- **Search.** `%` and `_` in a query are escaped (`src/lib/like.ts`); a storefront title override is searchable.
- **Structured data.** Product JSON-LD has absolute URLs and a `url`; the Dutch placeholder variant name no
  longer leaks into it; the meta description falls back to the first paragraph of the English copy.
- **Dashboard.** All 32 staff pages loaded at 1440 and 390 px with no console errors and no horizontal
  overflow, and were looked at (contact sheets, not committed). Fixed: hydration mismatches in the new-product
  and new-purchase-order forms (random ids), the dev-only instant-navigation errors on every list page
  (`instant = false` per page, `await connection()` on Overview), Bundles and Commissions overflowing at
  390 px (responsive grids now have a base single column), orange "outline" buttons (now neutral), search
  placeholders truncated on phones, the Storefronts list showing `/audio`. New: owner-only **Activity log**
  (`/activity`, read-only, filter and search, shows recorded changes).
- **Performance (lab).** Production build, Chromium, 390 px, 4x CPU slowdown, Fast 4G
  (`scripts/perf/lab-vitals.mjs`), median of 3: LCP 0.7 s home, 0.7 s shop, 1.0 s product, 1.4 s cart; CLS 0
  on all four; about 225 KB of JavaScript transferred per page; 190 KB of images on the shop. One lab machine,
  not field data. INP is only a proxy: scripted taps under the 4x slowdown took 40 to 144 ms (switch, sort,
  category chip, closing a sheet) and 128 to 296 ms for **opening the Filters sheet**, the one interaction
  above the 200 ms target in the lab. Watch it in real-user data before changing anything. No field data exists yet.

## Owner actions and open decisions

1. **Deploy to staging.** Run `deploy/vps/deploy-pinned.sh` with the full SHA below and your own sudo
   password. Then re-run the redirect table and the storefront checklist on staging.
2. **Apply the English text to the records** so the display fallbacks can be deleted: product titles
   (storefront title override), Settings text, the KZ AS16 Pro X description and specifications
   (`docs/NEXTX_ENGLISH_CONTENT.md`). Also rename the price list "Publiek SRD" (staff-visible, Dutch).
3. **Photography.** All 15 products have exactly one photograph, 500 to 1,500 px square. Weakest: KZ Vader
   (500 px), KZ EDX Pro and EDX Pro X (640 px), ESSAGER 1 m and 2 m (720 px). Several look like marketplace
   images; confirm you hold the rights, then reshoot on one background at 1,600 px or more. No second angle
   exists for any product.
4. **Pickup and contact details.** Settings has a placeholder WhatsApp number locally and no address or
   hours. The shop shows only what is configured. Pickup text contradicted itself in the old data
   (Paramaribo vs Commewijne): confirm one answer.
5. Watches: keep retired or plan a relaunch. Sellers log in? Month-end lock, bill inbox, budgets
   (parity matrix rows 17, 21, 22, 23). The 80 migration worksheet findings are untouched.

## Not done / not verified (do not claim)

- **Staging and production** have not been tested with any of this. Real-device testing (phone, WhatsApp
  hand-off, no-WhatsApp fallback) was **not** done; only emulated 390 px browsers.
- **No screen-reader session.** Automated checks cover names, focus, dialogs, tap size, contrast and
  reduced motion. Contrast is computed per text run and the checker has a self-test.
- **Dashboard:** pages were reviewed on mostly empty data (the rehearsal database has no sales history);
  data-heavy layouts (long tables, many rows) are unreviewed. Forms covered by a workflow test: record a sale,
  oversell policy, log an expense. Not exercised: product create/edit, purchase order receive, order
  confirm/fulfil, customer edit, payments, settings saves. Permissions for non-owner roles were not tested
  (the local auth hook signs in as an owner); the Activity log's owner gate is by inspection only.
- **Parity-matrix gaps still open:** stock transfers between locations (needs a schema decision), finance
  exception review, branch management, seller workflows, month-end close, supplier bill inbox.
- **Financial reconciliation reruns, backup/restore, email delivery, role tests** remain readiness
  requirements and were not touched.
- The public JSON API (`/api/v1/storefront/*`) returns stored text untranslated.
- Bundles are not shown anywhere (none exist), so the "Bundles" wording is untested on real data.

## How to run it locally (no Docker)

```bash
# rehearsal PostgreSQL 17 on 127.0.0.1:55432 (see scripts/rehearsal/rehearsal.ps1); .env.local points
# DATABASE_URL at it and sets NEXTLY_LOCAL_REHEARSAL=1 + NEXTLY_LOCAL_REHEARSAL_AUTH_USER_ID
bash scripts/rehearsal/reset-local.sh      # drop, migrate, load the 15-product fixture and the review owner
pnpm dev
E2E_VISUAL_FIXTURES=1 E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=public store-local store-a11y
MSYS_NO_PATHCONV=1 node scripts/design-review/shoot.mjs <label> http://localhost:3000 /,/shop
```

Production-build checks need a placeholder self-hosted environment:
`NEXTLY_DATABASE_MODE=self-hosted NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.test
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x NEXT_PUBLIC_APP_URL=https://nextx.example.test pnpm build`, then
`pnpm exec next start -p 3100` and `node scripts/perf/lab-vitals.mjs http://localhost:3100 /,/shop`.

`visual-seed.sql` is synthetic and only for the disposable cluster. Never run it elsewhere.
