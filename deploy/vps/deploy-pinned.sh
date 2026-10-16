#!/usr/bin/env bash
# Deploy an exact, pinned Git commit of NextX to the staging stack on this VPS.
#
#   sudo bash ~/nextx/deploy/vps/deploy-pinned.sh <full-commit-sha> [snapshot.json]
#
# Refuses to run unless ~/nextx is checked out at exactly <full-commit-sha> with a
# clean working tree, so the image is traceable to Git. Before building it tags the
# currently running web image as a rollback point, then runs deploy-nextx.sh (which
# applies migrations, rebuilds `web`, and with a snapshot runs the guarded import).
# Appends one line per run to ~/nextx-migration/deploys.log. Prints no secrets.
set -euo pipefail

COMMIT="${1:?usage: deploy-pinned.sh <full-commit-sha> [snapshot.json]}"
SNAPSHOT="${2:-}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OWNER="$(stat -c %U "$SRC")"
OWNER_HOME="$(getent passwd "$OWNER" | cut -d: -f6)"
LOG="$OWNER_HOME/nextx-migration/deploys.log"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 2; }
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "Pass the full 40-character commit SHA." >&2; exit 2; }
HEAD_SHA="$(git -C "$SRC" rev-parse HEAD)"
[ "$HEAD_SHA" = "$COMMIT" ] || { echo "Source tree is at $HEAD_SHA, not $COMMIT. Check it out first." >&2; exit 1; }
[ -z "$(git -C "$SRC" status --porcelain)" ] || { echo "Source tree has uncommitted changes." >&2; exit 1; }

BEFORE_ID="$(docker inspect -f '{{.Image}}' nextx-web-1 2>/dev/null || echo none)"
if [ "$BEFORE_ID" != none ]; then
  TAG="rollback-$(date -u +%Y%m%dT%H%M%SZ)"
  docker tag "$BEFORE_ID" "nextx-web:$TAG"
  echo "Rollback image tagged nextx-web:$TAG ($BEFORE_ID)"
fi

export GIT_COMMIT="$COMMIT"
ARGS=()
[ -n "$SNAPSHOT" ] && ARGS+=(--migrate "$SNAPSHOT")
set +e
bash "$SRC/deploy/vps/deploy-nextx.sh" "${ARGS[@]}"
STATUS=$?
set -e

AFTER_ID="$(docker inspect -f '{{.Image}}' nextx-web-1 2>/dev/null || echo none)"
LABEL="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$AFTER_ID" 2>/dev/null || echo none)"
printf '%s commit=%s exit=%s before=%s after=%s image_label=%s snapshot=%s\n' \
  "$(date -u +%FT%TZ)" "$COMMIT" "$STATUS" "$BEFORE_ID" "$AFTER_ID" "$LABEL" "${SNAPSHOT:-none}" >> "$LOG"
chown "$OWNER" "$LOG"
echo "Deployed commit $COMMIT: exit $STATUS, image $AFTER_ID, label $LABEL"
exit "$STATUS"
