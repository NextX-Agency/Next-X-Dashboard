#!/usr/bin/env bash
# NextX production backup for the LIVE Docker Compose stack (project "nextx").
#
#   sudo bash deploy/vps/backup-nextx.sh [--dry-run] [--unencrypted] [--no-offsite]
#                                        [--no-storage] [--prune-only] [--help]
#
# One run creates one timestamped directory under $BACKUP_DIR (default
# /var/backups/nextx) containing:
#
#   app.dump        pg_dump -Fc --no-owner of schemas public, private, drizzle
#                   (the shop: products, sales, ledger, members ...)
#   platform.dump   pg_dump -Fc --no-owner of schemas auth, storage
#                   (sign-in accounts and the Storage object index)
#   globals.sql     roles, no passwords (best effort, for reference)
#   storage.tar.gz  the Supabase Storage volume (product images, receipts),
#                   with the user.* extended attributes the file backend needs
#   config.tar.gz   deploy/ from the source tree (no .env files) plus
#                   stack.env.redacted (variable NAMES, values only for a
#                   short allow-list of non-secret settings)
#   MANIFEST.txt, rowcounts.txt, SHA256SUMS, COMPLETE
#
# Data files are encrypted with `age` (public key only on this server) or, as a
# fallback, gpg. Without a key the script refuses to run unless --unencrypted is
# given, and it never pushes an unencrypted backup offsite.
#
# It reads NO secrets: pg_dump runs inside the db container over the local
# socket. Configuration comes from the environment or, for unset variables,
# from $BACKUP_ENV_FILE (default /etc/nextx/backup.env, KEY=VALUE lines).
# The Postgres password and the other stack secrets in /etc/nextx/stack.env are
# only ever listed by name, never copied.
#
# Exit codes
#   0 ok                         5 dump/storage/config step failed
#   1 unexpected error           6 integrity check failed
#   2 usage / configuration      7 encryption failed
#   3 another run holds the lock 8 local backup is fine but offsite push failed
#   4 preflight failed (docker, database, disk space)
#
# The last line printed is always one machine-readable status line:
#   NEXTX_BACKUP status=OK|FAIL ts=... code=N ...
# and, when PING_URL is set, the same result is reported to it
# (healthchecks.io style: <PING_URL>/start, <PING_URL>, <PING_URL>/fail).
set -Eeuo pipefail
umask 077

# ─── Defaults ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
DEFAULT_REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONFIG_KEYS=(
  BACKUP_DIR PROJECT DB_CONTAINER DB_USER DB_NAME STORAGE_VOLUME STORAGE_DIR STORAGE_HELPER_IMAGE REPO_DIR STACK_ENV_FILE
  AGE_RECIPIENTS_FILE GPG_RECIPIENT GPG_HOME
  REMOTE RCLONE_FLAGS OFFSITE_PRUNE
  KEEP_DAILY KEEP_WEEKLY KEEP_MONTHLY
  LOG_FILE LOG_MAX_KB LOG_KEEP LOCK_FILE PING_URL MIN_FREE_MB
)

load_env_file() {
  # Fill variables that are still unset from KEY=VALUE lines. No eval, no sourcing.
  local file="$1" line key val allowed k
  [[ -f "$file" && -r "$file" ]] || return 0
  if [[ -n "$(find "$file" -maxdepth 0 -perm /022 2>/dev/null)" ]]; then
    printf 'WARN: %s is group/world-writable; fix with chmod 600\n' "$file" >&2
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"
    allowed=0
    for k in "${CONFIG_KEYS[@]}"; do [[ "$k" == "$key" ]] && allowed=1; done
    (( allowed )) || continue
    # Strip one pair of matching quotes.
    if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    if [[ -z "${!key+x}" ]]; then export "$key=$val"; fi
  done < "$file"
}

apply_defaults() {
  : "${BACKUP_DIR:=/var/backups/nextx}"
  : "${PROJECT:=nextx}"
  : "${DB_CONTAINER:=}"                      # auto-detected when empty
  : "${DB_USER:=supabase_admin}"             # local-socket superuser inside the db container
  : "${DB_NAME:=postgres}"
  : "${STORAGE_VOLUME:=${PROJECT}-supabase-storage-data}"
  : "${STORAGE_DIR:=}"                       # override: read this directory instead of the volume
  : "${STORAGE_HELPER_IMAGE:=}"              # fallback tar image; defaults to the db image
  : "${REPO_DIR:=$DEFAULT_REPO_DIR}"
  : "${STACK_ENV_FILE:=/etc/nextx/stack.env}"
  : "${AGE_RECIPIENTS_FILE:=/etc/nextx/backup.age.pub}"
  : "${GPG_RECIPIENT:=}"
  : "${GPG_HOME:=}"
  : "${REMOTE:=}"                            # e.g. offsite:nextx-backups (an rclone remote)
  : "${RCLONE_FLAGS:=}"                      # e.g. "--bwlimit 2M"
  : "${OFFSITE_PRUNE:=0}"                    # 1 = apply the retention policy to REMOTE too
  : "${KEEP_DAILY:=7}"
  : "${KEEP_WEEKLY:=4}"
  : "${KEEP_MONTHLY:=6}"
  : "${LOG_FILE:=/var/log/nextx/backup.log}"
  : "${LOG_MAX_KB:=2048}"
  : "${LOG_KEEP:=5}"
  : "${LOCK_FILE:=/run/lock/nextx-backup.lock}"
  : "${PING_URL:=}"
  : "${MIN_FREE_MB:=2048}"
}

# ─── State ───────────────────────────────────────────────────────────────────
DRY=0 UNENCRYPTED=0 NO_OFFSITE=0 NO_STORAGE=0 PRUNE_ONLY=0
TS="" WORK="" FINAL="" ERRLOG=""
STAGE="startup" EXIT_CODE=1
ENC_MODE="none" OFFSITE_STATE="skipped" KEPT_COUNT="n/a" TOTAL_BYTES=0
START_EPOCH=0 LOGGING_TO_FILE=0 LOCK_HELD=0 FINISHED=0
LOWPRIO=()
DB_ID=""

# ─── Logging ─────────────────────────────────────────────────────────────────
now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() {
  local level="$1"; shift
  local line
  line="$(now_utc) [$level] $*"
  if (( LOGGING_TO_FILE )); then printf '%s\n' "$line" | tee -a "$LOG_FILE"; else printf '%s\n' "$line"; fi
}
warn() { log WARN "$*" >&2; }
die() {  # die <exit-code> <message>
  EXIT_CODE="$1"; shift
  log ERROR "$*" >&2
  exit "$EXIT_CODE"
}
dry() { log DRYRUN "would: $*"; }

rotate_log() {
  local f="$1" keep="$2" max_kb="$3" size i
  [[ -f "$f" ]] || return 0
  size=$(( $(stat -c %s "$f") / 1024 ))
  (( size >= max_kb )) || return 0
  for (( i = keep - 1; i >= 1; i-- )); do
    [[ -f "$f.$i" ]] && mv -f "$f.$i" "$f.$((i + 1))"
  done
  mv -f "$f" "$f.1"
  : > "$f"
  chmod 600 "$f" || true
  [[ -f "$f.$((keep))" ]] && rm -f "$f.$((keep))" || true
}

setup_logging() {
  (( DRY )) && return 0
  local dir; dir="$(dirname "$LOG_FILE")"
  if mkdir -p "$dir" 2>/dev/null && touch "$LOG_FILE" 2>/dev/null; then
    chmod 600 "$LOG_FILE" 2>/dev/null || true
    rotate_log "$LOG_FILE" "$LOG_KEEP" "$LOG_MAX_KB"
    LOGGING_TO_FILE=1
  else
    printf 'WARN: cannot write %s; logging to stdout/journal only\n' "$LOG_FILE" >&2
  fi
}

# ─── Pure helpers (sourced by the test script, no side effects) ───────────────
# Backup directory names are UTC timestamps: YYYYMMDDTHHMMSSZ.
BACKUP_NAME_RE='^[0-9]{8}T[0-9]{6}Z$'

# stdin: one backup name per line.  args: keep_daily keep_weekly keep_monthly
# stdout: names to KEEP. Keeps the newest backup of each of the N most recent
# distinct days, ISO weeks and months (union). Everything else may be pruned.
retention_keep() {
  local nd="$1" nw="$2" nm="$3" n day mon wk cd=0 cw=0 cm=0
  local -a names=()
  local -A seen_d=() seen_w=() seen_m=() keep=()
  while IFS= read -r n; do
    [[ "$n" =~ $BACKUP_NAME_RE ]] && names+=("$n")
  done < <(sort -r)
  for n in ${names[@]+"${names[@]}"}; do
    day="${n:0:8}"; mon="${n:0:6}"
    wk="$(date -u -d "${day:0:4}-${day:4:2}-${day:6:2}" +%G-W%V)"
    if [[ -z "${seen_d[$day]:-}" ]]; then
      seen_d[$day]=1
      if (( cd < nd )); then keep[$n]=1; cd=$((cd + 1)); fi
    fi
    if [[ -z "${seen_w[$wk]:-}" ]]; then
      seen_w[$wk]=1
      if (( cw < nw )); then keep[$n]=1; cw=$((cw + 1)); fi
    fi
    if [[ -z "${seen_m[$mon]:-}" ]]; then
      seen_m[$mon]=1
      if (( cm < nm )); then keep[$n]=1; cm=$((cm + 1)); fi
    fi
  done
  for n in ${names[@]+"${names[@]}"}; do
    [[ -n "${keep[$n]:-}" ]] && printf '%s\n' "$n"
  done
  return 0
}

# stdin: names. args: same as above. stdout: names to PRUNE (never the newest).
retention_prune_list() {
  local all keepers
  all="$(cat)"
  [[ -n "$all" ]] || return 0
  keepers="$(printf '%s\n' "$all" | retention_keep "$@")"
  # The newest valid backup is always kept, whatever the arguments say.
  keepers="$(printf '%s\n%s\n' "$keepers" "$(printf '%s\n' "$all" | grep -E "$BACKUP_NAME_RE" | sort | tail -n 1)")"
  printf '%s\n' "$all" | grep -E "$BACKUP_NAME_RE" | sort | grep -vxF -f <(printf '%s\n' "$keepers" | grep -E "$BACKUP_NAME_RE") || true
}

is_pos_int() { [[ "${1:-}" =~ ^[0-9]+$ ]]; }

# stdin: KEY=VALUE lines from stack.env. Values are printed only for these
# non-secret settings; everything else shows <redacted>.
redact_env() {
  awk -F= '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      key=$1; sub(/^[[:space:]]+/, "", key)
      if (key !~ /^[A-Za-z_][A-Za-z0-9_]*$/) next
      if (key ~ /^(COMPOSE_PROJECT_NAME|SITE_URL|API_EXTERNAL_URL|SUPABASE_PUBLIC_URL|ADDITIONAL_REDIRECT_URLS|NEXTX_ENVIRONMENT|NEXTX_STAGING_APP_URL|POOLER_TENANT_ID|DISABLE_SIGNUP|ENABLE_[A-Z_]+|PANGOLIN_HOST_IP|API_GW_HTTP_HOST_PORT|NEXTLY_APP_HOST_PORT|POSTGRES_HOST|POSTGRES_PORT|POSTGRES_DB|REGION|STORAGE_TENANT_ID|GLOBAL_S3_BUCKET|JWT_EXPIRY|STUDIO_DEFAULT_[A-Z_]+|PGRST_DB_SCHEMAS|PGRST_DB_MAX_ROWS|PGRST_DB_EXTRA_SEARCH_PATH)$/) {
        print $0
      } else {
        print key "=<redacted>"
      }
    }'
}

# ─── Usage ───────────────────────────────────────────────────────────────────
usage() {
  sed -n '2,/^set -Eeuo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY=1 ;;
      --unencrypted) UNENCRYPTED=1 ;;
      --no-offsite) NO_OFFSITE=1 ;;
      --no-storage) NO_STORAGE=1 ;;
      --prune-only) PRUNE_ONLY=1 ;;
      -h|--help) usage; exit 0 ;;
      *) printf 'Unknown argument: %s (try --help)\n' "$1" >&2; exit 2 ;;
    esac
    shift
  done
}

# ─── Pings ───────────────────────────────────────────────────────────────────
ping_monitor() {  # ping_monitor <suffix> <body>
  local suffix="$1" body="${2:-}"
  [[ -n "$PING_URL" ]] || return 0
  if (( DRY )); then dry "ping monitor${suffix:- (success)} (URL not shown)"; return 0; fi
  command -v curl >/dev/null 2>&1 || { warn "curl missing; monitor not pinged"; return 0; }
  curl -fsS -m 15 --retry 3 --retry-delay 2 -o /dev/null --data-raw "$body" \
    "${PING_URL%/}${suffix}" 2>/dev/null \
    || warn "could not reach the monitor URL (suffix '${suffix:-/}'); the monitor will alert on silence"
}

# ─── Final status (EXIT trap) ────────────────────────────────────────────────
on_exit() {
  local rc=$?
  trap - EXIT ERR
  (( FINISHED )) && exit "$rc"
  FINISHED=1
  local duration=0 status line
  (( START_EPOCH > 0 )) && duration=$(( $(date +%s) - START_EPOCH ))
  if (( rc != 0 )); then
    # Prefer the deliberate code from die(); clamp anything unexpected to 1.
    if (( EXIT_CODE >= 2 && EXIT_CODE <= 8 )); then rc=$EXIT_CODE
    elif (( rc < 2 || rc > 8 )); then rc=1; fi
  fi
  # Remove an unfinished working directory (a completed backup was renamed already).
  if [[ -n "$WORK" && -d "$WORK" && "$WORK" == "$BACKUP_DIR"/.partial-* ]]; then rm -rf -- "$WORK"; fi
  if (( LOCK_HELD )); then release_lock; fi
  [[ -n "$ERRLOG" ]] && rm -f -- "$ERRLOG"
  if (( rc == 0 )); then status=OK; else status=FAIL; fi
  line="NEXTX_BACKUP status=$status ts=${TS:-none} code=$rc stage=$STAGE encrypted=$ENC_MODE offsite=$OFFSITE_STATE kept=$KEPT_COUNT size_bytes=$TOTAL_BYTES duration_s=$duration dry_run=$DRY host=$(hostname -s 2>/dev/null || echo unknown)"
  log "$([[ $rc -eq 0 ]] && echo INFO || echo ERROR)" "$line"
  if (( rc == 0 )); then ping_monitor "" "$line"; elif (( rc != 3 )); then ping_monitor "/fail" "$line"; fi
  exit "$rc"
}

# ─── Lock ────────────────────────────────────────────────────────────────────
acquire_lock() {
  local dir; dir="$(dirname "$LOCK_FILE")"
  mkdir -p "$dir" 2>/dev/null || true
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE" || die 2 "cannot open lock file $LOCK_FILE"
    flock -n 9 || die 3 "another backup is already running (lock $LOCK_FILE)"
  else
    # No flock: fall back to an atomic mkdir lock.
    if ! mkdir "$LOCK_FILE.d" 2>/dev/null; then
      die 3 "another backup is already running (lock $LOCK_FILE.d; remove it only if no backup runs)"
    fi
  fi
  LOCK_HELD=1
}
release_lock() {
  if ! command -v flock >/dev/null 2>&1; then rmdir "$LOCK_FILE.d" 2>/dev/null || true; fi
  LOCK_HELD=0
}

# ─── Setup helpers ───────────────────────────────────────────────────────────
setup_lowprio() {
  LOWPRIO=()
  command -v ionice >/dev/null 2>&1 && LOWPRIO+=(ionice -c2 -n7)
  command -v nice >/dev/null 2>&1 && LOWPRIO+=(nice -n 19)
  return 0
}
lp() { "${LOWPRIO[@]+"${LOWPRIO[@]}"}" "$@"; }

# Run a command inside the db container at low CPU priority.
dexec() {
  docker exec "$DB_ID" sh -c 'if command -v nice >/dev/null 2>&1; then exec nice -n 15 "$@"; else exec "$@"; fi' sh "$@"
}
dexec_i() {
  docker exec -i "$DB_ID" sh -c 'if command -v nice >/dev/null 2>&1; then exec nice -n 15 "$@"; else exec "$@"; fi' sh "$@"
}

validate_config() {
  local v
  for v in KEEP_DAILY KEEP_WEEKLY KEEP_MONTHLY LOG_MAX_KB LOG_KEEP MIN_FREE_MB; do
    is_pos_int "${!v}" || die 2 "$v must be a non-negative integer (got '${!v}')"
  done
  (( KEEP_DAILY >= 1 )) || die 2 "KEEP_DAILY must be at least 1"
  (( LOG_KEEP >= 1 )) || die 2 "LOG_KEEP must be at least 1"
  [[ "$BACKUP_DIR" == /* ]] || die 2 "BACKUP_DIR must be an absolute path (got '$BACKUP_DIR')"
  [[ "$BACKUP_DIR" != "/" ]] || die 2 "BACKUP_DIR must not be /"
  [[ -L "$BACKUP_DIR" ]] && die 2 "BACKUP_DIR must not be a symlink"
  [[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die 2 "PROJECT looks invalid: '$PROJECT'"
  return 0
}

setup_encryption() {
  STAGE="encryption-config"
  if (( UNENCRYPTED )); then
    ENC_MODE="none"
    warn "--unencrypted: this backup will be stored in clear text"
    [[ -z "$REMOTE" ]] || (( NO_OFFSITE )) || die 2 "refusing to push an unencrypted backup offsite; drop --unencrypted or pass --no-offsite"
    return 0
  fi
  if [[ -r "$AGE_RECIPIENTS_FILE" ]]; then
    if grep -q 'AGE-SECRET-KEY' "$AGE_RECIPIENTS_FILE"; then
      die 2 "$AGE_RECIPIENTS_FILE contains a PRIVATE age key. Put only the public key (age1...) on this server and keep the private key elsewhere."
    fi
    command -v age >/dev/null 2>&1 || die 2 "age is not installed (apt install age) but $AGE_RECIPIENTS_FILE exists"
    grep -qE '^(age1|ssh-(ed25519|rsa) )' "$AGE_RECIPIENTS_FILE" \
      || die 2 "$AGE_RECIPIENTS_FILE has no age public key (a line starting with age1...)"
    ENC_MODE="age"
  elif [[ -n "$GPG_RECIPIENT" ]]; then
    command -v gpg >/dev/null 2>&1 || die 2 "gpg is not installed but GPG_RECIPIENT is set"
    local -a g=(gpg --batch --no-tty)
    [[ -n "$GPG_HOME" ]] && g+=(--homedir "$GPG_HOME")
    "${g[@]}" --list-keys "$GPG_RECIPIENT" >/dev/null 2>&1 \
      || die 2 "gpg public key '$GPG_RECIPIENT' is not in the keyring (import it with gpg --import)"
    ENC_MODE="gpg"
  else
    die 2 "no encryption key. Provide an age PUBLIC key at $AGE_RECIPIENTS_FILE (see docs/05-operations/runbook.md), or set GPG_RECIPIENT, or pass --unencrypted"
  fi
}

# encrypt_file <path>: replaces <path> with <path>.age|.gpg (the plain file is removed).
encrypt_file() {
  local in="$1" out
  case "$ENC_MODE" in
    age)
      out="$in.age"
      lp age -R "$AGE_RECIPIENTS_FILE" -o "$out" "$in" 2>>"$ERRLOG" || return 1
      head -c 22 "$out" | grep -q '^age-encryption.org/v1' || return 1
      ;;
    gpg)
      out="$in.gpg"
      local -a g=(gpg --batch --yes --no-tty --trust-model always)
      [[ -n "$GPG_HOME" ]] && g+=(--homedir "$GPG_HOME")
      lp "${g[@]}" --recipient "$GPG_RECIPIENT" --output "$out" --encrypt "$in" 2>>"$ERRLOG" || return 1
      ;;
    *) return 0 ;;
  esac
  [[ -s "$out" ]] || return 1
  rm -f -- "$in"
}

find_db_container() {
  if [[ -n "$DB_CONTAINER" ]]; then
    DB_ID="$(docker ps -q --filter "name=^/${DB_CONTAINER}\$" | head -n1)"
  else
    DB_ID="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" \
                          --filter "label=com.docker.compose.service=db" | head -n1)"
    [[ -n "$DB_ID" ]] || DB_ID="$(docker ps -q --filter "name=^/${PROJECT}-db-1\$" | head -n1)"
  fi
  [[ -n "$DB_ID" ]]
}

free_mb() { df -Pm "$1" | awk 'NR==2 {print $4}'; }

preflight() {
  STAGE="preflight"
  command -v docker >/dev/null 2>&1 || die 4 "docker is not installed"
  command -v sha256sum >/dev/null 2>&1 || die 4 "sha256sum is missing"
  command -v tar >/dev/null 2>&1 || die 4 "tar is missing"
  command -v gzip >/dev/null 2>&1 || die 4 "gzip is missing"
  docker info >/dev/null 2>&1 || die 4 "cannot talk to the Docker daemon (run as root / is Docker up?)"
  find_db_container || die 4 "database container for project '$PROJECT' is not running (set DB_CONTAINER to override)"
  log INFO "database container: $(docker inspect -f '{{.Name}}' "$DB_ID" | sed 's#^/##') ($DB_ID)"
  dexec psql -U "$DB_USER" -d "$DB_NAME" -X -At -c 'select 1' >/dev/null 2>>"$ERRLOG" \
    || die 4 "cannot connect to the database as $DB_USER (set DB_USER=postgres to use the app role)"
  if (( ! NO_STORAGE )); then
    docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1 \
      || die 4 "Storage volume '$STORAGE_VOLUME' not found (set STORAGE_VOLUME; see docker volume ls)"
  fi
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  local free; free="$(free_mb "$BACKUP_DIR")"
  (( free >= MIN_FREE_MB )) || die 4 "only ${free} MB free under $BACKUP_DIR; need at least ${MIN_FREE_MB} MB (MIN_FREE_MB)"
  log INFO "free space under $BACKUP_DIR: ${free} MB"

  OFFSITE_STATE="skipped"
  if [[ -n "$REMOTE" ]] && (( ! NO_OFFSITE )); then
    if ! command -v rclone >/dev/null 2>&1; then
      OFFSITE_STATE="failed"; warn "REMOTE is set but rclone is not installed; offsite copy will be reported as FAILED"
    elif ! lp rclone mkdir "$REMOTE" $RCLONE_FLAGS 2>>"$ERRLOG"; then
      OFFSITE_STATE="failed"; warn "cannot reach rclone remote '$REMOTE' (check rclone config / credentials); the local backup will still run"
    else
      OFFSITE_STATE="pending"
    fi
  fi
}

# ─── Backup steps ────────────────────────────────────────────────────────────
db_count() {  # db_count schema.table -> number or NA
  local n
  n="$(dexec psql -U "$DB_USER" -d "$DB_NAME" -X -At -c "select count(*) from $1" 2>>"$ERRLOG" | tr -d '[:space:]')" || n=""
  [[ "$n" =~ ^[0-9]+$ ]] && printf '%s' "$n" || printf 'NA'
}

step_database() {
  STAGE="database-dump"
  log INFO "dumping app schemas (public, private, drizzle) to app.dump"
  dexec pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-publications --no-subscriptions \
      -n public -n private -n drizzle > "$WORK/app.dump" 2>>"$ERRLOG" \
    || die 5 "pg_dump of the app schemas failed: $(tail -n 3 "$ERRLOG" | tr '\n' ' ')"
  [[ -s "$WORK/app.dump" ]] || die 5 "app.dump is empty"

  log INFO "dumping auth + storage schemas to platform.dump"
  dexec pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-publications --no-subscriptions \
      -n auth -n storage > "$WORK/platform.dump" 2>>"$ERRLOG" \
    || die 5 "pg_dump of auth/storage failed: $(tail -n 3 "$ERRLOG" | tr '\n' ' ')"
  [[ -s "$WORK/platform.dump" ]] || die 5 "platform.dump is empty"

  if dexec pg_dumpall -U "$DB_USER" --globals-only --no-role-passwords > "$WORK/globals.sql" 2>>"$ERRLOG" \
       && [[ -s "$WORK/globals.sql" ]]; then
    log INFO "roles (no passwords) saved to globals.sql"
  else
    warn "globals.sql could not be created (non-fatal; roles are recreated by the Supabase image)"
    rm -f "$WORK/globals.sql"
  fi

  # Row counts right after the dump, for the restore drill to compare against.
  # Approximate: the shop may have written a row between dump and count.
  local t
  : > "$WORK/rowcounts.txt"
  for t in public.products public.product_variants public.sales public.ledger_entries public.members auth.users storage.objects; do
    printf '%s=%s\n' "$t" "$(db_count "$t")" >> "$WORK/rowcounts.txt"
  done
  log INFO "row counts: $(tr '\n' ' ' < "$WORK/rowcounts.txt")"
}

step_storage() {
  STAGE="storage-archive"
  if (( NO_STORAGE )); then warn "--no-storage: Storage volume skipped"; return 0; fi
  local mount st
  local -a tar_opts=(--xattrs '--xattrs-include=user.*' --numeric-owner)
  mount="$STORAGE_DIR"
  [[ -n "$mount" ]] || mount="$(docker volume inspect -f '{{.Mountpoint}}' "$STORAGE_VOLUME")"
  if [[ -n "$STORAGE_DIR" ]]; then log INFO "archiving Storage directory $STORAGE_DIR"; else log INFO "archiving Storage volume $STORAGE_VOLUME"; fi
  # Supabase Storage (file backend) keeps content-type and cache headers in user.* extended
  # attributes; without them objects are served with wrong headers after a restore.
  set +e
  if [[ -d "$mount" && -r "$mount" ]]; then
    lp tar "${tar_opts[@]}" -C "$mount" -cf - . 2>>"$ERRLOG" | lp gzip -3 > "$WORK/storage.tar.gz"
    st=("${PIPESTATUS[@]}")
  else
    # The volume path is not visible from this shell (remote or rootless Docker): read it
    # through a short-lived helper container that only mounts the volume read-only.
    local img="$STORAGE_HELPER_IMAGE"
    [[ -n "$img" ]] || img="$(docker inspect -f '{{.Config.Image}}' "$DB_ID")"
    warn "volume path $mount is not readable here; using helper container from image $img"
    docker run --rm --network none --cpu-shares 64 -v "$STORAGE_VOLUME":/data:ro --entrypoint tar "$img"       "${tar_opts[@]}" -C /data -cf - . 2>>"$ERRLOG" | lp gzip -3 > "$WORK/storage.tar.gz"
    st=("${PIPESTATUS[@]}")
  fi
  set -e
  # tar exit 1 = "a file changed while it was read": expected on a live shop, not fatal.
  (( st[0] <= 1 )) || die 5 "tar of the Storage volume failed (exit ${st[0]}): $(tail -n 2 "$ERRLOG" | tr '\n' ' ')"
  (( st[0] == 0 )) || warn "tar reported that some files changed while being read (live shop); the archive is still consistent per file"
  (( st[1] == 0 )) || die 5 "gzip of the Storage archive failed"
}

step_config() {
  STAGE="config-copy"
  local tmp="$WORK/cfg"
  mkdir -p "$tmp"
  if [[ -d "$REPO_DIR/deploy" ]]; then
    tar -C "$REPO_DIR" --exclude='.env' --exclude='*.env' --exclude='*.pem' --exclude='*.key' \
        -cf - deploy 2>>"$ERRLOG" | tar -C "$tmp" -xf - 2>>"$ERRLOG" || warn "could not copy deploy/ from $REPO_DIR"
  else
    warn "no deploy/ directory under $REPO_DIR; config copy will only hold runtime facts"
  fi
  if [[ -r "$STACK_ENV_FILE" ]]; then
    redact_env < "$STACK_ENV_FILE" > "$tmp/stack.env.redacted"
  fi
  {
    docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
      --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
    echo '---'
    docker image ls nextx-web --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}'
    echo '---'
    docker volume ls --filter "name=${PROJECT}-" --format '{{.Name}}'
    echo '---'
    docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${PROJECT}-web-1" 2>/dev/null || true
  } > "$tmp/runtime-state.txt" 2>>"$ERRLOG" || true
  if command -v git >/dev/null 2>&1 && [[ -d "$REPO_DIR/.git" ]]; then
    git -c safe.directory='*' -C "$REPO_DIR" rev-parse HEAD > "$tmp/source-commit.txt" 2>/dev/null || true
  fi
  tar -C "$tmp" -czf "$WORK/config.tar.gz" . 2>>"$ERRLOG" || die 5 "could not create config.tar.gz"
  rm -rf -- "$tmp"
}

step_verify() {
  STAGE="integrity-check"
  local f entries
  for f in app.dump platform.dump; do
    dexec_i pg_restore --list < "$WORK/$f" > "$WORK/$f.toc" 2>>"$ERRLOG"       || die 6 "$f is not a readable pg_dump archive (pg_restore --list failed)"
    entries="$(grep -c '^[0-9]' "$WORK/$f.toc" || true)"
    (( entries > 0 )) || die 6 "$f has an empty table of contents"
    log INFO "$f: pg_restore --list ok ($entries entries)"
  done
  grep -q 'TABLE DATA public products' "$WORK/app.dump.toc"     || die 6 "app.dump has no data entry for public.products; refusing to call this a backup"
  rm -f "$WORK/app.dump.toc" "$WORK/platform.dump.toc"
  if [[ -f "$WORK/storage.tar.gz" ]]; then
    gzip -t "$WORK/storage.tar.gz" 2>>"$ERRLOG" || die 6 "storage.tar.gz fails gzip -t"
    local nfiles; nfiles="$(tar -tzf "$WORK/storage.tar.gz" 2>>"$ERRLOG" | wc -l)"
    log INFO "storage.tar.gz: gzip ok, $nfiles entries"
    printf 'storage_entries=%s\n' "$nfiles" >> "$WORK/rowcounts.txt"
  fi
  gzip -t "$WORK/config.tar.gz" 2>>"$ERRLOG" || die 6 "config.tar.gz fails gzip -t"
  if [[ -f "$WORK/globals.sql" ]] && ! grep -q 'CREATE ROLE' "$WORK/globals.sql"; then
    warn "globals.sql has no CREATE ROLE lines"
  fi
  # Checksums of the plain content, recorded in the manifest so a restore can verify the decrypted files.
  local -a plain=(app.dump platform.dump config.tar.gz)
  [[ -f "$WORK/storage.tar.gz" ]] && plain+=(storage.tar.gz)
  [[ -f "$WORK/globals.sql" ]] && plain+=(globals.sql)
  ( cd "$WORK" && sha256sum "${plain[@]}" > PLAIN.SHA256SUMS ) || die 6 "sha256sum failed"
}

step_encrypt() {
  STAGE="encryption"
  [[ "$ENC_MODE" != none ]] || return 0
  local f
  for f in app.dump platform.dump globals.sql storage.tar.gz config.tar.gz; do
    [[ -f "$WORK/$f" ]] || continue
    encrypt_file "$WORK/$f" || die 7 "encrypting $f with $ENC_MODE failed: $(tail -n 2 "$ERRLOG" | tr '\n' ' ')"
  done
  log INFO "data files encrypted with $ENC_MODE"
}

step_manifest() {
  STAGE="manifest"
  {
    echo "nextx-backup-format=1"
    echo "created_utc=$TS"
    echo "host=$(hostname -f 2>/dev/null || hostname)"
    echo "project=$PROJECT"
    echo "db_name=$DB_NAME"
    echo "db_user=$DB_USER"
    echo "postgres_version=$(dexec psql -U "$DB_USER" -d "$DB_NAME" -X -At -c 'show server_version' 2>/dev/null | tr -d '[:space:]')"
    echo "db_image=$(docker inspect -f '{{.Config.Image}}' "$DB_ID" 2>/dev/null)"
    echo "storage_volume=$STORAGE_VOLUME"
    echo "encryption=$ENC_MODE"
    [[ "$ENC_MODE" = age ]] && echo "age_recipients_sha256=$(sha256sum "$AGE_RECIPIENTS_FILE" | cut -d' ' -f1)"
    [[ "$ENC_MODE" = gpg ]] && echo "gpg_recipient=$GPG_RECIPIENT"
    echo "script=backup-nextx.sh"
    echo "rowcounts_note=counts were taken right after pg_dump and may be a few rows behind a busy shop"
    echo "--- plain content sha256 (verify AFTER decrypting) ---"
    cat "$WORK/PLAIN.SHA256SUMS"
  } > "$WORK/MANIFEST.txt"
  rm -f "$WORK/PLAIN.SHA256SUMS"
  ( cd "$WORK" && sha256sum $(ls -1 | grep -vE '^(SHA256SUMS|COMPLETE)$') > SHA256SUMS )
  TOTAL_BYTES="$(du -sb "$WORK" | cut -f1)"
  chmod 600 "$WORK"/*
}

step_finalize() {
  STAGE="finalize"
  printf '%s\n' "$TS" > "$WORK/COMPLETE"
  sync
  FINAL="$BACKUP_DIR/$TS"
  [[ ! -e "$FINAL" ]] || die 1 "$FINAL already exists"
  mv -- "$WORK" "$FINAL"
  chmod 700 "$FINAL"
  WORK=""
  log INFO "backup complete: $FINAL ($TOTAL_BYTES bytes)"
}

step_offsite() {
  STAGE="offsite"
  [[ "$OFFSITE_STATE" == pending ]] || return 0
  log INFO "pushing $TS to $REMOTE"
  # shellcheck disable=SC2086
  if lp rclone copy "$FINAL" "$REMOTE/$TS" --retries 3 $RCLONE_FLAGS 2>>"$ERRLOG" \
     && lp rclone check "$FINAL" "$REMOTE/$TS" --one-way $RCLONE_FLAGS 2>>"$ERRLOG"; then
    OFFSITE_STATE="ok"
    log INFO "offsite copy verified at $REMOTE/$TS"
  else
    OFFSITE_STATE="failed"
    warn "OFFSITE PUSH FAILED: $(tail -n 3 "$ERRLOG" | tr '\n' ' ')"
  fi
}

list_local_backups() {
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null \
    | grep -E "$BACKUP_NAME_RE" | sort || true
}

step_prune() {
  STAGE="retention"
  local name victims
  # Stale partial directories from crashed runs (we hold the lock, so nobody is writing).
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if (( DRY )); then dry "remove stale partial $BACKUP_DIR/$name"; else rm -rf -- "${BACKUP_DIR:?}/$name"; log INFO "removed stale partial directory $name"; fi
  done < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '.partial-*' ! -newermt '1 day ago' -printf '%f\n' 2>/dev/null || true)

  victims="$(list_local_backups | retention_prune_list "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY")"
  KEPT_COUNT="$(list_local_backups | wc -l | tr -d ' ')"
  if [[ -n "$victims" ]]; then
    while IFS= read -r name; do
      [[ "$name" =~ $BACKUP_NAME_RE ]] || continue
      if [[ ! -f "$BACKUP_DIR/$name/COMPLETE" ]]; then
        warn "not pruning $name: no COMPLETE marker (inspect it by hand)"; continue
      fi
      if (( DRY )); then dry "prune local backup $name"; else
        rm -rf -- "${BACKUP_DIR:?}/$name"; log INFO "pruned local backup $name"
        KEPT_COUNT=$((KEPT_COUNT - 1))
      fi
    done <<< "$victims"
  fi
  log INFO "local retention: daily=$KEEP_DAILY weekly=$KEEP_WEEKLY monthly=$KEEP_MONTHLY, kept=$KEPT_COUNT"

  if [[ "$OFFSITE_PRUNE" = 1 && "$OFFSITE_STATE" == ok ]]; then
    local remote_names remote_victims
    remote_names="$(rclone lsf "$REMOTE" --dirs-only 2>/dev/null | sed 's#/$##' | grep -E "$BACKUP_NAME_RE" || true)"
    remote_victims="$(printf '%s\n' "$remote_names" | retention_prune_list "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY")"
    while IFS= read -r name; do
      [[ "$name" =~ $BACKUP_NAME_RE ]] || continue
      [[ "$name" != "$TS" ]] || continue
      if (( DRY )); then dry "prune offsite $REMOTE/$name"; else rclone purge "$REMOTE/$name" 2>>"$ERRLOG" && log INFO "pruned offsite backup $name" || warn "could not prune offsite $name"; fi
    done <<< "$remote_victims"
  fi
}

print_plan() {
  log INFO "DRY RUN: nothing will be written, encrypted, pushed or deleted"
  dry "lock $LOCK_FILE; log to $LOG_FILE (rotate at ${LOG_MAX_KB} KB, keep $LOG_KEEP)"
  dry "work dir $BACKUP_DIR/.partial-<UTC timestamp>, final dir $BACKUP_DIR/<UTC timestamp>"
  dry "pg_dump -Fc --no-owner -n public -n private -n drizzle  (user $DB_USER, db $DB_NAME, container ${DB_ID:-$PROJECT-db-1})"
  dry "pg_dump -Fc --no-owner -n auth -n storage"
  dry "pg_dumpall --globals-only --no-role-passwords"
  (( NO_STORAGE )) && dry "skip Storage volume" || dry "tar --xattrs of volume $STORAGE_VOLUME | gzip -3"
  dry "copy $REPO_DIR/deploy (no .env) + redacted $STACK_ENV_FILE"
  dry "integrity: pg_restore --list x2, gzip -t, sha256sum"
  dry "encryption mode: $ENC_MODE"
  if [[ -n "$REMOTE" ]] && (( ! NO_OFFSITE )); then dry "rclone copy + rclone check to $REMOTE/<ts>"; else dry "no offsite push (REMOTE unset or --no-offsite)"; fi
  ping_monitor "/start" "dry-run"
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  parse_args "$@"
  load_env_file "${BACKUP_ENV_FILE:-/etc/nextx/backup.env}"
  apply_defaults
  START_EPOCH="$(date +%s)"
  trap on_exit EXIT
  trap 'log ERROR "unexpected failure near line $LINENO during stage $STAGE" >&2' ERR
  if (( ! DRY )) && [[ "$(id -u)" -ne 0 ]] && [[ -z "${NEXTX_ALLOW_NONROOT_FOR_TESTS:-}" ]]; then
    die 2 "run as root (docker and the Storage volume need it), or use --dry-run"
  fi
  validate_config
  setup_logging
  setup_lowprio
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  ERRLOG="$(mktemp "${TMPDIR:-/tmp}/nextx-backup-err.XXXXXX")"

  if (( DRY )); then
    # Dry run: read-only discovery, no lock, no writes.
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      find_db_container && log INFO "found db container $DB_ID" || warn "db container not found (a real run would stop here)"
    else
      warn "docker not available in this shell; plan below is generic"
    fi
    setup_encryption_dry
    print_plan
    if [[ -d "$BACKUP_DIR" ]]; then
      log INFO "existing backups under $BACKUP_DIR: $(list_local_backups | wc -l | tr -d ' ')"
      step_prune
    else
      dry "BACKUP_DIR $BACKUP_DIR does not exist yet; retention preview skipped"
    fi
    STAGE="dry-run"; EXIT_CODE=0
    return 0
  fi

  acquire_lock
  setup_encryption
  ping_monitor "/start" "backup started $TS"

  if (( PRUNE_ONLY )); then
    preflight_min
    step_prune
    STAGE="done"; EXIT_CODE=0
    return 0
  fi

  preflight
  WORK="$BACKUP_DIR/.partial-$TS"
  mkdir -p "$WORK"; chmod 700 "$WORK"

  step_database
  step_storage
  step_config
  step_verify
  step_encrypt
  step_manifest
  step_finalize
  step_offsite
  step_prune

  STAGE="done"
  if [[ "$OFFSITE_STATE" == failed ]]; then EXIT_CODE=8; exit 8; fi
  EXIT_CODE=0
  return 0
}

preflight_min() {
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  OFFSITE_STATE="skipped"
}

setup_encryption_dry() {
  # Same decision as setup_encryption but only reports, never aborts the dry run.
  if (( UNENCRYPTED )); then ENC_MODE="none"; warn "would run UNENCRYPTED"; return 0; fi
  if [[ -r "$AGE_RECIPIENTS_FILE" ]] && command -v age >/dev/null 2>&1 && grep -qE '^(age1|ssh-)' "$AGE_RECIPIENTS_FILE" \
     && ! grep -q 'AGE-SECRET-KEY' "$AGE_RECIPIENTS_FILE"; then ENC_MODE="age"
  elif [[ -n "$GPG_RECIPIENT" ]] && command -v gpg >/dev/null 2>&1; then ENC_MODE="gpg"
  else ENC_MODE="MISSING"; warn "a real run would REFUSE to start: no age public key at $AGE_RECIPIENTS_FILE and no GPG_RECIPIENT (or age not installed)"; fi
}

# Only run when executed, not when sourced by the test script.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
