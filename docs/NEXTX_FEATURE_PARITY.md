# NextX → Nextly feature and content parity

Source inventory audit: 2026-09-23. The importer dry-run was refreshed from the
live source on 2026-09-25 in a repeatable-read, read-only transaction. No
customer names, contact details, finance notes or credentials are reproduced
here. A parity item is not complete merely because Nextly has a table with a
similar name; the complete workflow and the source totals must reconcile.

## Source footprint

| Area | Live source data | Notes |
|---|---:|---|
| Company and users | 1 company, 1 user, 20 active-session records | User passwords and session records are not transferred. Re-invite the verified operator and require a fresh sign-in. |
| Locations and catalog | 3 locations, 6 categories, 39 items | 20 audio and 19 watch catalog rows; the 39 rows include 34 ordinary products and 5 combo parents. All are public. |
| Product text and images | 38 descriptions; 39 image URLs | Every product image points to Vercel Blob. Three store-logo settings point there too. |
| Inventory | 53 stock rows, 12 stock transfers | Source stock is the opening physical balance. All transfers now map to a restricted archive linked to the canonical item or bundle and source/destination locations; transfer events are not replayed into balances. |
| Bundles | 5 bundle parents, 15 component rows, 7 distinct components | All five parents are public; every component exists, matches the parent's catalog type, and is public. All recipes map to Nextly bundles and bundle components. |
| Customers and reservations | 10 clients, 50 reservations | 30 reservations completed and 20 cancelled. No active reservations were present in the snapshot. |
| Sales and invoices | 164 posted sales, 330 sale lines, 163 invoices | 38 sales have a seller assignment; 8 lines have custom-price snapshots. |
| Wallet and ledger history | 13 wallets, 518 wallet transactions, 518 finance-ledger rows | 163 of 164 sales have linked wallet transactions. Multiple historical event shapes need reconciliation. |
| Expenses | 6 expense categories, 88 expenses, 3 active monthly recurring expenses | Category IDs/names, receipt reference numbers, all three schedules, estimated flags, next-run dates and historical expense links map to Nextly. The legacy schema has receipt numbers but no attached expense-file storage; new receipts use private self-hosted Storage. The Coolify worker posts through the normal expense/ledger path with exactly-once period keys. |
| Seller finance | 3 sellers, 3 category-rate rows, 130 commissions, 1 payout run | 106 commissions are marked paid and 24 unpaid; the run is draft. All commissions reference one seller. The legacy payout handler records aggregate commission counts on payout events, not commission IDs, and its code documents a prior path where paid flags survived failed payout-expense writes. Sixty-four paid rows therefore have no verified payout link in the current snapshot. |
| Other finance | 13 accounts, 1 budget category, 1 expired monthly budget, 1 partial receivable, 3 journal entries / 12 lines, 1 invoice sequence | The receivable is manually sourced. No accounting periods or fixed assets were present. |
| Store configuration | 34 key/value settings | Includes brand copy, contact/location information, logos, wallet-purpose mapping and payout/reconciliation settings. |
| CMS/content tables | 0 rows in banners, item-images, item-features, collections, reviews, subscribers, FAQs and testimonials | The live product descriptions and settings still provide customer-facing content. Static legacy assets also exist in the repository. |
| Analytics and audit | 12,011 site events, 1,162 activity-log rows | Read-only refreshes found 87 additional count-only events after the earlier 11,924 count; retain source access/export for historical lookup. This data is not operationally imported by default. |

### Transaction shapes requiring special handling

- All 518 wallet transactions have exactly one finance-ledger mirror with the
  same wallet, currency and amount. The importer imports each pair as one
  canonical event; the linked ledger row supplies direction and event metadata.
- The legacy Reservation table has no sale foreign key, and the live snapshot has
  no reservation foreign key in `sales` or `sale_items`; the `invoices` table is
  empty. Although the current legacy API writes completed reservation IDs into
  finance-ledger metadata, no source ledger row contains a `reservationIds`
  array. A repeatable-read audit on 2026-09-24 found zero `request_id`-paired
  completion/sale events and no exact opposite-side UUID reference in completed
  reservation rows, sale rows, sale lines, sale-linked ledger rows, or related
  activity rows. Neither side's notes contained the counterpart UUID, and
  activity/ledger metadata had no reservation/sale/invoice link keys. The 10
  completion activity records also lack the invoice details emitted by the
  current API. Product, quantity, timestamp or customer coincidences do not
  prove which historical sale consumed a reservation, so those rows remain
  blocked instead of creating duplicate orders.
- 163 posted sales have linked credit movements and each credit matches its
  sale-header amount, including the 148 credits with null `reference_type`.
  Linking uses the sale ID and credit direction. The latest transform maps all
  163 linked payments; one posted SRD 1,400 sale has no payment event and is flagged for owner review without a synthetic payment.
- The current source snapshot has no explicit `saleRefunds` rows. Its 15 wallet
  debits with `reference_type='sale_refund'` have null `sale_id` and
  `reference_id`. A repeatable-read exact-reference audit on 2026-09-24 found
  no sale UUID or invoice number in those transaction rows or their paired
  finance-ledger rows, and no activity row contained both the wallet
  transaction ID and an exact sale UUID/invoice number. They remain ledger
  movements with an `UNLINKED_REFUND` warning; no order refund is synthesized.
- 11 commission-payout debits have `reference_type='commission_payout'`. The
  legacy payout handler records an aggregate commission count and expense ID,
  not the paid commission IDs, and its code documents an older path where
  commissions could be marked paid despite failed payout-expense writes. A
  repeatable-read exact-ID scan on 2026-09-24 found 0 of 106 paid commission
  UUIDs in the payout run, payout-run-linked expenses, commission-payout wallet
  and paired ledger rows, or commission activity records. The 64 paid rows
  flagged by the importer still need owner evidence; aggregate payout amounts
  and paid flags do not identify which commissions were settled.
- Three source recurring-expense transactions are separate from the 88 direct
  expenses and must not be double-counted.
- 86 of 88 expenses have linked wallet movements. A 2026-09-25 exact-link audit found two posted USD expenses totaling USD 45 without a direct FK, reference, ledger source or matching debit candidate; both remain expense rows only and are flagged for owner review without synthetic postings. Zero-value wallet records whose
  before/after balances match are explicitly omitted as no-effect events.
- Eight wallet transactions have zero amount and no balance change. The 509
  positive movements produce 509 ledger events before seven explicit opening
  balance adjustments; source balance counters are never imported as mutable
  truth.

The latest read-only source dry-run completed at
`2026-09-26T13:19:13.579Z`; it discovered 3,182 rows and planned 1,861
destination operations. The source was read from the ignored legacy
`DIRECT_URL` only for the CLI process; no source or destination rows were
written. It is **not migratable**: 73 fatal conflicts, 77 warnings and 77
informational conflicts remain. Conflict groups and identities are unchanged
from the prior report. The count-only `site_analytics_events` table is now
12,011 rows, up 38 from the previous 11,973; the snapshot also adds one sale,
four sale lines, one wallet transaction, one finance-ledger row and one
activity row. The PII-minimized
owner worksheet has 150 fatal/warning findings and blank decision/evidence
fields at `migration-reports/nextx-live-owner-review-2026-09-26-1320z.csv`.
The 30 completed reservations now stop with
`COMPLETED_RESERVATION_WITHOUT_SALE_LINK`, because this snapshot has no
reservation IDs in finance-ledger metadata. The other 43 fatal conflicts are
unmapped legacy media. All 12 stock transfers are preserved in the restricted
`legacy_stock_transfer_archive`; the 52 opening-stock movements and their
reconciled balances are unchanged. The plan
includes 34 ordinary products/variants, 5 bundles, 15 bundle components and 34
storefront-product links. All three recurring schedules and the one
obligation map; all 34 settings are preserved in the restricted archive, with
supported values also transformed into canonical settings/storefronts. Two
source sale lines that directly reference combo parents are preserved as
bundle sale lines. One source combo-stock counter was verified to match
component-derived availability; the other 52 stock rows become opening
movements. It emits all 164 source sales plus 20 zero-priced cancelled-reservation
placeholders, all 330 source sale lines plus 20 placeholder lines, and 20
released inventory reservations. The 30 completed reservations are skipped
until a reliable source sale/item link is available. Cancelled reservation
records default to SRD, as the legacy API does; the source table does not store
item-level historical prices, so the zero-value placeholders preserve status
and quantity without asserting a historical amount. The source has 164 sales and 330 lines;
four sales have no lines, while 47 multi-line sales disagree with their header
totals (35 headers are lower, 12 are higher). The source has no sale-level
discount field, and none of the mismatched sales has notes, custom-price lines,
line discount reasons or original-price deltas. Eight mismatches are flagged
for review, but their review text contains no numeric adjustment. The legacy
sales API displays the sum of current line subtotals while the posted wallet
credits match the stored sale header. Direct audit history has creation events
for 44 mismatches and no update snapshots; those records do not recover the
line/header values in disagreement. The importer preserves the source header
and exact source-currency line subtotals in `sale_items.line_total_cents`, marks
each affected sale `needs_review`, appends both amounts to its review reason
and emits `ORDER_TOTAL_REVIEW_REQUIRED`; this retains history without
inventing an adjustment. Sale detail shows the review reason, line subtotal,
discount and recorded header total. Owner review remains required before
operational acceptance. Existing Nextly sale lines are backfilled from unit
price times quantity. Thirty-eight catalog USD prices have sub-cent precision;
they now round half away from zero to minor units, retain the exact source
decimal in a restricted archive, and produce informational conflicts. Seller
profiles and all three category-rate rows map, and all 130 commission rows now
resolve to migrated sales and sellers. Sixty-four
mapped commissions carry a legacy paid flag without a verified target payout
link or new ledger debit. The dry-run has no self-hosted media map: 39 product-image references and 4 logo/hero setting URLs (41 unique assets) remain fatal until copied and remapped. A read-only source-CDN audit on 2026-09-24 fetched and decoded all 41/41 URLs successfully; it wrote no source, local-media or Storage data. Twelve checked-in public brand assets are preserved in Nextly and
return HTTP 200 in the local production-layout smoke, but this does not map
legacy product media into self-hosted Storage. Warnings include 51 sale-total
review flags, 15 unlinked refunds, seven wallet-opening adjustments, two
posted expenses without wallet movements (the read-only exact-link scan found 2 USD expenses totaling USD 45, with no direct FK, reference, ledger source or matching debit candidate), one completed sale without a payment event,
and the aggregate legacy-paid-commission warning. Twenty informational
reservation-price records explain that the cancelled placeholders have no
stored item-level historical amount. The legacy payout-run row is preserved
verbatim in a restricted archive and is never replayed. Budgets, company/user metadata and
activity logs are explicitly deferred informational data; accounts, app
sessions, budget categories and journal tables are likewise retained as
read-only historical data, not day-one operational workflows. Eight zero-value
no-effect wallet records are informationally reported. No live source
data has been written to a destination; only a sanitized fixture has been
imported into the local rehearsal database.

## Parity matrix

| Capability/content | Nextly destination | Current state | Classification | Cutover requirement |
|---|---|---|---|---|
| Locations, categories, item records, variants, current stock | Canonical catalog and inventory tables, plus restricted legacy transfer archive | 34 ordinary products and 52 opening-stock movements map; one combo-stock counter reconciles to component-derived availability; all 12 stock transfers map with canonical item or bundle and location references, without replaying them into opening balances | `MIGRATE_DATA` | Reconcile every location/variant count and verify the archived transfer audit rows. |
| Sales, lines, invoices, customers, reservations | Sales, sale items, customers, invoices and inventory reservations | All 164 source sales, 330 source lines, 163 linked payments and 163 invoices map. Twenty cancelled reservations are preserved as released rows against cancelled zero-value placeholders. Thirty completed reservations have no explicit sale link in the live source snapshot and are blocked rather than duplicated. The importer accepts exact ledger metadata, invoice audit links and paired `reservations-api` activity events with one request ID; a read-only scan of the current source found zero matching pairs. Four sales have no lines and 47 multi-line sales have unexplained header differences; the importer preserves both amounts and flags all 51 mismatches for review. One posted SRD 1,400 sale has no payment event, direct sale FK, exact reference or ledger source; a same-wallet/currency/amount scan within ten minutes found no unlinked credit candidate. The importer preserves the sale and invoice without creating a payment and flags the sale `needs_review` with an owner-facing reason. | `MISSING_BLOCKER` | Obtain authoritative source links for the 30 completed reservations; owner-review the 51 flagged totals; provide linked payment evidence for the missing event or document the outstanding receivable. |
| Wallets, payments, expenses, FX, reconciliations | Wallets, append-only ledger, classified expenses and FX tables | Every one of 518 wallet transactions has one exact finance-ledger mirror; importer deduplicates each pair. Fifteen refund debits have no order reference. Two posted expenses totaling USD 45 have no expense FK, exact reference or ledger source; neither has a same-wallet/currency/amount debit candidate within one day. The importer flags both missing-movement expenses `needs_review` with an owner-facing reason and creates no cash posting. The current tree maps expense vendor/receipt/classification/review metadata and also preserves sale/product review flags and reasons; flagged rows are visible in their lists and owners can clear expense flags with an audit entry. The 2026-09-26 source dry-run includes these mappings; staging behavior and balances remain unverified. | `MISSING_BLOCKER` | Reconcile each unmatched refund and provide evidence that the two posted USD expenses were non-cash or identify their missing source movements; verify classifications and all source review flags in staging; prove the combined source ledger and opening balances against a named source-of-truth. |
| Bundles and recipes | Bundle and bundle-component tables, bundle-aware sales | All 5 combo parents and 15 component rows map; combo parents are excluded from ordinary products | `READY_BETTER` | Verify imported recipes, public presentation, stock consumption and returns in staging. |
| Product photos, logos and hero assets | Supabase Storage product-image pipeline | Read-only collection, safe host validation, image re-encoding, staging upload, URL mapping and `product_images` transforms are implemented. Twelve checked-in public assets are present and served locally. The 39 product-image references and 4 logo/hero settings (41 unique URLs) remain unmapped to self-hosted Storage; a read-only source-CDN audit validated all 41 as images on 2026-09-24, but none has been uploaded to staging Storage. | `MISSING_BLOCKER` | After all write gates pass, copy every product/logo/hero asset, verify public delivery and rerun the dry-run with the media map. |
| Audio and watch brands/routes | Storefronts and shared catalog | `/audio`, `/watches`, their carts and product aliases exist locally. Legacy product IDs resolve through imported variant metadata and redirect to canonical slugs. Staging content, branding and routes remain unverified. | `MISSING_BLOCKER` | Verify source copy, heroes, canonical URLs and ID redirects against staging data. |
| Multi-item public checkout | Storefront cart and WhatsApp checkout with local persistence, quantities, name/phone/notes, pickup location/date and an estimated total | The local checkout now refreshes public price and storefront-scoped available stock before enabling WhatsApp; unavailable variants block sending, and the customer is told that this quote does not reserve stock. It has not been exercised in staging. | `MISSING_BLOCKER` | Verify against live staging catalog data, confirm price/availability handling and complete the full guest journey before switching links. |
| Commissions and seller balances | `/commissions`, seller profiles, category rates, sale-time commission snapshots, transactional payout expense and ledger posting | The local tree supports owner-managed sellers/rates, frozen sale-time amounts, open/paid state and locked payouts. The live dry-run maps all 130 rows; 64 legacy-paid rows have no verified payout link and do not create a second debit. No staging workflow test has run. | `MISSING_BLOCKER` | Reconcile the 64 legacy paid flags against payout evidence, then verify payout and duplicate-payout behavior in staging. |
| Recurring expenses | Owner-managed schedules and an authenticated Coolify cron route; canonical expenses and ledger postings | The source's 3 active monthly schedules and historical references map. Estimated amount/date flags block posting; wallet balance, exchange rate, owner notification, period uniqueness, 3-period catch-up cap, month-end clamping and pause/resume are implemented locally. Staging runtime is not yet verified. | `READY_BETTER` | Verify in staging that a due occurrence posts once, retry does not duplicate it, estimate/low-balance cases notify owners and remain due, and catch-up stays bounded. |
| Budgets | No budget table/workflow | Source has one expired 2026-01 budget; retain it with the read-only legacy archive for later finance-history work. | `DEFERRED_NON_CUTOVER` | Preserve the source record and include it in the later finance-history migration. |
| Receivables/obligations | `/obligations`, transactional payments and restricted legacy settings archive | The local model maps the source obligation's identity, amount, currency, party, due/status and paid opening amount. It does not fabricate historical payment-ledger rows absent from the source; new payments post atomically. No live dry-run or staging workflow test has confirmed the mapping. | `MISSING_BLOCKER` | Reconcile the opening balance to source evidence and verify payment/ledger behavior in staging. |
| General ledger/accounts | Wallet ledger exists; no source account/journal model | Source has 13 account rows and 3 journal entries / 12 lines; no accounting periods or fixed assets were present. Retain these historical records with the read-only source archive pending ledger reconciliation. | `DEFERRED_NON_CUTOVER` | Reconcile opening journals to wallet positions and retain account mapping/history before retiring the legacy source. |
| Business/store settings | Singleton settings, typed storefront content and restricted `legacy_store_settings` archive | All 34 values are preserved by the importer; supported identity and storefront fields are transformed while the full JSON values remain archived. The scheduled legacy payout job has no configured active founders and has never posted a run in the current source snapshot; its one draft run is preserved in a restricted source-record archive and is never replayed as wallet activity. The automated split policy is deferred while the owner configures recipients and confirms the policy; manual wallet transfers and owner-draw expenses remain available. Four logo/hero URLs remain unmapped. | `DEFERRED_NON_CUTOVER` | Keep automated payout splits disabled until recipients are configured and the owner confirms the policy; verify manual transfer and owner-draw workflows on staging, and verify logos/heroes after media migration. |
| Authentication | Supabase Auth and member roles | No password/session migration | `MISSING_BLOCKER` | Verify owner identity, issue destination invite, set roles and test login before acceptance. |
| Store analytics | No first-party event collector; Vercel Analytics and Speed Insights were removed from the runtime | The latest read-only inventory counted 12,011 source events; retain the source archive for historical lookup. Post-cutover traffic analytics are not a day-one operational workflow. | `DEFERRED_NON_CUTOVER` | Keep the legacy analytics archive accessible for historical lookup. |
| FAQ, testimonials, reviews, blog, banners, collections | Product-level FAQs and storefront collection/homepage configuration; no global editorial CMS | Live FAQ, testimonial, review, banner, collection and related CMS tables are empty. The source blog queries tables absent from the live schema. Nextly preserves `/faq`, `/testimonials` and `/blog` as accurate empty-state pages, includes them in the sitemap/footer, and returns an intentional not-found page for article slugs because there are no published articles to migrate. Of 18 checked-in legacy public files, 12 business assets are preserved at their original paths in Nextly `public/`; ten remain byte-identical and the two SVGs have nonvisual accessible titles added. Five generic starter graphics are excluded and one duplicate logo file is represented by its identical logo asset. | `DEFERRED_NON_CUTOVER` | No editorial records or blog tables existed in the live source inventory, so no CMS is needed for cutover. Verify the empty-state routes, static assets and storefront content on staging; revisit if missing content or an authoring need is identified. |
| Search/social/SEO links | Nextly metadata and public invoice/share routes | Audited `/catalog` and `/catalog/:id` audio links permanently redirect to `/audio`; unsupported `/shop` and `/store` redirects were removed. The root now restores the legacy NextX Audio/Watches entry. Storefront-specific sitemap paths and staging noindex are implemented locally. Production URL routing and rendered staging metadata remain unverified. | `MISSING_BLOCKER` | Verify old links, custom-domain canonicals, sitemap/robots/OG images and public invoice URLs against the approved staging host. |

Classification totals across 17 matrix rows: `READY` 0, `READY_BETTER` 2,
`MISSING_BLOCKER` 9, `MIGRATE_CONTENT` 0, `MIGRATE_DATA` 1,
`PORT_REQUIRED` 0, `SUPERSEDED` 0 and `DEFERRED_NON_CUTOVER` 5. A local code
classification does not mean staging or migration readiness has passed.

## Importer safeguards

The database source reader uses one repeatable-read, read-only transaction. The
dry run inventories source tables without loading count-only audit/analytics
records. It inventories every public base table and fails closed when any
populated table has no approved mapping; only the Prisma migration ledger and
historical site analytics event archive are explicitly excluded from that
gate. `migrate` refuses to write while an unmapped populated table remains.
JSON exports must declare `metadata.sourceTableInventoryComplete: true` and
include the `metadata.sourceTableCounts` manifest for tables not included as
full row sets; otherwise the planner fails closed.

The current live dry-run reports 73 fatal conflicts (43
`UNMAPPED_LEGACY_MEDIA` and 30 completed reservations without authoritative
sale links), 77 warnings and 77 informational conflicts. Twenty cancelled
reservations are preserved as released rows against zero-value cancelled-order
placeholders. All 51 header/line total
mismatches are preserved as review-flagged sales, and all 130 commission rows
now resolve. Offline reconciliation matches the transform's expected
inventory (52), source sales (164), payments (163) and invoices (163), and
reports 13 wallets / 517 planned ledger entries. Validation still returns
`fail` because media is unmapped, completed reservation links are absent and
the reconciliation is offline; live target balances and media delivery have
not been checked. Five source
tables (accounts, app sessions, budget categories, journal entries and journal
lines) are retained as historical data; budgets, payout runs, company/user
metadata, activity logs and stock-transfer replay are explicitly deferred or
not represented as operational records.
The current source read used one repeatable-read, read-only transaction. Every
fatal conflict and warning must be explained and reconciled before staging
import; staging and production remain untouched. Only sanitized local fixtures
have been imported.
