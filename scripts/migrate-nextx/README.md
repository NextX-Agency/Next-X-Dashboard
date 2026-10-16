# NextX migration tooling

This directory contains the repeatable, non-UI migration pipeline for the
legacy NextX Dashboard data model. It consumes either a sanitized JSON export
or a direct legacy Postgres connection and produces deterministic destination
ids, dry-run reports, conflict classifications, and idempotent destination
inserts.

## Commands

```bash
pnpm migrate:nextx:inspect -- --source tests/fixtures/nextx-sanitized.json
pnpm migrate:nextx:dry-run -- --source path/to/nextx-export.json
pnpm migrate:nextx:media-audit -- --source path/to/nextx-export.json
pnpm migrate:nextx:owner-review -- --report migration-reports/nextx-dry-run.json
pnpm migrate:nextx:media-prepare -- --source path/to/nextx-export.json \
  --media-preparation-report migration-reports/nextx-media-preparation.json \
  --target-environment staging --confirm-safe-target staging
pnpm migrate:nextx:validate -- --source path/to/nextx-export.json
pnpm migrate:nextx:run -- --source path/to/nextx-export.json \
  --target-environment staging --confirm-safe-target staging
```

The source may also be read from `NEXTX_SOURCE_DATABASE_URL`. Destination
operations use `DIRECT_URL` or `DATABASE_URL` and require an explicit
`local`, `development`, or `staging` confirmation. `production` is rejected.

## Export contract

The preferred export is one JSON object with arrays named after the legacy
Prisma models: `locations`, `categories`, `items`, `stock`, `sales`,
`saleItems`, `wallets`, `walletTransactions`, `financeLedgerEntries`,
`expenses`, `exchangeRates`, `reservations`, and related entities. Both
camelCase Prisma output and raw snake_case exports are accepted. See the
sanitized fixtures under `tests/fixtures/`.

## Safety and restartability

- UUIDv5 ids are derived from `sourceSystem + entity + legacyId`.
- Inserts use `ON CONFLICT (id) DO NOTHING`; a rerun does not duplicate rows.
- Reference data is applied in bounded batches.
- Each canonical sale/order, payment/ledger pair, expense/ledger pair,
  transfer pair, and reservation is applied in its own logical transaction.
- Current legacy stock becomes an explicit `MIGRATION_OPENING_BALANCE`
  adjustment. Legacy stock transfers are retained in the restricted
  `legacy_stock_transfer_archive` with canonical item or bundle and location
  references, but are not replayed into balances, avoiding double counting.
- Legacy mutable wallet balances are never copied into a balance column. Any
  difference between imported ledger net and the reported source balance is an
  explicit opening-balance ledger entry and a warning.
- Reports are written to the ignored `migration-reports/` directory and do not
  contain customer names or full source rows.
- `owner-review` turns a dry-run report into a PII-minimized CSV containing
  conflict categories, safe legacy identifiers, required review actions, and
  blank owner/evidence sign-off columns. It accepts only a report with a
  source checksum and generation time; messages and row details are omitted.
- `media-audit` checks whether every approved public Vercel Blob image can be
  downloaded, decoded and processed within the migration size limit. It prints
  aggregate results only, retains no image bytes and performs no destination
  writes.
- Media preparation is a separate, pre-import write to the isolated self-hosted
  staging Storage bucket. It requires an explicit staging target, a matching
  `NEXTX_STAGING_HOST`, a current `MEDIA_PREPARATION` report, passing
  `SELF_HOSTING`, `COOLIFY_STAGING`, `SUPABASE_RUNTIME` and `RLS` prerequisites,
  and a passing staging Storage upload/public-read/delete smoke test. This
  phase does not relax the final import guard: `migrate:nextx:run` still needs
  all ten readiness gates to pass.

## Conflict policy

`FATAL` conflicts stop a dry-run/import: invalid money precision, missing
financial currency/rate, missing product references, duplicate invoice numbers,
and duplicate SKUs. Legacy sales whose header totals differ from their item
subtotals are imported with both source amounts intact, marked `needs_review`,
and reported as `ORDER_TOTAL_REVIEW_REQUIRED`; they require owner review before
operational acceptance. Exact source-currency line subtotals are stored in
`sale_items.line_total_cents` and shown beside the recorded header and discount
on sale detail. A completed reservation links to an existing sale only through
explicit finance-ledger `reservationIds`, its exact completion-audit invoice
number, or a `reservations-api` completion and sale-creation audit pair sharing
the same `requestId`/`request_id`. Ambiguous links stay fatal; the importer
does not infer links from customer, date, amount, or product similarity. Other
`WARNING` conflicts are imported only with an explicit report, such as negative
stock or wallet opening adjustments. `INFO`
records intentional deferrals and non-replayed history.
