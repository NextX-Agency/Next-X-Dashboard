#!/usr/bin/env bash
# Rebuilds the DISPOSABLE local rehearsal database from scratch: migrations, then the 15-product design
# fixture and the review owner. Use it after tests that write data (tests/e2e/dashboard-local.spec.ts).
# Stop the dev server first: the database cannot be dropped while it is connected.
#
#   bash scripts/rehearsal/reset-local.sh
set -euo pipefail
PG="${PG_BIN_DIR:-/c/Program Files/PostgreSQL/17/bin}"
ADMIN=postgresql://postgres@127.0.0.1:55432/postgres
DB=postgresql://postgres@127.0.0.1:55432/nextly_migration_rehearsal
"$PG/psql.exe" "$ADMIN" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS nextly_migration_rehearsal WITH (FORCE)" -c "CREATE DATABASE nextly_migration_rehearsal"
"$PG/psql.exe" "$DB" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/auth-compat.sql"
NEXTLY_LOCAL_REHEARSAL=1 DATABASE_URL="$DB" DIRECT_URL="$DB" pnpm db:migrate
"$PG/psql.exe" "$DB" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/visual-seed.sql"
echo "Local rehearsal database reset."
