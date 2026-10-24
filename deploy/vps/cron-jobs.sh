#!/usr/bin/env bash
# Call one of the NextX scheduled endpoints with the Bearer cron secret.
#
#   cron-jobs.sh reorder               # GET /api/cron/reorder              (weekly, Monday 12:00 UTC)
#   cron-jobs.sh recurring-expenses    # GET /api/cron/recurring-expenses   (daily, 03:10 UTC = 00:10 Paramaribo)
#   cron-jobs.sh --dry-run <job>       # show what would be called, send nothing
#
# The secret is read at run time from NEXTLY_CRON_SECRET in /etc/nextx/stack.env (the Compose file
# hands the same value to the app as CRON_SECRET). It is never written to a file, a log or the
# process list: curl receives the Authorization header through a config on stdin.
#
# The app endpoints are idempotent (reorder: one snapshot per week; recurring expenses: one row per
# due date), so a retry or a second run in the same period is safe. Failed attempts (connection
# refused during a deploy, HTTP 5xx) are retried 3 times, 60 s apart. A final failure sends an alert
# through notify-nextx.sh; a success pings the optional monitor URL (healthchecks.io style) from
# /etc/nextx/ops.env: PING_URL_REORDER / PING_URL_RECURRING.
#
# Exit codes: 0 ok; 1 the endpoint failed after retries; 2 usage or missing secret; 3 HTTP 401
# (secret mismatch: the running container has a different CRON_SECRET than stack.env).
set -uo pipefail
umask 077
HERE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# shellcheck source=lib-ops.sh
. "$HERE/lib-ops.sh"
ops_load_env; ops_defaults

DRY=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY=1; shift; fi
JOB="${1:-}"
case "$JOB" in
  reorder) PING="$PING_URL_REORDER" ;;
  recurring-expenses) PING="$PING_URL_RECURRING" ;;
  -h|--help|"") sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; [[ -n "$JOB" ]] && exit 0 || exit 2 ;;
  *) echo "Unknown job '$JOB' (reorder | recurring-expenses)" >&2; exit 2 ;;
esac
URL="${CRON_BASE_URL%/}/api/cron/$JOB"

SECRET="$(stack_env_get NEXTLY_CRON_SECRET)"
if [[ -z "$SECRET" || ${#SECRET} -lt 32 ]]; then
  ops_log ERROR "NEXTLY_CRON_SECRET missing or shorter than 32 characters in $STACK_ENV_FILE; job $JOB not run"
  (( DRY )) || "$HERE/notify-nextx.sh" "cron $JOB not run" "NEXTLY_CRON_SECRET is missing in $STACK_ENV_FILE" high || true
  exit 2
fi

if (( DRY )); then
  ops_log INFO "DRY RUN: would GET $URL with the Bearer secret from $STACK_ENV_FILE (length ${#SECRET}); retries 3 x 60 s"
  [[ -n "$PING" ]] && ops_log INFO "DRY RUN: would ping the monitor on success"
  exit 0
fi

ping_monitor() {  # ping_monitor <suffix>
  [[ -n "$PING" ]] || return 0
  curl -fsS -m 15 --retry 3 -o /dev/null "${PING%/}$1" 2>/dev/null || ops_log WARN "could not reach the monitor URL for $JOB"
}

BODY="$(mktemp)"; trap 'rm -f "$BODY"' EXIT
ping_monitor /start
attempt=0; code=000
while (( attempt < 3 )); do
  attempt=$((attempt + 1))
  code="$(printf 'header = "Authorization: Bearer %s"\n' "$SECRET" \
          | curl -sS -m 120 -K - -o "$BODY" -w '%{http_code}' -H 'Accept: application/json' "$URL" 2>/dev/null)" || code=000
  if [[ "$code" == 200 ]] && grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$BODY"; then
    ops_log INFO "cron $JOB ok (attempt $attempt): $(head -c 300 "$BODY" | tr '\n' ' ')"
    ping_monitor ""
    exit 0
  fi
  if [[ "$code" == 401 ]]; then
    ops_log ERROR "cron $JOB: HTTP 401, the secret in $STACK_ENV_FILE does not match the running container (recreate web after changing it)"
    "$HERE/notify-nextx.sh" "cron $JOB unauthorized" "HTTP 401: NEXTLY_CRON_SECRET differs from the running web container. Run 'docker compose -p nextx ... up -d --no-build --no-deps web'." high || true
    ping_monitor /fail
    exit 3
  fi
  ops_log WARN "cron $JOB attempt $attempt failed: HTTP $code $(head -c 200 "$BODY" | tr '\n' ' ')"
  (( attempt < 3 )) && sleep 60
done
"$HERE/notify-nextx.sh" "cron $JOB FAILED" "HTTP $code after 3 attempts: $(head -c 200 "$BODY" | tr '\n' ' ')" high || true
ping_monitor /fail
exit 1
