# Go-live checklist and operations state

Written 2026-10-24 for `https://nextx.nextxagency.com` (app) and `https://nextx-api.nextxagency.com`
(self-hosted Supabase gateway), one shared VPS, one Docker Compose project named `nextx`, published
through Pangolin. The older [Coolify notes](coolify.md) describe a topology that was **not** used for
the live stack; the deploy path is `deploy/vps/deploy-nextx.sh` and `deploy/vps/deploy-pinned.sh`.

> **Update 2026-10-24 (operations pass).** The tooling for backups, restore drills, uptime checks,
> scheduled app jobs, log rotation and the web memory cap is now written and statically tested in
> `deploy/vps/` and `deploy/supabase/docker-compose.yml`; the procedures are in
> [runbook.md](runbook.md). **Nothing has been installed or run on the VPS.** Every row that this pass
> touched therefore reads **Partial: written, untested on VPS** until the owner has installed it and
> the verification step in the runbook has passed on the server. Statuses below were changed only
> for that reason; no row was upgraded to Done.

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
| Database backup (scheduled) | **Partial: written, untested on VPS** | `deploy/vps/backup-nextx.sh` + daily systemd timer (`install-ops.sh`). Until installed and run, only two manual `pg_dump` files from 16 Oct exist. |
| Storage (photos, receipts) backup | **Partial: written, untested on VPS** | Same script archives volume `nextx-supabase-storage-data` with its extended attributes. |
| Offsite, encrypted copy | **Partial: written, untested on VPS** | `age` (or gpg) encryption and `rclone` push are in the script. **Still blocked on the owner:** no key pair and no offsite target chosen. Production gate `OFFSITE_BACKUP_TARGET_REQUIRED` stays open. |
| Restore drill | **Partial: written, untested on VPS** | `deploy/vps/restore-nextx.sh` restores into a throwaway container and prints row counts and timings. Earlier evidence unchanged: pre-import dump restored (63 tables); post-import dump and Storage never restored; no measured recovery time yet. |
| Uptime monitoring and alerts | **Partial: written, untested on VPS** | `check-health.sh` every 2 minutes (local + public health, TLS expiry, containers, disk, memory) with ntfy/Telegram/webhook/mail alerts. Needs an alert channel configured by the owner. An *external* monitor (UptimeRobot etc.) is still advised because this one runs on the box it watches. |
| Log retention | **Partial: written, untested on VPS** | Compose now sets `json-file` 10 MB x 5 on all 12 services and a logrotate rule covers `/var/log/nextx` and the deploy log. Takes effect only when containers are recreated at the next deploy. |
| Web memory cap | **Partial: written, untested on VPS** | `mem_limit: 1g` on `web` (host has no swap). Takes effect at the next deploy. |
| Secret rotation | **Missing** | Secrets generated once on first deploy; no rotation procedure ever run. |
| Email (invites, password reset) | **Missing** | No SMTP; `ENABLE_EMAIL_AUTOCONFIRM=true`. Invitations and resets cannot be delivered. |
| DNS / TLS | **Partial** | Both hosts answered over HTTPS on 16 Oct; certificate details and auto-renewal ownership not verified. A 14-day TLS expiry alert is now part of `check-health.sh` (untested on VPS). |
| Rollback | **Partial** | `deploy-pinned.sh` tags every outgoing image. Exact command in [runbook.md](runbook.md) section 3, never rehearsed. |
| Scheduled app jobs (reorder, recurring expenses) | **Partial: written, untested on VPS** | `cron-jobs.sh` + systemd timers (Monday 12:00 UTC and daily 03:10 UTC) call the secured endpoints with the Bearer secret read from `stack.env` at run time. |
| Environment flag | **Partial** | Deploy script still sets `NEXTX_ENVIRONMENT=staging` on purpose. Owner steps and SEO consequences to switch: [runbook.md](runbook.md) section 8. |

## 1. Backups

| Item | Status | Evidence and what to do |
|---|---|---|
| Scheduled backup of the NextX database | **Partial: written, untested on VPS** | `deploy/vps/backup-nextx.sh` (installed by `install-ops.sh`, daily 03:30 UTC). *audit 16 Oct*: before this there was no scheduled backup; the only cron backup on the box belongs to the unrelated Chatwoot stack; two manual dumps exist in `/var/backups/nextx` (352 KB and 358 KB, pre-import, root-only). The script dumps schemas `public`, `private`, `drizzle` and (separately) `auth`, `storage` with `pg_dump -Fc --no-owner` inside `nextx-db-1`, checks them with `pg_restore --list`, and records row counts. |
| `deploy/backup-staging.sh` | **Not usable as is, superseded** | *repo*: it only runs against a Coolify service (needs a `coolify.serviceId` label and a `/data/coolify/services/<uuid>` directory). Left untouched; `backup-nextx.sh` is the Compose-aware replacement. |
| Storage objects (product photos, `nextly-expense-receipts`) | **Partial: written, untested on VPS** | Volume `nextx-supabase-storage-data` is archived by the same script (tar with `user.*` xattrs, gzip, integrity-checked). Photos are re-creatable from originals only if the originals exist elsewhere; receipts are not. |
| Database volume protection | **Partial** | Named volume `nextx-supabase-postgres-data`, `restart: unless-stopped`. A volume is not a backup. |
| Offsite copy, encrypted | **Partial: written, untested on VPS** | Encrypt with `age` (public key on the server, private key off it; gpg fallback), push with `rclone copy` + `rclone check`, never unencrypted, offsite failure is exit code 8 plus an alert. **Owner to do:** generate the key, choose the target (different provider or account, for example Backblaze B2 or a Hetzner Storage Box), run `rclone config`. |
| Retention | **Partial: written, untested on VPS** | Local: newest backup per day for 7 days, per ISO week for 4, per month for 6 (tested with fake directories). Optional `OFFSITE_PRUNE=1` for the remote. |
| Backup failure alert | **Partial: written, untested on VPS** | `PING_URL` (healthchecks.io style `/start`, success, `/fail`), a systemd `OnFailure` alert, and the last line of every run is a machine-readable `NEXTX_BACKUP status=...` line. Needs the owner to create the check. |

### Restore drill

| Step | Status | Evidence |
|---|---|---|
| Pre-import dump restored to a scratch database | **Done** | Reconciliation report: restore matched 63 tables plus the migration ledger. |
| Restore tooling that decrypts, restores into a throwaway Postgres and prints row counts of products, product_variants, sales, ledger_entries, members | **Partial: written, untested on VPS** | `deploy/vps/restore-nextx.sh` (runbook section 4). Its decrypt and checksum logic and row-count verdicts are tested offline; the `pg_restore` path has **not** been run against a real Postgres (no Docker engine was available to the author). |
| Restore of a dump taken **after** real data exists | **Missing** | Report: "Restore of the post-import dump has not been tested." Run the drill on the first scheduled backup. |
| Restore of Storage to a scratch directory, photos and a signed receipt link verified | **Missing** | Extraction is scripted; nobody has looked at the result. |
| Whole-stack restore on a second host (the disaster case) | **Missing** | Needs the offsite copy first. Procedure sketched in runbook section 5. |
| Written restore time (RTO) | **Missing** | The drill prints it; record it in the table in runbook section 4. |

Do the drill once after the first scheduled offsite backup exists, then monthly and after every Supabase
upgrade. An untested backup is a belief, not a backup.

## 2. Monitoring and uptime

| Item | Status | Evidence and what to do |
|---|---|---|
| Container health | **Done** | *repo*: Dockerfile `HEALTHCHECK` calls `/api/health` every 30 s and requires `status: "ready"`. Docker only restarts on exit, not on `unhealthy`, and tells nobody. |
| `GET /api/health` | **Done** | *repo*: one `select 1`, `Cache-Control: no-store`, 503 when the database or environment is wrong. Now also returns `databaseMs` (round trip of that one query) and `uptimeSeconds` (a value that keeps resetting means a crash loop). No secrets. |
| Internal uptime check and alerts | **Partial: written, untested on VPS** | `deploy/vps/check-health.sh`, every 2 minutes: local `http://127.0.0.1:13000/api/health` and the public URL must return 200 with `"status":"ready"`; alerts after 2 failed runs, repeats hourly, sends a recovery notice; channels ntfy, Telegram, generic webhook, mail. Runs on the box it watches, so it cannot report a dead server or network. |
| External uptime check | **Missing** | Still advised as the second line: see below. |
| Supabase gateway / Auth monitoring | **Missing** | `https://nextx-api.nextxagency.com/auth/v1/health` answers 401 without the API key, so a free keyword monitor cannot use it. Cover Auth indirectly: the app login page (`/login`) renders without the database, so also monitor that the **sign-in flow works** by a monthly manual test, and rely on `/api/health` for the database. `check-health.sh` also flags unhealthy, restarting or exited `nextx` containers. |
| Disk and memory alert | **Partial: written, untested on VPS** | The box is shared with Traefik, Pangolin, Directus and Chatwoot (*audit 16 Oct*: about 6 GiB free, disk 17 % used). `check-health.sh` alerts at 85 % disk (`/`, `/var/lib/docker`, the backup volume) and below 400 MB available memory (no swap). |
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
| Docker log rotation | **Partial: written, untested on VPS** | Before: no `logging:` options, so each container used Docker's default `json-file` driver **without a size limit**. Now: `x-logging` anchor (`json-file`, `max-size: 10m`, `max-file: 5`) on all 12 services in `deploy/supabase/docker-compose.yml`, validated with `docker compose config`. **It only applies to containers created after the change**: the next `deploy-pinned.sh` recreates them, including the database (one to two minutes of downtime, plan a quiet window and take a backup first). Global alternative for every container on the host: `/etc/docker/daemon.json` `{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}` plus a Docker restart, which restarts all tenants. Confirm with `docker inspect -f '{{.HostConfig.LogConfig}}' nextx-web-1`. |
| Script and deploy logs | **Partial: written, untested on VPS** | `/etc/logrotate.d/nextx` (installed by `install-ops.sh`) rotates `/var/log/nextx/*.log` weekly x 8 and `~/nextx-migration/deploys.log` monthly x 12. |
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

### Rollback (status: Partial, never rehearsed; the same commands live in [runbook.md](runbook.md) section 3)

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

1. **`NEXTX_ENVIRONMENT=staging` is still set on the live stack** by `deploy-nextx.sh` (line
   `env_set NEXTX_ENVIRONMENT staging`, re-applied on every deploy, deliberately left unchanged). The app
   uses it to disable indexing (`robots.txt` disallows everything, empty sitemap, `noindex`). If the shop
   should appear in Google, that one line becomes `production`. Pre-conditions, the exact command,
   verification and the SEO consequences are in [runbook.md](runbook.md) section 8. Decision owner: the
   shop owner, after the canonical host and the import sign-off are settled.
2. **Whether to keep `www.shop-nextx.com` redirecting** and when to retire the legacy site (see the URL
   migration notes).
3. **Whether the 16 Oct staging import is the data of record.** The audit shows the historical import was
   rehearsed and reconciled; the 77 warnings need owner sign-off (`docs/audits/2026-10-16-owner-warning-worksheet.csv`).

## 10. Remaining blockers, in order

"Status" is as of 2026-10-24. **Partial: written, untested on VPS** means the files exist in the repository and
passed offline tests; the blocker is closed only when the owner has installed them and the runbook's
verification step passed on the server.

| # | Blocker | Status | Why it matters | What is left |
|---|---|---|---|---|
| 1 | **Scheduled, offsite, encrypted backups of database and Storage** | Partial: written, untested on VPS | One disk failure or one bad migration loses the books. | Install (`install-ops.sh`), generate the age key pair off the server, choose the offsite target and `rclone config`, create the healthchecks.io check, run the first backup ([runbook](runbook.md) section 1, steps 2 to 9). |
| 2 | **A restore drill on real data** | Partial: written, untested on VPS | Unproven backups are not backups. Also sets the real recovery time. | Run `nextx-restore --backup latest` once a real backup exists; fix the script if the real `pg_restore` disagrees; record the time ([runbook](runbook.md) section 4). |
| 3 | **Uptime alert** | Partial: written, untested on VPS | The site can be down all night with nobody told. | Configure an alert channel in `/etc/nextx/ops.env`, run the stop-the-web-container test, and add an external monitor on `/api/health` as the second line. |
| 4 | **SMTP for Supabase Auth** | Missing | Staff cannot be invited or reset a password by themselves; every account change needs SSH. | Unchanged (section 5). |
| 5 | **Apply migration `0048` on the VPS** (and the code release) | Missing | Closes the viewer-to-owner escalation on the public REST API. | Part of the next `deploy-pinned.sh`. |
| 6 | **Docker log rotation** | Partial: written, untested on VPS | Unbounded logs can fill the shared disk and take down every service on the box. | Deploy a commit containing the Compose change in a quiet window (recreates all containers, database included) and confirm with `docker inspect`. |
| 7 | **Schedule the two app jobs** (weekly reorder, daily recurring expenses) | Partial: written, untested on VPS | Reorder advice and recurring expenses silently do not happen. | Installer enables the timers when `NEXTLY_CRON_SECRET` exists; run each service once by hand and read the journal. |
| 8 | **Close extra public ports** (3000, 6001, 6002, 8055) and add proxy rate limits for `/login`, `/auth/*`, `/api/*` | Missing | Reduces attack surface on a shared box. | Unchanged (outside `deploy/**`; Pangolin/firewall). |
| 9 | **Decide the environment flag** (`staging` vs `production`) | Partial | Controls search indexing and canonical URLs. | Owner decision; steps and SEO effects in [runbook](runbook.md) section 8. Script default intentionally still `staging`. |
| 10 | **Rehearse the rollback once; start a secret-rotation calendar** | Partial | The procedure exists but has never run. | Rehearse [runbook](runbook.md) section 3 on a quiet day and write the time down. |
| 11 | **Web memory cap** (new) | Partial: written, untested on VPS | No swap on the host: one runaway process could take every tenant down. | Applied by the same deploy as #6; watch `docker stats` and `OOMKilled` for a week. |
