#!/usr/bin/env bash
# Shared helpers for the NextX ops scripts (check-health.sh, notify-nextx.sh,
# cron-jobs.sh). Sourced, never executed. Contains no secrets.
#
# Configuration comes from the environment or, for variables that are still unset,
# from /etc/nextx/ops.env (KEY=VALUE lines, root:root 600). Alert tokens and
# monitor URLs live ONLY there. The stack secrets (for example the cron bearer
# secret) are read from /etc/nextx/stack.env at run time by stack_env_get.

OPS_ENV_FILE="${OPS_ENV_FILE:-/etc/nextx/ops.env}"
STACK_ENV_FILE="${STACK_ENV_FILE:-/etc/nextx/stack.env}"

OPS_KEYS=(
  ALERT_KIND ALERT_WEBHOOK_URL NTFY_TOKEN TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID ALERT_EMAIL
  HEALTH_LOCAL_URL HEALTH_PUBLIC_URL FAIL_THRESHOLD REALERT_MINUTES DISK_WARN_PCT TLS_WARN_DAYS
  PING_URL_REORDER PING_URL_RECURRING CRON_BASE_URL STATE_DIR HOST_LABEL OPS_LOG_FILE
)

ops_load_env() {
  local file="${1:-$OPS_ENV_FILE}" line key val k allowed
  [[ -f "$file" && -r "$file" ]] || return 0
  if [[ -n "$(find "$file" -maxdepth 0 -perm /022 2>/dev/null)" ]]; then
    printf 'WARN: %s is group/world-writable; run: chmod 600 %s\n' "$file" "$file" >&2
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; val="${line#*=}"; key="${key//[[:space:]]/}"
    allowed=0
    for k in "${OPS_KEYS[@]}"; do [[ "$k" == "$key" ]] && allowed=1; done
    (( allowed )) || continue
    if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    if [[ -z "${!key+x}" ]]; then export "$key=$val"; fi
  done < "$file"
}

ops_defaults() {
  : "${HEALTH_LOCAL_URL:=http://127.0.0.1:13000/api/health}"
  : "${HEALTH_PUBLIC_URL:=https://nextx.nextxagency.com/api/health}"
  : "${FAIL_THRESHOLD:=2}"          # consecutive failed runs before alerting (runs are 2 min apart)
  : "${REALERT_MINUTES:=60}"        # repeat the alert while the problem persists
  : "${DISK_WARN_PCT:=85}"
  : "${TLS_WARN_DAYS:=14}"
  : "${CRON_BASE_URL:=http://127.0.0.1:13000}"
  : "${STATE_DIR:=/var/lib/nextx/health}"
  : "${OPS_LOG_FILE:=/var/log/nextx/ops.log}"
  : "${ALERT_KIND:=}"               # ntfy | telegram | generic (empty: infer from the URL)
  : "${ALERT_WEBHOOK_URL:=}"
  : "${NTFY_TOKEN:=}"
  : "${TELEGRAM_BOT_TOKEN:=}"
  : "${TELEGRAM_CHAT_ID:=}"
  : "${ALERT_EMAIL:=}"
  : "${PING_URL_REORDER:=}"
  : "${PING_URL_RECURRING:=}"
  : "${HOST_LABEL:=$(hostname -s 2>/dev/null || echo vps)}"
}

ops_log() {  # ops_log LEVEL message...
  local level="$1"; shift
  local line; line="$(date -u +%Y-%m-%dT%H:%M:%SZ) [$level] $*"
  printf '%s\n' "$line"
  if [[ -n "${OPS_LOG_FILE:-}" ]] && { mkdir -p "$(dirname "$OPS_LOG_FILE")" && printf '%s\n' "$line" >> "$OPS_LOG_FILE"; } 2>/dev/null; then :; fi
}

# Print the value of NAME from the stack env file, or nothing. Never echoes the file.
stack_env_get() {
  [[ -r "$STACK_ENV_FILE" ]] || return 0
  grep -m1 "^$1=" "$STACK_ENV_FILE" | cut -d= -f2- | tr -d '\r'
}

ops_json_escape() {
  # Escape backslash, quote and control characters for a JSON string value (pure bash).
  local v="$1" nl=$'\n' cr=$'\r' tab=$'\t'
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  v="${v//$nl/\\n}"
  v="${v//$cr/}"
  v="${v//$tab/\\t}"
  printf '%s' "$v"
}
