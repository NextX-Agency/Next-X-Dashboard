#!/usr/bin/env bash
# NextX uptime check, run every 2 minutes by a systemd timer (or cron).
#
#   check-health.sh [--dry-run] [--test-alert]
#
# Checks (each reported as ok / FAIL with a reason):
#   local       GET $HEALTH_LOCAL_URL  (default http://127.0.0.1:13000/api/health)
#               must answer HTTP 200 with JSON "status":"ready"
#   public      GET $HEALTH_PUBLIC_URL (default https://nextx.nextxagency.com/api/health), same rule;
#               catches Pangolin/Traefik/TLS/DNS faults that the local check cannot see
#   tls         the public certificate must not expire within $TLS_WARN_DAYS days
#   containers  no NextX container is unhealthy or restarting
#   disk        / , /var/lib/docker and the backup volume below $DISK_WARN_PCT percent
#   memory      MemAvailable above $MEM_WARN_MB (this host has no swap)
#
# A problem raises an alert after $FAIL_THRESHOLD consecutive failed runs, repeats every
# $REALERT_MINUTES minutes while it lasts, and sends one "recovered" message when it clears.
# Alerts go through notify-nextx.sh (ntfy, Telegram, generic webhook, mail), configured in
# /etc/nextx/ops.env. --dry-run prints results and neither alerts nor touches the state.
# Reads no stack secrets. Exit 0 when everything is ok, 1 when any check failed.
set -uo pipefail
umask 077
HERE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# shellcheck source=lib-ops.sh
. "$HERE/lib-ops.sh"
OPS_KEYS+=(MEM_WARN_MB BACKUP_DIR)
ops_load_env; ops_defaults
: "${MEM_WARN_MB:=400}"
: "${BACKUP_DIR:=/var/backups/nextx}"
PROJECT="${PROJECT:-nextx}"

DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --test-alert) exec "$HERE/notify-nextx.sh" --test ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $a" >&2; exit 2 ;;
  esac
done

if (( ! DRY )); then
  mkdir -p "$STATE_DIR" 2>/dev/null || { echo "cannot create $STATE_DIR" >&2; exit 2; }
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$STATE_DIR/.lock"
    flock -n 9 || { echo "previous check still running"; exit 0; }
  fi
fi

NOW="$(date +%s)"
FAILED=0
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT

# ready_json <file>: true when the JSON body says status "ready".
ready_json() {
  if command -v jq >/dev/null 2>&1; then
    [[ "$(jq -r '.status // empty' < "$1" 2>/dev/null)" == ready ]]
  else
    grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' "$1"
  fi
}

# record <check> <ok|fail> <message>
record() {
  local name="$1" state="$2" msg="$3" fails_f alerted_f fails=0 alerted=0
  if [[ "$state" == ok ]]; then printf '%-11s ok   %s\n' "$name" "$msg"; else printf '%-11s FAIL %s\n' "$name" "$msg"; FAILED=1; fi
  (( DRY )) && return 0
  fails_f="$STATE_DIR/$name.fails"; alerted_f="$STATE_DIR/$name.alerted"
  [[ -f "$fails_f" ]] && fails="$(cat "$fails_f" 2>/dev/null || echo 0)"
  [[ -f "$alerted_f" ]] && alerted="$(cat "$alerted_f" 2>/dev/null || echo 0)"
  [[ "$fails" =~ ^[0-9]+$ ]] || fails=0
  [[ "$alerted" =~ ^[0-9]+$ ]] || alerted=0
  if [[ "$state" == ok ]]; then
    if (( alerted > 0 )); then
      "$HERE/notify-nextx.sh" "RECOVERED: $name" "$name is ok again after $(( (NOW - alerted) / 60 )) min. $msg" default || true
      ops_log INFO "recovered: $name"
    fi
    rm -f "$fails_f" "$alerted_f"
    return 0
  fi
  fails=$((fails + 1)); printf '%s' "$fails" > "$fails_f"
  ops_log WARN "check $name failed ($fails in a row): $msg"
  if (( fails >= FAIL_THRESHOLD )) && { (( alerted == 0 )) || (( NOW - alerted >= REALERT_MINUTES * 60 )); }; then
    if "$HERE/notify-nextx.sh" "DOWN: $name" "$msg (failed $fails runs in a row)" high; then printf '%s' "$NOW" > "$alerted_f"; fi
  fi
}

check_url() {  # check_url <name> <url>
  local name="$1" url="$2" code rc
  code="$(curl -sS -m 10 -A 'nextx-healthcheck/1' -o "$TMP" -w '%{http_code}' "$url" 2>"$TMP.err")"; rc=$?
  if (( rc != 0 )); then record "$name" fail "cannot reach $url (curl exit $rc: $(head -c 120 "$TMP.err" | tr '\n' ' '))"; rm -f "$TMP.err"; return; fi
  rm -f "$TMP.err"
  if [[ "$code" != 200 ]]; then record "$name" fail "$url answered HTTP $code: $(head -c 160 "$TMP" | tr '\n' ' ')"; return; fi
  if ready_json "$TMP"; then record "$name" ok "HTTP 200, status ready"; else record "$name" fail "$url answered 200 but status is not ready: $(head -c 160 "$TMP" | tr '\n' ' ')"; fi
}

check_tls() {
  local url="$HEALTH_PUBLIC_URL" host
  case "$url" in https://*) ;; *) record tls ok "public URL is not https; skipped"; return ;; esac
  command -v openssl >/dev/null 2>&1 || { record tls ok "openssl missing; skipped"; return; }
  host="${url#https://}"; host="${host%%/*}"; host="${host%%:*}"
  if echo | timeout 10 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
       | openssl x509 -noout -checkend $(( TLS_WARN_DAYS * 86400 )) >/dev/null 2>&1; then
    record tls ok "certificate for $host valid for more than $TLS_WARN_DAYS days"
  else
    record tls fail "certificate for $host is expired, unreachable or expires within $TLS_WARN_DAYS days"
  fi
}

check_containers() {
  command -v docker >/dev/null 2>&1 || { record containers ok "docker not found; skipped"; return; }
  local bad="" out rc=0 f
  for f in "health=unhealthy" "status=restarting" "status=exited"; do
    out="$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" --filter "$f" --format '{{.Names}}' 2>&1)" || rc=$?
    if (( rc != 0 )); then record containers fail "cannot query Docker: $(printf '%s' "$out" | head -c 160 | tr '\n' ' ')"; return; fi
    [[ -n "$out" ]] && bad+="$(printf '%s' "$out" | tr '\n' ',') (${f#*=}) "
  done
  if [[ -z "$bad" ]]; then record containers ok "no $PROJECT container is unhealthy, restarting or exited"; else record containers fail "$bad"; fi
}

check_disk() {
  local worst="" pct mnt
  # GNU df --output keeps the mount point intact even if it contains spaces.
  while read -r pct mnt; do
    pct="${pct%\%}"
    [[ "$pct" =~ ^[0-9]+$ ]] || continue
    if (( pct >= DISK_WARN_PCT )); then worst+="$mnt at ${pct}% "; fi
  done < <(df --output=pcent,target / /var/lib/docker "$BACKUP_DIR" 2>/dev/null | awk 'NR>1 && !seen[$2]++ {print $1, $2}')
  if [[ -z "$worst" ]]; then record disk ok "below ${DISK_WARN_PCT}%"; else record disk fail "$worst(limit ${DISK_WARN_PCT}%)"; fi
}

check_memory() {
  local kb mb
  kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null)"
  [[ "$kb" =~ ^[0-9]+$ ]] || { record memory ok "no /proc/meminfo; skipped"; return; }
  mb=$(( kb / 1024 ))
  if (( mb >= MEM_WARN_MB )); then record memory ok "${mb} MB available"; else record memory fail "only ${mb} MB available (limit ${MEM_WARN_MB} MB, no swap: the OOM killer is close)"; fi
}

check_url local "$HEALTH_LOCAL_URL"
check_url public "$HEALTH_PUBLIC_URL"
check_tls
check_containers
check_disk
check_memory
exit "$FAILED"
