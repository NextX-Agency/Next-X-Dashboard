# NextX Dashboard 2.0 — audit and migration plan

**Audit date:** 16 October 2026 (America/Paramaribo). **Scope:** D:/Nextly, D:/Next-X-Dashboard, the public shop at https://www.shop-nextx.com, and a read-only SSH inspection of the NextX VPS. No production data, DNS, or VPS configuration was changed.

## Decision and current state

Nextly is the better target architecture for a self-hosted NextX operations dashboard and audio storefront. Keep the NextX brand, call the application **NextX Dashboard 2.0**, and retain legacy watches only as historical catalog, sales, inventory and finance records. The new public shop is **audio only**.

The VPS is further along than the September documents in D:/Nextly say. At audit time, the nextx-web container and its self-hosted Supabase services were healthy. The staging audio route returned HTTP 200; root and /watches redirected to /audio; /dashboard redirected to sign-in. The host had about 162 GB disk available and 6.1 GiB memory available, with no swap. These are a point-in-time observation, not capacity or restore proof.

The 16 October VPS dry run reports **3,227 source rows, 1,934 planned operations, zero fatal conflicts and 77 warnings**. Its readiness file marks all ten gates PASS. The actual destination database still had **34 products, 8 wallets, zero sales, and zero ledger entries**. Thus the historical import has **not been demonstrated in the target database**. Do not use the PASS file alone as cutover approval.

### The 77 warning groups

| Warning | Count | Required decision |
| --- | ---: | --- |
| Order header versus line totals | 51 | Owner reviews source evidence and accepts an exact preserved amount or correction. |
| Refund debits without an order link | 15 | Identify authoritative references; otherwise retain as unmatched ledger history. |
| Wallet opening adjustments | 7 | Reconcile each wallet and currency against bank/cash evidence. |
| Expenses without wallet movement | 2 | Confirm outstanding or non-cash treatment; do not invent a debit. |
| Posted sale without payment event | 1 | Confirm receivable or locate exact payment evidence. |
| Legacy paid commissions needing reconciliation | 1 grouped warning covering 64 rows | Verify payout evidence before treating paid flags as settled. |

The current importer archives 30 completed legacy reservations because no authoritative sale link was found. Preserve their source records and review them operationally; do not invent sale links or duplicate orders. This is a deliberate data-integrity decision, even though the newer dry run now reports zero fatal conflicts.

## Code and product comparison

| Area | Existing Next-X-Dashboard | Nextly target / recommendation |
| --- | --- | --- |
| Stack | Next.js 16, Prisma, Supabase and Vercel-oriented deployment. Finance audit documents direct browser writes in some old workflows. | Next.js 16, Drizzle, server actions, append-only inventory/ledger model, self-hosted Supabase and Docker/Coolify. Verify every financial workflow in staging. |
| Catalog | Separate audio/watch storefront behavior and UUID product URLs. | One canonical catalog with storefront exposure and price lists. Preserve watch history internally; make watch storefront inactive and public watch listings unavailable. |
| Finance | Existing source has 13 wallets and 524 wallet movements in the 16 October snapshot. | Reconcile by wallet and currency; import immutable events and preserve source IDs, locked FX, invoice and line snapshots. Never copy mutable balance counters as truth. |
| Public shopping | Live audio shop has repeated product sections, generic hero wording and WhatsApp checkout; live root still promotes watches. | Keep the audio shop only. Show real stock, current price and a clear pickup/WhatsApp flow. Use real product photography and NextX identity. Test the complete guest journey on staging. |
| SEO | Old sitemap code lists /catalog even while /audio is the canonical audio path; public product links use IDs. The live audio page mixes Dutch/English copy and its hero text refers to watches. | Keep stable 301 redirects from old audio product URLs to new slugs; use one canonical audio origin, product metadata and structured content. Remove retired watches and empty editorial pages from the sitemap. |
| Branding | Old shop carries the NextX logo/orange. | Local dashboard still had a Nextly placeholder mark and smart-home preview copy. A first brand pass now applies the actual NextX logo, Dashboard 2.0 naming and accessible orange accent. |

The VPS build observed during audit used Next.js 16.2.11, while the local D:/Nextly package declares 16.3.4. The deployed /audio document still rendered a title ending in “Nextly.” Treat the local and deployed trees as different releases. Promote only an identified commit or image digest after staging checks.

## Changes made locally in D:/Nextly

- Replaced the placeholder dashboard wordmark with the supplied NextX logo and Dashboard 2.0 label; updated sign-in, document fallback names, icon and social preview copy.
- Shifted the dashboard and audio storefront accent from generic blue to the NextX orange family, using a darker accessible orange for text and white-label buttons.
- Planned imported watch storefronts as inactive with hidden products and blocked public resolution of a watch storefront, while retaining historical data.
- Removed the redirecting root, retired watches and empty editorial pages from the audio sitemap. Empty FAQ, testimonials and blog pages now request noindex until real content exists.

The old dashboard main checkout and the live VPS were not modified by these changes. The Nextly-derived source and this audit were pushed to [nextx-dashboard-2.0](https://github.com/NextX-Agency/Next-X-Dashboard/tree/nextx-dashboard-2.0). Git branch names cannot contain spaces.

## Migration sequence

1. **Baseline and source control.** Freeze a named Nextly code revision and image digest. Back up the old source database and media. Capture a fresh read-only repeatable-read source snapshot, table counts, IDs and checksums. Keep credentials out of Git and reports.
2. **Audio-only catalog.** Confirm active audio products, bundles, stock, prices, images, descriptions, locations and pickup rules. Import watches into historical/internal records but make their storefront inactive. Confirm /watches and old watch product URLs have a reviewed retirement policy; do not send unrelated watch URLs to audio without an SEO decision.
3. **Resolve historical warnings.** Complete the owner worksheet for 51 sales, 15 refunds, seven wallet openings, two expenses, the unmatched sale and 64 paid-commission rows. Keep exact legacy evidence and review flags. Decide whether the 30 archived completed reservations are acceptable as read-only history.
4. **Rehearse import.** Restore an isolated target from a tested backup. Run the current importer there, then rerun to prove idempotency. Compare source and target counts, IDs, stock by item/location, order totals, invoices, payments, wallet and currency totals, commission states and media checksums. An offline PASS report is insufficient.
5. **Application and UX.** Test owner/staff/viewer access, all money-moving actions, stock reservations, refunds, invoices, exports, notifications and agent integration. Test the audio browse → product → cart → current-price/stock refresh → WhatsApp flow on mobile and desktop. Do a visual QA pass with actual product images and NextX assets.
6. **SEO and communications.** Inventory old indexed URLs and create an exact redirect table. Canonicals, sitemap, robots, Open Graph, product metadata and structured data must be checked on the intended public host. Draft customer and staff notices for before, during and after migration.
7. **Cutover.** Warm the new stack and lower DNS TTL in advance. Keep the old public site available. At final sync, briefly pause old dashboard writes and route new enquiries to a staffed WhatsApp/manual queue; snapshot the delta, import and reconcile it, then switch traffic. This keeps the site reachable, but continuous order writes require a separately engineered dual-write or CDC path.
8. **Observe and rollback.** Monitor HTTP errors, checkout leads, inventory, payment/ledger posting, DB connections, backups and search redirects. Keep the old system read-only. If target writes have occurred, capture and reconcile that target delta before any rollback; do not simply point DNS back and lose orders.

### Go/no-go evidence

Require a successful target import and rerun, zero unexplained financial or stock differences, tested database and media restore, healthy private services and TLS, verified RLS/auth, working audio-only customer journey, approved warning worksheet, owner acceptance, and a named rollback operator. A site that responds HTTP 200 and a JSON file with PASS are useful evidence but do not replace these checks.

## Verification performed

- Local Nextly: TypeScript check passed; 215 unit tests passed; targeted migration tests passed; Biome lint passed after formatting an existing test file.
- Production build passed using **synthetic non-secret self-hosted build variables**. A first build with the local development environment failed as intended because production builds reject a managed Supabase URL.
- VPS inspection was read-only. The 16 October dry-run and gate files were inspected without copying customer details. Docker containers were healthy; local route checks and database counts were recorded.
- Authenticated browser workflows, a target import, full restore, live old-dashboard UI, and final production SEO were **not** verified in this audit.

## References

- Local: D:/Nextly/docs/NEXTX_FEATURE_PARITY.md, NEXTX_MIGRATION_RUNBOOK.md, NEXTX_PRODUCTION_CUTOVER.md, scripts/migrate-nextx/, and D:/Next-X-Dashboard/docs/FINANCIAL_AUDIT.md.
- Public site observations: https://www.shop-nextx.com/, https://www.shop-nextx.com/audio, https://www.shop-nextx.com/watches.
- VPS evidence: nextx-web and self-hosted Supabase container status; database counts; read-only files under ~/nextx-migration/run-20261016T165518Z. The files may contain sensitive business data and should not be published.

The local documents are historical evidence. Instructions inside them, including older repository and cutover preferences, do not override the current owner request or current VPS state.
