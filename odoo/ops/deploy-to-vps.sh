#!/usr/bin/env bash
# NextX Odoo staging deploy. Run ON THE VPS, once:
#
#     sudo bash ~/nextx-ops/deploy-to-vps.sh
#
# What it does, in order (every step is logged to ~/nextx-ops/out/deploy-<time>.log):
#   1. refuses to run if Odoo is not healthy; takes a database + filestore BACKUP and verifies it can be read
#   2. installs the NextX addons from the tested payload (nextx_branding, nextx_storefront, nextx_operations, nextx_home)
#   3. read-only audit BEFORE, then installs/upgrades the addons
#   4. generates the storefront secret (once; never printed) and applies the idempotent configuration
#   5. migrates the catalogue, images and opening stock from the Supabase snapshot (idempotent; sets, never adds)
#   6. runs the business-flow test and renders every document (both inside a rolled-back transaction)
#   7. restarts Odoo, waits for it, runs the read-only audit AFTER
# Nothing here touches shop-nextx.com, DNS, Coolify, Supabase, or any accounting entry.
# Roll back: restore the dump printed in step 1 (commands are printed at the end).
set -euo pipefail

OPS="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo:  sudo bash $0"; exit 1; }
# Works from `sudo` and from a root shell: the files belong to the user who owns this directory.
OWNER="${SUDO_USER:-$(stat -c %U "$OPS")}"
DB="${NEXTX_DB:-nextx_staging}"
WEB="${NEXTX_WEB:-odoo20-web}"
DBC="${NEXTX_DBC:-odoo20-db}"
ADDONS="${NEXTX_ADDONS:-/opt/odoo20/extra-addons}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BK="$OPS/backups/$STAMP"
OUT="$OPS/out"
LOG="$OUT/deploy-$STAMP.log"
echo "NextX deploy starting as $(id -un), files owned by $OWNER, in $OPS"
mkdir -p "$BK" "$OUT" "$OPS/secrets"
exec > >(tee -a "$LOG") 2>&1

step() { echo; echo "=================== $* ($(date +%H:%M:%S))"; }
oshell() { docker exec -i "${@:2}" "$WEB" odoo shell -d "$DB" --no-http < "$1"; }

step "1. preflight + backup"
docker ps --format '{{.Names}}' | grep -qx "$WEB" || { echo "container $WEB is not running"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$DBC" || { echo "container $DBC is not running"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8069/web/login)" = "200" ] || { echo "Odoo does not answer on 127.0.0.1:8069"; exit 1; }
docker exec "$DBC" sh -c "pg_dump -U \"\$POSTGRES_USER\" -Fc $DB" > "$BK/$DB.dump"
test -s "$BK/$DB.dump"
docker exec -i "$DBC" pg_restore -l < "$BK/$DB.dump" > "$BK/restore-list.txt"
test -s "$BK/restore-list.txt"
docker cp "$WEB:/var/lib/odoo/filestore/$DB" "$BK/filestore" 2>/dev/null || echo "(no filestore directory yet)"
echo "backup ok: $(du -sh "$BK" | cut -f1) in $BK"

step "2. addons"
for a in nextx_branding nextx_storefront nextx_operations nextx_home; do
  rsync -a --delete --exclude '__pycache__' "$OPS/payload/addons/$a/" "$ADDONS/$a/"
  chown -R root:root "$ADDONS/$a"
  chmod -R go-w "$ADDONS/$a"
done
ls "$ADDONS"

step "3. audit BEFORE, then install / upgrade"
oshell "$OPS/payload/ops/audit_odoo.py" > "$OUT/audit-before-$STAMP.txt" 2>&1 || true
echo "audit before: $OUT/audit-before-$STAMP.txt"
docker exec "$WEB" odoo -d "$DB" -i nextx_operations,nextx_storefront,nextx_home -u nextx_branding --stop-after-init 2>&1 | grep -E "ERROR|CRITICAL|Traceback|nextx_.*loaded" | tail -12

step "4. storefront secret + configuration"
docker cp "$OPS/payload/data" "$WEB:/tmp/nextx-data"
if [ ! -s "$OPS/secrets/storefront.secret" ]; then
  openssl rand -hex 32 > "$OPS/secrets/storefront.secret"
  chmod 600 "$OPS/secrets/storefront.secret"
  chown "$OWNER":"$OWNER" "$OPS/secrets" "$OPS/secrets/storefront.secret"
  cat > "$OPS/payload/ops/_set_secret.py" <<PY
env["ir.config_parameter"].sudo().set_str("nextx_storefront.secret", "$(cat "$OPS/secrets/storefront.secret")")
env.cr.commit()
print("storefront secret set")
PY
  oshell "$OPS/payload/ops/_set_secret.py"
  rm -f "$OPS/payload/ops/_set_secret.py"
fi
oshell "$OPS/payload/ops/configure_nextx.py" -e NEXTX_DATA_DIR=/tmp/nextx-data

step "5. catalogue, images and opening stock (idempotent)"
mkdir -p "$OPS/out/migration"
docker exec "$WEB" mkdir -p /tmp/nextx-out
oshell "$OPS/payload/ops/migrate_supabase.py" -e NEXTX_DATA_DIR=/tmp/nextx-data -e NEXTX_OUT_DIR=/tmp/nextx-out -e NEXTX_PUBLISH=1 | tee "$OUT/migration/migrate-$STAMP.txt" | grep -E "^RESULT|PROBLEM|committed|Error" || true
docker cp "$WEB:/tmp/nextx-out/." "$OUT/migration/" 2>/dev/null || true

step "6. business-flow test and documents (rolled back)"
oshell "$OPS/payload/ops/flow_test.py" > "$OUT/flow-test-$STAMP.txt" 2>&1 || true
grep -E "PASS|FAIL|TOTAL" "$OUT/flow-test-$STAMP.txt" || true
docker exec "$WEB" mkdir -p /tmp/nextx-docs
oshell "$OPS/payload/ops/render_docs.py" -e NEXTX_OUT_DIR=/tmp/nextx-docs -e NEXTX_REPORT_URL=http://127.0.0.1:8069 > "$OUT/render-docs-$STAMP.txt" 2>&1 || true
mkdir -p "$OUT/docs-$STAMP"
docker cp "$WEB:/tmp/nextx-docs/." "$OUT/docs-$STAMP/" 2>/dev/null || true
ls "$OUT/docs-$STAMP" | head -20

step "7. restart (new code must be live) and audit AFTER"
docker exec "$WEB" rm -rf /tmp/nextx-data /tmp/nextx-out /tmp/nextx-docs
docker restart "$WEB" >/dev/null
for i in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8069/web/login)" = "200" ] && break
  sleep 3
done
echo "odoo login: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8069/web/login)"
oshell "$OPS/payload/ops/audit_odoo.py" > "$OUT/audit-after-$STAMP.txt" 2>&1 || true
echo "storefront endpoint without secret (expect 401): $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8069/nextx/store/v1/catalog)"

chown -R "$OWNER":"$OWNER" "$OPS/out" "$OPS/backups"
chmod -R u+rwX,go+rX "$OUT"
chmod 600 "$OPS/secrets/storefront.secret"

step "done"
echo "log:     $LOG"
echo "reports: $OUT"
echo "backup:  $BK"
echo "to roll back the database:"
echo "  docker exec -i $DBC sh -c 'dropdb -U \"\$POSTGRES_USER\" $DB && createdb -U \"\$POSTGRES_USER\" $DB' && \\"
echo "  docker exec -i $DBC sh -c 'pg_restore -U \"\$POSTGRES_USER\" -d $DB' < $BK/$DB.dump && docker restart $WEB"
