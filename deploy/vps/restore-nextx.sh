#!/usr/bin/env bash
# Restore a NextX backup made by backup-nextx.sh into a SEPARATE, throwaway target
# and prove it works. By default nothing on the live stack is read or changed.
#
#   restore-nextx.sh --list
#   restore-nextx.sh --backup <dir|latest> [--identity /path/to/age-private-key]
#                    [--port 55432] [--scratch DIR] [--image IMAGE]
#                    [--skip-storage] [--keep]
#
# Drill mode (default). It
#   1. verifies SHA256SUMS and decrypts into a private scratch directory,
#   2. starts a NEW Postgres container (name nextx-restore-<id>) bound to
#      127.0.0.1:<port> (default 55432; the live database is never touched),
#   3. restores app.dump and platform.dump with pg_restore --no-owner,
#   4. extracts the Storage archive into <scratch>/storage (never the live volume),
#   5. prints row counts of products, product_variants, sales, ledger_entries and
#      members next to the counts recorded at backup time, and
#   6. prints how long each phase took (the recovery time you measure and write
#      down in docs/05-operations/runbook.md) and removes everything it made.
#      --keep leaves the container and scratch directory for inspection; remove
#      them afterwards with: docker rm -f nextx-restore-<id>; rm -rf <scratch>
#
# Decryption: age backups need the PRIVATE key via --identity (copy it to the
# machine for the drill, delete it afterwards; it must never live on the VPS).
# gpg backups use the private key in the gpg keyring.
#
# Live restore (disaster only). It replaces the live database contents and needs
# BOTH flags, the second one naming the exact backup it applies:
#   --overwrite-live  --confirm-live-restore <backup-timestamp>
# It stops web/auth/storage/rest, saves a safety dump of the current state under
# $BACKUP_DIR/pre-restore-<ts>/, restores in ONE transaction (all or nothing),
# extracts Storage over the live volume (existing files with the same name are
# replaced; extra files stay), and starts the services again. Without both flags
# it exits before touching anything.
#
# Environment (all optional): BACKUP_DIR (/var/backups/nextx), PROJECT (nextx),
# DB_CONTAINER, STORAGE_VOLUME, RESTORE_PG_IMAGE, RESTORE_MEMORY (default 1g).
#
# Exit codes: 0 ok; 1 failure; 2 usage / unsafe request; 3 integrity or decrypt
# failure; 4 row counts do not match what the backup recorded.
set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/nextx}"
PROJECT="${PROJECT:-nextx}"
DB_CONTAINER="${DB_CONTAINER:-}"
STORAGE_VOLUME="${STORAGE_VOLUME:-${PROJECT}-supabase-storage-data}"
RESTORE_PG_IMAGE="${RESTORE_PG_IMAGE:-}"
RESTORE_MEMORY="${RESTORE_MEMORY:-1g}"
DEFAULT_IMAGE="supabase/postgres:17.6.1.136"
KEY_TABLES=(public.products public.product_variants public.sales public.ledger_entries public.members)
# Drift allowed between the counts taken right after the dump and the dump itself
# (rows written by the live shop in between): the larger of 5 rows or 1 percent.
BACKUP_NAME_RE='^[0-9]{8}T[0-9]{6}Z$'

BACKUP=""; IDENTITY=""; PORT=55432; SCRATCH=""; IMAGE=""; SKIP_STORAGE=0; KEEP=0
LIST=0; LIVE=0; LIVE_CONFIRM=""; LIVE_FLAG=0
RID=""; CNAME=""; PLAIN=""; SCRATCH_MADE=0; CONTAINER_MADE=0
PG_USER="postgres"; STARTED_AT=0
declare -a PHASE_NAMES=() PHASE_SECS=()
RC=1

log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${*:2}"; }
die() { local code="$1"; shift; log ERROR "$*" >&2; RC="$code"; exit "$code"; }
usage() { sed -n '2,/^set -Eeuo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; }

phase_start() { PHASE_T0=$(date +%s); PHASE_LABEL="$1"; log INFO "== $1"; }
phase_end() { PHASE_NAMES+=("$PHASE_LABEL"); PHASE_SECS+=("$(( $(date +%s) - PHASE_T0 ))"); }

# Pure helper (sourced by tests): evaluate one table. Echo OK|DRIFT|DIFF.
#   count_verdict <restored> <expected_at_backup>
count_verdict() {
  local got="$1" want="$2" tol diff
  [[ "$got" =~ ^[0-9]+$ ]] || { echo MISSING; return; }
  [[ "$want" =~ ^[0-9]+$ ]] || { echo NOBASELINE; return; }
  if (( got == want )); then echo OK; return; fi
  tol=$(( want / 100 )); (( tol < 5 )) && tol=5
  diff=$(( want > got ? want - got : got - want ))
  if (( got <= want + tol && diff <= tol )); then echo DRIFT; else echo DIFF; fi
}

cleanup() {
  local rc=$?
  trap - EXIT
  if (( KEEP )) && (( CONTAINER_MADE )); then
    log INFO "kept container $CNAME and scratch $SCRATCH (remove: docker rm -f $CNAME; rm -rf '$SCRATCH')"
  else
    if (( CONTAINER_MADE )) && [[ -n "$CNAME" ]]; then docker rm -f -v "$CNAME" >/dev/null 2>&1 || true; fi
    # Plain-text copies of customer data never outlive the drill unless --keep.
    if (( SCRATCH_MADE )) && [[ -n "$SCRATCH" && "$SCRATCH" == */nextx-restore-* ]]; then rm -rf -- "$SCRATCH"; fi
  fi
  if (( rc != 0 )) && (( RC != 1 )); then rc=$RC; fi
  exit "$rc"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --list) LIST=1 ;;
      --backup) BACKUP="${2:?--backup needs a value}"; shift ;;
      --identity) IDENTITY="${2:?--identity needs a value}"; shift ;;
      --port) PORT="${2:?--port needs a value}"; shift ;;
      --scratch) SCRATCH="${2:?--scratch needs a value}"; shift ;;
      --image) IMAGE="${2:?--image needs a value}"; shift ;;
      --skip-storage) SKIP_STORAGE=1 ;;
      --keep) KEEP=1 ;;
      --overwrite-live) LIVE_FLAG=1 ;;
      --confirm-live-restore) LIVE_CONFIRM="${2:?--confirm-live-restore needs the backup timestamp}"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) printf 'Unknown argument: %s (try --help)\n' "$1" >&2; exit 2 ;;
    esac
    shift
  done
  if (( LIVE_FLAG )) || [[ -n "$LIVE_CONFIRM" ]]; then
    (( LIVE_FLAG )) && [[ -n "$LIVE_CONFIRM" ]] \
      || die 2 "a live restore needs BOTH --overwrite-live and --confirm-live-restore <backup-timestamp>. Nothing was changed."
    LIVE=1
  fi
}

resolve_backup() {
  [[ -n "$BACKUP" ]] || die 2 "pass --backup <directory|latest> (or --list)"
  if [[ "$BACKUP" == latest ]]; then
    BACKUP="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | grep -E "$BACKUP_NAME_RE" | sort | tail -n1)"
    [[ -n "$BACKUP" ]] || die 2 "no backups under $BACKUP_DIR"
    BACKUP="$BACKUP_DIR/$BACKUP"
  elif [[ "$BACKUP" =~ $BACKUP_NAME_RE ]]; then
    BACKUP="$BACKUP_DIR/$BACKUP"
  fi
  [[ -d "$BACKUP" ]] || die 2 "backup directory not found: $BACKUP"
  BACKUP="$(cd "$BACKUP" && pwd)"
  [[ -f "$BACKUP/COMPLETE" ]] || die 2 "$BACKUP has no COMPLETE marker: it is an unfinished backup"
  [[ -f "$BACKUP/MANIFEST.txt" && -f "$BACKUP/SHA256SUMS" ]] || die 2 "$BACKUP lacks MANIFEST.txt / SHA256SUMS"
}

manifest_get() { grep -m1 "^$1=" "$BACKUP/MANIFEST.txt" | cut -d= -f2-; }

# decrypt_to <encrypted-or-plain name without suffix> <dest>
decrypt_to() {
  local base="$1" dest="$2"
  if [[ -f "$BACKUP/$base.age" ]]; then
    command -v age >/dev/null 2>&1 || die 3 "age is not installed"
    [[ -n "$IDENTITY" && -r "$IDENTITY" ]] || die 3 "backup is age-encrypted: pass --identity /path/to/private-key"
    age -d -i "$IDENTITY" -o "$dest" "$BACKUP/$base.age" || die 3 "age could not decrypt $base (wrong key?)"
  elif [[ -f "$BACKUP/$base.gpg" ]]; then
    command -v gpg >/dev/null 2>&1 || die 3 "gpg is not installed"
    gpg --batch --yes --no-tty --output "$dest" --decrypt "$BACKUP/$base.gpg" 2>/dev/null || die 3 "gpg could not decrypt $base"
  elif [[ -f "$BACKUP/$base" ]]; then
    cp -- "$BACKUP/$base" "$dest"
  else
    return 1
  fi
}

step_verify_and_decrypt() {
  phase_start "verify checksums and decrypt"
  ( cd "$BACKUP" && sha256sum --quiet -c SHA256SUMS ) || die 3 "SHA256SUMS does not match: the backup is damaged or was altered"
  log INFO "SHA256SUMS ok (files are exactly as written)"
  mkdir -p "$PLAIN"
  local f
  for f in app.dump platform.dump config.tar.gz storage.tar.gz globals.sql; do
    if decrypt_to "$f" "$PLAIN/$f"; then :; else
      case "$f" in storage.tar.gz|globals.sql) log WARN "$f not in this backup" ;; *) die 3 "$f missing from $BACKUP" ;; esac
    fi
  done
  # Compare the decrypted files with the checksums recorded before encryption.
  sed -n '/^--- plain content sha256/,$p' "$BACKUP/MANIFEST.txt" | tail -n +2 > "$PLAIN/PLAIN.SHA256SUMS"
  ( cd "$PLAIN" && sha256sum --quiet -c PLAIN.SHA256SUMS ) || die 3 "decrypted content does not match the checksums in MANIFEST.txt"
  log INFO "decrypted content verified against MANIFEST.txt"
  rm -f "$PLAIN/PLAIN.SHA256SUMS"
  phase_end
}

pg_exec() { docker exec -i "$CNAME" "$@"; }
psql_t() { pg_exec psql -U "$PG_USER" -d postgres -X -At -v ON_ERROR_STOP=1 "$@"; }

step_start_target() {
  phase_start "start throwaway Postgres on 127.0.0.1:$PORT"
  command -v docker >/dev/null 2>&1 || die 2 "docker is required"
  docker info >/dev/null 2>&1 || die 2 "cannot talk to the Docker daemon"
  [[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1024 && PORT <= 65535 )) || die 2 "--port must be 1024-65535"
  case "$PORT" in 5432|6543|15432|16543|5433|13000|18000) die 2 "port $PORT is used by the live stack; choose another" ;; esac
  if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${PORT}\$"; then
    die 2 "port $PORT is already in use"
  fi
  local live_img
  if [[ -z "$IMAGE" ]]; then
    IMAGE="$RESTORE_PG_IMAGE"
    [[ -n "$IMAGE" ]] || IMAGE="$(manifest_get db_image || true)"
    [[ -n "$IMAGE" ]] || IMAGE="$DEFAULT_IMAGE"
  fi
  log INFO "image: $IMAGE (same as the live database unless you override it)"
  RID="$(date -u +%Y%m%dT%H%M%S)-$RANDOM"
  CNAME="nextx-restore-$RID"
  local pw; pw="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  docker run -d --name "$CNAME" --label nextx.restore-drill=1 --memory "$RESTORE_MEMORY" \
    -p "127.0.0.1:${PORT}:5432" -e "POSTGRES_PASSWORD=$pw" "$IMAGE" >/dev/null \
    || die 1 "could not start the throwaway database container"
  CONTAINER_MADE=1
  unset pw
  local i
  for i in $(seq 1 120); do
    if docker exec "$CNAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 \
       && docker exec "$CNAME" psql -U postgres -d postgres -X -At -c 'select 1' >/dev/null 2>&1; then break; fi
    sleep 2
    [[ $i -lt 120 ]] || die 1 "throwaway database did not become ready in 4 minutes"
  done
  # Settle: the Supabase image restarts once while its init scripts run.
  sleep 3
  for i in $(seq 1 60); do docker exec "$CNAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
  if docker exec "$CNAME" psql -U supabase_admin -d postgres -X -At -c 'select 1' >/dev/null 2>&1; then PG_USER=supabase_admin; else PG_USER=postgres; fi
  log INFO "target ready, superuser for restore: $PG_USER"
  phase_end
}

ROLES_SQL="
DO \$\$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_admin',
      'supabase_auth_admin','supabase_storage_admin','supabase_read_only_user','dashboard_user',
      'pgbouncer','supabase_realtime_admin','supabase_replication_admin','supabase_etl_admin','pgsodium_keyholder']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END \$\$;"

restore_dump() {  # restore_dump <file> <label> [extra pg_restore args...]
  local file="$1" label="$2"; shift 2
  local errs; errs="$(mktemp)"
  # No --exit-on-error in drill mode: grant/ACL noise for roles that only exist on the real
  # stack must not abort the drill. Errors are counted and shown; the row counts decide.
  if pg_exec pg_restore -U "$PG_USER" -d postgres --no-owner "$@" < "$file" 2>"$errs"; then
    log INFO "$label: pg_restore finished without errors"
  else
    local n; n="$(grep -c 'error:' "$errs" || true)"
    log WARN "$label: pg_restore reported $n error line(s); first lines follow"
    grep 'error:' "$errs" | head -n 8 | sed 's/^/    /'
  fi
  rm -f "$errs"
}

step_restore_db() {
  phase_start "restore database dumps"
  psql_t -c "$ROLES_SQL" >/dev/null
  restore_dump "$PLAIN/platform.dump" "platform.dump (auth, storage)"
  restore_dump "$PLAIN/app.dump" "app.dump (public, private, drizzle)"
  phase_end
}

step_restore_storage() {
  phase_start "extract Storage archive to scratch"
  if (( SKIP_STORAGE )) || [[ ! -f "$PLAIN/storage.tar.gz" ]]; then
    log WARN "no Storage archive restored (skipped or not in this backup)"; phase_end; return 0
  fi
  mkdir -p "$SCRATCH/storage"
  tar --xattrs '--xattrs-include=user.*' --numeric-owner -C "$SCRATCH/storage" -xzf "$PLAIN/storage.tar.gz" 2>"$SCRATCH/tar.err" \
    || { log WARN "tar extraction reported problems (extended attributes need a filesystem with user xattrs):"; head -n 5 "$SCRATCH/tar.err" | sed 's/^/    /'; }
  local files expect
  files="$(find "$SCRATCH/storage" -type f | wc -l | tr -d ' ')"
  expect="$(grep -m1 '^storage_entries=' "$BACKUP/rowcounts.txt" | cut -d= -f2 || true)"
  log INFO "Storage extracted: $files file(s) (archive lists ${expect:-?} entries including directories)"
  phase_end
}

step_verify_counts() {
  phase_start "verify row counts"
  local t got want verdict bad=0 drift=0 line
  printf '\n%-28s %12s %12s  %s\n' TABLE RESTORED AT_BACKUP VERDICT
  for t in "${KEY_TABLES[@]}"; do
    got="$(psql_t -c "select count(*) from $t" 2>/dev/null | tr -d '[:space:]' || true)"
    want="$(grep -m1 "^$t=" "$BACKUP/rowcounts.txt" | cut -d= -f2 || true)"
    verdict="$(count_verdict "${got:-x}" "${want:-x}")"
    printf '%-28s %12s %12s  %s\n' "$t" "${got:-n/a}" "${want:-n/a}" "$verdict"
    case "$verdict" in OK) ;; DRIFT) drift=$((drift + 1)) ;; *) bad=$((bad + 1)) ;; esac
  done
  for t in auth.users storage.objects; do
    got="$(psql_t -c "select count(*) from $t" 2>/dev/null | tr -d '[:space:]' || true)"
    want="$(grep -m1 "^$t=" "$BACKUP/rowcounts.txt" | cut -d= -f2 || true)"
    printf '%-28s %12s %12s  %s\n' "$t" "${got:-n/a}" "${want:-n/a}" "$(count_verdict "${got:-x}" "${want:-x}")"
  done
  echo
  if (( drift > 0 )); then log INFO "DRIFT = restored count within tolerance of the count taken right after the dump (the shop wrote rows in between)"; fi
  phase_end
  if (( bad > 0 )); then
    log ERROR "$bad key table(s) do not match the backup: treat this backup as suspect"
    return 4
  fi
  return 0
}

print_timings() {
  local total=$(( $(date +%s) - STARTED_AT )) i
  echo
  echo "Recovery time measurement (this machine; write the total into docs/05-operations/runbook.md):"
  for i in "${!PHASE_NAMES[@]}"; do printf '  %-48s %6ss\n' "${PHASE_NAMES[$i]}" "${PHASE_SECS[$i]}"; done
  printf '  %-48s %6ss\n' "TOTAL (restore only)" "$total"
  echo "RESTORE_DRILL total_seconds=$total backup=$(basename "$BACKUP") status=${1:-unknown}"
  echo "Not included: provisioning a new server, installing Docker, restoring stack.env from the password manager,"
  echo "re-pointing DNS/Pangolin. Time those by hand in a full disaster drill."
}

# ─── Live restore (disaster only) ────────────────────────────────────────────
live_restore() {
  [[ "$LIVE_CONFIRM" == "$(basename "$BACKUP")" ]] \
    || die 2 "--confirm-live-restore '$LIVE_CONFIRM' does not match the backup '$(basename "$BACKUP")'. Nothing was changed."
  local live_id
  if [[ -n "$DB_CONTAINER" ]]; then live_id="$(docker ps -q --filter "name=^/${DB_CONTAINER}\$" | head -n1)"
  else live_id="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter 'label=com.docker.compose.service=db' | head -n1)"; fi
  [[ -n "$live_id" ]] || die 2 "live database container for project '$PROJECT' is not running"
  CNAME="$live_id"
  if docker exec "$CNAME" psql -U supabase_admin -d postgres -X -At -c 'select 1' >/dev/null 2>&1; then PG_USER=supabase_admin; else PG_USER=postgres; fi

  log WARN "LIVE RESTORE of $(basename "$BACKUP") into $(docker inspect -f '{{.Name}}' "$live_id")"
  log WARN "web, auth, storage and rest stop now; the shop is DOWN until this finishes"
  PLAIN="$(mktemp -d /var/tmp/nextx-restore-live.XXXXXX)"; SCRATCH="$PLAIN"; SCRATCH_MADE=1
  mkdir -p "$PLAIN/p"; local keep_plain="$PLAIN"; PLAIN="$PLAIN/p"
  step_verify_and_decrypt

  local svc ids=()
  for svc in web auth storage rest; do
    local id; id="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$svc" | head -n1)"
    [[ -n "$id" ]] && ids+=("$id")
  done
  local safety="$BACKUP_DIR/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$safety"; chmod 700 "$safety"
  log INFO "safety dump of the current live state to $safety (delete it when the restore is accepted)"
  docker exec "$CNAME" pg_dump -U "$PG_USER" -d postgres -Fc --no-owner -n public -n private -n drizzle -n auth -n storage > "$safety/current.dump" \
    || die 1 "could not take the safety dump; nothing was changed"
  [[ -s "$safety/current.dump" ]] || die 1 "safety dump is empty; nothing was changed"

  [[ ${#ids[@]} -eq 0 ]] || docker stop "${ids[@]}" >/dev/null
  local ok=1
  # One transaction: either the whole restore applies or the database stays as it was.
  if ! pg_exec pg_restore -U "$PG_USER" -d postgres --no-owner --clean --if-exists --single-transaction --exit-on-error < "$PLAIN/platform.dump"; then ok=0; fi
  if (( ok )) && ! pg_exec pg_restore -U "$PG_USER" -d postgres --no-owner --clean --if-exists --single-transaction --exit-on-error < "$PLAIN/app.dump"; then ok=0; fi
  if (( ok )) && [[ -f "$PLAIN/storage.tar.gz" ]] && (( ! SKIP_STORAGE )); then
    local mount; mount="$(docker volume inspect -f '{{.Mountpoint}}' "$STORAGE_VOLUME" 2>/dev/null || true)"
    if [[ -d "$mount" ]]; then
      tar --xattrs '--xattrs-include=user.*' --numeric-owner -C "$mount" -xzf "$PLAIN/storage.tar.gz" || { log ERROR "Storage extraction failed"; ok=0; }
    else
      log WARN "Storage volume path not visible here; extract $PLAIN/storage.tar.gz into volume $STORAGE_VOLUME yourself"
    fi
  fi
  [[ ${#ids[@]} -eq 0 ]] || docker start "${ids[@]}" >/dev/null
  PLAIN="$keep_plain"
  if (( ok )); then
    log INFO "live restore applied. Verify: curl -fsS http://127.0.0.1:13000/api/health ; then sign in and open a product page"
    log INFO "safety dump of the previous state: $safety"
    RC=0
  else
    log ERROR "live restore FAILED and was rolled back by the single transaction; services were started again. Safety dump: $safety"
    RC=1
  fi
  return "$RC"
}

main() {
  parse_args "$@"
  if (( LIST )); then
    find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | grep -E "$BACKUP_NAME_RE" | sort | while read -r n; do
      printf '%s  %s  %s\n' "$n" "$(du -sh "$BACKUP_DIR/$n" | cut -f1)" "$(grep -m1 '^encryption=' "$BACKUP_DIR/$n/MANIFEST.txt" 2>/dev/null || echo encryption=?)"
    done
    exit 0
  fi
  trap cleanup EXIT
  STARTED_AT=$(date +%s)
  resolve_backup
  log INFO "backup: $BACKUP (encryption: $(manifest_get encryption || echo ?), created $(manifest_get created_utc || echo ?))"
  if (( LIVE )); then
    [[ "$(id -u)" -eq 0 ]] || die 2 "live restore must run as root"
    live_restore
    exit "$RC"
  fi
  [[ -n "$SCRATCH" ]] || SCRATCH="/var/tmp/nextx-restore-$(date -u +%Y%m%dT%H%M%S)-$RANDOM"
  [[ "$SCRATCH" == */nextx-restore-* ]] || SCRATCH="$SCRATCH/nextx-restore-$(date -u +%Y%m%dT%H%M%S)-$RANDOM"
  case "$SCRATCH" in "$BACKUP"*|/var/lib/docker/*) die 2 "scratch directory must not be inside the backup or the Docker data directory" ;; esac
  [[ ! -e "$SCRATCH" ]] || die 2 "scratch directory already exists: $SCRATCH"
  mkdir -p "$SCRATCH"; chmod 700 "$SCRATCH"; SCRATCH_MADE=1
  PLAIN="$SCRATCH/plain"

  step_verify_and_decrypt
  step_start_target
  step_restore_db
  step_restore_storage
  local verdict=0
  step_verify_counts || verdict=$?
  local status=PASS; (( verdict == 0 )) || status=FAIL
  print_timings "$status"
  RC=$verdict
  if (( KEEP )); then
    log INFO "connect: docker exec -it $CNAME psql -U $PG_USER -d postgres   (also 127.0.0.1:$PORT)"
  fi
  exit "$verdict"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
