# Dashboard 2.0 — progress and blockers (resume here)

Last updated 2026-10-18 (sixth session: real-browser walkthrough, draft-sale and date fixes, option cues on the shop; fifth session before it: visual sale picker, option-aware shop, filters, browser QA). Update this
file at the end of every session. Earlier sessions' detail is in git history and the linked documents.

## State at a glance

| Item | State | Evidence |
|---|---|---|
| Source of truth | Worktree `C:/Users/lrano/Documents/Codex/2026-10-16/i-w/work/nextx-dashboard-2.0`, branch `nextx-dashboard-2.0`. `D:/Nextly` (upstream) and `D:/Next-X-Dashboard` (old `main`) are untouched. | `git worktree list` |
| Release candidate | Code last changed in `5448223`; later commits on the branch are documentation only. The owner deploys the **full tip SHA** (`git rev-parse origin/nextx-dashboard-2.0`). No migration, no dependency change and no deploy-script change in this session. | `docs/NEXTX_RELEASE_2026-10-18.md` |
| Staging | **Still an older build** (seen 2026-10-18 in the signed-in browser: no photo or variant filters on Products, `?colour=` ignored on the shop). The owner runs `deploy/vps/deploy-pinned.sh` at the exact SHA; nothing from this session has run there. | `docs/NEXTX_BROWSER_QA.md` §1 |
| Production | Untouched. **NO-GO** (see the release document). | |
| Design | **Rustig** (owner's choice), implemented. | `docs/03-design/design-system.md` |
| Public language | **English throughout** (owner decision 2026-10-17). | `docs/NEXTX_ENGLISH_CONTENT.md` |
| Variants and photographs | One image policy, option-aware shop and pickers. | `docs/NEXTX_VARIANTS_AND_IMAGES.md` |

## Seventh session (18 Oct): storefront redesign

Full account, evidence and the list of what is **not** proven: `docs/NEXTX_STOREFRONT_REDESIGN_2026-10-18.md`.
In one paragraph: a real home page (hero of three real products on the brand orange, category tiles, two
non-repeating shelves, ordering and pickup card), header navigation, an announcement bar and a fuller footer,
all from catalogue and settings data; cards with Quick Add and Choose options; a desktop filter sidebar,
variant-aware min/max price, token search with typo suggestions, best-match sort, history-aware filters;
model and SKU, arrow keys and swipe on the product page; "what happens next" in the cart. A real P1 was found
and fixed (price filter ignored the variant). Unit 375/375; Playwright 46/46 plain and 82/82 on fixtures; lab
LCP 0.7 to 1.3 s, CLS 0. No migration, no dependency change. Not on staging yet.

## Sixth session (18 Oct): what changed

Six defects found by using the app in the browser and fixed with regression tests (detail in `docs/NEXTX_BROWSER_QA.md` §4, S-3 to V-6):

- **Drafts no longer look like profit.** The toast for a saved draft said "recorded" with a gross profit; the sales list and sale page showed a draft at cost $0.00 and 100% margin. Now "Draft saved: nothing is booked until you confirm it", and cost, gross and margin show —.
- **Editing a draft no longer moves its date back a day** (found on a database whose session time zone is UTC-3; the VPS's zone was not checked).
- **Phones:** Record a sale shows the products first; the product page's buy bar names the option being added; shop cards say "3 options".
- No migration, no dependency change, no deploy-script change. Rollback is redeploying the previous SHA.

Not done this session: staging (it needs the owner's sign-in and the owner's sudo to deploy, so the staging build is still the old one), the production gates, real devices.

## Checks run this session (local, against the disposable rehearsal database)

| Check | Result | Baseline before |
|---|---|---|
| Biome | clean (400 files) | clean |
| TypeScript | clean | clean |
| Unit tests (vitest) | 375 of 375 | 346 |
| Browser, storefront and accessibility (`store-local`, `store-a11y`) | 36 of 36 | 36 |
| Browser, dashboard workflows (`dashboard-local`, writes data) | 7 of 7 | 5 |
| Browser, buy-receive-sell (`purchasing-local`, writes data) | 1 of 1 (new) | – |
| Browser, variants (`variants-local`, needs the variant fixture) | 15 of 15 (new) | – |
| Production build (`next build`, placeholder self-hosted env) | passes | passes |
| Constraint rehearsal (visual fixture) | 16 of 17; the failure needs the imported invoice row | 17 of 17 on the sanitized import (2026-09-25) |
| RLS runtime, concurrency, migration rehearsal | **not re-run**: the importer refuses to write without the owner's readiness report | 128/128 and 15/15 (2026-09-25) |

Run commands are in the header of each spec. `store-local` and `store-a11y` need `E2E_VISUAL_FIXTURES=1`;
`dashboard-local` and `purchasing-local` write rows and need `E2E_DISPOSABLE_DB=1` on a localhost URL, then
`bash scripts/rehearsal/reset-local.sh` afterwards (stop the dev server first). `variants-local` needs the
synthetic variant fixture (`psql <rehearsal db> -f scripts/rehearsal/variant-fixture.sql`) and
`E2E_VARIANT_FIXTURE=1`; run the other suites on a database **without** that fixture (they count 15 products).

## What changed this session

- **Visual sale picker** (Record a sale and New order): photo grid or compact list; search over name, model,
  brand, SKU and option values; category and stock filters; per-option photograph, price in the sale currency and
  stock per location; quantity; "Add to sale" keeps the dialog open; keyboard flow (search, Enter, Enter adds one);
  focus returns to the opener; sale lines show the option photograph. Pricing, costing and posting are unchanged.
- **One image policy** (`src/lib/product-images.ts`) and the option-aware product page: gallery, price, stock,
  pickup, add-to-cart, WhatsApp message and cart line share one selected option, mirrored to `?variant=SKU`;
  labelled colour swatches; the cart shows the option photograph. An option with no photograph shows a
  placeholder, never another option's photograph.
- **Shop filters**: brand, colour, other options (connector and so on), price tier, availability; multi-select; a
  product matches only through one variant that satisfies every variant-level filter; documented facet counts;
  chips and Clear all; cards open on the matching option.
- **Dashboard**: filters and thumbnails for products, inventory and sales; option photo badges, per-option
  upload, "main photo of its option", variant reordering, SKU conflicts named; the sale page shows the current
  option photograph beside the sale's own snapshot.
- **Defects fixed** (full list in `docs/NEXTX_BROWSER_QA.md` §4): SRD amounts rendered with the US dollar sign
  everywhere (including the customer quote page); the SRD order default price was the USD number; pickup stock
  ignored legacy no-location movements; two stacked dialogs on empty Suppliers and Categories; unlabeled repeated
  form rows; a sale date filter off by one day (in new code).
- **Docs and tools**: `NEXTX_VARIANTS_AND_IMAGES.md`, `NEXTX_BROWSER_QA.md`, `audits/2026-10-18-media-audit.md`,
  `NEXTX_RELEASE_2026-10-18.md`, `scripts/audit/media-integrity.ts`, `scripts/rehearsal/variant-fixture.sql`.

## Owner actions and open decisions

1. **Rotate the VPS password.** It was pasted into the chat on 2026-10-18. It was not used.
2. **Deploy to staging.** On the VPS, check out the full SHA in `~/nextx` (clean tree), then
   `sudo bash ~/nextx/deploy/vps/deploy-pinned.sh <full-sha>` with your own sudo password. Then run the staging
   checklist in `docs/NEXTX_RELEASE_2026-10-18.md` §4 and send the results back.
3. **Sign the reconciliation** (`docs/audits/2026-10-16-reconciliation-report.md`, sign-off block blank) and test
   the restore of the post-import dump. Both gate production.
4. **Photography.** See `docs/audits/2026-10-18-media-audit.md`: KZ Vader (500 px), EDX Pro and EDX Pro X (640 px),
   ESSAGER 1 m and 2 m (720 px, and the same picture), plus a second angle for every product. Confirm you hold the
   rights.
5. **Options on real products.** No active product has more than one option today. To sell a colour as an option,
   edit the product, add a variant per colour with the attribute `colour`, and upload a photograph per colour.
6. Earlier open items stand: pickup text (Paramaribo or Commewijne), WhatsApp number and hours, retire or relaunch
   the watches (their colourways are separate archived products), seller logins, month-end lock, bill inbox,
   budgets, the 80 migration worksheet findings, applying the English text to the stored records.

## Not done / not verified (do not claim)

- The new code on staging or production. No real-device test, no screen reader, no staff or viewer role session.
- Image upload (needs storage); the media audit against the real `product_images` rows (needs the VPS).
- Dashboard filters for stock movements (there is no movements list); filters on purchase orders, wallets,
  invoices and the activity log beyond what they had.
- Migration rehearsal, RLS runtime and concurrency re-run, backup restore of the post-import dump, financial and
  stock reconciliation re-run, email delivery.
- Parity-matrix gaps from earlier sessions are unchanged (stock transfers, finance exception review, branches,
  seller workflows, month-end close, supplier bill inbox).
- The public JSON API (`/api/v1/storefront/*`) returns stored text untranslated; the cart quote response gained an
  `imageUrl` field per item.

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
