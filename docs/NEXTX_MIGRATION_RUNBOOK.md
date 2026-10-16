# NextX migration runbook

This runbook is for a controlled Nextly staging import. It does not authorize
or automate a production import. Production remains untouched until every
go/no-go criterion is approved by the business owner and the operator.

## Pre-migration

1. Provision the isolated self-hosted Supabase stack in the Coolify
   `NextX-Migration-Staging` project and `staging` environment. Record its
   pinned release/config revision and private service names.
2. Confirm the destination is not production. The tooling rejects a production
   target, but the operator must still verify the project identity out of band.
3. Take a source backup/export and a destination backup. Keep credentials out
   of the repository and terminal transcripts.
4. Confirm the source export includes products, stock, customers, sales,
   payments, refunds, wallets, expenses, FX rates, invoices, bundles, sellers,
   commissions, recurring expenses, obligations, settings and a count manifest
   for every other public source table.
5. Compare the export to [the audited parity inventory](NEXTX_FEATURE_PARITY.md).
   If any populated module has no approved destination mapping, stop: the
   importer intentionally refuses to write while those gaps remain.
6. Run the code quality gates before touching the destination:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm exec drizzle-kit check
```

## Freeze

Use a source write freeze for the final export window. If a freeze is not
possible, record the export timestamp and source write policy; do not silently
mix a changing source with a historical reconciliation.

## Migration

Configure isolated self-hosted staging credentials only in Coolify's secret
store or a temporary local shell. Keep both destination database connections
on the private VPS network; the source connection remains read-only:

```bash
export NEXTX_SOURCE_DATABASE_URL='postgresql://...'
export NEXTLY_MIGRATION_TARGET='staging'
export DATABASE_URL='postgresql://...'
export DIRECT_URL='postgresql://...'
```

Apply Nextly migrations to the isolated target through the normal workflow.
Confirm the target identity before connecting. Never use `db:reset`,
`DROP DATABASE`, `DROP SCHEMA`, or force migration commands:

```bash
pnpm db:migrate
```

Inspect and dry-run the source. Prefer a sanitized export when one is
available, because reports are easier to retain and review:

```bash
pnpm migrate:nextx:inspect -- --source path/to/nextx-export.json
pnpm migrate:nextx:dry-run -- --source path/to/nextx-export.json \
  --out migration-reports/nextx-staging-dry-run.json
```

Review the JSON and text reports. Resolve every `fatal` conflict before an
import. Warnings require a named owner and written explanation.

Run the guarded staging import:

```bash
pnpm migrate:nextx:run -- --source path/to/nextx-export.json \
  --readiness-report migration-reports/nextx-readiness.json \
  --target-environment staging --confirm-safe-target staging \
  --out migration-reports/nextx-staging-run.json
```

The runner uses deterministic UUIDv5 mappings, bounded reference/inventory
batches, and transaction boundaries that keep each order, payment/ledger pair,
expense/ledger pair, transfer pair, and reservation coherent. It refuses to
write until the readiness report marks all ten gates `PASS` and matches the
current Git working-tree fingerprint.

## Validation

Run the online validation against the same confirmed staging target:

```bash
pnpm migrate:nextx:validate -- --source path/to/nextx-export.json \
  --target-environment staging --confirm-safe-target staging \
  --out migration-reports/nextx-staging-validation.json
```

Also run the application smoke suite against the isolated database. Verify
`/dashboard`, `/products`, `/inventory`, `/customers`, `/orders`,
`/storefronts`, `/finance`, `/wallets`, `/expenses`, and `/invoices` with an
owner, staff, viewer, and unauthenticated browser context. Confirm that public
storefront endpoints do not expose finance or internal catalog tables.

## Local migration dress rehearsal

The repository includes a disposable PostgreSQL rehearsal so the migration can
be exercised without Docker, Supabase, or production credentials. It uses
PostgreSQL 17 on `127.0.0.1:55432`, database
`nextly_migration_rehearsal`, and data under `.local-rehearsal/`. The normal
PostgreSQL service on port 5432 is not used.

From PowerShell:

```powershell
pnpm db:rehearsal:start
pnpm db:rehearsal:run
pnpm db:rehearsal:rls
pnpm db:rehearsal:constraints
pnpm db:rehearsal:concurrency
pnpm db:rehearsal:stop
```

`db:rehearsal:run` applies all migration files, loads three synthetic members,
inspects the schema, performs the NextX dry-run, imports the sanitized fixture,
repeats the import, validates imported rows, then runs RLS, constraint and
concurrency suites. The latest fixture contains 45 source rows and produces 63
operations in 11 logical batches, including a restricted archive row for its
historical stock transfer. On 2026-09-24 the combined run applied all 45
migrations, repeated the import, then passed 64/64 import validations, 123/123
RLS checks, 17/17 constraint checks and 15/15 concurrency checks. The
commission race produced one payout and one ledger debit across two callers.
The local auth shim and synthetic member IDs are rehearsal-only; no Supabase
auth data or password hashes are copied.

The current chain includes additive migration `0034_self_hosted_media`. It adds
an idempotency key for signed image finalization and creates private staging
and public derivative Storage buckets when the Supabase Storage schema exists.
The isolated PostgreSQL rehearsal has no Storage schema and skips that bucket
setup. Confirm both bucket policies and MIME/size limits in Supabase staging.

Migration `0039_expense_receipt_storage` adds the private receipt bucket and
the dedicated expense receipt-reference field. Legacy expense receipt numbers
map to that field; the source schema has no attached expense-file storage.
New receipts are directly uploaded with short-lived path-scoped tokens,
validated server-side, served only through one-minute signed download links,
and included in the separate Storage backup/restore set.

Migration `0040_expense_review_metadata` adds legacy vendor/classification and
review metadata. Existing reviewer account IDs remain as source IDs because
legacy auth users are not automatically provisioned; new review actions record
the authenticated Nextly member separately. Unrecognized classifications stop
the import with a fatal mapping conflict instead of silently becoming an
operating expense. Operating-profit reports keep inventory and owner draws out
of expenses, matching the legacy report treatment.

Migration `0041_sales_product_review_flags` adds the source review flags and
reasons to canonical sales and products. The importer carries these into the
destination and both lists expose flagged records and their source reasons.

Migrations `0043_legacy_stock_transfer_archive` and
`0044_legacy_stock_transfer_bundle_reference` preserve historical NextX stock
transfers in a forced-RLS archive with no grants to API roles. Rows reference
the canonical product variant or bundle, both canonical locations, original
source IDs, quantity, notes and timestamp. They are not replayed into stock
because the source's current quantity is imported as the opening balance.

The chain also includes `0033_notifications`. It stores
one owner (`member_id`) per in-app notification, derives unread state from
nullable `read_at`, and applies forced RLS policies for owner-only SELECT and
UPDATE. Creation is server-side only; authenticated clients have no INSERT or
DELETE policy. The isolated runtime matrix covers anonymous, viewer A, viewer
B, staff, and owner identities, including cross-user reads and mutations.

Migration `0036_commissions` adds sellers, category-specific basis-point rates,
sale-time commission snapshots, and payout links. RLS permits members to read,
owners to edit seller/rate data and insert payout records, and owner/staff roles
to append commission rows; commission state has no authenticated update policy.
The runtime suite verifies those boundaries for owner, staff, viewer and anon.

Migration `0038_legacy_catalog_price_archive` stores exact legacy catalog price
decimals when source precision exceeds cents. The archive table has forced RLS,
no client policies and no API-role grants. Catalog prices use explicit
half-away-from-zero rounding to minor units; the live dry-run currently creates
38 protected archive operations and 38 informational rounding records.

## Legacy media preparation

This is a pre-import write to the isolated self-hosted staging Storage bucket.
It must run after `SELF_HOSTING`, `COOLIFY_STAGING`, `SUPABASE_RUNTIME`, and
`RLS` pass, and after a synthetic Storage upload/public-read/delete smoke test
has passed. Copying media before the final dry-run allows the transformed
source plan to include the self-hosted object map; it does not import database
rows or modify the legacy source. The relational import remains blocked until
the separate final report has all ten readiness gates set to `PASS`.

Run the read-only source/CDN preflight before preparing a staging media map.
It downloads the public legacy images in memory, validates their format and
size, and reports counts and generic error categories without persisting image
bytes or writing to Supabase Storage. Supply the read-only source through the
approved process environment or a verified export file:

```powershell
pnpm migrate:nextx:media-audit
```

Freeze the working tree before creating the media-preparation report. The
report must match the current fingerprint and staging hostname:

```powershell
pnpm migrate:nextx:readiness-fingerprint
# Create nextx-media-preparation.json only after recording the prerequisite
# evidence described above. Its required shape is:
# {
#   "phase": "MEDIA_PREPARATION",
#   "generatedAt": "<ISO-8601 timestamp>",
#   "workingTreeFingerprint": "<fingerprint from the command above>",
#   "targetEnvironment": "staging",
#   "stagingHost": "<exact NEXTX_STAGING_HOST>",
#   "storageSmokeTest": "PASS",
#   "gates": {
#     "SELF_HOSTING": "PASS",
#     "COOLIFY_STAGING": "PASS",
#     "SUPABASE_RUNTIME": "PASS",
#     "RLS": "PASS"
#   }
# }
pnpm migrate:nextx:media-prepare -- --source path/to/nextx-export.json `
  --media-preparation-report migration-reports/nextx-media-preparation.json `
  --target-environment staging --confirm-safe-target staging
```

Any working-tree change invalidates the report. The command also requires an
HTTPS self-hosted endpoint whose host matches both the report and
`NEXTX_STAGING_HOST`; it rejects Supabase Cloud. The final staging database
import still uses the all-ten-gate report, including migration dry-run and
reconciliation. No media copy has run because the prerequisite gates and
isolated staging stack are not ready.

## Backup / restore rehearsal

The following PowerShell workflow was exercised against the disposable local
rehearsal database on `127.0.0.1:55432`. The dump path is ignored by Git.

```powershell
$Database = 'postgresql://postgres@127.0.0.1:55432/nextly_migration_rehearsal'
$AdminDatabase = 'postgresql://postgres@127.0.0.1:55432/postgres'
$RunId = [DateTime]::UtcNow.ToString('yyyyMMdd_HHmmss')
$RestoreName = "nextly_migration_restore_rehearsal_$RunId"
$RestoreDatabase = "postgresql://postgres@127.0.0.1:55432/$RestoreName"
$BackupPath = ".local-rehearsal/backups/nextly-rehearsal-$RunId.dump"

if (Test-Path -LiteralPath $BackupPath) {
  throw 'Backup path already exists; choose a new run identifier.'
}
New-Item -ItemType Directory -Force -Path (Split-Path $BackupPath -Parent) | Out-Null
& 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe' $Database `
  -Fc --no-owner --no-privileges -f $BackupPath
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' --list $BackupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup archive verification failed.' }

$ExistingDatabase = (& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' $AdminDatabase `
  -tAc "SELECT 1 FROM pg_database WHERE datname = '$RestoreName'") -join ''
if ($LASTEXITCODE -ne 0) { throw 'Restore target preflight failed.' }
if ($ExistingDatabase.Trim() -eq '1') {
  throw 'Restore target already exists; choose a new unique name.'
}
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' $AdminDatabase `
  -v ON_ERROR_STOP=1 -c "CREATE DATABASE $RestoreName"
if ($LASTEXITCODE -ne 0) { throw 'Could not create the restore database.' }
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' `
  --no-owner --no-privileges --dbname=$RestoreDatabase $BackupPath
if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed.' }

& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' $RestoreDatabase `
  -v ON_ERROR_STOP=1 -c `
  "SELECT (SELECT count(*) FROM products) AS products,
          (SELECT count(*) FROM sales) AS orders,
          (SELECT count(*) FROM inventory_movements) AS inventory_movements,
          (SELECT count(*) FROM sale_payments) AS payments,
          (SELECT count(*) FROM wallets) AS wallets,
          (SELECT count(*) FROM ledger_entries) AS ledger_entries,
          (SELECT count(*) FROM members) AS members,
          (SELECT count(*) FROM product_images) AS product_images,
          (SELECT count(*) FROM legacy_catalog_price_archive) AS catalog_price_archive,
          (SELECT count(*) FROM commissions) AS commissions,
          (SELECT count(*) FROM sellers) AS sellers,
          (SELECT count(*) FROM finance_obligations) AS obligations,
          (SELECT count(*) FROM legacy_store_settings) AS legacy_settings,
          (SELECT count(*) FROM sales WHERE invoice_number IS NOT NULL) AS invoice_numbered_sales,
          (SELECT count(*) FROM drizzle.__drizzle_migrations) AS migrations,
          to_regclass('public.notifications') AS notifications"
```

The latest 332,139-byte custom-format archive at
`.local-rehearsal/backups/nextly-46-migration-20260925-1708z.dump` from the
46-migration rehearsal database restored into the new isolated
`nextly_migration_restore_20260925_1708z` database. Source and restore counts
match for 46 migrations, 2 products, 3 sales, 3 sale items, 862,000 summed
line-total cents, zero null line totals, 2 payments, 3 inventory movements,
1 archived stock transfer, 1 synthetic payout-run archive smoke row,
8 ledger entries and 4 members. The query also matched wallets, product images,
commissions, sellers, obligations, restricted settings and catalog archives.
This is synthetic local evidence only; offsite and staging restores remain
unverified.

Earlier 42-, 43- and 45-migration restores are superseded by this 46-migration
restore. Offsite copies, Coolify volumes, Supabase Storage and production
backup configuration remain unverified.

## Go / No-Go criteria

Go only when all of the following are true:

- zero fatal migration conflicts;
- complete source table counts and an approved mapping for every populated
  operational module;
- all expected product and variant mappings are accounted for, with duplicate
  SKU conflicts resolved explicitly;
- every `Variant + Location` stock balance equals the source or has a recorded
  opening-balance exception;
- every migrated order total matches in exact supported cents;
- valid payments reconcile to source payments without ledger double counting;
- wallet balances reconcile or every difference is an explicit approved opening
  adjustment;
- historical invoice numbers and order relationships are preserved;
- all customer-facing images, store identity, public routes and checkout
  behavior are verified against the source experience;
- auth/member handling is approved without password-hash copying;
- critical RLS, authorization, and browser smoke tests pass;
- the restore procedure has been demonstrated on an isolated database.

Any unmet criterion is No-Go. “Looks good” is not an acceptance state.

## Rollback

For staging, restore the destination snapshot into a fresh isolated project or
restore the pre-import snapshot. Re-run the same source checksum and import
there; do not use an unscoped delete-all rollback script. For production, use
the approved database backup/snapshot restore strategy and pause writes until
the restore is verified.

## Post-migration

Retain the source checksum, dry-run report, mapping state, validation report,
backup identifiers, conflict decisions, and operator approval with the release
record. Remove temporary source credentials from the shell/secret store when
the controlled window ends. Keep the source write freeze until the business
signs off on counts, inventory, payments, finance, invoices, and public catalog
smoke tests.
