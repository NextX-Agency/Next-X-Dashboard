#!/usr/bin/env bash
# Finishes what deploy-to-vps.sh could not (its last step stopped on a permission error inside the container).
# Run on the VPS:   sudo bash /home/lranoesendjojo/nextx-ops/finish-deploy.sh
# Does: removes the private data copied into the container's /tmp (as root), re-applies the configuration (adds the standard
# contact-creation group to rico/aryan), renders every document + receipt (rolled back), checks the real seller accounts
# (rolled back), lists and CANCELS my own test web orders (customer name starting with TEST; nothing is deleted),
# and writes the "audit after". It does not restart Odoo (the new code is already live).
set -uo pipefail
OPS="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo:  sudo bash $0"; exit 1; }
OWNER="${SUDO_USER:-$(stat -c %U "$OPS")}"
WEB="${NEXTX_WEB:-odoo20-web}"; DB="${NEXTX_DB:-nextx_staging}"
STAMP="$(date +%Y%m%d-%H%M%S)"; OUT="$OPS/out"; mkdir -p "$OUT"
exec > >(tee -a "$OUT/finish-$STAMP.log") 2>&1
step() { echo; echo "=================== $* ($(date +%H:%M:%S))"; }
sh_() { docker exec -i "${@:2}" "$WEB" odoo shell -d "$DB" --no-http < "$1"; }

step "1. refresh the scripts from the payload and clean the container's /tmp (as root)"
docker exec -u root "$WEB" rm -rf /tmp/nextx-out /tmp/nextx-docs
docker exec -u root "$WEB" sh -c 'mkdir -p /tmp/nextx-out /tmp/nextx-docs && chmod 777 /tmp/nextx-out /tmp/nextx-docs'

step "2. configuration (idempotent) - sellers get the standard contact-creation group"
sh_ "$OPS/payload/ops/configure_nextx.py" -e NEXTX_DATA_DIR=/tmp/nextx-data 2>&1 | grep -vE " INFO | WARNING |^\s*$" | tail -12

step "3. documents rendered from STAGING (rolled back)"
sh_ "$OPS/payload/ops/render_docs.py" -e NEXTX_OUT_DIR=/tmp/nextx-docs -e NEXTX_REPORT_URL=http://127.0.0.1:8069 > "$OUT/render-docs2-$STAMP.txt" 2>&1
grep -E "wrote|Error|rolled" "$OUT/render-docs2-$STAMP.txt" | cut -c1-110
mkdir -p "$OUT/docs2-$STAMP"; docker cp "$WEB:/tmp/nextx-docs/." "$OUT/docs2-$STAMP/" 2>/dev/null

step "4. real seller accounts (rolled back)"
sh_ "$OPS/payload/ops/seller_check.py" > "$OUT/seller-check-$STAMP.txt" 2>&1
grep -vE " INFO | WARNING |^\s*$" "$OUT/seller-check-$STAMP.txt" | cut -c1-200

step "5. web orders: list, cancel my TEST orders, list other possible test data (nothing deleted)"
sh_ "$OPS/payload/ops/web_orders_and_testdata.py" -e NEXTX_CANCEL_TESTS=1 > "$OUT/web-orders-$STAMP.txt" 2>&1
grep -vE " INFO | WARNING |^\s*$" "$OUT/web-orders-$STAMP.txt" | cut -c1-220

step "6. audit AFTER"
sh_ "$OPS/payload/ops/audit_odoo.py" > "$OUT/audit-after-$STAMP.txt" 2>&1
docker exec -u root "$WEB" rm -rf /tmp/nextx-data /tmp/nextx-out /tmp/nextx-docs
chown -R "$OWNER":"$OWNER" "$OUT"; chmod -R u+rwX,go+rX "$OUT"
echo; echo "done. reports in $OUT"
