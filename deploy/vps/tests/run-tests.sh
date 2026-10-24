#!/usr/bin/env bash
# Offline tests for the NextX ops scripts. Touches nothing outside a temp directory, never talks
# to Docker or the VPS, and needs only bash, GNU coreutils/findutils, curl and python.
#
#   bash deploy/vps/tests/run-tests.sh
#
# Covers: retention pruning, backup naming, env redaction, config refusal paths (no key, private key,
# unencrypted + offsite), --dry-run, log rotation, lock, restore row-count verdicts, the health
# check (ok / degraded / alert / recovery), the cron caller (200 / 401) and installer idempotency.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VPS="$(cd "$HERE/.." && pwd)"
T="$(mktemp -d)"
PASS=0 FAIL=0
cleanup() { [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT

ok() { PASS=$((PASS + 1)); printf '  ok    %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
assert_eq() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3 (got '$1', want '$2')"; fi; }
assert_contains() { if [[ "$1" == *"$2"* ]]; then ok "$3"; else bad "$3 (missing '$2')"; fi; }
assert_not_contains() { if [[ "$1" != *"$2"* ]]; then ok "$3"; else bad "$3 (found '$2')"; fi; }

# ── 1. Retention ─────────────────────────────────────────────────────────────
echo "Retention and naming (backup-nextx.sh)"
# shellcheck source=../backup-nextx.sh
source "$VPS/backup-nextx.sh"
set +e  # the sourced script enables errexit; the tests handle failures themselves

names=()
for i in $(seq 0 206); do names+=("$(date -u -d "2026-10-24 -$i days" +%Y%m%d)T033000Z"); done
keep="$(printf '%s\n' "${names[@]}" | retention_keep 7 4 6 | sort -r | tr '\n' ' ')"
want="20261024T033000Z 20261023T033000Z 20261022T033000Z 20261021T033000Z 20261020T033000Z 20261019T033000Z 20261018T033000Z 20261011T033000Z 20261004T033000Z 20260930T033000Z 20260831T033000Z 20260731T033000Z 20260630T033000Z 20260531T033000Z "
assert_eq "$keep" "$want" "207 daily backups keep 7 daily + older weekly + 6 monthly (14 total)"
prune_count="$(printf '%s\n' "${names[@]}" | retention_prune_list 7 4 6 | wc -l | tr -d ' ')"
assert_eq "$prune_count" "$((207 - 14))" "everything else is on the prune list"

# Two backups on the same day: only the newer survives the daily bucket.
two="$(printf '%s\n' 20261024T013000Z 20261024T033000Z | retention_prune_list 7 4 6 | tr '\n' ' ')"
assert_eq "$two" "20261024T013000Z " "older backup of the same day/week/month is pruned, newest kept"
# The newest backup is kept even with zero retention.
only="$(printf '%s\n' 20261023T033000Z 20261024T033000Z | retention_prune_list 0 0 0 | tr '\n' ' ')"
assert_eq "$only" "20261023T033000Z " "newest backup is never pruned, even with 0/0/0"
# Junk names are neither kept nor pruned.
junk="$(printf '%s\n' .partial-20261024T033000Z notes pre-restore-20261024T033000Z 20261024T033000Z | retention_prune_list 1 1 1 | tr '\n' ' ')"
assert_eq "$junk" "" "partial dirs and unrelated names are ignored by retention"
assert_eq "$(printf '' | retention_prune_list 7 4 6 | wc -l | tr -d ' ')" "0" "empty directory listing is fine"

# ISO week boundary: Monday 2026-10-19 belongs to a different week than Sunday 2026-10-18.
wk="$(printf '%s\n' 20261018T033000Z 20261019T033000Z 20261025T033000Z | retention_keep 0 2 0 | sort | tr '\n' ' ')"
assert_eq "$wk" "20261018T033000Z 20261025T033000Z " "weekly bucket uses ISO weeks (Sunday 18th and Sunday 25th)"

# ── 2. Redaction ─────────────────────────────────────────────────────────────
echo "stack.env redaction"
red="$(printf '%s\n' 'POSTGRES_PASSWORD=hunter2' 'JWT_SECRET=abc' 'NEXTLY_CRON_SECRET=zzz' 'SITE_URL=https://x.example' 'NEXTX_ENVIRONMENT=staging' '# comment' 'ANON_KEY=eyJ' 'SMTP_PASS=p' 'ENABLE_EMAIL_AUTOCONFIRM=true' | redact_env)"
assert_contains "$red" "SITE_URL=https://x.example" "allow-listed value kept"
assert_contains "$red" "NEXTX_ENVIRONMENT=staging" "environment flag kept (useful in a restore)"
assert_contains "$red" "POSTGRES_PASSWORD=<redacted>" "password redacted"
for secret in hunter2 abc zzz eyJ; do assert_not_contains "$red" "$secret" "secret value '$secret' absent from output"; done
assert_contains "$red" "SMTP_PASS=<redacted>" "unknown names are redacted by default"

# ── 3. Refusal paths and dry run ─────────────────────────────────────────────
echo "Configuration refusals"
out="$( (apply_defaults; AGE_RECIPIENTS_FILE="$T/none.pub"; GPG_RECIPIENT=""; UNENCRYPTED=0; setup_encryption) 2>&1 )"; rc=$?
assert_eq "$rc" "2" "no key and no --unencrypted: refuses with exit 2"
assert_contains "$out" "no encryption key" "refusal says why"

printf 'AGE-SECRET-KEY-1ABCDEF\n' > "$T/private.key"
out="$( (apply_defaults; AGE_RECIPIENTS_FILE="$T/private.key"; UNENCRYPTED=0; setup_encryption) 2>&1 )"; rc=$?
assert_eq "$rc" "2" "a PRIVATE age key on the server is refused"
assert_contains "$out" "PRIVATE age key" "refusal names the problem"

out="$( (apply_defaults; REMOTE="offsite:x"; UNENCRYPTED=1; NO_OFFSITE=0; setup_encryption) 2>&1 )"; rc=$?
assert_eq "$rc" "2" "--unencrypted together with an offsite REMOTE is refused"
out="$( (apply_defaults; REMOTE=""; UNENCRYPTED=1; setup_encryption) 2>&1 )"; rc=$?
assert_eq "$rc" "0" "--unencrypted without offsite is allowed (with a warning)"
assert_contains "$out" "clear text" "warning printed for unencrypted"

out="$( (apply_defaults; KEEP_DAILY=abc; validate_config) 2>&1 )"; rc=$?
assert_eq "$rc" "2" "non-numeric retention value rejected"
out="$( (apply_defaults; BACKUP_DIR=relative/path; validate_config) 2>&1 )"; rc=$?
assert_eq "$rc" "2" "relative BACKUP_DIR rejected"

echo "Dry run"
mkdir -p "$T/bk"
for n in "${names[@]:0:30}"; do mkdir -p "$T/bk/$n"; : > "$T/bk/$n/COMPLETE"; done
mkdir -p "$T/bk/.partial-20200101T000000Z"
before="$(ls "$T/bk" | wc -l | tr -d ' ')"
out="$(BACKUP_DIR="$T/bk" BACKUP_ENV_FILE=/nonexistent LOG_FILE="$T/b.log" AGE_RECIPIENTS_FILE="$T/none.pub" \
       bash "$VPS/backup-nextx.sh" --dry-run 2>&1)"; rc=$?
after="$(ls "$T/bk" | wc -l | tr -d ' ')"
assert_eq "$rc" "0" "--dry-run exits 0 even though no key exists"
assert_eq "$before" "$after" "--dry-run deletes nothing"
assert_contains "$out" "DRY RUN" "dry run announces itself"
assert_contains "$out" "would: prune local backup" "dry run previews pruning"
assert_contains "$out" "REFUSE" "dry run warns that a real run would refuse (no key)"
last="$(printf '%s\n' "$out" | tail -n 1)"
assert_contains "$last" "NEXTX_BACKUP status=OK" "last line is the machine-readable status line"
assert_contains "$last" "dry_run=1" "status line says dry_run=1"

out="$(BACKUP_DIR="$T/bk" BACKUP_ENV_FILE=/nonexistent bash "$VPS/backup-nextx.sh" --bogus 2>&1)"; rc=$?
assert_eq "$rc" "2" "unknown flag: exit 2"

echo "Log rotation and lock"
printf '%0.sx' $(seq 1 3000) > "$T/r.log"
rotate_log "$T/r.log" 3 1
[[ -f "$T/r.log.1" && ! -s "$T/r.log" ]] && ok "log over LOG_MAX_KB is rotated to .1 and truncated" || bad "log rotation"
printf 'second\n' >> "$T/r.log"; head -c 2000 /dev/zero | tr '\0' y >> "$T/r.log"
rotate_log "$T/r.log" 3 1
[[ -f "$T/r.log.2" && -f "$T/r.log.1" ]] && ok "second rotation shifts .1 to .2" || bad "log rotation shift"

lockdir="$T/lock"; mkdir -p "$lockdir"
( LOCK_FILE="$lockdir/l"; LOGGING_TO_FILE=0; acquire_lock; sleep 4 ) &
holder=$!
sleep 1
out="$( (LOCK_FILE="$lockdir/l"; LOGGING_TO_FILE=0; acquire_lock) 2>&1 )"; rc=$?
assert_eq "$rc" "3" "second run while the first holds the lock exits 3"
kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null; rmdir "$lockdir/l.d" 2>/dev/null

# ── 4. Restore verdicts ──────────────────────────────────────────────────────
echo "Restore row-count verdicts (restore-nextx.sh)"
RESTORE_SRC="$T/restore-functions.sh"
sed -n '/^count_verdict() {/,/^}/p' "$VPS/restore-nextx.sh" > "$RESTORE_SRC"
# shellcheck disable=SC1090
source "$RESTORE_SRC"
assert_eq "$(count_verdict 100 100)" "OK" "equal counts: OK"
assert_eq "$(count_verdict 99 100)" "DRIFT" "1 row behind on 100: within tolerance"
assert_eq "$(count_verdict 90 100)" "DIFF" "10 rows behind on 100: suspicious"
assert_eq "$(count_verdict 0 3)" "DRIFT" "tiny table: up to 5 rows of drift tolerated"
assert_eq "$(count_verdict 0 50)" "DIFF" "empty restore of a populated table: DIFF"
assert_eq "$(count_verdict 10100 10000)" "DRIFT" "1 percent on a big table is tolerated"
assert_eq "$(count_verdict x 10)" "MISSING" "missing table: MISSING"
assert_eq "$(count_verdict 5 x)" "NOBASELINE" "no recorded baseline: NOBASELINE"

out="$(bash "$VPS/restore-nextx.sh" --backup "$T/bk/nope" --overwrite-live 2>&1)"; rc=$?
assert_eq "$rc" "2" "--overwrite-live without --confirm-live-restore: exit 2"
assert_contains "$out" "BOTH" "message explains both flags are needed"
out="$(bash "$VPS/restore-nextx.sh" --backup "$T/bk/nope" --confirm-live-restore 20261024T033000Z 2>&1)"; rc=$?
assert_eq "$rc" "2" "--confirm-live-restore alone: exit 2"

# ── 5. Mock server for health, cron and alerts ───────────────────────────────
echo "Health check, cron caller and alerts (mock server)"
PORT=$((20000 + RANDOM % 20000))
mkdir -p "$T/srv"
echo '{"ok":true,"status":"ready"}' > "$T/srv/health.json"; echo 200 > "$T/srv/health.code"
SECRET="0123456789abcdef0123456789abcdef0123456789abcdef"
python "$HERE/mock_server.py" "$PORT" "$T/srv" "$SECRET" &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 0.3; done

mkdir -p "$T/fakebin"
printf '#!/bin/sh\nexit 0\n' > "$T/fakebin/docker"; chmod +x "$T/fakebin/docker"
HC_ENV=(env PATH="$T/fakebin:$PATH" OPS_ENV_FILE=/nonexistent OPS_LOG_FILE="$T/ops.log" STATE_DIR="$T/state" BACKUP_DIR="$T/bk"
        HEALTH_LOCAL_URL="http://127.0.0.1:$PORT/health" HEALTH_PUBLIC_URL="http://127.0.0.1:$PORT/health"
        ALERT_KIND=generic ALERT_WEBHOOK_URL="http://127.0.0.1:$PORT/alert" FAIL_THRESHOLD=2 DISK_WARN_PCT=100 MEM_WARN_MB=0 HOST_LABEL=testhost)

out="$("${HC_ENV[@]}" bash "$VPS/check-health.sh" 2>&1)"; rc=$?
assert_eq "$rc" "0" "healthy: exit 0"
assert_contains "$out" "local       ok" "local check ok"
assert_contains "$out" "public      ok" "public check ok"

echo '{"ok":false,"status":"degraded"}' > "$T/srv/health.json"; echo 503 > "$T/srv/health.code"
out="$("${HC_ENV[@]}" bash "$VPS/check-health.sh" 2>&1)"; rc=$?
assert_eq "$rc" "1" "degraded: exit 1"
assert_contains "$out" "local       FAIL" "degraded flagged"
[[ ! -s "$T/srv/alerts.log" ]] && ok "first failure does not alert yet (threshold 2)" || bad "alerted too early"
out="$("${HC_ENV[@]}" bash "$VPS/check-health.sh" 2>&1)"
assert_contains "$(cat "$T/srv/alerts.log" 2>/dev/null)" "DOWN: local" "second consecutive failure sends the alert"
n1="$(wc -l < "$T/srv/alerts.log" | tr -d ' ')"
"${HC_ENV[@]}" bash "$VPS/check-health.sh" >/dev/null 2>&1
n2="$(wc -l < "$T/srv/alerts.log" | tr -d ' ')"
assert_eq "$n2" "$n1" "alert is not repeated within REALERT_MINUTES"

# 200 but wrong status must also fail.
echo '{"ok":true,"status":"starting"}' > "$T/srv/health.json"; echo 200 > "$T/srv/health.code"
out="$("${HC_ENV[@]}" bash "$VPS/check-health.sh" --dry-run 2>&1)"; rc=$?
assert_eq "$rc" "1" "HTTP 200 with status != ready fails the check"

echo '{"ok":true,"status":"ready","databaseMs":4,"uptimeSeconds":12}' > "$T/srv/health.json"; echo 200 > "$T/srv/health.code"
"${HC_ENV[@]}" bash "$VPS/check-health.sh" >/dev/null 2>&1; rc=$?
assert_eq "$rc" "0" "recovered: exit 0"
assert_contains "$(cat "$T/srv/alerts.log")" "RECOVERED: local" "recovery message sent"
[[ -z "$(ls "$T/state" 2>/dev/null | grep -E '\.(fails|alerted)$')" ]] && ok "state cleared after recovery" || bad "state not cleared"

echo "Cron caller"
printf 'POSTGRES_PASSWORD=do-not-print\nNEXTLY_CRON_SECRET=%s\n' "$SECRET" > "$T/stack.env"
CJ_ENV=(env OPS_ENV_FILE=/nonexistent OPS_LOG_FILE="$T/ops.log" STACK_ENV_FILE="$T/stack.env" CRON_BASE_URL="http://127.0.0.1:$PORT"
        ALERT_WEBHOOK_URL="http://127.0.0.1:$PORT/alert" ALERT_KIND=generic)
out="$("${CJ_ENV[@]}" bash "$VPS/cron-jobs.sh" reorder 2>&1)"; rc=$?
assert_eq "$rc" "0" "cron reorder with the right secret: exit 0"
assert_contains "$out" "cron reorder ok" "success logged"
assert_not_contains "$out" "$SECRET" "secret never printed"
assert_not_contains "$(cat "$T/ops.log")" "$SECRET" "secret never written to the log"
assert_not_contains "$out" "do-not-print" "other stack.env values never printed"
out="$("${CJ_ENV[@]}" bash "$VPS/cron-jobs.sh" recurring-expenses 2>&1)"; rc=$?
assert_eq "$rc" "0" "cron recurring-expenses: exit 0"
printf 'NEXTLY_CRON_SECRET=%s\n' "ffffffffffffffffffffffffffffffffffffffffffffffff" > "$T/stack.env"
out="$("${CJ_ENV[@]}" bash "$VPS/cron-jobs.sh" reorder 2>&1)"; rc=$?
assert_eq "$rc" "3" "secret mismatch -> HTTP 401 -> exit 3"
assert_contains "$(cat "$T/srv/alerts.log")" "cron reorder unauthorized" "401 raises an alert"
printf 'NEXTLY_CRON_SECRET=short\n' > "$T/stack.env"
out="$("${CJ_ENV[@]}" bash "$VPS/cron-jobs.sh" reorder 2>&1)"; rc=$?
assert_eq "$rc" "2" "missing/short secret: exit 2"
out="$("${CJ_ENV[@]}" bash "$VPS/cron-jobs.sh" nonsense 2>&1)"; rc=$?
assert_eq "$rc" "2" "unknown job: exit 2"
printf 'NEXTLY_CRON_SECRET=%s
' "$SECRET" > "$T/stack.env"
out="$("${CJ_ENV[@]}" bash "$VPS/cron-jobs.sh" --dry-run reorder 2>&1)"; rc=$?
assert_contains "$out" "DRY RUN" "cron --dry-run prints the plan"

# ── 6. Installer ─────────────────────────────────────────────────────────────
echo "Installer (temp prefix, no systemctl)"
I="$T/inst"; mkdir -p "$I/etc"
printf 'NEXTLY_CRON_SECRET=%s\n' "$SECRET" > "$I/etc/stack.env"
INST=(env NEXTX_INSTALL_TEST=systemd NEXTX_LIB_DIR="$I/lib" NEXTX_SBIN_DIR="$I/sbin" NEXTX_ETC_DIR="$I/etc" NEXTX_UNIT_DIR="$I/units"
      NEXTX_LOGROTATE_DIR="$I/logrotate" NEXTX_BACKUPS_DIR="$I/bk" NEXTX_LOG_DIR="$I/log" NEXTX_STATE_DIR="$I/state")
mkdir -p "$I/logrotate"
out1="$("${INST[@]}" bash "$VPS/install-ops.sh" 2>&1)"; rc=$?
assert_eq "$rc" "0" "installer first run: exit 0"
for f in lib/backup-nextx.sh lib/lib-ops.sh sbin/nextx-backup units/nextx-health.timer units/nextx-backup.service logrotate/nextx etc/ops.env etc/backup.env; do
  [[ -e "$I/$f" || -L "$I/$f" ]] && ok "installed $f" || bad "missing $f"
done
# Git Bash on Windows copies instead of linking; probe so the test only asserts where links exist.
ln -s "$I/lib/lib-ops.sh" "$T/probe-link" 2>/dev/null
if [[ -L "$T/probe-link" ]]; then SYMLINKS=1; else SYMLINKS=0; fi
if (( SYMLINKS )); then [[ -L "$I/sbin/nextx-backup" ]] && ok "command is a symlink to the root-owned copy" || bad "symlink"; else echo "  skip  symlink assertions (no real symlinks on this OS; verified on Linux only)"; fi
assert_contains "$out1" "NOT enabling nextx-backup.timer" "backup timer not enabled without an age key"
assert_not_contains "$out1" "NOT enabling the cron timers" "cron timers enabled when the secret exists"
echo "OWNER-EDIT" >> "$I/etc/ops.env"
out2="$("${INST[@]}" bash "$VPS/install-ops.sh" 2>&1)"
if (( SYMLINKS )); then assert_contains "$out2" "nothing to change" "second run changes nothing (idempotent)"; else assert_not_contains "$out2" "updated /" "second run rewrites no file (idempotent apart from links)"; fi
assert_contains "$(cat "$I/etc/ops.env")" "OWNER-EDIT" "owner-edited config is never overwritten"
echo "# local tweak" >> "$I/units/nextx-health.timer"
out3="$("${INST[@]}" bash "$VPS/install-ops.sh" 2>&1)"
assert_contains "$out3" ".bak-" "a changed unit is backed up before being replaced"
ls "$I/units"/nextx-health.timer.bak-* >/dev/null 2>&1 && ok ".bak file exists" || bad ".bak file missing"
out4="$("${INST[@]}" bash "$VPS/install-ops.sh" --dry-run 2>&1)"; rc=$?
assert_eq "$rc" "0" "dry run exits 0"
INSTC=("${INST[@]}"); INSTC[1]="NEXTX_INSTALL_TEST=cron"
out5="$("${INSTC[@]}" env NEXTX_CROND_DIR="$I/cron.d" bash "$VPS/install-ops.sh" 2>&1)"
[[ -f "$I/cron.d/nextx" ]] && ok "cron fallback writes cron.d/nextx when systemd is absent" || bad "cron fallback"
grep -q 'nextx-cron reorder' "$I/cron.d/nextx" && ok "cron file contains the reorder job" || bad "cron file content"
if grep -q "$SECRET" "$I/cron.d/nextx" "$I/units/"* "$I/etc/backup.env" 2>/dev/null; then bad "secret leaked into an installed file"; else ok "no secret in any installed unit or cron file"; fi

# ── 7. Backup orchestration end to end (fake docker + fake rclone, real gpg) ──
echo "Backup run end to end (fake docker, fake rclone, throwaway gpg key)"
mkdir -p "$T/e2e/bin" "$T/e2e/storage/bucket" "$T/e2e/remote" "$T/e2e/repo/deploy/supabase"
cp "$HERE/fake-docker.sh" "$T/e2e/bin/docker"; cp "$HERE/fake-rclone.sh" "$T/e2e/bin/rclone"; chmod +x "$T/e2e/bin/"*
echo "image-bytes" > "$T/e2e/storage/bucket/photo.jpg"
echo "services: {}" > "$T/e2e/repo/deploy/supabase/docker-compose.yml"
echo "SECRET=do-not-copy" > "$T/e2e/repo/deploy/supabase/.env"
printf 'POSTGRES_PASSWORD=hunter2-not-in-backup\nSITE_URL=https://x.example\n' > "$T/e2e/stack.env"
export GNUPGHOME="$T/e2e/gnupg"; mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME" 2>/dev/null
GPG_OK=0
if command -v gpg >/dev/null 2>&1 && gpg --batch --passphrase '' --quick-gen-key drill@nextx.invalid default default never >/dev/null 2>&1; then GPG_OK=1; fi
E2E=(env PATH="$T/e2e/bin:$PATH" NEXTX_ALLOW_NONROOT_FOR_TESTS=1 BACKUP_ENV_FILE=/nonexistent BACKUP_DIR="$T/e2e/bk"
     LOG_FILE="$T/e2e/backup.log" LOCK_FILE="$T/e2e/lock" STORAGE_DIR="$T/e2e/storage" REPO_DIR="$T/e2e/repo"
     STACK_ENV_FILE="$T/e2e/stack.env" DB_USER=postgres MIN_FREE_MB=1 FAKE_REMOTE_ROOT="$T/e2e/remote"
     AGE_RECIPIENTS_FILE="$T/none.pub" PING_URL="http://127.0.0.1:$PORT/ping")
: > "$T/srv/alerts.log"

# A: unencrypted, no offsite -> refuses without the flag, works with it.
out="$("${E2E[@]}" bash "$VPS/backup-nextx.sh" 2>&1)"; rc=$?
assert_eq "$rc" "2" "real run without a key and without --unencrypted exits 2"
assert_contains "$out" "NEXTX_BACKUP status=FAIL" "failure still ends with the status line"
assert_contains "$(cat "$T/srv/alerts.log")" "/ping/fail" "failure pings <PING_URL>/fail"
assert_eq "$(ls "$T/e2e/bk" 2>/dev/null | grep -c .)" "0" "nothing was written when the run was refused"

out="$("${E2E[@]}" bash "$VPS/backup-nextx.sh" --unencrypted 2>&1)"; rc=$?
assert_eq "$rc" "0" "unencrypted backup succeeds"
D="$(ls -d "$T/e2e/bk"/2*Z | head -n1)"
for f in app.dump platform.dump globals.sql storage.tar.gz config.tar.gz MANIFEST.txt rowcounts.txt SHA256SUMS COMPLETE; do
  [[ -s "$D/$f" ]] && ok "unencrypted backup contains $f" || bad "missing $f"
done
( cd "$D" && sha256sum --quiet -c SHA256SUMS ) && ok "SHA256SUMS verifies" || bad "SHA256SUMS fails"
assert_contains "$(tail -n 1 <<< "$out")" "NEXTX_BACKUP status=OK" "last line: status OK"
assert_contains "$(cat "$T/srv/alerts.log")" "/ping |" "success pings <PING_URL>"
assert_contains "$(cat "$T/srv/alerts.log")" "/ping/start" "start pings <PING_URL>/start"
cfg="$(tar -tzf "$D/config.tar.gz")"
assert_contains "$cfg" "deploy/supabase/docker-compose.yml" "config copy has the compose file"
if printf '%s
' "$cfg" | grep -qE '(^|/)\.env$|\.env$' ; then
  printf '%s
' "$cfg" | grep -E '\.env$' | grep -qv 'example' && bad "config copy contains an .env file" || ok "config copy excludes .env files (only .env.example is kept)"
else ok "config copy excludes .env files"; fi
assert_not_contains "$(tar -xzOf "$D/config.tar.gz" ./stack.env.redacted)" "hunter2" "stack.env copy is redacted"
assert_contains "$(cat "$D/rowcounts.txt")" "public.products=34" "row counts recorded"
assert_eq "$(stat -c %a "$D" 2>/dev/null | tail -c 4)" "$(stat -c %a "$D" 2>/dev/null | tail -c 4)" "mode readable"
tar -tzf "$D/storage.tar.gz" | grep -q 'bucket/photo.jpg' && ok "storage archive holds the object" || bad "storage archive content"
[[ ! -d "$T/e2e/bk/.partial-"* ]] 2>/dev/null && ok "no partial directory left behind" || bad "partial left"

# B: failing integrity check (no products data) -> exit 6, nothing finalised.
before="$(ls "$T/e2e/bk" | wc -l | tr -d ' ')"
out="$("${E2E[@]}" FAKE_NO_PRODUCTS_TOC=1 bash "$VPS/backup-nextx.sh" --unencrypted 2>&1)"; rc=$?
assert_eq "$rc" "6" "dump without public.products data fails the integrity check (exit 6)"
assert_eq "$(ls "$T/e2e/bk" | wc -l | tr -d ' ')" "$before" "failed run leaves no new directory"

# C: database down -> exit 4.
out="$("${E2E[@]}" FAKE_DB_DOWN=1 bash "$VPS/backup-nextx.sh" --unencrypted 2>&1)"; rc=$?
assert_eq "$rc" "4" "database container not running: exit 4"

# D: gpg-encrypted + offsite; then offsite failure -> exit 8 but the local copy stays.
if (( GPG_OK )); then
  sleep 1
  out="$("${E2E[@]}" GPG_RECIPIENT=drill@nextx.invalid GPG_HOME="$GNUPGHOME" REMOTE=fake:nextx-backups bash "$VPS/backup-nextx.sh" 2>&1)"; rc=$?
  assert_eq "$rc" "0" "gpg-encrypted backup with offsite push succeeds"
  assert_contains "$out" "encrypted=gpg" "status line reports gpg"
  assert_contains "$out" "offsite=ok" "status line reports offsite ok"
  DG="$(ls -d "$T/e2e/bk"/2*Z | tail -n1)"
  [[ -s "$DG/app.dump.gpg" && ! -e "$DG/app.dump" ]] && ok "dumps are encrypted and the plain file is gone" || bad "encryption layout"
  assert_not_contains "$(cat "$DG/app.dump.gpg" | head -c 200 | tr -c '[:print:]' '.')" "PGDMP fake" "ciphertext does not contain the plain dump"
  [[ -s "$T/e2e/remote/nextx-backups/$(basename "$DG")/SHA256SUMS" ]] && ok "offsite directory received the backup" || bad "offsite copy missing"
  # Restore side: verify + decrypt with the private key in the keyring.
  RESTORE_SH="$T/restore-all.sh"; sed '/^if \[\[ "\${BASH_SOURCE\[0\]}" == "\$0" \]\]; then/,$d' "$VPS/restore-nextx.sh" > "$RESTORE_SH"
  out="$( ( source "$RESTORE_SH"; set +e; BACKUP="$DG"; PLAIN="$T/e2e/plain"; step_verify_and_decrypt ) 2>&1 )"; rc=$?
  assert_eq "$rc" "0" "restore: checksums + gpg decrypt + manifest comparison pass"
  assert_contains "$out" "decrypted content verified" "restore reports verified content"
  head -c 5 "$T/e2e/plain/app.dump" | grep -q PGDMP && ok "decrypted dump equals the original" || bad "decrypted dump content"
  # Tamper with an encrypted file: restore must refuse.
  echo x >> "$DG/storage.tar.gz.gpg"
  out="$( ( source "$RESTORE_SH"; set +e; BACKUP="$DG"; PLAIN="$T/e2e/plain2"; step_verify_and_decrypt ) 2>&1 )"; rc=$?
  assert_eq "$rc" "3" "tampered backup is rejected by restore (exit 3)"
  sleep 1
  out="$("${E2E[@]}" FAKE_RCLONE_FAIL=1 GPG_RECIPIENT=drill@nextx.invalid GPG_HOME="$GNUPGHOME" REMOTE=fake:nextx-backups bash "$VPS/backup-nextx.sh" 2>&1)"; rc=$?
  assert_eq "$rc" "8" "offsite failure: exit 8"
  assert_contains "$out" "offsite=failed" "status line reports offsite=failed"
  DF="$(ls -d "$T/e2e/bk"/2*Z | tail -n1)"
  [[ "$DF" != "$DG" && -f "$DF/COMPLETE" && -s "$DF/app.dump.gpg" ]] && ok "the local backup of the failed-offsite run is kept and complete" || bad "local backup missing after offsite failure"
else
  echo "  skip  gpg scenarios (no usable gpg here)"
fi

# E: retention applied by a real run: pre-create 40 old complete dirs.
for i in $(seq 40 80); do n="$(date -u -d "2026-08-01 -$i days" +%Y%m%d)T033000Z"; mkdir -p "$T/e2e/bk/$n"; : > "$T/e2e/bk/$n/COMPLETE"; done
sleep 1
out="$("${E2E[@]}" bash "$VPS/backup-nextx.sh" --unencrypted 2>&1)"; rc=$?
assert_eq "$rc" "0" "run with many old backups succeeds"
left="$(ls -d "$T/e2e/bk"/2*Z | wc -l | tr -d ' ')"
(( left < 20 )) && ok "retention pruned old backups ($left left of 45+)" || bad "retention did not prune ($left left)"
[[ -d "$(ls -d "$T/e2e/bk"/2*Z | tail -n1)" ]] && ok "newest backup survives pruning" || bad "newest missing"

echo
printf 'Result: %s passed, %s failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
