#!/usr/bin/env bash
# Deploy NextX (the Nextly codebase) and its self-hosted Supabase stack
# (Postgres, Auth, Storage, pooler, API gateway) on this VPS, published through
# the local Pangolin site.
#
# Run on the VPS from the uploaded source tree:
#   sudo bash ~/nextx/deploy/vps/deploy-nextx.sh \
#     [--migrate ~/nextx-migration/source-snapshot.json] \
#     [--user 'you@example.com,owner,Your Name'] ...
#
# --migrate runs deploy/vps/migrate-nextx.sh after the deploy: readiness
# checks, the legacy media copy, the guarded NextX data import and validation.
#
# Safe to re-run: secrets are generated once and kept in /etc/nextx, the
# Postgres and Storage volumes are never removed, migrations are additive, and
# existing users are left alone. Re-run after uploading new source to redeploy.
#
# Nothing secret is printed. Initial sign-in passwords for newly created users
# are written to /etc/nextx/initial-logins.txt (root only).
set -euo pipefail

APP_HOST="${APP_HOST:-nextx.nextxagency.com}"
API_HOST="${API_HOST:-nextx-api.nextxagency.com}"
PANGOLIN_HOST_IP="${PANGOLIN_HOST_IP:-172.18.0.1}"
PROJECT=nextx
APP_SERVICE=web
APP_PORT=13000
API_PORT=18000
# The first deployment ran under this name; its containers hold the ports.
RETIRED_PROJECT=nextly

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK="$SRC/deploy/supabase"
OVERRIDE="$SRC/deploy/vps/docker-compose.pangolin.yml"
ETC=/etc/nextx
ENV_FILE="$ETC/stack.env"
LOGINS="$ETC/initial-logins.txt"

USERS=()
MIGRATE_SNAPSHOT=
while [ $# -gt 0 ]; do
  case "$1" in
    --user) USERS+=("$2"); shift 2 ;;
    --migrate) MIGRATE_SNAPSHOT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
compose() {
  docker compose -p "$PROJECT" --project-directory "$STACK" --env-file "$ENV_FILE" \
    -f "$STACK/docker-compose.yml" -f "$OVERRIDE" "$@"
}
# `compose up --wait` gives up the moment a container reports unhealthy, but
# Storage and Realtime run their own migrations on first boot and recover from
# early failed probes. Poll instead, and only fail after the timeout.
wait_healthy() {
  local timeout="$1"; shift
  local deadline=$(( $(date +%s) + timeout )) pending
  while :; do
    pending=()
    for svc in "$@"; do
      local id state
      id="$(compose ps -q "$svc")"
      state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
      [ "$state" = healthy ] || [ "$state" = running ] || pending+=("$svc:$state")
    done
    [ ${#pending[@]} -eq 0 ] && return 0
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "Not healthy after ${timeout}s: ${pending[*]}"
      return 1
    fi
    sleep 5
  done
}
env_get() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '\r'; }
env_set() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # Values are URLs, hex or base64; '|' never occurs in them.
    sed -i "s|^${key}=.*$|${key}=${val}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# ─── Preflight ───────────────────────────────────────────────────────────────
step "Preflight"
[ "$(id -u)" -eq 0 ] || die "Run with sudo: sudo bash $0 ..."
command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null || die "docker compose plugin is missing"
command -v openssl >/dev/null || die "openssl is required"
[ -f "$STACK/docker-compose.yml" ] || die "Source tree not found at $SRC"
if [ -n "$MIGRATE_SNAPSHOT" ]; then
  [ -f "$MIGRATE_SNAPSHOT" ] || die "Migration snapshot not found: $MIGRATE_SNAPSHOT"
fi
ip -4 -o addr | grep -q " ${PANGOLIN_HOST_IP}/" \
  || die "Pangolin bridge address $PANGOLIN_HOST_IP is not on this host"

# Retire the first deployment's containers so this stack can take the ports.
# Its volumes are kept (they hold only an empty schema); remove them by hand
# once satisfied: docker volume ls --filter name=$RETIRED_PROJECT-
retired="$(docker ps -aq --filter "label=com.docker.compose.project=$RETIRED_PROJECT")"
if [ -n "$retired" ]; then
  echo "Removing containers of the retired '$RETIRED_PROJECT' stack (volumes kept)"
  docker rm -f $retired >/dev/null
  docker network rm "${RETIRED_PROJECT}_default" >/dev/null 2>&1 || true
fi

for port in $APP_PORT $API_PORT 15432 16543; do
  if ss -tln | awk '{print $4}' | grep -qE "[:.]${port}\$"; then
    # Ours from a previous run is fine; anything else is a conflict.
    if ! docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Ports}}' \
        | grep -q ":${port}->"; then
      die "Port $port is already used by another service"
    fi
  fi
done
echo "ok: source $SRC"

# ─── Secrets (first run only) ────────────────────────────────────────────────
step "Configuration"
install -d -m 700 "$ETC"
if [ ! -f "$ENV_FILE" ]; then
  echo "Generating secrets into $ENV_FILE (first run)"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  umask 077
  cp "$STACK/.env.example" "$tmp/.env"
  ( cd "$tmp" \
    && sh "$STACK/utils/generate-keys.sh" --update-env \
    && sh "$STACK/utils/add-new-auth-keys.sh" --update-env ) >/dev/null 2>&1 \
    || die "Key generation failed"
  install -m 600 "$tmp/.env" "$ENV_FILE"
  rm -rf "$tmp"; trap - EXIT

  env_set NEXTLY_CRON_SECRET "$(openssl rand -hex 32)"
fi
chmod 600 "$ENV_FILE"

# Non-secret settings are (re)applied on every run.
env_set COMPOSE_PROJECT_NAME "$PROJECT"
env_set REALTIME_CONTAINER_NAME "$PROJECT.supabase-realtime"
env_set POOLER_TENANT_ID "$PROJECT"
env_set SUPABASE_PUBLIC_URL "https://$API_HOST"
env_set API_EXTERNAL_URL "https://$API_HOST/auth/v1"
env_set SITE_URL "https://$APP_HOST"
env_set ADDITIONAL_REDIRECT_URLS "https://$APP_HOST/**"
env_set NEXTX_STAGING_APP_URL "https://$APP_HOST"
env_set NEXTX_ENVIRONMENT staging
# Invite-only: accounts are created by this script or by an owner in the app.
env_set DISABLE_SIGNUP true
# No SMTP server is configured yet, so email confirmation cannot be delivered.
env_set ENABLE_EMAIL_AUTOCONFIRM true
env_set ENABLE_PHONE_SIGNUP false
env_set PANGOLIN_HOST_IP "$PANGOLIN_HOST_IP"
env_set API_GW_HTTP_HOST_PORT "$API_PORT"
env_set NEXTLY_APP_HOST_PORT "$APP_PORT"
# The compose file reads the Postgres password under its Coolify variable name.
env_set SERVICE_PASSWORD_64_NEXTX_POSTGRES "$(env_get POSTGRES_PASSWORD)"

for key in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
           SUPABASE_PUBLISHABLE_KEY DASHBOARD_PASSWORD NEXTLY_CRON_SECRET; do
  [ -n "$(env_get "$key")" ] || die "$key is empty in $ENV_FILE"
done
compose config --quiet || die "Compose configuration is invalid"
echo "ok: $ENV_FILE"

# ─── Supabase stack ──────────────────────────────────────────────────────────
step "Starting database and Supabase services"
SERVICES=(db supavisor auth rest storage imgproxy meta studio api-gw realtime functions)
compose pull --quiet "${SERVICES[@]}"
compose up -d "${SERVICES[@]}"
wait_healthy 600 "${SERVICES[@]}" \
  || { compose ps; die "Supabase services did not become healthy (see: docker compose -p $PROJECT logs)"; }
compose ps --format 'table {{.Service}}\t{{.Status}}'

# ─── Migrations ──────────────────────────────────────────────────────────────
step "Applying database migrations"
PGPASS="$(env_get POSTGRES_PASSWORD)"
docker run --rm --network "${PROJECT}_default" \
  -v "$SRC":/src:ro \
  -e DIRECT_URL="postgresql://postgres:${PGPASS}@db:5432/postgres" \
  -e NEXTLY_DATABASE_MODE=self-hosted \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e CI=true \
  node:22-alpine sh -c '
    set -e
    mkdir /w && cp -r /src/. /w && rm -rf /w/node_modules /w/.next && cd /w
    corepack enable >/dev/null
    pnpm install --frozen-lockfile --ignore-scripts >/dev/null
    pnpm exec drizzle-kit migrate
  ' || die "Migrations failed"

# ─── App ─────────────────────────────────────────────────────────────────────
step "Building and starting the NextX app"
compose build "$APP_SERVICE"
compose up -d "$APP_SERVICE"
wait_healthy 300 "$APP_SERVICE" \
  || { compose logs --tail 80 "$APP_SERVICE"; die "The NextX app did not become healthy"; }

# ─── Data migration ──────────────────────────────────────────────────────────
if [ -n "$MIGRATE_SNAPSHOT" ]; then
  step "NextX data migration"
  PROJECT="$PROJECT" ENV_FILE="$ENV_FILE" API_HOST="$API_HOST" API_PORT="$API_PORT" \
    APP_PORT="$APP_PORT" PANGOLIN_HOST_IP="$PANGOLIN_HOST_IP" \
    bash "$SRC/deploy/vps/migrate-nextx.sh" "$MIGRATE_SNAPSHOT" \
    || die "The data migration stopped; see the output above. The app keeps running."
fi

# ─── Users ───────────────────────────────────────────────────────────────────
if [ ${#USERS[@]} -gt 0 ]; then
  step "Users"
  SRK="$(env_get SERVICE_ROLE_KEY)"
  touch "$LOGINS"; chmod 600 "$LOGINS"
  response="$(mktemp)"
  trap 'rm -f "$response"' EXIT
  for spec in "${USERS[@]}"; do
    IFS=',' read -r email role name <<< "$spec"
    email="$(echo "$email" | tr '[:upper:]' '[:lower:]' | xargs)"
    role="$(echo "${role:-staff}" | xargs)"
    name="$(echo "${name:-$email}" | xargs)"
    case "$role" in owner|staff|viewer) ;; *) die "Role for $email must be owner, staff or viewer";; esac
    case "$email" in *@*) ;; *) die "Not an email address: $email";; esac

    # Member row first: first sign-in claims it by email. An imported member
    # with the same email keeps its row; only the role is updated.
    compose exec -T db psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres \
      -v email="$email" -v role="$role" -v name="$name" >/dev/null <<'SQL'
INSERT INTO public.members (email, full_name, role)
VALUES (:'email', :'name', :'role'::member_role)
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, updated_at = now();
SQL

    password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
    body="$(printf '{"email":"%s","password":"%s","email_confirm":true,"user_metadata":{"full_name":"%s"}}' \
      "$email" "$password" "$name")"
    code="$(curl -s -o "$response" -w '%{http_code}' \
      -X POST "http://127.0.0.1:${API_PORT}/auth/v1/admin/users" \
      -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
      -H 'Content-Type: application/json' --data "$body")"
    if [ "$code" = 200 ] || [ "$code" = 201 ]; then
      printf '%s  %s  role=%s  password=%s\n' "$(date -Is)" "$email" "$role" "$password" >> "$LOGINS"
      echo "created: $email ($role)"
    elif grep -qiE 'already|exists|registered' "$response"; then
      echo "exists:  $email ($role) — password unchanged"
    else
      die "Creating auth user $email failed (HTTP $code)"
    fi
  done
  rm -f "$response"; trap - EXIT
  echo "Initial passwords: sudo cat $LOGINS"
fi

# ─── Verification ────────────────────────────────────────────────────────────
step "Verification"
ANON="$(env_get ANON_KEY)"
health="$(curl -s -m 10 "http://${PANGOLIN_HOST_IP}:${APP_PORT}/api/health" || true)"
echo "app  http://${PANGOLIN_HOST_IP}:${APP_PORT}/api/health -> $health"
echo "$health" | grep -q '"ready"' || die "App health is not ready"
auth="$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H "apikey: $ANON" \
  "http://${PANGOLIN_HOST_IP}:${API_PORT}/auth/v1/health" || true)"
echo "auth http://${PANGOLIN_HOST_IP}:${API_PORT}/auth/v1/health -> HTTP $auth"
[ "$auth" = 200 ] || die "Auth health check failed"

cat <<EOF

Deployed. Containers: docker compose -p $PROJECT ps

Pangolin routes (local site, Pangolin authentication OFF):
  $APP_HOST  ->  http://${PANGOLIN_HOST_IP}:${APP_PORT}
  $API_HOST  ->  http://${PANGOLIN_HOST_IP}:${API_PORT}

Secrets: $ENV_FILE (root only). Studio basic-auth user: supabase,
password: DASHBOARD_PASSWORD in that file.
EOF
