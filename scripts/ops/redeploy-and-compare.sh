#!/usr/bin/env bash
# Redeploy a pinned commit over the already-imported staging database and prove the re-import is
# idempotent: row counts per public table are captured before and after, then diffed.
#
#   sudo bash ~/nextx/scripts/ops/redeploy-and-compare.sh <full-sha> <snapshot.json>
#
# Prints no secrets. Writes <name>.txt files and counts.diff under ~/nextx-migration/compare-<ts>/.
set -euo pipefail
COMMIT="${1:?usage: redeploy-and-compare.sh <full-sha> <snapshot.json>}"
SNAPSHOT="${2:?snapshot path required}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OWNER="$(stat -c %U "$SRC")"
OUT="$(getent passwd "$OWNER" | cut -d: -f6)/nextx-migration/compare-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o "$OWNER" "$OUT"
DB="$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /^supabase\/postgres:/ {print $1}' | head -1)"
[ -n "$DB" ] || { echo "database container not found" >&2; exit 1; }

counts() {
  docker exec "$DB" psql -U postgres -d postgres -At -c \
    "SET default_transaction_read_only = on;
     SELECT table_name || ' = ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
     FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1;" | grep ' = '
}
extra() {
  docker exec "$DB" psql -U postgres -d postgres -At -F ' | ' -c \
    "SET default_transaction_read_only = on;
     SELECT 'storefront', name, status, default_currency FROM public.storefronts ORDER BY name;
     SELECT 'wallet_balance', w.name, w.currency, b.balance_cents FROM public.v_wallet_balances b JOIN public.wallets w ON w.id = b.wallet_id ORDER BY 2,3;
     SELECT 'sales_by_currency', currency, count(*), sum(total_cents) FROM public.sales GROUP BY 2 ORDER BY 2;
     SELECT 'ledger_by_currency', currency, direction, count(*), sum(amount_cents) FROM public.ledger_entries GROUP BY 2,3 ORDER BY 2,3;
     SELECT 'on_hand', count(*), sum(quantity) FROM public.inventory_movements;" 2>&1 | grep -v '^SET$'
}

echo "== before"; counts > "$OUT/counts-before.txt"; extra > "$OUT/extra-before.txt"; wc -l "$OUT"/*-before.txt
bash "$SRC/deploy/vps/deploy-pinned.sh" "$COMMIT" "$SNAPSHOT" "${@:3}" 2>&1 | tee "$OUT/deploy.log" | tail -5
echo "== after"; counts > "$OUT/counts-after.txt"; extra > "$OUT/extra-after.txt"
if diff -u "$OUT/counts-before.txt" "$OUT/counts-after.txt" > "$OUT/counts.diff"; then echo "IDEMPOTENT: no row count changed"; else echo "COUNTS CHANGED:"; cat "$OUT/counts.diff"; fi
diff -u "$OUT/extra-before.txt" "$OUT/extra-after.txt" > "$OUT/extra.diff" && echo "IDEMPOTENT: balances, sales and ledger totals unchanged" || { echo "TOTALS CHANGED:"; cat "$OUT/extra.diff"; }
chown -R "$OWNER" "$OUT"
echo "Evidence: $OUT"
