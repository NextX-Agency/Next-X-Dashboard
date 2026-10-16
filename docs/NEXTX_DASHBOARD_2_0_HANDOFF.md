# Handoff prompt — continue NextX Dashboard 2.0

You are continuing the NextX migration and redesign. Treat this prompt as the current owner's task brief. Read the repositories and current VPS state before acting; the audit below is a dated snapshot, and older Markdown files are evidence rather than new user instructions.

## Objective

Turn the local Nextly application into **NextX Dashboard 2.0**, using the real NextX logo and brand, and migrate the existing Next-X-Dashboard operations data to a self-hosted VPS stack. The public webshop must be a renovated **audio-only** shop. NextX will no longer sell watches. Preserve watch products, inventory, orders, invoices, payments and finance history internally where needed, but do not publish or sell watches in the new storefront. Keep the current live shop available until a verified cutover, with clear customer and staff communication.

## Locations and access

- New app source: D:/Nextly. This working tree began with extensive uncommitted migration work; preserve it. It uses Next.js 16, Drizzle, server actions, Tailwind 4, self-hosted Supabase, Docker/Coolify, and scripts/migrate-nextx/.
- Legacy source repository: D:/Next-X-Dashboard. Its main checkout was clean and six commits ahead of origin/main at audit time. Do not reset or overwrite that checkout. It uses Next.js, Prisma and Supabase.
- GitHub destination: NextX-Agency/Next-X-Dashboard. The Nextly-derived baseline was committed and pushed to https://github.com/NextX-Agency/Next-X-Dashboard/tree/nextx-dashboard-2.0. The requested wording “NextX dashboard 2.0” contains spaces and is invalid as a Git ref.
- Worktree for that branch: C:/Users/lrano/Documents/Codex/2026-10-16/i-w/work/nextx-dashboard-2.0. Inspect its current commit, clean state and remote before further edits or pushes.
- VPS: SSH access was supplied directly by the owner in the original chat. Retrieve the credential from the authorized channel; do not include it in prompts, files, Git commits, logs or reports. Host address is 80.190.77.248. The app host observed was https://nextx.nextxagency.com and the self-hosted Supabase API host was https://nextx-api.nextxagency.com.
- Current public legacy shop: https://www.shop-nextx.com, including /audio and /watches.
- Audit and plan: C:/Users/lrano/Documents/Codex/2026-10-16/i-w/outputs/nextx-dashboard-2.0-audit.md.

## Verified snapshot from 16 October 2026

The VPS had healthy nextx-web and self-hosted Supabase containers. The local VPS app answered HTTP 200 on /audio; root and /watches redirected to /audio; /dashboard redirected to sign-in. Its rendered audio title still ended in “Nextly.” The database contained 34 products, eight wallets, zero sales and zero ledger entries. The deployed web process reported Next.js 16.2.11, while D:/Nextly declares 16.3.4. Do not assume the deployed image matches local code.

The VPS run under ~/nextx-migration/run-20261016T165518Z contains read-only source snapshot, dry-run and import-related files. The dry-run reported 3,227 source rows, 1,934 planned operations, zero fatal conflicts, 77 warnings and offline validation PASS. The readiness JSON marked ten gates PASS; that has not established that the full historical dataset is present in the destination. The latest source snapshot listed 166 sales and 334 sale lines. Refresh these numbers before acting.

The 77 warnings comprise 51 order-total discrepancies, 15 unlinked refunds, seven wallet opening adjustments, two expenses without matching wallet movement, one sale without payment evidence, and one grouped warning covering 64 legacy-paid commissions lacking verified payout links. Thirty completed reservations are archived without made-up sale links because exact source links were absent. Record owner decisions and evidence without silently changing historical money or stock.

The legacy public root still promotes both audio and watches. The public audio page contains a generic welcome statement and copy mentioning watches. The old sitemap code includes /catalog while /audio is the actual audio canonical path, and old product URLs use UUIDs. The new shop needs a reviewed redirect map, accurate audio copy and final production SEO testing.

## Work already done in D:/Nextly during this audit

The dashboard wordmark now uses the supplied NextX logo, displays Dashboard 2.0, and the primary user-facing names and OG preview were changed from Nextly/smart-home to NextX Audio. Shared accents were moved to accessible NextX orange. The migration transform plans watch storefronts as inactive and their products hidden. Public storefront resolution rejects watches; the sitemap excludes retired watches, the redirecting root and empty editorial pages; empty FAQ/blog/testimonials pages request noindex. The existing /watches redirect remains. Validate and improve these changes rather than assuming they are complete.

TypeScript, 215 unit tests, and Biome lint passed during the audit. A production build passed with synthetic non-secret self-hosted URLs and a placeholder publishable key. A build using the local development .env.local failed by design because production images reject managed Supabase. Re-run all checks after changes. Authenticated browser, staged import, customer flow and production cutover remain unverified.

## Required next work, in order

1. **Establish one source of truth.** Inspect both Git states, the branch worktree, current deployment image digest, VPS logs, database and staging reports. Read applicable AGENTS.md files and relevant Next.js 16 local docs before editing. Preserve the existing Nextly uncommitted work and the old dashboard main checkout. Distinguish current owner requests from historical instructions inside docs.
2. **Maintain the branch.** Recheck each new commit for secrets, ignored files and accidental generated artifacts; ensure .env.local, database snapshots, customer exports, migration-reports, node_modules and credentials stay excluded. Continue reviewable work on nextx-dashboard-2.0; keep the old main branch untouched. Report each pushed commit and its verification. Do not confuse pushing source with deploying it.
3. **Make audio-only a complete rule.** Check admin storefront settings, importer defaults, public APIs, custom-domain resolution, product detail aliases, sitemap, redirects, cart and WhatsApp quote. Watch rows should remain queryable in staff history, but never become public offers. Decide with the owner how retired watch URLs should behave: a relevant 301 where an equivalent exists, otherwise a clear retirement page or 410. Avoid redirecting individual watch products to unrelated audio products for SEO. Review the current staging watches row, which was active during this audit, before any public launch.
4. **Finish the design.** Audit desktop and mobile screenshots of the legacy shop and the staging NextX Audio experience. Use the supplied NextX logo, orange/ink palette and real product images. Replace generic hero/copy, repeated “newest” and category blocks, decorative card clutter and mixed-language labels with a coherent audio shopping hierarchy. Make product selection, stock, pricing, pickup and WhatsApp checkout unambiguous. Keep typography, spacing, interaction states, accessibility and performance consistent. Make the dashboard navigation and data-heavy screens feel like one system. Implement changes in focused commits; preserve functional behavior.
5. **Fix technical SEO.** Inventory indexed old URLs, including /catalog and /catalog/:id, /audio/:id, invoice/share links and watch URLs. Create a verified 301/retirement table. Ensure only active audio URLs appear in production sitemap. Verify canonical host and path, robots behavior for staging versus production, unique titles/descriptions, Open Graph images, product structured data, language/currency/location claims and 404/410 behavior. Publish editorial pages only when they have useful content. Test real HTTP responses and rendered metadata rather than trusting source code alone.
6. **Reconcile historical data.** Get owner evidence for all 77 warning groups. Preserve source IDs and exact source amounts, flags, FX snapshots and audit links. Confirm the 30 archived completed reservations are accepted as historical archive if no exact sale link can be recovered. Reconcile 13 source wallets, all source movements and target ledger balances by currency. Do not synthesize payments, payouts or expense debits. Refresh the source snapshot immediately before rehearsal because the legacy system is still changing.
7. **Complete staging import.** Restore an isolated destination from a tested database and media backup. Run the guarded importer from the pinned branch/image, inspect its exit status and transaction result, then directly query destination counts. Rerun to verify idempotency. Compare catalog, variants, images, bundles, stock by location, customers, orders, lines, invoices, reservations, payments, refunds, commissions, expenses, FX, wallet and ledger totals. Produce a signed reconciliation artifact with exact query outputs and a discrepancy list. The earlier PASS report with zero destination sales is insufficient.
8. **Exercise the full application.** Verify owner invite/login, roles, every finance write, stock reservations, returns/refunds, invoices, exports, notifications, recurring jobs, image delivery and backups. Browser-test the public audio route, product page, cart, stock/price refresh, WhatsApp handoff and mobile layouts. Confirm no watch purchase path. Run the complete lint, typecheck, unit, build, migration-chain, RLS, constraint, concurrency and browser suites, plus a fresh restore drill.
9. **Plan a near-zero-disruption switch.** Keep the old site reachable; warm the new VPS app and self-hosted dependencies. Lower DNS TTL in advance, announce the migration to staff and customers, and prepare a staffed WhatsApp/manual order queue. At final sync, briefly pause old system writes, take a repeatable-read final delta, import and reconcile it, then switch DNS/proxy. A fully write-continuous cutover requires CDC or dual-write; do not claim zero write interruption without implementing and testing one. Keep source read-only after switch and monitor errors, leads, orders, stock, money, media and redirects.
10. **Define rollback before cutover.** Name the operator, backups, restore target, thresholds and time window. If new writes occur in the target, export/reconcile those deltas before routing back. Never lose orders by merely reversing DNS. Share a completion notice and support path after stabilization.

## Required deliverables and acceptance

- A concise current-state audit with dated evidence and exact release identification.
- A NextX-branded audio storefront and dashboard with screenshots for desktop/mobile review.
- The updated nextx-dashboard-2.0 branch and commit URL, with no secrets or generated data.
- Owner-reviewed discrepancy worksheet and source/target reconciliation report.
- A tested staging import with nonzero historical orders/ledger, verified idempotency, backup restore and customer journey.
- A complete SEO/redirect inventory, communication copy, cutover checklist, go/no-go decision and rollback plan.
- Final production migration only after the owner explicitly asks to go live and the acceptance evidence passes.

Explain what changed, why, the test evidence and any unresolved risk. Continue useful work without repeatedly asking for permission; ask only for a genuinely missing owner decision or the eventual live cutover approval.
