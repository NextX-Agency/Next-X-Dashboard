#!/usr/bin/env bash
# Run on the VPS:  sudo bash ~/nextx-ops/run-audit.sh
# Read-only. Writes a report to ~/nextx-ops/out/ that the VPS user (and Claude over SSH) can read.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OWNER="${SUDO_USER:-$(id -un)}"
OUT="$HERE/out"
mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M%S)"

{
  echo "# host: $(hostname)  time: $(date -Is)"
  echo "## containers"; docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}'
  echo "## disk";       df -h / | tail -1
  echo "## memory";     free -h | sed -n 2p
  echo "## odoo log (last 30 lines, errors/warnings only)"
  docker logs --tail 400 odoo20-web 2>&1 | grep -E "ERROR|CRITICAL|WARNING" | tail -30 || true
  echo "## odoo database audit"
  docker exec -i odoo20-web odoo shell -d nextx_staging --no-http < "$HERE/audit_odoo.py" 2>&1 \
    | grep -vE "^\s*$|odoo.modules|odoo.registry|werkzeug|INFO "
} > "$OUT/audit-$STAMP.txt"

chown -R "$OWNER":"$OWNER" "$HERE"
chmod 644 "$OUT/audit-$STAMP.txt"
echo "Report written to $OUT/audit-$STAMP.txt"
