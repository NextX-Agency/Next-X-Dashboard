# NextX → Nextly production cutover readiness

Status on 2026-09-26: **NO-GO.** This checklist records verified state and
remaining work. It does not authorize a production import, DNS change or
legacy shutdown.

Coolify staging update on 2026-09-26: after the user-authorized one-time source
transfer, a source-less Compose resource named `NextX-Self-Hosted-Staging` was
saved in the isolated `NextX-Migration-Staging/staging` environment. It contains
the reviewed PostgreSQL 17 self-hosted Supabase stack and Nextly app. A deployment
attempt pulled the pinned images and created the stack network, but the Nextly
production image build stopped because Coolify did not supply a usable
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The staging URL variables have since been
corrected to their HTTPS hosts. Coolify now shows a redacted value for the root
`SUPABASE_PUBLISHABLE_KEY`, with build-time and runtime availability enabled;
the key's validity has not yet been verified by a Coolify build. A
user-authorized deletion attempt for the locked `POSTGRES_PASSWORD` placeholder
did not remove it: after reload Coolify still listed the variable as locked
with its value masked. Both staging and checked-in Compose manifests reference
`POSTGRES_PASSWORD` 13 times without an inline default; no replacement value
was entered. The local Dockerfile
now sets non-secret self-hosted DB aliases during the build stage; a fresh local
production build passes with those aliases unresolvable. A read-only SSH check
on 2026-09-26 found Dockerfile SHA-256 `bbb04f1832e182c51acf2f3cf2a3da8d3090e969e574e7fc19ccd796c0c2e03f`
on the VPS versus `46A9C7C05AE9B073CF6E72F7561DC2916B2C4F84303BF92F165D58DA99F7B339`
locally; the builder fix has not reached Coolify.
The staging service remains `Exited`; no service is healthy and no migration
data has been imported. No Coolify domains or healthy staging runtime exist yet.

Local database verification refreshed on 2026-09-25: all 46 migrations were
applied to the isolated PostgreSQL rehearsal database; the sanitized importer
ran twice and database validation passed 65/65 checks. Runtime RLS passed
128/128 checks, constraints 17/17 and concurrency 15/15. A fresh 332,139-byte
custom-format backup at
`.local-rehearsal/backups/nextly-46-migration-20260925-1708z.dump` restored
into the new isolated `nextly_migration_restore_20260925_1708z` database with
matching counts: 46
migrations, 2 products, 3 sales, 3 sale items, 862,000 summed line-total
cents, zero null line totals, 2 payments, 3 inventory movements, 1 archived
stock transfer, 1 synthetic archived payout-run fixture, 8 ledger entries and
4 members. A dedicated archive smoke import ran twice and retained one row,
without duplicate rows or wallet activity.

On 2026-09-25, the current working tree passed lint on 362 files, typecheck,
213 unit tests and the Drizzle migration-chain check. A fresh 93-route
production build also passes with `NEXTLY_DATABASE_MODE=self-hosted`, synthetic
self-hosted HTTPS public URLs and the isolated local rehearsal database; it
does not verify a real Supabase key or Coolify runtime. The build rejects a
Supabase Cloud URL. The last Playwright run had two public tests pass and 16
authenticated/staging tests skip because no staging app, test identity or
Supabase runtime is deployed. A read-only CDN preflight downloaded and
decoded all 41 unique legacy image URLs (43 row references); it stored no
image bytes and did not write to Storage. The production-layout smoke served
all 12 checked-in NextX public assets with HTTP 200 and expected image MIME
types. These local results do not establish Coolify or live-source readiness.

A refreshed live-source dry-run completed at `2026-09-26T13:19:13.579Z` using the
legacy repository's ignored `DIRECT_URL` only in the process environment. The
source read used a repeatable-read, read-only transaction. It discovered 3,182
rows, planned 1,861 operations, and reported 73 fatal conflicts, 77 warnings
and 77 informational conflicts. The PII-minimized owner worksheet contains
150 non-informational findings with owner decision/evidence fields blank
(`migration-reports/nextx-live-owner-review-2026-09-26-1320z.csv`). Its source
checksum is `39874258a9cdc97265d759c72be3871ee9458a2db2d2c9cf2d38cd0180fbaf7f`.
The conflict groups and identities are unchanged from the prior report.
Currency totals and expected reconciliation controls were recalculated for the
new sale and its associated rows. The count-only `site_analytics_events`
inventory is now 12,011, up 38 from the previous 11,973. The source snapshot
also added one sale, four sale lines, one wallet transaction, one
finance-ledger row and one activity row; the transform now plans 184 sales,
350 sale items, 163 sale payments and 517 ledger entries. It still refuses to duplicate completed
reservation sales: the current source snapshot has no `reservationIds` in its
finance-ledger metadata, leaving 30 completed reservations without
authoritative sale links. The 10 completion activity records also identify
none of those reservation rows. A targeted read-only check found that none of
the 10 events had parseable item-count/invoice details or entity IDs matching
an existing reservation. The other 43 fatal conflicts are unmapped media.
All 12 stock transfers now map into a restricted archive without changing the
52 opening-stock movements. The source payout-run row maps into a separate
restricted archive, with no wallet activity replayed. Offline counts match for inventory, sales,
payments and invoices. The CLI
refused migration; neither source nor destination was written. A separate
repeatable-read, read-only exact-link audit at `2026-09-25T11:52:27Z` found
2 posted expenses totaling USD 45 without a wallet-transaction FK, recognized
reference or finance-ledger source; neither had a matching unmatched debit by
wallet, currency and amount within one day. It also confirmed one posted
SRD 1,400 sale with no direct sale FK, exact reference, ledger source or
matching unmatched credit within ten minutes. The importer now flags those
records for owner review without creating payments or cash postings. Source
and destination remain untouched.

A separate read-only source-reference check confirms that all 130 legacy
commissions have existing sale and seller rows. The updated transform now maps
all 130 commissions after preserving the 51 mismatched sales and their line
amounts with explicit review flags. None of the commission links are source
orphans.

## Current blockers

- Parity work remains for the active source modules in
  [feature parity](NEXTX_FEATURE_PARITY.md): all 130 commission rows map, but
  64 legacy-paid rows have no verified payout link, alongside one partial
  receivable and unmatched historical payment/refund event shapes. The
  automated payout-split job is explicitly deferred: no active founder splits
  are configured, and the sole source run is a draft. Its source row and all
  payout settings are preserved without replaying financial activity.
  The receivable and all 34 store settings now map locally; they still need
  live reconciliation and owner review.
- The latest saved read-only live-source dry-run, generated at
  `2026-09-26T13:19:13.579Z`, plans 1,861 operations from 3,182 rows and has
  73 fatal conflicts, 77 warnings and 77 informational conflicts. The source
  connection was read from the old repository's ignored `DIRECT_URL` file and
  passed only to the CLI process; the CLI used a repeatable-read, read-only
  transaction. Conflict groups and identities match the prior report;
  currency totals and expected reconciliation controls were recalculated for
  the added source rows.
  The count-only `site_analytics_events` inventory is 12,011, up 38 from
  11,973. The snapshot adds one sale, four sale lines, one wallet transaction,
  one finance-ledger row and one activity row. No source or
  destination rows were written. Thirty completed
  reservations lack persisted reservation-to-sale references and remain
  blocked instead of generating duplicate orders. All three recurring schedules, the one
  obligation and 34 settings now map. It also maps all 5 bundle parents,
  15 component rows, 2 direct combo sale lines and the combo-stock counter
  after verifying its quantity against component-derived availability.
  All 5 public combos have 15 existing, public components with matching
  catalog types. The transform maps all 164 source sales, 330 source sale
  lines, 163 linked payments and 163 invoices. All 12 source stock transfers
  map into a restricted archive without changing the 52 opening-stock
  movements. Twenty cancelled reservations
  map as released rows against zero-value cancelled-order placeholders.
  Thirty completed reservations have no authoritative sale-line links and
  remain fatal. The report contains 183 sale operations and 346 sale-item
  operations including those placeholders. Offline reconciliation of sales,
  payments and invoices remains separate from reservation linkage and is not
  a live target comparison.
  All 6 legacy expense categories are loaded and linked by their source IDs.
  The recurring worker and owner schedule controls are implemented locally;
  the worker has not been exercised against staging.
- No staging route or offsite backup target is configured. Coolify's instance
  URL is `https://coolify.nextxagency.com`; DNS for `staging.nextxagency.com`
  and `supabase-staging.nextxagency.com` resolves to the VPS. On 2026-09-24,
  both hosts returned HTTP 404 over HTTP and HTTPS; TLS presented `TRAEFIK
  DEFAULT CERT` with an internal-only SAN, not either staging hostname. The
  Coolify server wildcard-domain field is blank and its managed proxy is
  `Exited`. Read-only terminal inspection shows the active Traefik belongs to
  the existing Pangolin Compose project, while Gerbil owns public ports 80/443.
  Starting Coolify's proxy without a planned ingress handoff would conflict
  with those bindings. The selected PostgreSQL 17/Nextly Compose draft is now
  saved in the isolated staging environment. Its first deployment attempt
  stopped at the Nextly build because the build-time publishable key was absent;
  all 12 resources remain `Exited`. The URL variables have been corrected and
  Coolify now shows a redacted root publishable-key value with build-time/runtime
  availability. A fresh local build passes using non-secret DB aliases, but the
  VPS Dockerfile SHA-256 remains `bbb04f1832e182c51acf2f3cf2a3da8d3090e969e574e7fc19ccd796c0c2e03f`
  (local SHA-256 `46A9C7C05AE9B073CF6E72F7561DC2916B2C4F84303BF92F165D58DA99F7B339`)
  and no successful Coolify build or runtime has verified the key or stack.
  Staging-only secrets and
  Auth settings are configured in Coolify, but no domains or healthy runtime
  exist. The earlier PostgreSQL 15 catalog draft
  is still stopped and is not the selected stack. No staging HTTPS, Auth
  login, media upload, cron, redeploy persistence, or offsite restore test has
  run.
- The latest dry-run has 73 fatal data issues: 43 unmapped legacy media URLs
  (39 product images plus 4 logo/hero URLs) and 30 completed reservations
  without an authoritative source sale link. The 51 sale-header/line-total mismatches now
  retain the header and exact source-currency line subtotals in
  `sale_items.line_total_cents`, mark each sale `needs_review` and produce an
  owner-review warning. Sale detail shows source subtotal, discount, recorded
  header and review reason; no adjustment is invented. All 130 commission links
  resolve. The 38 catalog USD values with sub-cent precision now round
  explicitly and are archived exactly. Warnings also include 15 refunds
  without sale references, 7 wallet opening adjustments, 2 posted expenses without wallet movements,
  1 sale without a payment event and 64 legacy-paid commissions without
  verified payout links. Every
  one of the 518 source wallet transactions has an exact finance-ledger mirror;
  the importer deduplicates each pair. The source has only been queried inside a
  read-only transaction; no live data has been imported and no staging
  destination has been touched.
- Additional read-only sale investigation found four line-less sales and 47
  multi-line mismatches; 35 of the latter have headers below line sums and 12
  above. None has a sale note, line discount reason, custom-price line or
  original-price delta. Eight are flagged for review, but their review text has
  no numeric adjustment. The legacy sales API displays current line sums while
  wallet credits match stored headers. Audit history contains only creation
  events for 44 mismatches, with no update snapshots. The importer preserves
  exact source line and header values, marks all mismatched sales for review,
  and records both totals for owner review. Existing Nextly sale lines are
  backfilled from unit price times quantity in migration 0042.
- The importer now includes a safe legacy media collection/re-encoding/upload
  path and creates `product_images` rows from its map. Twelve checked-in
  NextX public assets have been copied into Nextly `public/`; ten are
  byte-identical and two SVG files only add nonvisual accessible titles. All
  12 returned HTTP 200 from the local production-layout standalone server.
  The read-only media preflight verified that all 41 unique remote source
  images can be downloaded and decoded in the read-only preflight repeated on
  2026-09-24. No legacy product media has been
  migrated into self-hosted Storage, no
  `product_images` media map has been verified against staging, and the Vercel
  Blob image allow-list has been removed from production config.
- A local multi-item cart and WhatsApp checkout now include quantity,
  customer details, pickup location/date and an estimated order total. Before
  enabling WhatsApp, the cart refreshes public prices and storefront-scoped
  available stock; unavailable quantities block sending and cached prices stay
  hidden until the quote is ready. The cart does not reserve stock and has not
  been exercised against staging catalog data. `/audio`, `/watches` and legacy product-ID
  redirects exist locally; source content and brand presentation are not yet
  verified against staging data.
- Legacy `/catalog` and `/catalog/:id` audio links now redirect to the NextX
  audio routes. No `/shop` or `/store` redirects are configured because the
  audited legacy router has no such pages. The root restores the NextX
  Audio/Watches entry locally. Storefront-specific sitemap paths, custom-domain canonical
  origins and staging noindex behavior are implemented locally, but rendered
  host metadata and crawl policy still need staging verification.
- The self-hosted media switch is coded locally but migration 0034 has not been
  applied to self-hosted Supabase staging, and the storage bucket/upload flow has not yet
  been exercised there.
- Vercel Analytics/Speed Insights and the Vercel cron manifest are removed;
  production scheduled tasks are documented for Coolify only. The Coolify
  schedules still need deployment and runtime verification.
- The Coolify project `NextX-Migration-Staging` and its `staging` environment
  exist. On 2026-09-24 the Coolify 4.3.23 Supabase catalog entry was opened to
  inspect its deployment configuration, leaving a stopped PostgreSQL 15
  catalog draft; do not start or use it. On 2026-09-25 a separate
  `NextX-Self-Hosted-Staging` Docker Compose resource was saved using the
  reviewed Compose configuration after the authorized one-time source
  transfer. It contains 12 resources, including Nextly and the official
  Supabase `self-hosted/v0.8.2` stack with PostgreSQL `17.6.1.136`. All 12
  report `Exited`; no service was deployed or started, and no environment
  secrets or domains were configured. Its loopback-only host bindings do not
  resolve the ingress requirement. Its generated `http://…sslip.io` route is
  not an accepted TLS endpoint. The two drafts are distinct; the PostgreSQL 17
  Compose resource is the selected staging configuration.
  Coolify's managed Traefik proxy reports `Exited`. Read-only container labels
  place the active Traefik in the existing Pangolin Compose project; Gerbil
  binds public 80/443. This establishes that Pangolin owns the active ingress
  path. Starting Coolify's proxy would conflict with current public port
  bindings unless ingress is deliberately migrated. No proxy, network,
  firewall or existing app was changed.
- The exact Nextly working tree remains uncommitted on `main`. GitHub metadata
  confirms its configured `LeoRanoe/nextly` origin is public. A read-only
  preflight as authenticated account `LeoRanoe` (active org member) could not resolve
  `NextX-Agency/NextX-Suite`; the org repository listing exposed neither the
  preferred name nor `NextX-Platform`. This establishes only that neither is
  visible to this account; private-repository existence and contents remain
  unverified. Do not push this migration tree to the public origin, and do not
  create the final repository before the readiness gates pass. Coolify has a connected
  NextX-Agency GitHub provider but no staging application configured for this
  working tree. The temporary source-less Compose draft uses the authorized
  one-time source transfer; it does not provide a repeatable Git-based build
  path for future redeploys.
- Coolify lists the Den's Designs production app. Its running app/CMS services
  and the existing proxy/network stack were not changed. The NextX staging
  Compose resource is saved but stopped; there is no healthy Supabase runtime,
  verified database volume, usable HTTPS staging route or scheduled task.
  The staging environment has no shared
  variables. Coolify's Sources page shows one connected GitHub provider for
  the NextX-Agency team, but no Git-connected NextX staging app is configured
  for this working tree. Coolify API access is disabled; no API settings were
  changed.
  Coolify lists zero S3 backup destinations and its instance backup is not
  configured.
  A fresh SSH check again received Docker socket permission denied for the
  deployment account; non-interactive sudo still requires a password.
  Coolify's built-in root terminal was used for read-only inventory and
  capacity checks. The configured SSH key authenticates as the deployment
  account, but that account still cannot access Docker or use non-interactive
  sudo. A local-only SSH tunnel to Coolify's HTTP listener is active on
  `127.0.0.1:18080`; the account owner is signed in through this localhost
  origin. Staging-only Supabase, Storage/Vault/Realtime, Studio and cron
  secrets have been generated and stored as locked runtime-only Coolify values;
  staging URL/auth settings are also configured. Never put those values in
  reports or the repository. Do not enter secrets in the existing plain-HTTP
  IP-origin session. The legacy source URL was found
  locally and passed only to the read-only CLI process; no Coolify API token
  was needed or created. No offsite backup destination or credentials were
  found or generated.
- Verified VPS capacity on 2026-09-24: 6 vCPU, 11 GiB RAM, no swap, and a
  193 GB root filesystem with 181 GB free. This is a point-in-time inventory,
  not proof that the complete Coolify, Supabase and Nextly stack fits its
  runtime budget. The deployment account cannot access the Docker socket or
  use non-interactive sudo, so deployment and restart-persistence checks remain
  unavailable through the current SSH account.
- Production runtime validation now rejects Supabase Cloud database poolers
  and `*.supabase.co` API/Auth/Storage URLs. The staging code path has not yet
  been deployed to prove the guard.
- A NextX-specific Compose bundle now vendors the reviewed Supabase
  `self-hosted/v0.8.2` release (PostgreSQL `17.6.1.136`), adds the Nextly app,
  uses project-scoped persistent Postgres/Storage volumes and loopback-only
  host bindings. Compose configuration validation passed with the sanitized
  `.env.example`; no services were started. The local Docker CLI has no reachable
  Docker Desktop Linux engine, and the bundle has not been deployed. The
  upstream defaults publish host ports 5432/6543 and use 8000 for the API
  gateway; this VPS already uses 8000 for Coolify. Private database networking,
  API routing, persistent-volume restart checks, backup/restore and production
  monitoring are not yet proven.
- No offsite backup destination has been selected or tested:
  `OFFSITE_BACKUP_TARGET_REQUIRED`.
- No destination backup/restore drill, auth invitation test or source-to-target
  end-to-end reconciliation has been evidenced.

## Required gates

### Final production repository (last step only)

Do not create the production GitHub repository until every gate below is
verified PASS: `FEATURE_PARITY`, `SELF_HOSTING`, `COOLIFY_STAGING`,
`SUPABASE_RUNTIME`, `RLS`, `MEDIA`, `BACKUP_RESTORE`, `MIGRATION_DRY_RUN`,
`RECONCILIATION` and `TESTS`. The current state is **NOT READY**, so repository
creation is deferred.

| Gate | Current status | Evidence |
| --- | --- | --- |
| `FEATURE_PARITY` | NOT PASS | 5 bundles, 15 recipes, 2 direct combo sale lines, combo stock validation, 3 recurring schedules and all 130 commissions now map. Owner review of 51 flagged sale totals, 64 unverified legacy-paid commissions, receivables, settings and other operational parity remain. |
| `SELF_HOSTING` | NOT PASS | Production image configuration now requires an HTTPS NextX app URL and HTTPS self-hosted Supabase endpoint, and rejects Supabase Cloud during image builds and runtime. The full private stack is not deployed. |
| `COOLIFY_STAGING` | NOT PASS | The selected PostgreSQL 17/Nextly Compose resource is saved. Its first deployment attempt stopped at the Nextly build because the build-time publishable key was absent; current Coolify inspection confirms the root key now has a redacted value and build-time/runtime availability is enabled. The service is `Exited`. URL variables are corrected. A local 93-route build passes with non-secret self-hosted DB aliases, but the updated Dockerfile has not reached the one-time VPS source copy. No successful Coolify build or runtime verifies the key or stack. No domain or healthy stack exists. The separate PostgreSQL 15 catalog draft is not selected. Pangolin owns public ingress while Coolify's managed proxy is exited. The temporary source transfer does not give a repeatable Git-based build path. |
| `SUPABASE_RUNTIME` | NOT PASS | The selected PostgreSQL 17 Compose draft is stopped; no Supabase service, database, Auth, Storage, or health check has been exercised on staging. |
| `RLS` | NOT PASS | Local rehearsal passed 128/128 checks, including the stock-transfer and payout-run archives with forced RLS, no policies and no API-role grants, plus obligation/settings and seller/rate/commission/payout policies; staging verification is pending. |
| `MEDIA` | NOT PASS | Twelve checked-in public assets return HTTP 200 locally. A read-only preflight successfully downloaded and decoded all 41 unique source image URLs (43 legacy references). None has been copied into self-hosted Storage or mapped to destination URLs; staging delivery and media restore have not been tested. |
| `BACKUP_RESTORE` | NOT PASS | A fresh 332,139-byte custom-format backup from the 46-migration local rehearsal restored into the new isolated `nextly_migration_restore_20260925_1708z` database; source and restore counts matched for migrations, products, sales, line totals, payments, inventory movements, one archived transfer, one synthetic archived payout-run fixture, ledger and members. Coolify has zero S3 backup destinations and instance backup is unconfigured; no offsite target, VPS volume or Storage restore proof exists. |
| `MIGRATION_DRY_RUN` | NOT PASS | The latest repeatable-read, read-only report at `2026-09-26T13:19:13.579Z` plans 1,861 operations from 3,182 rows, with 73 fatal conflicts, 77 warnings and 77 informational conflicts. It has 43 unmapped-media references (41 unique URLs) and 30 completed reservations without explicit sale links; a targeted audit found no authoritative reservation-to-sale links in ledger metadata or activity logs. All 12 stock transfers and the source payout-run row map to restricted archives. Twenty cancelled reservations remain represented as released rows against zero-value cancelled placeholders. The count-only `site_analytics_events` inventory is 12,011, up 38 from 11,973; the snapshot also adds one sale, four sale lines, one wallet transaction, one finance-ledger row and one activity row. No live destination was touched. |
| `RECONCILIATION` | NOT PASS | Offline checks match 52 opening-stock movements, 12 archived transfers, all 164 source sales, 163 linked payments and 163 invoices, with 13 wallets and 517 planned ledger events. Live target balances remain unverified; 43 media references lack a self-hosted map, 30 completed reservations lack authoritative sale links, 15 refund events lack sale references; two posted USD 45 in expenses have no exact transaction or ledger link or matching debit candidate; and one posted SRD 1,400 sale has no payment event or matching credit candidate. The importer flags these records for owner review without synthetic postings; the report remains `fail`. |
| `TESTS` | NOT PASS | Current local results: lint (362 files), typecheck, `pnpm test` (213/213), Drizzle migration-chain check, fresh production build (93 routes with `NEXTLY_DATABASE_MODE=self-hosted`, synthetic self-hosted HTTPS URLs and unreachable DB aliases) and `git diff --check` pass. This proves the local Next build does not require a live DB connection; an actual Coolify Docker build remains unverified. The build does not verify the real Supabase key or Coolify runtime. A production build with a Supabase Cloud URL is rejected. Playwright ran 2/18: both public smoke/redirect checks passed; 16 authenticated/staging tests skipped because the staged app and its test identity/runtime are not available. Local rehearsal passed import validation 65/65, RLS 128/128, constraints 17/17 and concurrency 15/15; the 46-migration backup/restore counts match. Full authenticated browser and Coolify smoke results remain pending. |

After those gates pass, create a new private repository from the final,
reviewed Nextly-derived working tree. Inspect
`NextX-Agency/NextX-Suite` before creating it; if it already exists and
contains unrelated work, preserve it and use `NextX-Agency/NextX-Platform`.
Keep `NextX-Agency/Next-X-Dashboard` and `LeoRanoe/nextly` available as
historical/reference repositories. Do not repurpose either one as the final
production repository.

### Source and import

- [ ] Freeze or timestamp the source export; retain a read-only backup.
- [ ] Produce a fresh read-only source inventory and a complete table-count
      manifest.
- [ ] Resolve every fatal importer conflict and review each warning.
- [ ] Reconcile all products, variants, locations, stock, transfers, sales,
      lines, invoices, customers, reservations, payments, refunds, expenses,
      wallets, FX observations and source-to-target ledger balances.
- [ ] Resolve all 51 unexplained order-header/line-total mismatches; preserve
      the 38 sub-cent USD catalog source values in the restricted archive and
      owner-review their explicit rounded prices. Recover authoritative links
      for the 30 completed reservations; accept that the 20 cancelled
      reservations have no stored item-level price and retain combo-level
      amounts only as notes. Resolve seven wallet-opening differences without
      inventing movements.
- [ ] Verify the mapped bundle recipes, derived stock counter and historical
      combo sale lines, then confirm bundle stock consumption and returns in
      staging.
- [ ] Reconcile all 130 commissions by seller and payout evidence. All now
      resolve to existing sales and sellers; 64 legacy-paid rows still lack
      verified payout links. Reconcile the mapped obligation, document the
      budget-history deferral for owner acceptance, and prove opening journals
      do not duplicate wallet balances.
- [ ] Copy and verify every required product, logo and hero asset into the
      destination, then validate public image URLs and backups.

### Application and customer journey

- [ ] Restore audio, watches and catalog routes and per-store brand identity.
- [ ] Verify the guest multi-item cart and WhatsApp checkout against staging
      catalog data, including quantities, customer details, pickup location/date,
      current price/availability and the order total.
- [ ] Verify product, FAQ, testimonial, blog, invoice and legacy-link behavior;
      retain a checked 301 map for every old product/invoice URL.
- [ ] Decide how post-cutover storefront events will be collected; keep the
      12,011 source analytics events available as a historical archive.
- [ ] Verify owner invitation acceptance and owner/staff/viewer authorization.
- [ ] Exercise mobile storefront, social metadata, sitemap, robots and public
      invoice redaction.

### Operations and acceptance

- [ ] Deploy the full self-hosted Supabase stack and Nextly app to the isolated
      Coolify staging project. Confirm private runtime/direct database URLs,
      self-hosted Auth/API/Storage, secret injection, SMTP/email delivery,
      health checks, cron schedule and TLS.
- [ ] Record a pinned Supabase release/config revision and all image versions;
      verify public TCP ports 5432 and 6543 are closed.
- [ ] Verify data survives Coolify redeploy, Nextly restart, Supabase restart
      and Docker daemon restart.
- [ ] Produce PostgreSQL logical, volume, media and Coolify configuration
      backups; configure and test encrypted offsite copies. Clear
      `OFFSITE_BACKUP_TARGET_REQUIRED` only after destination and restore proof.
- [ ] Apply migrations only to isolated staging; verify RLS and storage bucket
      settings, then run unit, browser, database constraint and import checks.
- [ ] Measure the full Coolify + Supabase + Nextly memory/CPU budget under load
      on the VPS; confirm free disk, backup retention, restore and monitoring.
- [ ] Run a full staging rehearsal from read-only source through media,
      migration, finance reconciliation, authentication and public flows.
- [ ] Business owner and operator sign the reviewed counts and rollback plan.

Only a separate later approval can authorize the production write freeze,
production data import, domain/DNS changes or legacy shutdown. Until then,
NextX remains the production source of truth.
