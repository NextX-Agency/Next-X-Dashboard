#!/usr/bin/env bash
# Install the NextX operations tooling on the VPS. Idempotent: safe to run again after every
# `git pull`. Run with sudo from the checked-out source tree:
#
#   sudo bash ~/nextx/deploy/vps/install-ops.sh [--dry-run] [--no-enable] [--enable-backup]
#
# What it installs
#   /usr/local/lib/nextx/*.sh        root-owned copies of the scripts (so a non-root git user cannot
#                                    change what root runs)
#   /usr/local/sbin/nextx-backup     -> backup-nextx.sh      nextx-restore -> restore-nextx.sh
#   /usr/local/sbin/nextx-check-health, nextx-cron, nextx-notify
#   /etc/nextx/ops.env, backup.env   TEMPLATES, created only when absent (never overwritten)
#   systemd timers (cron if systemd is absent):
#       nextx-health (every 2 min)           nextx-backup (daily 03:30 UTC)
#       nextx-cron-reorder (Mon 12:00 UTC)   nextx-cron-recurring-expenses (daily 03:10 UTC)
#   /etc/logrotate.d/nextx           /var/log/nextx/*.log and the deploy log
#
# It does NOT touch Docker, the Compose stack, /etc/docker/daemon.json, stack.env or any secret.
# Any existing file it would change is first copied to <file>.bak-<UTC timestamp>.
#
# Timers are enabled only when their prerequisites exist:
#   health            always (alerts need /etc/nextx/ops.env configured; it works without, log only)
#   cron timers       NEXTLY_CRON_SECRET is set in /etc/nextx/stack.env
#   backup            /etc/nextx/backup.age.pub exists (or pass --enable-backup to override)
# --no-enable installs everything but enables nothing. --dry-run changes nothing.
set -Eeuo pipefail
umask 022

DRY=0 NO_ENABLE=0 FORCE_BACKUP=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --no-enable) NO_ENABLE=1 ;;
    --enable-backup) FORCE_BACKUP=1 ;;
    -h|--help) sed -n '2,/^set -Eeuo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $a" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# Test hooks (default to the real locations).
LIB="${NEXTX_LIB_DIR:-/usr/local/lib/nextx}"
SBIN="${NEXTX_SBIN_DIR:-/usr/local/sbin}"
ETC="${NEXTX_ETC_DIR:-/etc/nextx}"
UNIT_DIR="${NEXTX_UNIT_DIR:-/etc/systemd/system}"
LOGROTATE_DIR="${NEXTX_LOGROTATE_DIR:-/etc/logrotate.d}"
CROND_DIR="${NEXTX_CROND_DIR:-/etc/cron.d}"
VAR_BACKUPS="${NEXTX_BACKUPS_DIR:-/var/backups/nextx}"
VAR_LOG="${NEXTX_LOG_DIR:-/var/log/nextx}"
VAR_LIB="${NEXTX_STATE_DIR:-/var/lib/nextx}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ACTIONS=()

say() { printf '%s\n' "$*"; }
note() { ACTIONS+=("$*"); printf '  - %s\n' "$*"; }
run() { if (( DRY )); then say "  [dry-run] $*"; else "$@"; fi; }

if [[ -z "${NEXTX_INSTALL_TEST:-}" ]]; then
  [[ $(id -u) -eq 0 ]] || { echo "Run with sudo." >&2; exit 2; }
fi
[[ -f "$HERE/backup-nextx.sh" && -f "$HERE/check-health.sh" ]] || { echo "Run this from the source tree: $HERE lacks the scripts" >&2; exit 2; }

USE_SYSTEMD=0
if [[ -z "${NEXTX_INSTALL_TEST:-}" && -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1; then USE_SYSTEMD=1; fi
[[ "${NEXTX_INSTALL_TEST:-}" == systemd ]] && USE_SYSTEMD=1
say "NextX ops install ($( ((DRY)) && echo DRY RUN || echo live )); scheduler: $( ((USE_SYSTEMD)) && echo systemd || echo cron )"

# install_file <src> <dst> <mode>: create, update (with .bak) or leave alone.
install_file() {
  local src="$1" dst="$2" mode="$3"
  if [[ -f "$dst" ]]; then
    if cmp -s "$src" "$dst"; then
      if [[ "$(stat -c %a "$dst")" != "$mode" ]]; then run chmod "$mode" "$dst"; fi
      return 0
    fi
    run cp -p "$dst" "$dst.bak-$STAMP"
    run install -m "$mode" "$src" "$dst"
    note "updated $dst (previous copy: $dst.bak-$STAMP)"
  else
    run install -D -m "$mode" "$src" "$dst"
    note "created $dst"
  fi
}

# install_text <content> <dst> <mode>: same, for generated content.
install_text() {
  local tmp; tmp="$(mktemp)"; printf '%s\n' "$1" > "$tmp"
  install_file "$tmp" "$2" "$3"
  rm -f "$tmp"
}

link_file() {  # link_file <target> <linkpath>
  local target="$1" link="$2"
  if [[ -L "$link" && "$(readlink "$link")" == "$target" ]]; then return 0; fi
  if [[ -e "$link" || -L "$link" ]]; then run mv "$link" "$link.bak-$STAMP"; note "moved aside existing $link to $link.bak-$STAMP"; fi
  run ln -s "$target" "$link"
  note "linked $link -> $target"
}

# 1. Dependencies (report only).
say; say "Dependencies"
for spec in "docker:required" "curl:required" "tar:required" "gzip:required" "sha256sum:required" "flock:required (locks)" \
            "age:needed for encrypted backups (apt install age)" "rclone:needed only for offsite copies" \
            "jq:optional (JSON check falls back to grep)" "logrotate:log rotation" "gpg:fallback encryption" \
            "openssl:TLS expiry check" "mail:optional e-mail alerts (or use ntfy/Telegram)"; do
  cmd="${spec%%:*}"; why="${spec#*:}"
  if command -v "$cmd" >/dev/null 2>&1; then printf '  ok       %-10s\n' "$cmd"; else printf '  MISSING  %-10s %s\n' "$cmd" "$why"; fi
done

# 2. Directories.
say; say "Files"
for d in "$LIB:755" "$ETC:700" "$VAR_BACKUPS:700" "$VAR_LOG:750" "$VAR_LIB:700" "$SBIN:755"; do
  path="${d%:*}"; mode="${d##*:}"
  if [[ ! -d "$path" ]]; then
    if (( DRY )); then say "  [dry-run] install -d -m $mode $path"
    elif ! install -d -m "$mode" "$path" 2>/dev/null; then
      # Only the offline test run (Windows filesystem without POSIX modes) may fall back.
      [[ -n "${NEXTX_INSTALL_TEST:-}" ]] && mkdir -p "$path" || { echo "cannot create $path" >&2; exit 1; }
    fi
    note "created directory $path ($mode)"
  fi
done

# 3. Scripts (root-owned copies) and command links.
for f in backup-nextx.sh restore-nextx.sh check-health.sh cron-jobs.sh notify-nextx.sh; do install_file "$HERE/$f" "$LIB/$f" 755; done
install_file "$HERE/lib-ops.sh" "$LIB/lib-ops.sh" 644
link_file "$LIB/backup-nextx.sh" "$SBIN/nextx-backup"
link_file "$LIB/restore-nextx.sh" "$SBIN/nextx-restore"
link_file "$LIB/check-health.sh" "$SBIN/nextx-check-health"
link_file "$LIB/cron-jobs.sh" "$SBIN/nextx-cron"
link_file "$LIB/notify-nextx.sh" "$SBIN/nextx-notify"

# 4. Configuration templates: created once, never overwritten (they hold the owner's choices).
if [[ ! -e "$ETC/backup.env" ]]; then
  install_text "# Non-secret settings for nextx-backup. Owner: root, mode 600. Unset lines use the defaults.
# Source tree whose deploy/ folder is copied into every backup:
REPO_DIR=$REPO
#BACKUP_DIR=/var/backups/nextx
#AGE_RECIPIENTS_FILE=/etc/nextx/backup.age.pub
#GPG_RECIPIENT=
# Offsite copy through rclone (configure with: sudo rclone config). Example remote name + path:
#REMOTE=offsite:nextx-backups
#RCLONE_FLAGS=--bwlimit 2M
#OFFSITE_PRUNE=0
# Dead-man's-switch (healthchecks.io style). Treat the URL as semi-secret.
#PING_URL=https://hc-ping.com/<uuid>
#KEEP_DAILY=7
#KEEP_WEEKLY=4
#KEEP_MONTHLY=6" "$ETC/backup.env" 600
fi
if [[ ! -e "$ETC/ops.env" ]]; then
  install_text "# Alerting and monitor settings for nextx-check-health / nextx-cron. Owner: root, mode 600.
# Tokens and webhook URLs belong here and nowhere else.
#
# Pick at least one alert channel. ntfy is the simplest (install the ntfy phone app, subscribe to a
# long random topic name):
#ALERT_KIND=ntfy
#ALERT_WEBHOOK_URL=https://ntfy.sh/<long-random-topic>
#NTFY_TOKEN=
# or Telegram:
#TELEGRAM_BOT_TOKEN=
#TELEGRAM_CHAT_ID=
# or e-mail (needs an MTA on the VPS):
#ALERT_EMAIL=
#
#HEALTH_LOCAL_URL=http://127.0.0.1:13000/api/health
#HEALTH_PUBLIC_URL=https://nextx.nextxagency.com/api/health
#FAIL_THRESHOLD=2
#REALERT_MINUTES=60
#DISK_WARN_PCT=85
#MEM_WARN_MB=400
#PING_URL_REORDER=
#PING_URL_RECURRING=" "$ETC/ops.env" 600
fi
for f in backup.env ops.env; do if [[ -e "$ETC/$f" ]]; then run chmod 600 "$ETC/$f"; fi; done

# 5. logrotate.
if [[ -d "$LOGROTATE_DIR" ]]; then
  owner="$(stat -c %U "$REPO")"; home="$(getent passwd "$owner" | cut -d: -f6 || true)"
  deploy_log="${home:-/root}/nextx-migration/deploys.log"
  tmp="$(mktemp)"; sed "s#@DEPLOY_LOG@#$deploy_log#" "$HERE/logrotate-nextx" > "$tmp"
  install_file "$tmp" "$LOGROTATE_DIR/nextx" 644; rm -f "$tmp"
  if command -v logrotate >/dev/null 2>&1 && (( ! DRY )) && [[ -z "${NEXTX_INSTALL_TEST:-}" ]]; then
    if logrotate -d "$LOGROTATE_DIR/nextx" >/dev/null 2>&1; then say "  logrotate config parses"
    else say "  WARNING: logrotate -d reported a problem; run: logrotate -d $LOGROTATE_DIR/nextx"; fi
  fi
else
  say "  $LOGROTATE_DIR not found: install logrotate to rotate $VAR_LOG"
fi

# 6. Scheduler.
ENABLE=()
secret_present=0
if [[ -r "$ETC/stack.env" ]] && grep -q '^NEXTLY_CRON_SECRET=.\{32,\}' "$ETC/stack.env"; then secret_present=1; fi
age_present=0
if [[ -s "$ETC/backup.age.pub" ]]; then age_present=1; fi

if (( USE_SYSTEMD )); then
  for u in nextx-backup nextx-health nextx-cron-reorder nextx-cron-recurring-expenses; do
    install_file "$HERE/systemd/$u.service" "$UNIT_DIR/$u.service" 644
    install_file "$HERE/systemd/$u.timer" "$UNIT_DIR/$u.timer" 644
  done
  install_file "$HERE/systemd/nextx-notify-failure@.service" "$UNIT_DIR/nextx-notify-failure@.service" 644
  if (( ! DRY )) && [[ -z "${NEXTX_INSTALL_TEST:-}" ]]; then systemctl daemon-reload; fi
  ENABLE+=(nextx-health.timer)
  if (( secret_present )); then ENABLE+=(nextx-cron-reorder.timer nextx-cron-recurring-expenses.timer)
  else say "  NOT enabling the cron timers: NEXTLY_CRON_SECRET (32+ chars) not found in $ETC/stack.env"; fi
  if (( age_present || FORCE_BACKUP )); then ENABLE+=(nextx-backup.timer)
  else say "  NOT enabling nextx-backup.timer: no age public key at $ETC/backup.age.pub (create it, then re-run this installer)"; fi
  if (( NO_ENABLE )); then
    say "  --no-enable: nothing enabled. Later: systemctl enable --now ${ENABLE[*]}"
  else
    for t in "${ENABLE[@]}"; do
      if (( DRY )) || [[ -n "${NEXTX_INSTALL_TEST:-}" ]]; then say "  [dry-run] systemctl enable --now $t"
      elif systemctl enable --now "$t" >/dev/null 2>&1; then note "enabled and started $t"
      else say "  WARNING: could not enable $t"; fi
    done
  fi
else
  if (( NO_ENABLE )); then say "  --no-enable: cron file not installed. Template: $HERE/cron.d-nextx"
  else install_file "$HERE/cron.d-nextx" "$CROND_DIR/nextx" 644; fi
  if (( ! secret_present )); then say "  NOTE: NEXTLY_CRON_SECRET not found; the cron jobs will log an error until it exists"; fi
  if (( ! age_present && ! FORCE_BACKUP )); then say "  NOTE: no age public key yet; the backup cron entry will fail (exit 2) until $ETC/backup.age.pub exists"; fi
fi

# 7. Summary.
say; say "Summary"
if (( ${#ACTIONS[@]} == 0 )); then say "  nothing to change (already installed and up to date)"; fi
say
say "Next steps"
say "  1. sudoedit $ETC/ops.env         (alert channel), then:  sudo nextx-notify --test"
say "  2. age-keygen -o nextx-backup.key   ON YOUR OWN COMPUTER; copy ONLY the line starting age1... into $ETC/backup.age.pub"
say "  3. sudo nextx-backup --dry-run   then   sudo nextx-backup"
say "  4. sudo nextx-check-health --dry-run ; sudo nextx-cron --dry-run reorder"
say "  5. Docker log rotation: see docs/05-operations/runbook.md (the Compose file now sets json-file 10m x 5)."
say "  Timers: systemctl list-timers 'nextx-*'    Logs: journalctl -u nextx-backup -n 50    $VAR_LOG/"
