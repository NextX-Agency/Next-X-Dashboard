#!/usr/bin/env bash
# Installs / updates ONLY the NextX home screen addon (nextx_home) on the staging Odoo. Run ON THE VPS:
#
#     sudo bash ~/nextx-ops/deploy-home-screen.sh
#
# 1. takes a quick database backup (verified readable)   2. copies the addon from the tested payload
# 3. installs or upgrades nextx_home (internal users then land on the tile screen after login)
# 4. restarts Odoo so the new assets are served, waits for it, checks the login page answers.
# Roll back: uninstall "NextX Home Screen" in Apps (users keep working, they just see the standard menu again after
# clearing their landing action), or restore the dump printed in step 1.
set -euo pipefail

OPS="$(cd "$(dirname "$0")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo:  sudo bash $0"; exit 1; }
DB="${NEXTX_DB:-nextx_staging}"
WEB="${NEXTX_WEB:-odoo20-web}"
DBC="${NEXTX_DBC:-odoo20-db}"
ADDONS="${NEXTX_ADDONS:-/opt/odoo20/extra-addons}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BK="$OPS/backups/home-$STAMP"
mkdir -p "$BK" "$OPS/out"
exec > >(tee -a "$OPS/out/home-screen-$STAMP.log") 2>&1

step() { echo; echo "=================== $* ($(date +%H:%M:%S))"; }

step "1. backup"
docker exec "$DBC" sh -c "pg_dump -U \"\$POSTGRES_USER\" -Fc $DB" > "$BK/$DB.dump"
test -s "$BK/$DB.dump"
docker exec -i "$DBC" pg_restore -l < "$BK/$DB.dump" > "$BK/restore-list.txt"
test -s "$BK/restore-list.txt"
echo "backup ok: $(du -sh "$BK" | cut -f1) in $BK"

step "2. addon files"
rsync -a --delete --exclude '__pycache__' "$OPS/payload/addons/nextx_home/" "$ADDONS/nextx_home/"
chown -R root:root "$ADDONS/nextx_home"; chmod -R go-w "$ADDONS/nextx_home"
ls "$ADDONS/nextx_home"

step "3. install / upgrade nextx_home"
INSTALLED="$(docker exec "$DBC" sh -c "psql -U \"\$POSTGRES_USER\" -d $DB -tAc \"select state from ir_module_module where name='nextx_home'\"" || true)"
if [ "$INSTALLED" = "installed" ]; then FLAG="-u"; else FLAG="-i"; fi
docker exec "$WEB" odoo -d "$DB" $FLAG nextx_home --stop-after-init 2>&1 | grep -E "ERROR|CRITICAL|Traceback|nextx_home.*loaded" | tail -8

step "4. restart and check"
docker restart "$WEB" >/dev/null
for i in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8069/web/login)" = "200" ] && break
  sleep 3
done
echo "login page: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8069/web/login)"
echo "storefront API still answers (401 without the secret is correct): $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8069/nextx/store/v1/catalog)"
echo; echo "done. Log in and you land on the NextX tile screen. Log: $OPS/out/home-screen-$STAMP.log"
