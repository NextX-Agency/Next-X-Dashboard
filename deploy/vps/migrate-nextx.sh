#!/usr/bin/env bash
# Import the legacy NextX data into the self-hosted NextX stack on this VPS.
# Called by deploy-nextx.sh --migrate <snapshot.json>; runs as root so the
# stack secrets never leave /etc/nextx.
#
# Phases, each of which stops the run on failure:
#   1. Host checks: self-hosting, isolated staging stack, Supabase runtime,
#      RLS posture, a Storage upload/public-read/delete smoke test, and a
#      backup of the target that is restored into a scratch database.
#   2. Tooling container (deploy/vps/migrate-nextx.container.sh): legacy media
#      copy and delivery check, the dry-run with the media map, the readiness
#      report, the guarded import and online validation.
#   3. Host checks after the import: anonymous API access returns no rows.
#
# The source is a frozen JSON snapshot taken read-only from the legacy
# database (pnpm migrate:nextx:snapshot), so no legacy credentials are needed
# here. Reports go to ~<owner>/nextx-migration/run-<timestamp>/; they omit
# customer names and row values by design. The snapshot itself contains
# customer data: keep it private and delete it once the import is accepted.
set -euo pipefail

SNAPSHOT="$(realpath "$1")"
: "${PROJECT:?}" "${ENV_FILE:?}" "${API_HOST:?}" "${API_PORT:?}" "${APP_PORT:?}" "${PANGOLIN_HOST_IP:?}"

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK="$SRC/deploy/supabase"
OVERRIDE="$SRC/deploy/vps/docker-compose.pangolin.yml"
OWNER="$(stat -c %U "$SRC")"
OWNER_HOME="$(getent passwd "$OWNER" | cut -d: -f6)"
EVIDENCE="$OWNER_HOME/nextx-migration/local-evidence.json"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$OWNER_HOME/nextx-migration/run-$RUN_ID"
BACKUPS=/var/backups/nextx
SCRATCH_DB=nextx_restore_check

step() { printf '\n--> %s\n' "$*"; }
die() { printf '\nMIGRATION STOPPED: %s\n' "$*" >&2; exit 1; }
compose() {
  docker compose -p "$PROJECT" --project-directory "$STACK" --env-file "$ENV_FILE" \
    -f "$STACK/docker-compose.yml" -f "$OVERRIDE" "$@"
}
env_get() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '\r'; }
psql_db() { compose exec -T db psql -v ON_ERROR_STOP=1 -X -q -t -A -U postgres "$@"; }
# The scratch restore runs as Supabase's superuser so it can recreate schemas.
psql_admin() { compose exec -T db psql -v ON_ERROR_STOP=1 -X -q -t -A -U supabase_admin "$@"; }
gate() { printf '"%s": "%s"' "$1" "$2"; }

install -d -m 700 "$BACKUPS"
install -d -o "$OWNER" -m 700 "$OWNER_HOME/nextx-migration"
install -d -o "$OWNER" -m 700 "$WORK"
trap 'chown -R "$OWNER" "$WORK" 2>/dev/null || true' EXIT

[ -f "$EVIDENCE" ] || die "Local evidence file missing: $EVIDENCE"
grep -q '"TESTS": *"PASS"' "$EVIDENCE" || die "Local evidence does not record passing tests"
grep -q '"FEATURE_PARITY": *"PASS"' "$EVIDENCE" || die "Local evidence does not record the owner parity decisions"

ANON="$(env_get ANON_KEY)"
SRK="$(env_get SERVICE_ROLE_KEY)"
API="http://127.0.0.1:${API_PORT}"

# ─── 1. Host checks ──────────────────────────────────────────────────────────
step "SELF_HOSTING: Supabase endpoints are on this VPS, not Supabase Cloud"
public_url="$(env_get SUPABASE_PUBLIC_URL)"
case "$public_url" in
  https://"$API_HOST") ;;
  *) die "SUPABASE_PUBLIC_URL is $public_url, expected https://$API_HOST" ;;
esac
case "$public_url" in *supabase.co*|*supabase.com*) die "Supabase Cloud endpoint configured" ;; esac
health="$(curl -s -m 10 "http://${PANGOLIN_HOST_IP}:${APP_PORT}/api/health")"
echo "$health" | grep -q '"environment":true' || die "App rejects its runtime environment: $health"
echo "ok"

step "COOLIFY_STAGING: isolated staging stack (Docker Compose project '$PROJECT'; Coolify is not used)"
[ "$(env_get NEXTX_ENVIRONMENT)" = staging ] || die "NEXTX_ENVIRONMENT is not staging"
for port in 15432 16543; do
  bound="$(ss -tln | awk '{print $4}' | grep -E "[:.]${port}\$" || true)"
  [ -z "$bound" ] || ! echo "$bound" | grep -vq '^127\.0\.0\.1:' \
    || die "Database port $port is bound beyond loopback: $bound"
done
echo "ok: database and pooler ports are loopback-only"

step "SUPABASE_RUNTIME: every service healthy and answering"
unhealthy="$(compose ps --format '{{.Service}}|{{.Health}}|{{.State}}' \
  | awk -F'|' '$2 != "healthy" && !($2 == "" && $3 == "running") {print $1"("$2" "$3")"}')"
[ -z "$unhealthy" ] || die "Unhealthy services: $unhealthy"
for path in /auth/v1/health /storage/v1/status /rest/v1/; do
  code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" "$API$path")"
  [ "$code" = 200 ] || die "$path answered HTTP $code"
done
echo "$health" | grep -q '"database":true' || die "App cannot reach the database: $health"
echo "ok"

step "RLS: every public table enforces row-level security"
no_rls="$(psql_db -d postgres -c "SELECT string_agg(c.relname, ', ') FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity")"
[ -z "$no_rls" ] || die "Public tables without RLS: $no_rls"
echo "ok: $(psql_db -d postgres -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'") public tables, all with RLS"

step "Storage smoke test: upload, public read over HTTPS, delete"
# The public bucket accepts only WebP/AVIF, so the probe is a 1x1 WebP.
probe="migration-smoke/$RUN_ID.webp"
probe_file="$(mktemp)"
echo 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA' | base64 -d > "$probe_file"
code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST   "$API/storage/v1/object/nextly-product-images/$probe"   -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H 'Content-Type: image/webp'   --data-binary "@$probe_file")"
[ "$code" = 200 ] || die "Smoke upload answered HTTP $code"
read_back="$(curl -s -m 20 "https://$API_HOST/storage/v1/object/public/nextly-product-images/$probe" | sha256sum | cut -d' ' -f1)"
[ "$read_back" = "$(sha256sum < "$probe_file" | cut -d' ' -f1)" ]   || die "Public read over https://$API_HOST did not return the uploaded object"
rm -f "$probe_file"
code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE   "$API/storage/v1/object/nextly-product-images/$probe"   -H "apikey: $SRK" -H "Authorization: Bearer $SRK")"
[ "$code" = 200 ] || die "Smoke delete answered HTTP $code"
echo "ok"

step "BACKUP_RESTORE: back up the target and restore it into a scratch database"
dump="$BACKUPS/nextx-pre-import-$RUN_ID.dump"
compose exec -T db pg_dump -U postgres -d postgres -Fc -n public -n private -n drizzle --no-publications --no-subscriptions > "$dump"
chmod 600 "$dump"
compose exec -T db pg_restore --list < "$dump" >/dev/null || die "Backup archive is unreadable"
psql_admin -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH_DB" >/dev/null
psql_admin -d postgres -c "CREATE DATABASE $SCRATCH_DB" >/dev/null
psql_admin -d "$SCRATCH_DB" < "$SRC/scripts/rehearsal/auth-compat.sql" >/dev/null
compose exec -T db pg_restore -U supabase_admin -d "$SCRATCH_DB" --clean --if-exists --no-owner   --exit-on-error < "$dump" || die "Restore into $SCRATCH_DB failed"
count_query="SELECT string_agg(t || '=' || n, ',' ORDER BY t) FROM (
  SELECT c.relname AS t, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r') s"
src_counts="$(psql_db -d postgres -c "$count_query"); $(psql_db -d postgres -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')"
dst_counts="$(psql_admin -d "$SCRATCH_DB" -c "$count_query"); $(psql_admin -d "$SCRATCH_DB" -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')"
psql_admin -d postgres -c "DROP DATABASE $SCRATCH_DB" >/dev/null
[ "$src_counts" = "$dst_counts" ] || die "Restored row counts differ from the target"
echo "ok: $(echo "$dst_counts" | tr ',' '\n' | wc -l) tables and the migration ledger match; backup kept at $dump"

cat > "$WORK/host-gates.json" <<EOF
{
  "checkedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  $(gate SELF_HOSTING PASS),
  $(gate COOLIFY_STAGING PASS),
  "coolifyNote": "Satisfied by the isolated Docker Compose staging project '$PROJECT'; Coolify is not used on this VPS.",
  $(gate SUPABASE_RUNTIME PASS),
  $(gate RLS PASS),
  $(gate BACKUP_RESTORE PASS),
  "storageSmokeTest": "PASS",
  "preImportBackup": "$dump"
}
EOF

# ─── 2. Tooling container ────────────────────────────────────────────────────
step "Media copy, dry-run, readiness report, import and validation"
cp "$EVIDENCE" "$WORK/local-evidence.json"
docker run --rm --network "${PROJECT}_default" \
  -v "$SRC":/src:ro \
  -v "$SNAPSHOT":/in/snapshot.json:ro \
  -v "$WORK":/out \
  -e DIRECT_URL="postgresql://postgres:$(env_get POSTGRES_PASSWORD)@db:5432/postgres" \
  -e NEXTLY_DATABASE_MODE=self-hosted \
  -e NEXT_PUBLIC_SUPABASE_URL="https://$API_HOST" \
  -e SUPABASE_SECRET_KEY="$(env_get SUPABASE_SECRET_KEY)" \
  -e NEXTX_STAGING_HOST="$API_HOST" \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e CI=true \
  node:22-alpine sh /src/deploy/vps/migrate-nextx.container.sh \
  || die "The tooling container stopped; reports so far are in $WORK"

# ─── 3. After the import ─────────────────────────────────────────────────────
step "Deactivating the unused default wallets seeded by the schema"
compose exec -T db psql -v ON_ERROR_STOP=1 -X -q -U postgres -d postgres \
  < "$SRC/deploy/vps/retire-seeded-wallets.sql" || die "Default wallet clean-up failed"
echo "ok: active wallets $(psql_db -d postgres -c 'SELECT count(*) FROM wallets WHERE active')"

step "RLS after import: the public anon key reads no business data"
leaks=
for table in members customers sales sale_items sale_payments ledger_entries wallets expenses \
             commissions finance_obligations legacy_store_settings legacy_reservation_archive; do
  rows="$(curl -s -m 10 -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    "$API/rest/v1/$table?select=*&limit=1")"
  case "$rows" in
    '[]'|*'"code"'*) ;;  # empty, or refused by Postgres/PostgREST
    *) leaks="$leaks $table" ;;
  esac
done
[ -z "$leaks" ] || die "Anonymous API key can read rows from:$leaks"
echo "ok"

step "Post-import backup"
post_dump="$BACKUPS/nextx-post-import-$RUN_ID.dump"
compose exec -T db pg_dump -U postgres -d postgres -Fc -n public -n private -n drizzle --no-publications --no-subscriptions > "$post_dump"
chmod 600 "$post_dump"
echo "ok: $post_dump"

echo
echo "Migration complete. Reports: $WORK"
