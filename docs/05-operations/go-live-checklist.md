# Go-live checklist and operations state

Written 2026-10-24 for `https://nextx.nextxagency.com` (app) and `https://nextx-api.nextxagency.com`
(self-hosted Supabase gateway), one shared VPS, one Docker Compose project named `nextx`, published
through Pangolin. The older [Coolify notes](coolify.md) describe a topology that was **not** used for
the live stack; the deploy path is `deploy/vps/deploy-nextx.sh` and `deploy/vps/deploy-pinned.sh`.

## How to read this

Each row is **Done**, **Partial** or **Missing**, with its evidence. Evidence is one of:

- *repo*: read in this repository on the date above;
- *audit 16 Oct*: recorded by the read-only VPS audit in
  [`docs/audits/2026-10-16-current-state.md`](../audits/2026-10-16-current-state.md) and the
  reconciliation report. **Nothing on the VPS was touched or re-checked when this page was written.**
  Anything that audit marked UNVERIFIED stays unverified here. Re-run
  `sudo bash scripts/ops/vps-readonly-audit.sh` to refresh it before relying on a row.

## Status at a glance

| Area | Status | One-line state |
|---|---|---|
| Database backup (scheduled) | **Missing** | Only two manual `pg_dump` files from 16 Oct. No schedule for the NextX database. |
| Storage (photos, receipts) backup | **Missing** | Nothing copies the Storage volume. |
| Offsite, encrypted copy | **Missing** | No target chosen. Production gate `OFFSITE_BACKUP_TARGET_REQUIRED` is still open. |
| Restore drill | **Partial** | Pre-import dump restored into a scratch DB (63 tables matched). Post-import dump and Storage never restored. |
| Uptime monitoring and alerts | **Missing** | Container `HEALTHCHECK` only; nobody is told when the site is down. |
| Log retention | **Missing** | No Docker log rotation configured in the Compose files. |
| Secret rotation | **Missing** | Secrets generated once on first deploy; no rotation procedure ever run. |
| Email (invites, password reset) | **Missing** | No SMTP; `ENABLE_EMAIL_AUTOCONFIRM=true`. Invitations and resets cannot be delivered. |
| DNS / TLS | **Partial** | Both hosts answered over HTTPS on 16 Oct; certificate details, expiry alerting and auto-renewal ownership not verified. |
| Rollback | **Partial** | `deploy-pinned.sh` tags every outgoing image. Procedure below, never rehearsed. |
| Scheduled app jobs (reorder, recurring expenses) | **Missing** | Endpoints exist and are secured; no scheduler calls them. |
| Environment flag | **Partial** | The deploy script still sets `NEXTX_ENVIRONMENT=staging` (see "Decisions only the owner can make"). |

## 1. Backups

| Item | Status | Evidence and what to do |
|---|---|---|
| Scheduled `pg_dump` of the NextX database | **Missing** | *audit 16 Oct*: "No scheduled backup of the NextX Supabase database". The only cron backup on the box belongs to the unrelated Chatwoot stack. Two manual dumps exist in `/var/backups/nextx` (352 KB and 358 KB, taken before the import, root-only). |
| `deploy/backup-staging.sh` | **Not usable as is** | *repo*: it only runs against a Coolify service (it requires a `coolify.serviceId` container label and a `/data/coolify/services/<uuid>` directory). The live stack is a plain Compose project, so the script refuses to run. Do not edit it in place; write a Compose-aware job (sketch below). |
| Storage objects (product photos, `nextly-expense-receipts`) | **Missing** | Volume `nextx-supabase-storage-data`. Photos are re-creatable from originals only if the originals exist elsewhere; receipts are not. |
| Database volume protection | **Partial** | Named volume `nextx-supabase-postgres-data`, `restart: unless-stopped`. A volume is not a backup. |
| Offsite copy, encrypted | **Missing** | Pick a target (an S3-compatible bucket such as Backblaze B2 or a Hetzner Storage Box, in a different provider or at least a different account from the VPS). Encrypt before upload (`age` or `gpg`) and keep the key off the VPS. |
| Retention | **Missing** | Suggested: 14 daily, 8 weekly, 6 monthly. |
| Backup failure alert | **Missing** | Ping a dead-man's-switch (healthchecks.io free tier) at the end of each successful run so a silent failure becomes an email. |

### Sketch of the missing job (review and rehearse on a copy first; not run anywhere)

```bash
# /usr/local/bin/nextx-backup  (root, mode 700), run daily from /etc/cron.d/nextx-backup
set -Eeuo pipefail; umask 077
DEST=/var/backups/nextx; STAMP=$(date -u +%Y%m%dT%H%M%SZ); mkdir -p "$DEST/$STAMP"
DB=$(docker ps --filter label=com.docker.compose.project=nextx --filter label=com.docker.compose.service=db -q)
# Logical dump of the whole cluster (roles, auth, storage metadata, app data).
docker exec "$DB" pg_dumpall -U postgres --no-password | gzip -9 > "$DEST/$STAMP/postgres.sql.gz"
# Storage objects (photos, private receipts).
docker run --rm -v nextx-supabase-storage-data:/data:ro -v "$DEST/$STAMP":/out alpine \
  tar -C /data -czf /out/storage.tar.gz .
( cd "$DEST/$STAMP" && sha256sum * > SHA256SUMS )
# Encrypt, then ship offsite with rclone (config in /root/.config/rclone), then prune.
tar -C "$DEST" -cf - "$STAMP" | age -r "$(cat /etc/nextx/backup.age.pub)" > "$DEST/$STAMP.tar.age"
rclone copy "$DEST/$STAMP.tar.age" offsite:nextx-backups/
find "$DEST" -maxdepth 1 -name '*.tar.age' -mtime +14 -delete
rm -rf "$DEST/$STAMP"
curl -fsS -m 10 https://hc-ping.com/<your-check-uuid> >/dev/null
```

`pg_dumpall` is used because it carries roles and the `auth`/`storage` schemas, which a restore of the
Supabase stack needs. Stop writes (or accept a few seconds of drift) for the storage tarball.

### Restore drill

| Step | Status | Evidence |
|---|---|---|
| Pre-import dump restored to a scratch database | **Done** | Reconciliation report: restore matched 63 tables plus the migration ledger. |
| Restore of a dump taken **after** real data exists | **Missing** | Report: "Restore of the post-import dump has not been tested." |
| Restore of Storage to a scratch volume, photos and a signed receipt link verified | **Missing** | Never done. |
| Whole-stack restore on a second host (the disaster case) | **Missing** | Needs the offsite copy first. |
| Written restore time (RTO) | **Missing** | Measure it during the drill and record it here. |

Do the drill once after the first scheduled offsite backup exists, and again after every Supabase
upgrade. An untested backup is a belief, not a backup.

## 2. Monitoring and uptime

| Item | Status | Evidence and what to do |
|---|---|---|
| Container health | **Done** | *repo*: Dockerfile `HEALTHCHECK` calls `/api/health` every 30 s and requires `status: "ready"`. Docker only restarts on exit, not on `unhealthy`, and tells nobody. |
| `GET /api/health` | **Done** | *repo*: one `select 1`, `Cache-Control: no-store`, 503 when the database or environment is wrong. Now also returns `databaseMs` (round trip of that one query) and `uptimeSeconds` (a value that keeps resetting means a crash loop). No secrets. |
| External uptime check | **Missing** | See below. |
| Supabase gateway / Auth monitoring | **Missing** | `https://nextx-api.nextxagency.com/auth/v1/health` answers 401 without the API key, so a free keyword monitor cannot use it. Cover Auth indirectly: the app login page (`/login`) renders without the database, so also monitor that the **sign-in flow works** by a monthly manual test, and rely on `/api/health` for the database. |
| Disk and memory alert | **Missing** | The box is shared with Traefik, Pangolin, Directus and Chatwoot (*audit 16 Oct*: about 6 GiB free, disk 17 % used). Alert at 80 % disk. |
| Error reporting | **Missing** | Errors go to container stdout as one JSON line each (scrubbed of SQL and customer data). Nothing reads them. |

### Wire an external uptime check (free, ten minutes)

1. Create a free account at UptimeRobot or Better Stack (or self-owned healthchecks.io for the backup ping).
2. Add an **HTTPS keyword** monitor: URL `https://nextx.nextxagency.com/api/health`, interval 5 minutes,
   alert when the page does **not** contain `"status":"ready"`. The endpoint answers 503 with another
   status when the database is down, so a plain "HTTP 200" check would also work; the keyword catches a
   `degraded` state.
3. Add a second monitor on `https://nextx.nextxagency.com/` (the shop, expect 200) so a proxy or TLS
   fault is caught even when the app is healthy.
4. Send alerts to two channels: an email that is read, and a phone push or Telegram. Add a TLS-expiry
   alert (14 days) if the tool offers it.
5. Write down who gets the alert and what they do first (restart `nextx-web-1`, check disk, check
   `docker compose -p nextx ps`).

## 3. Logs

| Item | Status | Evidence and what to do |
|---|---|---|
| Application logging | **Done** | *repo*: structured JSON lines; request id on every response (`x-nextly-request-id`); `logServerError` and the action error handler drop SQL, bound parameters and constraint detail so customer data does not reach the logs. |
| Docker log rotation | **Missing** | *repo*: the Compose files set no `logging:` options, so each container uses Docker's default `json-file` driver **without a size limit**; a noisy container can fill the disk. Set `/etc/docker/daemon.json` to `{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}`, restart Docker in a quiet window and recreate containers (the setting applies to new containers only). Confirm afterwards with `docker inspect -f '{{.HostConfig.LogConfig}}' nextx-web-1`. |
| Retention period decided | **Missing** | With the setting above each container keeps about 50 MB, roughly days of history. If the owner wants 30 days for audits, ship logs to a free tier of a log service instead. |
| Audit trail in the app | **Done** | `activity_logs` records every mutation by member; `/activity` lists them. |

## 4. Secrets

| Secret | Where | Rotation state |
|---|---|---|
| Postgres password, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, dashboard password, cron secret | `/etc/nextx/stack.env` (root, mode 600), generated on the first deploy | **Missing**: never rotated, no schedule. |
| Initial sign-in passwords of users created by the deploy script | `/etc/nextx/initial-logins.txt` (plaintext, root-only) | **Missing**: delete the file once each person has changed their password. |
| `CRON_SECRET` | `NEXTLY_CRON_SECRET` in `stack.env` | Easy to rotate (edit, recreate `web`, update the scheduler). |

Rotation notes: changing `JWT_SECRET` invalidates every session and requires re-issuing `ANON_KEY` and
`SERVICE_ROLE_KEY`; because the anon key is baked into the web image at build time
(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), the web image must be rebuilt, not just restarted. Changing the
Postgres password needs Supabase's `utils/db-passwd.sh` procedure. Do it deliberately, once, after the
first real backup exists, and record the date here. Rotate immediately if anyone with VPS or Studio
access leaves.

Leaked-password protection (Have I Been Pwned check) is a GoTrue setting
(`GOTRUE_PASSWORD_HIBP_ENABLED`) that the Compose file does not pass; GoTrue's default minimum length is
6. The app's own set-password screen enforces 10 characters.

## 5. Email for invitations and password reset

**Missing.** `deploy-nextx.sh` sets `ENABLE_EMAIL_AUTOCONFIRM=true` and the stack has no SMTP settings, so
Supabase Auth cannot send mail. Until it can:

- "Invite member" in Settings fails with a clear message instead of creating a half-invited row (fixed in
  this release; before it, even with SMTP, an invitation could never be accepted because the link target
  only understood a different kind of link and there was no set-password page).
- "Forgot your password?" on the sign-in page shows a "could not send" message.
- The workaround is the deploy script: `sudo bash deploy/vps/deploy-nextx.sh --user 'email,role,Name'`
  creates a confirmed account with a generated password in `/etc/nextx/initial-logins.txt`.

To fix: choose a transactional provider (Resend, Brevo, Postmark, Amazon SES), verify the sending domain
(SPF, DKIM, DMARC on `nextxagency.com`), then set in `/etc/nextx/stack.env`: `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`, and recreate the `auth` service. Keep
`SITE_URL=https://nextx.nextxagency.com` and `ADDITIONAL_REDIRECT_URLS=https://nextx.nextxagency.com/**`
(the script already sets both; the invitation and reset links point at `/auth/set-password` and
`/auth/callback`). Then test end to end once: invite a test address, open the link on a phone, set a
password, sign in, remove the test member.

## 6. DNS and TLS

| Item | Status | Evidence |
|---|---|---|
| `nextx.nextxagency.com` and `nextx-api.nextxagency.com` resolve to the VPS and answer over HTTPS | **Done** | *audit 16 Oct*: app 200, API 401 without a key (expected). |
| Certificate issuer, expiry and renewal owner | **Partial** | Pangolin/Traefik terminate TLS. *Audit 16 Oct* lists "TLS and certificate details" as UNVERIFIED. Add the TLS-expiry alert above and note who owns renewal. |
| Public ports | **Partial** | *audit 16 Oct*: Postgres is loopback-only (good). Publicly bound: 22, 80, 443, 3000 (Coolify), 8000 (Supabase gateway), 8055 (Directus), 6001/6002 (Coolify realtime). Close or IP-restrict 3000, 6001, 6002 and 8055 unless a business need exists; 8000 should be reachable only through the TLS host. |
| Rate limiting at the proxy | **Missing** | The app limits public form posts and the cart-quote API in memory (one process). Add a per-IP limit in Pangolin/Traefik for `/login`, `/auth/*` and `/api/*` as the real perimeter. Supabase Auth's own sign-in throttle applies to password attempts. |
| `x-forwarded-for` | **Unverified** | The app limiter keys on the first forwarded address. Confirm Pangolin sets it; if it does not, only the site-wide ceiling applies. |

## 7. Deploy and rollback

Deploy: on the VPS, check out the exact commit in `~/nextx` and run
`sudo bash ~/nextx/deploy/vps/deploy-pinned.sh <40-character-sha>`. It refuses to run on a dirty tree or a
different commit, **tags the currently running image as `nextx-web:rollback-<UTC timestamp>`**, applies
migrations, rebuilds `web`, checks `/api/health`, and appends a line to `~/nextx-migration/deploys.log`.

### Rollback (status: Partial, never rehearsed)

Application code only; database migrations are additive and are **not** reversed (an older image runs
fine against a newer additive schema).

```bash
# 1. Find the rollback image and confirm what commit it is.
docker image ls nextx-web --format '{{.Tag}}  {{.ID}}  {{.CreatedSince}}' | grep rollback
docker image inspect nextx-web:rollback-<ts> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'

# 2. Make it the image Compose runs, then recreate only the web container (no build).
docker tag nextx-web:rollback-<ts> nextx-web:latest
cd ~/nextx
sudo docker compose -p nextx --project-directory deploy/supabase --env-file /etc/nextx/stack.env \
  -f deploy/supabase/docker-compose.yml -f deploy/vps/docker-compose.pangolin.yml \
  up -d --no-build --no-deps web

# 3. Verify.
curl -fsS http://172.18.0.1:13000/api/health          # expect "status":"ready"
tail -3 ~/nextx-migration/deploys.log                  # note the rollback in the log by hand
```

Caveats: the tag `latest` moves, so the next `deploy-pinned.sh` run tags the rolled-back image again
(fine). The rollback image keeps the `NEXT_PUBLIC_*` values it was built with. Check out the matching
commit in `~/nextx` afterwards so the next deploy starts from the code that is actually running. Rehearse
this once on a quiet day and write the measured time here.

## 8. Application security state (verified in the repo this release)

| Item | State |
|---|---|
| Role checks | Every server action is built on `writeAction` (owner or staff), `ownerAction`, `memberAction` or the single throttled `publicAction`; viewers are read-only. API routes use `requireApiMember`; the export route is member-only. |
| Open redirects | Fixed: `?next=` accepted a backslash or tab trick (`/\evil.example`) that browsers resolve to another origin. One shared validator now guards the sign-in form and `/auth/callback`. |
| Invitations | Fixed end to end in code (set-password page, correct link target, reset flow). Needs SMTP to work in production (section 5). |
| Privilege escalation through the public REST API | Fixed by migration `0048` (see report): a viewer could PATCH their own `members` row to `role=owner` with only their session token. |
| Cron endpoints | Constant-time secret compare, bearer header only, GET only, 503 when the secret is missing or short, no failure detail in the response. Covered by tests. |
| Row Level Security | Enabled on all 63 tables, no `anon` policy anywhere, views use `security_invoker`, helper functions live in the unexposed `private` schema, archive tables are revoked from API roles. Remaining design note: any **staff** member with a session token can write directly through PostgREST to tables whose policy allows `can_write()` (including `ledger_entries` inserts), bypassing the app's posting rules. Staff are trusted today; tightening this means removing write policies and exposing only the server path. |
| Error output | Action errors show a plain sentence; SQL, table names and constraint detail stay in server logs and are scrubbed there. |
| Public write endpoints | Quote and restock requests and `/api/v1/storefront/cart/quote` are rate limited in memory (per client address plus a site-wide ceiling). |
| Server Action origin check | Next.js compares `Origin` to `Host`; behind a proxy that rewrites `Host`, set `experimental.serverActions.allowedOrigins` in `next.config.ts` (owned by the shop work, not changed here). |

## 9. Decisions only the owner can make

1. **`NEXTX_ENVIRONMENT=staging` is still set on the live stack** by `deploy-nextx.sh`. The app uses it to
   disable indexing and select the staging canonical origin. If the shop should appear in Google at
   `nextx.nextxagency.com`, this must become `production` (the script needs a flag; it is in `deploy/**`).
2. **Whether to keep `www.shop-nextx.com` redirecting** and when to retire the legacy site (see the URL
   migration notes).
3. **Whether the 16 Oct staging import is the data of record.** The audit shows the historical import was
   rehearsed and reconciled; the 77 warnings need owner sign-off (`docs/audits/2026-10-16-owner-warning-worksheet.csv`).

## 10. Remaining blockers, in order

| # | Blocker | Why it matters | Effort |
|---|---|---|---|
| 1 | **Scheduled, offsite, encrypted backups of database and Storage** | One disk failure or one bad migration loses the books. Today there is no automated copy at all. | 0.5 day |
| 2 | **A restore drill on real data** | Unproven backups are not backups. Also sets the real recovery time. | 0.5 day |
| 3 | **External uptime alert on `/api/health`** | The site can be down all night with nobody told. | 15 minutes |
| 4 | **SMTP for Supabase Auth** | Staff cannot be invited or reset a password by themselves; every account change needs SSH. | 1 hour plus DNS |
| 5 | **Apply migration `0048` on the VPS** (and the code release) | Closes the viewer-to-owner escalation on the public REST API. | part of the next deploy |
| 6 | **Docker log rotation** | Unbounded logs can fill the shared disk and take down every service on the box. | 15 minutes plus a quiet window |
| 7 | **Schedule the two app jobs** (weekly reorder, daily recurring expenses) | Reorder advice and recurring expenses silently do not happen. Host cron calling the endpoints with the bearer secret. | 30 minutes |
| 8 | **Close extra public ports** (3000, 6001, 6002, 8055) and add proxy rate limits for `/login`, `/auth/*`, `/api/*` | Reduces attack surface on a shared box. | 1 hour |
| 9 | **Decide the environment flag** (`staging` vs `production`) | Controls search indexing and canonical URLs. | 10 minutes |
| 10 | **Rehearse the rollback once; start a secret-rotation calendar** | The procedure exists but has never run. | 1 hour |
