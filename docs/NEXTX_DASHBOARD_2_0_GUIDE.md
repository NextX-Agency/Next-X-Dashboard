# NextX Dashboard 2.0: the complete guide

Written 23 Oct 2026 for the owner, staff and any developer or agent who picks this up. If this file disagrees
with the code, the code is right and this file is a bug. Dated session records (what was tested, what broke) live
in the other `docs/NEXTX_*` files; this guide is the stable manual and points to them.

Contents: 1 What it is · 2 Where everything lives · 3 Stack · 4 Setup on Windows · 5 Environment variables ·
6 Commands · 7 Repository map · 8 How it works · 9 Brand and design rules · 10 What each dashboard area does ·
11 Testing · 12 The local rehearsal database · 13 Deploying · 14 Production gates · 15 Release history ·
16 Known issues and owner decisions · 17 Troubleshooting · 18 Working agreements · 19 Document index.

---

## 1. What it is

One Next.js application with two faces:

| Face | URL (local) | Who | What |
|---|---|---|---|
| **Shop** | `/`, `/shop`, `/products/<slug>`, `/cart`, `/faq`, `/blog`, `/testimonials` | Customers | English, prices in SRD, search and filters, cart, orders sent through WhatsApp. No online payment. Pickup only, no delivery (from settings). |
| **Dashboard** | `/dashboard` and the pages under it | Owner, staff, viewer | Record sales, orders, inventory, purchasing, suppliers, expenses, wallets, finance, reports, shop settings, activity log. |

It replaces the old NextX app (`shop-nextx.com`, Dutch). It was derived from the Nextly codebase and carries the
old data through a guarded, read-only-source migration. **Today it is a release candidate**: staging runs an older
build, production still runs the old app (section 14).

Business facts it shows come from Settings, never from code: WhatsApp number, pickup places, payment methods,
announcement, opening hours. A line that has not been entered is not displayed.

## 2. Where everything lives

| What | Where |
|---|---|
| **Working copy (this folder)** | `D:\NextX-Dashboard-2.0` (independent clone, branch `nextx-dashboard-2.0`) |
| Remote | https://github.com/NextX-Agency/Next-X-Dashboard, branch `nextx-dashboard-2.0` |
| Earlier worktree (same branch, same history) | `C:\Users\lrano\Documents\Codex\2026-10-16\i-w\work\nextx-dashboard-2.0`. Safe to ignore. Remove with `git worktree remove` from `D:\Next-X-Dashboard` only after you no longer need its local database (`.local-rehearsal`) or `.env.local`. |
| Old app, historical (`main`) | `D:\Next-X-Dashboard`. Do not edit. |
| Upstream (Nextly) | `D:\Nextly`. Untouched. |
| Staging | https://nextx.nextxagency.com (API host `nextx-api.nextxagency.com`) |
| Live shop (old app) | https://www.shop-nextx.com |
| VPS paths | `~/nextx` (source checkout), `~/nextx-migration` (snapshots, `deploys.log`), `/etc/nextx` (generated secrets, root only) |
| VPS runtime | Docker Compose project `nextx`: web container `nextx-web-1` (host port 13000), self-hosted Supabase stack (API gateway on 18000), published through the existing Pangolin ingress |

Never copy `/etc/nextx`, `.env.local`, snapshots or the VPS password into Git, chat or documents.

## 3. Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript 7 · Tailwind CSS 4 · Drizzle ORM on PostgreSQL 17
(`postgres` driver) · self-hosted Supabase (Auth, Storage, API) · Zod 4 · `nuqs` (filters live in the URL) ·
Radix UI · Biome (lint and format) · Vitest (unit) · Playwright (browser). Package manager: pnpm 10.15.1, Node 20.9+.

Why these choices are in `docs/adr/` (ten decision records) and `docs/01-architecture/stack.md`.

## 4. Setup on Windows

Prerequisites: Git, Node 20.9+, pnpm 10.15.1 (`corepack enable`), PostgreSQL 17 installed at
`C:\Program Files\PostgreSQL\17\bin` (override with `PG_BIN_DIR`), and Chromium for Playwright
(`pnpm exec playwright install chromium`).

```bash
cd /d/NextX-Dashboard-2.0
pnpm install --frozen-lockfile
pnpm db:rehearsal:start                  # starts a private PostgreSQL on 127.0.0.1:55432 (data in .local-rehearsal/)
bash scripts/rehearsal/reset-local.sh    # drops and rebuilds the disposable database, loads the fixture
pnpm dev                                 # http://localhost:3000
```

This clone was set up exactly this way and verified: lint clean, typecheck clean, 376 of 376 unit tests.

Line endings: the repo has a `.gitattributes` forcing LF. Without it, Git for Windows rewrites files to CRLF and
Biome's format check fails on every file.

## 5. Environment variables

Names only. Values are never committed. For local work `.env.local` points `DATABASE_URL` at the rehearsal
database and turns on the local sign-in hook; it was copied from the earlier worktree into this folder.

| Variable | Purpose |
|---|---|
| `NEXTLY_DATABASE_MODE` | `self-hosted` for staging and production; `managed` only for an isolated dev project |
| `DATABASE_URL` | Runtime connection (self-hosted pooler on the private network; locally the rehearsal database) |
| `DIRECT_URL` | Direct PostgreSQL path for migrations and tooling |
| `NEXT_PUBLIC_SUPABASE_URL` | Self-hosted API, Auth and Storage origin (also the image allow-list). `*.supabase.co` is rejected in production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Auth key |
| `SUPABASE_SECRET_KEY` | Server-only (signed uploads, admin Auth tasks). Never a Docker build argument |
| `NEXT_PUBLIC_APP_URL` | Canonical origin for links and metadata |
| `NEXTX_STAGING_HOST` | Marks the staging host so it is not indexed |
| `CRON_SECRET` | 32+ random characters for the scheduled endpoints |
| `NEXTLY_LOCAL_REHEARSAL`, `NEXTLY_LOCAL_REHEARSAL_AUTH_USER_ID` | Local only: sign in as the review owner without a password |

More: `docs/05-operations/environments.md`.

## 6. Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on port 3000 |
| `pnpm lint` | Biome check (`pnpm format` writes fixes) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest, 376 tests |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm e2e` | Playwright (section 11) |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations (additive only; never `db:push` on shared databases) |
| `pnpm db:rehearsal:start`, `stop`, `migrate`, `seed`, `validate`, `rls`, `constraints`, `concurrency`, `run` | Local rehearsal database and its checks (section 12) |
| `pnpm migrate:nextx:inspect`, `dry-run`, `media-audit`, `run`, `validate`, `owner-review`, `readiness-fingerprint`, `snapshot` | Old-app data migration tooling (`scripts/migrate-nextx/README.md`) |

A production build needs placeholder self-hosted variables (no live database is contacted):

```bash
NEXTLY_DATABASE_MODE=self-hosted NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.test \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x NEXT_PUBLIC_APP_URL=https://nextx.example.test pnpm build
```

Stop the dev server before building, and delete the ignored `.next` folder if route types look stale.

## 7. Repository map

```
src/app/                 routes
  (store)/               the public shop: home, shop, products, cart, faq, blog, testimonials, setups
                         + its own not-found.tsx and error.tsx (customer-facing)
  (app)/                 the staff dashboard (behind sign-in): dashboard, sales, orders, items (products),
                         inventory, purchase-orders, suppliers, finance, wallets, expenses, reports, settings ...
  login, no-access, setup, auth/   sign-in flow
  d/invoice, d/quote     public, tokenised invoice and quote views
  api/                   /api/v1/storefront (public catalogue), /api/health, /api/export, /api/cron/* (recurring
                         expenses, reorder; protected by CRON_SECRET), /api/integrations/agent
  not-found.tsx          root 404, written for customers
src/components/
  store/                 shop UI (cards, filters, gallery, cart, header, footer)
  ui/ patterns/ shell/   dashboard building blocks, sidebar, top bar
  forms/                 dashboard forms and the visual product picker
src/lib/                 pure rules, unit-tested: money, price-range, search-query, line-price, order-state,
                         home-merchandising, store-cart, whatsapp, route-access, language-audit ...
src/server/
  db/                    Drizzle schema and migrations
  queries/               read paths (the public ones never select a cost figure)
  actions/               write paths (server actions, authorisation checked here)
  services/              posting (ledger), reservations, storefront, rates, notifications
src/styles/tokens.css    design tokens (dashboard and .nx-store shop skin)
src/app/globals.css      Tailwind theme, component classes (.nx-btn ...)
tests/e2e/               Playwright specs
scripts/                 rehearsal (local DB), migrate-nextx, audit, perf, design-review, ops
deploy/vps/              deploy-pinned.sh, deploy-nextx.sh, migration and Pangolin override
deploy/supabase/         the pinned self-hosted Supabase stack
docs/                    all documentation (section 19)
public/                  logo, OG image, favicon, fixtures under dev-fixtures/
```

## 8. How it works

**Access.** Public paths (shop, legacy redirects, invoice and quote links) are allowed without sign-in; everything
else requires a member record matched by email (`src/lib/route-access.ts`, proxy). Roles are `owner`, `staff`,
`viewer`. A viewer cannot write; some actions are owner-only. Authorisation is enforced in server code, because
the app's database connection bypasses Row Level Security (`docs/01-architecture/security.md`).

**Money.** Every amount is an integer number of USD cents. SRD is shown through the stored exchange rate and is
always labelled "SRD". Freight, tax and card fees are allocated to the products on receipt, so cost and margin are
true. Stock and cash are append-only ledgers (`inventory_movements`, `ledger_entries`); corrections are reversing
entries, never edits (`docs/02-data/`, ADR 0001 and 0004).

**Orders.** `DRAFT → CONFIRMED → READY → COMPLETED`, with `CANCELLED` from the first three. Confirming reserves
stock atomically; completing consumes the reservation and posts the movement and the cash receipt
(`src/lib/order-state.ts`, `ARCHITECTURE.md`).

**Variants and photographs.** One image policy: every option can have its own photographs; the product page,
cards, cart line, WhatsApp message and the staff picker all follow the chosen option (`docs/NEXTX_VARIANTS_AND_IMAGES.md`).
Real products currently have one option each; the colour filters appear only when the catalogue really varies.

**Shop search and filters.** Every word must match anywhere (name, model, brand, category, features, option name,
SKU); spacing and punctuation are ignored ("zs 10" finds "ZS10"); best match first; typo suggestions come from the
shop's own words. Price filtering is variant-aware (one condition on one variant). Filters live in the URL, so Back
and Forward work and old `?price=` links still resolve.

**Public language.** English throughout, enforced by a language audit test (`src/lib/language-audit.ts`).

**Caching.** Cache Components with tags; some pages are deliberately dynamic (`docs/01-architecture/rendering-and-caching.md`).

## 9. Brand and design rules

NextX is orange and black. The shop's skin is `.nx-store` in `src/styles/tokens.css`; the dashboard shares the
orange, the warm neutral ramp and the charcoal of the logo frame.

| Role | Token / class | Value | Used for |
|---|---|---|---|
| Shop main action fill | `--nx-cta` / `bg-cta`, `text-cta-fg` | `#e8590c` fill, `#141414` text (5.15:1, AA) | `.nx-btn-primary`, Quick Add, selected category chip, active filter chips, in-stock switch, count badges |
| Shop CTA hover | `--nx-cta-hover` | `#f2691a` | hover |
| Orange as text / links / outlines | `--nx-accent` / `text-accent` | `#c2410c` (white on it 5.18:1; on the tint 4.68:1) | links, "Choose options" outline, selected option and swatch border, focus ring |
| Orange tint | `--nx-accent-muted` | `#fff1e6` | selected states, announcement bar |
| Bright logo orange | `--nx-store-bright` | `#e8590c` | hero, logo, signals. **Never behind white text (3.58:1, fails AA)** |
| Charcoal | `--nx-night` | `#141414` | type, the pickup card, overlays. Not for buttons |
| Dashboard accent | `--nx-accent` | light `#b13f06`, dark `#ff7a2e` | primary button, active nav (tint plus orange text), Record-a-sale tile, focus |

Rules: orange never replaces the semantic success, warning and error colours; chart colours are their own palette;
product photographs are never tinted; no gradients, glows or emoji in the shop; one photograph per category tile
(stacking two multiplied photographs ghosts, which was a real defect); every text colour pair must pass WCAG AA
(`store-a11y.spec.ts` checks it). Full system: `docs/03-design/design-system.md`.

## 10. What each dashboard area does

Navigation is grouped by the job being done (`src/lib/navigation.ts`). The command palette (`Ctrl/Cmd+K`) reaches
every page by name or intent.

| Group | Pages | Use it to |
|---|---|---|
| Home | Overview | See cash, stock at cost, money owed, what needs attention (negative stock, low stock, drafts, overdue credit, sales without a receipt), cash flow, margin leaders, recent activity |
| Sell | Sales, Orders, Requests | Record a sale (photo picker, exact option, stock per location), run customer orders, answer quote requests |
| Products | Products, Bundles, Price lists | Edit the catalogue, photographs, options, brand, publish to the shop |
| Stock | Inventory, Reorder advice | Stock per location, low stock, receive, count, write off; weekly buying advice |
| Buy | Suppliers, Purchase orders | Raise and receive purchases; freight lands on the goods |
| Money | Finance, Cash ledger, Wallets, Invoices, Obligations, Expenses, Recurring expenses, Commissions, Exchange rates, Reconciliation | Balances, receipts, expenses, what is owed, statement checks |
| Reports | Reports, Activity log, Owners | Period reports, who changed what, owner equity |
| Shop & settings | Storefront, Storefronts, Settings | Hero, support text, announcement, pickup places, business details, WhatsApp number, members and roles |

## 11. Testing

Unit: `pnpm test` (376). Browser: Playwright project `public` (no login) and `smoke` (needs a staging login,
writes to staging, **do not run locally**).

Playwright starts its own server on port 3100 unless `E2E_BASE_URL` is set. The usual run points at your own dev
server: `E2E_BASE_URL=http://localhost:3000`.

| Suite | Needs | Flags | Writes data |
|---|---|---|---|
| `store-local`, `store-a11y` | plain 15-product fixture | `E2E_VISUAL_FIXTURES=1` | no |
| `dashboard-local`, `purchasing-local` | plain fixture | `E2E_DISPOSABLE_DB=1` | **yes**, reset afterwards |
| `catalog-local` | variant **and** price fixture | `E2E_VARIANT_FIXTURE=1 E2E_PRICE_FIXTURE=1` | no |
| `variants-local` | variant fixture | `E2E_VARIANT_FIXTURE=1` | no |
| `filters-local` | variant fixture | `E2E_DISPOSABLE_DB=1` | inserts marked rows |

Order that works: reset database; run the plain suites; reset again; load `scripts/rehearsal/variant-fixture.sql`
and `price-fixture.sql`; run the variant suites. The plain suites count 15 products, so they fail on a database
that has the variant fixture loaded. Example:

```bash
bash scripts/rehearsal/reset-local.sh
E2E_VISUAL_FIXTURES=1 E2E_DISPOSABLE_DB=1 E2E_BASE_URL=http://localhost:3000 \
  pnpm exec playwright test --project=public store-local store-a11y dashboard-local purchasing-local
```

Last full results (22 Oct 2026, commit `f8a53ff`): plain fixture 46 of 46; variant and price fixtures 46 of 46
(plus 59 of 60 in a later combined run; the one failure was a timing race, since fixed). Test races to know: the
cart test and the sale-picker test used to act before the page or the search results had settled; both now wait.

Other tools: `scripts/design-review/shoot.mjs <label> <baseUrl> <paths> [--dark] [--fold] [--width=1440]` takes
screenshots at 390, 768 and 1440 px and reports console errors and horizontal overflow
(on Git Bash prefix with `MSYS_NO_PATHCONV=1`); `scripts/perf/lab-vitals.mjs` measures page vitals against a
production build; `scripts/audit/media-integrity.ts` checks every product photograph.

**Not proven by any test so far:** real phones, real WhatsApp hand-off, screen readers, staff and viewer roles on this
build, image upload, email delivery, and multi-option behaviour on real products (none exist yet).

## 12. The local rehearsal database

A private PostgreSQL 17 cluster inside the repo (`.local-rehearsal/`, ignored by Git) on `127.0.0.1:55432`, trust
auth, database `nextly_migration_rehearsal`. It exists so tests and screenshots never touch staging or production.

- `pnpm db:rehearsal:start` initialises and starts it (creates the `anon`, `authenticated`, `service_role` roles
  and an auth compatibility layer). `pnpm db:rehearsal:stop` stops it.
- `bash scripts/rehearsal/reset-local.sh` drops and rebuilds it: migrations, then `visual-seed.sql` (the live shop's
  15 public products, synthetic stock and a review owner). Stop the dev server first.
- `variant-fixture.sql` adds "KZ Test IEM" (Black, Silver, Purple) and "KZ Test Case" (Red, Blue);
  `price-fixture.sql` adds "KZ Duo" (Graphite 3,000, Pearl 1,500). Both are synthetic, for the disposable cluster only.
- Release-grade checks: `pnpm db:rehearsal:validate | rls | constraints | concurrency`. These were last run
  against the 46-migration import rehearsal (65/65 validation, 128/128 RLS, 17/17 constraints, 15/15 concurrency);
  they must be re-run on the final build before production.

If the shop returns HTTP 500 with `ECONNREFUSED 127.0.0.1:55432`, the database is not running: start it.

## 13. Deploying to staging (owner, on the VPS)

Staging deploys the exact commit; the script refuses a different checkout or a dirty tree and tags the running
image as `nextx-web:rollback-<time>` first. It needs `sudo`, so the owner enters credentials in a trusted terminal.
The VPS password was pasted into a chat earlier and **must be rotated before any deploy**.

```bash
# 1. on the VPS, as yourself
cd ~/nextx && git fetch origin nextx-dashboard-2.0
git checkout --detach <full-40-character-sha> && git status --porcelain     # must print nothing

# 2. read-only audit before (table counts, image id, containers; prints no secrets)
sudo bash ~/nextx/scripts/ops/vps-readonly-audit.sh | tee ~/audit-before.txt

# 3. deploy. NO snapshot argument: that would re-run the data import.
sudo bash ~/nextx/deploy/vps/deploy-pinned.sh <full-40-character-sha>

# 4. audit after: table counts must be identical; the web image id must have changed
sudo bash ~/nextx/scripts/ops/vps-readonly-audit.sh | tee ~/audit-after.txt
```

Expect: a rollback image tag, migrations "already applied", the web image rebuilt, a line appended to
`~/nextx-migration/deploys.log` with the image revision label. Then run the acceptance checklist in
`docs/NEXTX_RELEASE_2026-10-18.md` section 4 (shop, product page, cart, Record a sale, filters, media audit, staff
and viewer logins).

**Rollback:** redeploy the previous SHA (the line before it in `deploys.log`) with `deploy-pinned.sh`, or retag the
image `nextx-web:rollback-<time>`. Releases so far contain no migration, so no database step is needed. A
release that adds a migration needs its own rollback plan written first.

Do not bypass the migration or database readiness safeguards, and do not trigger another data import without a
separately tested and approved plan (`docs/NEXTX_MIGRATION_RUNBOOK.md`).

## 14. Production gates (owner side)

Production traffic moves only on the owner's explicit confirmation of the exact SHA. Four gates are open:

1. Staging passes acceptance, including a real **staff** and **viewer** login on this build.
2. The reconciliation is signed (`docs/audits/2026-10-16-reconciliation-report.md`, sign-off block blank). Open
   item: 21 confirmed sales without a ledger receipt (20 are zero-total orders derived from reservations, 1 is a
   posted sale with no payment event); the owner must accept or correct it. No balancing entries are invented.
3. The **post-import** backup is restore-tested (only the pre-import dump was).
4. The readiness report passes, so the migration rehearsal, RLS and concurrency checks are re-run on the final
   build, and the 80 owner-worksheet findings have recorded decisions.

Then follow `docs/NEXTX_PRODUCTION_CUTOVER.md` and `docs/NEXTX_URL_MIGRATION.md` (write freeze, DNS, redirects,
legacy shutdown, rollback). The cutover is a separate procedure; the staging deploy script is not a production
cutover script. Keep the old app recoverable until the new one is verified live.

## 15. Release history (this branch)

| Commit | What |
|---|---|
| `32e04a0` | Storefront redesign (18 Oct): real home page, cards with Quick Add, filter sidebar, variant-aware price, search, product page, cart; docs and QA register |
| `fc06e65` | Brand correction: NextX orange as the interactive accent in shop and dashboard; soft announcement bar; defined `text-accent-ink`; cart-test race fixed; polish record |
| `f8a53ff` | UAT pass: category-tile ghosting removed; shop buttons in the logo orange with charcoal text; customer-facing 404 and shop error page; clean titles; leftover "Nextly" and "NextX Audio" wording fixed; sale-picker test race fixed |

Detail and evidence: `docs/NEXTX_BRAND_POLISH_2026-10-18.md`, `docs/NEXTX_STOREFRONT_REDESIGN_2026-10-18.md`,
`docs/NEXTX_BROWSER_QA.md`.

## 16. Known issues and owner decisions

- **Brand is empty on real products.** The migration never maps a brand, so staging returns `brand: null` for all
  15 products; the Brand filter group is absent and `?brand=kz` returns nothing there. Decide: set brands in
  Products, or approve a one-off backfill by name prefix (KZ, ESSAGER, M-Vave). Nothing has been written.
- `businessName` defaults to `Nextly` in the database schema; the live value comes from Settings. Changing the
  default needs a migration.
- Shop settings that would improve the shop if filled in: phone number, opening hours, payment methods, address,
  hero text, announcement. A Facebook link field does not exist (needs a migration and approval).
- Photography that would help most: a second angle per product; better photos for KZ Vader (500 px), EDX Pro and
  EDX Pro X (640 px), ESSAGER 1 m and 2 m (720 px); one lifestyle photograph for the hero.
- The empty FAQ, blog and customer-experience pages are reachable by URL, `noindex`, and linked from nowhere.
- The earlier worktree and this clone each have their own local database on port 55432; run only one at a time.

## 17. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `pnpm lint` fails on every file | CRLF checkout. Make sure `.gitattributes` exists and `git config core.autocrlf false`, then `git add --renormalize .` |
| Shop returns 500, log says `ECONNREFUSED 127.0.0.1:55432` | Rehearsal database is down: `pnpm db:rehearsal:start` |
| `reset-local.sh` cannot drop the database | The dev server holds a connection: stop it first |
| Plain Playwright suites fail on product counts | Variant or price fixture is loaded: reset the database |
| Cart or picker test acts too early on a cold dev server | Page not hydrated yet; the specs now wait. Re-run once if the dev server has just compiled a route |
| Playwright starts a second server | `E2E_BASE_URL` is unset; set it to your running server |
| Git Bash turns `/shop` into `C:/Program Files/Git/shop` | Prefix the command with `MSYS_NO_PATHCONV=1` |
| Route types or build look stale | Stop the dev server, delete `.next`, rebuild |
| The round "N" button in screenshots | Next.js dev indicator. It is not in production builds |

## 18. Working agreements

- Read `AGENTS.md` first. Next.js 16 differs from older versions; read the guide in `node_modules/next/dist/docs/`.
- Do not rebuild what works. Fix defects, record them in the QA register, retest the same interaction.
- Use isolated test records for anything that writes money or stock; never on production.
- No secrets, customer data or snapshots in Git. Review diffs before every commit.
- Commit normally and push to `origin/nextx-dashboard-2.0`; record the full 40-character SHA with the release.
- At the end of every session update `docs/NEXTX_PROGRESS.md`: what changed, what was verified, what was not.
- Do not call an environment live, or the books reconciled, without evidence.

## 19. Document index

| Area | Files |
|---|---|
| Start | `README.md`, this guide, `AGENTS.md` |
| State | `docs/NEXTX_PROGRESS.md`, `docs/NEXTX_RELEASE_2026-10-18.md`, `docs/NEXTX_PRODUCTION_CUTOVER.md` |
| QA | `docs/NEXTX_BROWSER_QA.md`, `docs/audits/` (current state, reconciliation, SEO and URL inventory, media audit, owner worksheet) |
| Design | `docs/03-design/design-system.md`, `docs/design-review/` (screenshots by session), `docs/NEXTX_ENGLISH_CONTENT.md` |
| Product and data | `docs/00-product/`, `docs/02-data/`, `docs/NEXTX_VARIANTS_AND_IMAGES.md`, `docs/NEXTX_FEATURE_PARITY.md`, `docs/NEXTX_PARITY_MATRIX_2026-10-17.md` |
| Architecture and security | `ARCHITECTURE.md`, `docs/01-architecture/`, `docs/adr/` |
| Migration from the old app | `docs/NEXTX_MIGRATION.md`, `docs/NEXTX_MIGRATION_RUNBOOK.md`, `docs/NEXTX_URL_MIGRATION.md`, `docs/NEXTX_AUTH_MIGRATION.md`, `scripts/migrate-nextx/README.md` |
| Operations | `docs/05-operations/` (environments, Coolify), `deploy/vps/`, `scripts/ops/`, `docs/production-readiness.md` |
| Audit and handoff | `docs/NEXTX_DASHBOARD_2_0_AUDIT.md`, `docs/NEXTX_DASHBOARD_2_0_HANDOFF.md` |
