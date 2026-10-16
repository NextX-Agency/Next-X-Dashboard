#!/usr/bin/env bash
# Back up one isolated Coolify staging service. Run on its Docker host as root.
set -Eeuo pipefail
umask 077

required=(BACKUP_DEST STAGING_DB_CONTAINER STAGING_STORAGE_VOLUME COOLIFY_SERVICE_DIR)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    printf 'Missing required setting: %s\n' "$key" >&2
    exit 2
  fi
done

for command in docker tar gzip sha256sum realpath mktemp; do
  command -v "$command" >/dev/null 2>&1 || { printf 'Missing command: %s\n' "$command" >&2; exit 2; }
done

if (( EUID != 0 )); then
  printf 'Run as root to read the staging Docker volume and Coolify service configuration.\n' >&2
  exit 2
fi

[[ -d "$BACKUP_DEST" && ! -L "$BACKUP_DEST" ]] || { printf 'BACKUP_DEST must be an existing directory, not a symlink.\n' >&2; exit 2; }
destination=$(realpath -- "$BACKUP_DEST")
[[ -d "$COOLIFY_SERVICE_DIR" && ! -L "$COOLIFY_SERVICE_DIR" ]] || { printf 'COOLIFY_SERVICE_DIR is not a directory.\n' >&2; exit 2; }
service_dir=$(realpath -- "$COOLIFY_SERVICE_DIR")
[[ "$service_dir" == /data/coolify/services/* && "$service_dir" != /data/coolify/services ]] || {
  printf 'COOLIFY_SERVICE_DIR must name one service under /data/coolify/services.\n' >&2
  exit 2
}
service_id=$(basename -- "$service_dir")

db_running=$(docker inspect --format '{{.State.Running}}' "$STAGING_DB_CONTAINER" 2>/dev/null || true)
[[ "$db_running" == true ]] || { printf 'Staging database container is not running.\n' >&2; exit 2; }
db_service_id=$(docker inspect --format '{{ index .Config.Labels "coolify.serviceId" }}' "$STAGING_DB_CONTAINER" 2>/dev/null || true)
db_compose_service=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$STAGING_DB_CONTAINER" 2>/dev/null || true)
db_compose_project=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$STAGING_DB_CONTAINER" 2>/dev/null || true)
[[ "$db_service_id" == "$service_id" && "$db_compose_service" == db &&
   -n "$db_compose_project" ]] || {
  printf 'Database container labels do not identify the requested Coolify staging Service and db component.\n' >&2
  exit 2
}
storage_mount=$(docker volume inspect --format '{{.Mountpoint}}' "$STAGING_STORAGE_VOLUME" 2>/dev/null || true)
[[ -n "$storage_mount" && -d "$storage_mount" ]] || { printf 'Staging Storage volume is unavailable.\n' >&2; exit 2; }
storage_compose_project=$(docker volume inspect --format '{{ index .Labels "com.docker.compose.project" }}' "$STAGING_STORAGE_VOLUME" 2>/dev/null || true)
[[ "$storage_compose_project" == "$db_compose_project" ]] || {
  printf 'Storage volume does not belong to the staging database Compose project.\n' >&2
  exit 2
}
storage_mount=$(realpath -- "$storage_mount")
if [[ "$destination" == "$service_dir" || "$destination" == "$service_dir"/* ||
      "$destination" == "$storage_mount" || "$destination" == "$storage_mount"/* ]]; then
  printf 'BACKUP_DEST must be outside the staging configuration and Storage volume.\n' >&2
  exit 2
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$destination/nextx-staging-${service_id}-${timestamp}"
[[ ! -e "$final" ]] || { printf 'Backup destination already exists.\n' >&2; exit 2; }
workdir=$(mktemp -d -- "$destination/.nextx-staging-${service_id}-${timestamp}.XXXXXX")
cleanup() {
  if [[ -n "${workdir:-}" && -d "$workdir" && "$workdir" == "$destination"/.nextx-staging-* ]]; then
    rm -rf -- "$workdir"
  fi
}
trap cleanup EXIT

# pg_dumpall includes roles, schemas, and data. Compose sets POSTGRES_PASSWORD
# inside the database container; the value is never passed through host argv.
docker exec "$STAGING_DB_CONTAINER" sh -c \
  'test -n "$POSTGRES_PASSWORD" && PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dumpall -U postgres --no-password' \
  | gzip -9 > "$workdir/postgres.sql.gz"
[[ -s "$workdir/postgres.sql.gz" ]] || { printf 'Database dump is empty.\n' >&2; exit 1; }

# This is a file copy, not a transactional Storage snapshot. Quiesce writes
# before using it as a cutover backup and verify a restore separately.
tar -C "$storage_mount" -czf "$workdir/storage.tar.gz" .
tar -C "$(dirname -- "$service_dir")" -czf "$workdir/coolify-service-config.tar.gz" "$service_id"

(
  cd "$workdir"
  sha256sum postgres.sql.gz storage.tar.gz coolify-service-config.tar.gz > SHA256SUMS
)
printf 'Created UTC: %s\nService UUID: %s\nDatabase container: %s\nStorage volume: %s\n' \
  "$timestamp" "$service_id" "$STAGING_DB_CONTAINER" "$STAGING_STORAGE_VOLUME" > "$workdir/MANIFEST.txt"

chmod 600 "$workdir"/*
mv -- "$workdir" "$final"
workdir=''
printf 'Staging backup created: %s\n' "$final"
