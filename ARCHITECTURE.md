# Nextly commerce core

## Canonical transaction

Orders are the canonical commercial transaction. The existing `sales` table is
the persisted compatibility seam and is exposed to new code as `orders`; a
completed order represents a sale. Web, POS, manual, WhatsApp and Messenger
origins all use the same order model.

## Commerce entities

- `customers` — reusable identity with optional phone/email and walk-in orders
  represented by a nullable customer reference.
- `sales` / `sale_items` — canonical orders and immutable line-price/product
  snapshots. `ORD-` numbers identify new orders; legacy `V` numbers remain
  supported by the existing sales and invoice flow.
- `order_fulfillments` — one pickup or delivery context per order, including
  location and minimal destination/scheduling information.
- `inventory_reservations` — claims against stock; they are not stock
  movements.
- `sale_payments` — append-only money received against an order. Paid and
  balance state are derived from confirmed payments.
- `storefronts` — channel identity, lifecycle, domain, locale, fulfillment
  flags and assigned default price list. One canonical catalog can have many
  storefronts.
- `storefront_products` — the many-to-many exposure layer for products, with
  visibility, ordering, featured state and channel-specific copy/slug
  overrides. It never duplicates product or variant records.
- `price_lists` / `price_list_items` — canonical selling prices by currency and
  variant. Public reads require an active positive price in the storefront's
  assigned list; missing prices are unavailable rather than silently inferred.
- `storefront_locations` — the locations a channel may fulfill from. Public
  availability is calculated centrally from those locations.

## Finance and invoicing

Finance reuses the canonical `sales` / `sale_items` order records and the
existing `ledger_entries` table. It does not introduce a second order or sales
system.

- `wallets` are destinations for money, separate from payment methods. Their
  balances are derived from ledger rows through `v_wallet_balances`.
- `ledger_entries` is append-only and now carries wallet, location, storefront,
  correlation and event metadata. Corrections are new reversal entries.
- `wallet_transfers` posts one correlated outflow and inflow atomically. Only
  same-currency transfers are supported; cross-currency movement remains an
  explicit future FX workflow.
- `sale_payments`, supplier payments and expenses keep their own business
  records while the posting service writes the corresponding wallet ledger
  entry in the same transaction. Payment state and invoice outstanding are
  derived; there is no manually maintained `isPaid` flag.
- `reconciliations` are statement checkpoints against derived wallet balances.
  They preserve history and never rewrite ledger entries.
- Invoices are the stable read/print view of confirmed sales. Invoice numbers
  and sale line snapshots remain on the existing document rows so catalog edits
  cannot rewrite historical invoices.

All new finance writes pass through server actions and the posting service;
server-side authorization remains required because the application database
connection bypasses RLS, while the migration adds RLS policies for the
PostgREST boundary.

## Inventory semantics

Physical inventory remains the append-only `inventory_movements` ledger:

```text
onHand    = physical movements at the location
reserved  = active inventory reservations
available = onHand - reserved
```

Storefront boundaries do not create a second inventory pool: every channel
reads the same movements and reservations, scoped only to its allowed active
locations. Orders may carry an optional `storefront_id` for attribution,
while `source` remains the operational origin (web, POS, manual, etc.). Line
prices are still snapshotted on the order, so later price-list edits cannot
rewrite history.

The public boundary is versioned under `/api/v1/storefront`. It returns safe
catalog DTOs only; internal costs, stock value, audit records and database
identifiers are not part of that contract. Local development resolves
`<storefront-slug>.localhost:3000`, while custom domains resolve to the same
active storefront record.

Confirming an order locks its variants, checks all lines, and creates all
reservations atomically. Cancellation releases active reservations without
changing on-hand stock. Completion consumes reservations and creates outbound
sale movements in the same transaction.

## State machine

```text
DRAFT → CONFIRMED → READY → COMPLETED
  └──────────────→ CANCELLED
                 └────────→ CANCELLED
```

Completed and cancelled orders are terminal. Business transitions live in
`src/lib/order-state.ts` and database mutations live in the order server
actions, not in page components.

## Deliberate boundaries

This phase does not add a CMS, messaging integrations, AI, delivery dispatch,
routing, live tracking, procurement redesign, commission/budget systems, a
full tax engine, or a duplicate product/inventory/order model. Production
NextX data migration remains a separate controlled phase.
