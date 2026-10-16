#!/usr/bin/env bash
# Read-only VPS audit for NextX Dashboard 2.0. Run on the VPS as a user who can use docker:
#   sudo bash vps-readonly-audit.sh | tee vps-audit-$(date +%F).txt
# Prints no environment variables, keys, or passwords. Makes no changes.
set -u

echo "== time / host"; date -u +%FT%TZ; hostname
echo; echo "== containers (name, image, status, image digest)"
docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}' | while IFS='|' read -r n i s; do
  d=$(docker inspect -f '{{.Image}}' "$n" 2>/dev/null)
  echo "$n | $i | $s | $d"
done

echo; echo "== app container: labels, created, next version (no env)"
APP=$(docker ps --format '{{.Names}}' | grep -i -E 'nextx|nextly|web' | grep -v -i supabase | head -1)
if [ -n "$APP" ]; then
  docker inspect -f 'name={{.Name}} created={{.Created}} image={{.Config.Image}}' "$APP"
  docker inspect -f '{{json .Config.Labels}}' "$APP" | tr ',' '\n' | grep -i -E 'commit|sha|git|revision|coolify.name' || true
  docker exec "$APP" node -e "console.log('next', require('next/package.json').version)" 2>&1 | head -2
fi

echo; echo "== postgres row counts, every public table (read-only)"
DB=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /^supabase\/postgres:/ {print $1}' | head -1)
echo "db container: ${DB:-none}"
if [ -n "$DB" ]; then
  docker exec "$DB" psql -U postgres -d postgres -At -c \
    "SET default_transaction_read_only = on;
     SELECT table_name || ' = ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
     FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1;"
  echo; echo "== storefronts (name, status)"
  docker exec "$DB" psql -U postgres -d postgres -At -c \
    "SET default_transaction_read_only = on; SELECT name, status FROM public.storefronts ORDER BY name;"
  echo; echo "== applied migrations"
  docker exec "$DB" psql -U postgres -d postgres -At -c \
    "SET default_transaction_read_only = on; SELECT count(*), max(created_at) FROM drizzle.__drizzle_migrations;" 2>&1 | head -3
fi

echo; echo "== how the web image was built (no env values)"
docker inspect -f 'compose project dir={{index .Config.Labels "com.docker.compose.project.working_dir"}} config={{index .Config.Labels "com.docker.compose.project.config_files"}}' nextx-web-1 2>/dev/null
docker image inspect nextx-web -f 'image created={{.Created}} id={{.Id}} labels={{json .Config.Labels}}' 2>/dev/null
docker exec nextx-web-1 sh -c 'cat .next/BUILD_ID 2>/dev/null; echo; ls -la server.js 2>/dev/null' 2>&1 | head -4

echo; echo "== Coolify applications: source repo, branch, commit (no secrets selected)"
docker exec coolify-db psql -U coolify -d coolify -At -F ' | ' -c "SELECT name, git_repository, git_branch, git_commit_sha, build_pack, updated_at FROM applications ORDER BY updated_at DESC LIMIT 10;" 2>&1 | head -12
docker exec coolify-db psql -U coolify -d coolify -At -F ' | ' -c "SELECT name, git_repository, git_branch, git_commit_sha, updated_at FROM applications WHERE name ILIKE '%nextx%' OR name ILIKE '%nextly%';" 2>&1 | head -5

echo; echo "== backups detail"
ls -la /var/backups/nextx 2>&1 | head -20
echo "-- cron file"; cat /etc/cron.d/nextx-assist-staging-backup 2>&1 | grep -v '^#' | head -10
echo "-- backup scripts"; ls -la /usr/local/bin /opt 2>/dev/null | grep -i -E 'backup|nextx' | head

echo; echo "== resource use (snapshot)"
docker stats --no-stream --format '{{.Name}}\tCPU {{.CPUPerc}}\tMEM {{.MemUsage}}' 2>/dev/null | head -30

echo; echo "== published ports (look for DB ports bound to 0.0.0.0)"
ss -ltnp 2>/dev/null | awk 'NR==1 || /0\.0\.0\.0|\[::\]/' | head -30

echo; echo "== backups (newest files, sizes only)"
ls -lat /var/backups /data/backups /opt/backups 2>/dev/null | head -20
echo; echo "== cron"; crontab -l 2>/dev/null | grep -v '^#' | head; ls /etc/cron.d 2>/dev/null
echo; echo "== disk / memory"; df -h / | tail -1; free -h | head -2
