# NextX: Odoo as the business system, Next.js as the shop

Branch `feat/odoo-storefront`. **Not merged. Production is untouched.** Production still reads Supabase and hands carts to
WhatsApp; every new behaviour here is behind a flag that is off by default.

This repository is **public**. Costs, stock counts, wallet balances and customer data live in
`docs/odoo-migration/private/` (gitignored) and in the owner's private folder, never here.
`scripts/privacy-scan.sh` runs before every push.

## Architecture

```
Browser ──► Next.js (Vercel) ──► server-only layer ──► nextx_storefront addon ──► Odoo 20
                                  src/lib/storefront/odoo      3 narrow endpoints      (source of truth)
```

* The browser never talks to Odoo and never sees its URL or secret. `ODOO_STOREFRONT_URL/SECRET` have no `NEXT_PUBLIC_` prefix and
  the client module is `server-only`.
* The addon exposes exactly three endpoints under `/nextx/store/v1`, guarded by a bearer secret kept in the Odoo system parameter
  `nextx_storefront.secret`: `GET /catalog`, `POST /availability`, `POST /orders`. No generic RPC. A leaked secret can read the
  published catalogue and create web orders, nothing else. Cost, margin and partner data are never returned.
* `STOREFRONT_SOURCE=supabase|odoo` selects the catalogue source (default `supabase`). Orders: `STOREFRONT_ORDERS=odoo` (server) and
  `NEXT_PUBLIC_STOREFRONT_ORDERS=odoo` (UI flag, not a secret). Asking for Odoo without credentials falls back to Supabase and logs it.
* Checkout: browse → cart (no stock held) → *Bestelling plaatsen* → Odoo re-checks live stock under a row lock → creates and confirms
  the sales order (which reserves stock at the chosen pickup shop) → order number shown, with an optional WhatsApp confirmation.
  The idempotency key means a retry or double tap returns the same order.
* No permanent dual write. Supabase becomes archive/read-only after cutover; the unmerged Supabase order system on
  `claude/dashboard-webshop-flow-analysis-jac2cj` should be **abandoned**, not merged.

## What is in the branch

| Area | Where |
|---|---|
| Odoo addons (tested on a real Odoo 20) | `odoo/addons/nextx_branding`, `nextx_storefront`, `nextx_operations` |
| Idempotent Odoo configuration, migration, audit, tests, document rendering | `odoo/ops/*.py`, `deploy-to-vps.sh` |
| Supabase read-only export, artifact builder, image fetcher | `scripts/odoo-migration/*` |
| Storefront data seam, slugs, SEO, order API | `src/lib/storefront`, `src/services/storefront`, `src/app/api/store` |
| Legacy URL map (68 one-hop 301s), slug registry | `src/data/*.json`, `docs/odoo-migration/redirect-map.csv` |
| Verifiers | `scripts/verify-redirects.mjs`, `tests/unit`, `tests/integration/odoo-storefront.mjs` |

## Odoo setup (standard Odoo first)

One warehouse "NextX", the three real shops as internal locations under its stock location (named after the real shops, adopted by
external id), one POS per shop sourcing from its own shop. One-step receipts, one normal manual internal transfer (no transit, no
Push, no pack, no replenishment rules), AVCO costing, three landed-cost products (Freight, Import / Handling, Other), SRD base
currency with USD, SRD price list first so customers and web orders default to SRD. No tax is configured or assumed: that waits for
an accountant-approved Surinamese setup. Supplier purchasing is plain Odoo: PO → receive (partial + backorder) → vendor bill → landed cost.

Small addons only where standard Odoo falls short:

* `nextx_branding`: document layout and stylesheet, 80 mm black-and-white POS receipt, mail templates.
* `nextx_operations`: Odoo 20 raises `AccessError` for a POS seller who sells a product that carries landed cost (landed-cost
  models are Stock-Manager only but are read when valuing the outgoing move). This grants internal users **read-only** access.
* `nextx_storefront`: the three endpoints above.

## Brand

Real NextX assets only (logo, orange `#F97015`, dark `#111111`). Orange is an accent (rules, buttons), never body text. The A4 documents
(quotation, order, invoice, credit note, purchase order, delivery slip) share one layout; the receipt uses a 1-bit mark derived from the real logo
(`odoo/ops/build_receipt_logo.py`) because colour fills and hairlines smear on thermal paper. No legal, tax, bank or address
details are invented: the footer and header carry only `shop-nextx.com`, the name and the country until the owner supplies the rest.

## SEO (all verified on the Vercel preview)

* One canonical host (`https://www.shop-nextx.com`) for canonical tags, sitemap, robots and structured data. Before: canonicals
  pointed at the apex, which 301s to `www`.
* Readable slugs (`/audio/kz-as16-pro-x`), permanent once published (`src/data/storefront-slugs.json`). All 68 legacy URLs
  (`/catalog/<uuid>`, `/audio/<uuid>`, `/watches/<uuid>`) make **one** 301 hop to a 200 page: `node scripts/verify-redirects.mjs <base>`.
* Sitemap lists only final URLs from the active source. Before: 20 watch URLs in the sitemap returned 404 and `/watches` was missing.
* Product, Offer (price, SRD, availability) and Breadcrumb JSON-LD rendered on the server with absolute URLs and a base-currency price.
  Before: built on the client with an empty URL on first paint and a price that followed the visitor's currency toggle.
* A branded Dutch 404 page.

## Operations

```bash
# on the VPS, once (backs up, installs, configures, migrates, tests, restarts)
sudo bash ~/nextx-ops/deploy-to-vps.sh

# local checks
pnpm test:unit
node scripts/verify-redirects.mjs https://<preview-or-prod>
ODOO_STOREFRONT_URL=https://<odoo>/nextx/store/v1 ODOO_STOREFRONT_SECRET=... node tests/integration/odoo-storefront.mjs
```

## Production cutover, in order

1. Run the deploy script on staging; read `~/nextx-ops/out/audit-after-*.txt`, `flow-test-*.txt`, `migration/*`.
2. Owner: physical count of stock per shop, cash and bank per shop and currency, a current USD→SRD rate, confirmation of every cost
   marked NEEDS_OWNER_CONFIRMATION, and the SRD 17,000 "savings" wallet and the open receivable.
3. Accountant: Surinamese chart, taxes, periods; then post **one** balanced opening entry.
4. Set `STOREFRONT_SOURCE=odoo` on the **Preview** environment pointing at staging; run the integration test and a manual checkout.
5. Production Odoo (or promote staging) with a verified backup and a restore test; real payment methods; SMTP; thermal printer test.
6. Merge the branch; set `STOREFRONT_SOURCE=odoo` and (when ready) the order flags on Production; keep WhatsApp as the fallback button.
7. Make Supabase read-only; remove the dual source.
