# NextX operations runbook

Written 2026-10-24 for the live stack on the single VPS: Docker Compose project `nextx`
(`nextx-web-1`, `nextx-db-1`, auth, storage, rest, supavisor, api-gw, studio, meta, imgproxy,
realtime, functions), published through Pangolin at `https://nextx.nextxagency.com` (app) and
`https://nextx-api.nextxagency.com` (Supabase gateway). Status of every item is tracked in
[go-live-checklist.md](go-live-checklist.md).

> **Status of this page.** Every script and command below was written and statically tested on a
> developer machine (syntax, unit-style tests with a fake Docker and a throwaway gpg key, YAML and
> Compose validation). **None of it has been installed or run on the VPS.** Where a step says
> "expected", that is the intended result, not an observed one. The first time you run each step,
> read the output and fix this page.

## Conventions

All commands are run on the VPS over SSH. The source tree is `~/nextx` (a clean Git checkout).
The Compose helper used throughout (paste once per SSH session):

```bash
nxc() { sudo docker compose -p nextx --project-directory ~/nextx/deploy/supabase \
  --env-file /etc/nextx/stack.env -f ~/nextx/deploy/supabase/docker-compose.yml \
  -f ~/nextx/deploy/vps/docker-compose.pangolin.yml "$@"; }
```

| What | Where |
|---|---|
| Stack secrets (never copied into backups) | `/etc/nextx/stack.env` (root, 600) |
| Alert tokens, monitor URLs | `/etc/nextx/ops.env` (root, 600), created by the installer |
| Backup settings | `/etc/nextx/backup.env` (root, 600), created by the installer |
| Backup public key (no secret) | `/etc/nextx/backup.age.pub` |
| Backups | `/var/backups/nextx/<UTC timestamp>/` (root, 700) |
| Logs | `/var/log/nextx/*.log`, `journalctl -u nextx-backup`, deploy log `~/nextx-migration/deploys.log` |
| Commands (after install) | `nextx-backup`, `nextx-restore`, `nextx-check-health`, `nextx-cron`, `nextx-notify` |
| Scripts in Git | `deploy/vps/` (`backup-nextx.sh`, `restore-nextx.sh`, `install-ops.sh`, `check-health.sh`, `cron-jobs.sh`, `notify-nextx.sh`, `lib-ops.sh`, `systemd/`, `logrotate-nextx`, `cron.d-nextx`) |
| Offline tests of those scripts | `bash deploy/vps/tests/run-tests.sh` (runs anywhere with bash, curl, python; touches nothing real) |

**Keep `/etc/nextx/stack.env` in a password manager as well.** The backup deliberately stores only the
variable *names* of that file (`stack.env.redacted` inside `config.tar.gz`). After a total loss you can
regenerate secrets, but anything signed with the old `JWT_SECRET` stops working and the Postgres
password must match the restored roles, so keeping the file is far easier.

---

## 1. Install, in order

Do this once, in a quiet hour. Steps 1 to 9 do not touch the running shop. Step 10 does.

1. **Update the source tree and read what will run.**
   ```bash
   cd ~/nextx && git fetch --all && git checkout <the-reviewed-commit> && git status --short   # must be clean
   ```
2. **Install the tools the scripts need.**
   ```bash
   sudo apt-get update && sudo apt-get install -y age rclone jq logrotate curl
   ```
   (`age` encrypts backups, `rclone` ships them offsite, `jq` makes the health check stricter. The
   scripts also need `docker`, `tar`, `gzip`, `flock`, `sha256sum`, which are already present.)
3. **Dry-run the installer, then run it.** It prints what it creates; it never overwrites a changed
   file without keeping `<file>.bak-<timestamp>`, and never overwrites `/etc/nextx/ops.env` or
   `backup.env` once they exist. It does not touch Docker or the Compose stack.
   ```bash
   sudo bash ~/nextx/deploy/vps/install-ops.sh --dry-run
   sudo bash ~/nextx/deploy/vps/install-ops.sh
   ```
   Expected: scripts under `/usr/local/lib/nextx/`, commands in `/usr/local/sbin/`, systemd units
   (or `/etc/cron.d/nextx` if the host has no systemd), `/etc/logrotate.d/nextx`. It enables the
   health timer immediately, the two app-job timers only if `NEXTLY_CRON_SECRET` exists in
   `stack.env`, and the backup timer **only after** the age public key exists (step 5).
4. **Choose an alert channel** and test it. Simplest: install the free *ntfy* phone app, pick a long
   random topic name, then
   ```bash
   sudoedit /etc/nextx/ops.env        # uncomment ALERT_KIND=ntfy and ALERT_WEBHOOK_URL=https://ntfy.sh/<topic>
   sudo nextx-notify --test           # your phone should buzz
   ```
   Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) and e-mail (`ALERT_EMAIL`, needs an MTA) are the
   other options in the same file.
5. **Create the backup key pair on your own computer, not on the VPS.**
   ```bash
   age-keygen -o nextx-backup.key      # prints:  Public key: age1....
   ```
   Put `nextx-backup.key` (the private key) in your password manager and on an offline copy. **If it is
   lost, the backups cannot be read.** Put only the `age1...` line on the VPS:
   ```bash
   echo 'age1....' | sudo tee /etc/nextx/backup.age.pub && sudo chmod 644 /etc/nextx/backup.age.pub
   ```
   The backup script refuses to run without this file (or a gpg recipient), and refuses a file that
   contains a private key.
6. **Choose the offsite target** (a different provider or at least a different account from the VPS:
   Backblaze B2, a Hetzner Storage Box, any S3 bucket) and configure it:
   ```bash
   sudo rclone config                  # name the remote e.g. "offsite"
   sudo rclone lsd offsite:            # must list without error
   sudoedit /etc/nextx/backup.env      # set REMOTE=offsite:nextx-backups
   ```
   Backups are encrypted *before* they leave the server, and the script never pushes an unencrypted
   one. Optional `OFFSITE_PRUNE=1` applies the same retention to the remote.
7. **Create a dead-man's-switch** (free healthchecks.io check, period 1 day, grace 3 hours) and put its
   ping URL in `backup.env` as `PING_URL=...`. The script pings `/start`, success, or `/fail`, so both
   a failed and a *missing* backup raise an alert. Optionally add checks for the two app jobs as
   `PING_URL_REORDER` and `PING_URL_RECURRING` in `ops.env` (weekly and daily periods).
8. **Dry-run everything.**
   ```bash
   sudo nextx-backup --dry-run
   sudo nextx-check-health --dry-run
   sudo nextx-cron --dry-run reorder && sudo nextx-cron --dry-run recurring-expenses
   ```
9. **Run the first real backup and read the result.**
   ```bash
   sudo nextx-backup ; echo "exit=$?"
   ls -la /var/backups/nextx/                     # a directory named like 20261024T033000Z
   sudo cat /var/backups/nextx/*/MANIFEST.txt | head -20
   sudo tail -3 /var/log/nextx/backup.log
   sudo systemctl enable --now nextx-backup.timer # or re-run install-ops.sh: it now sees the key
   ```
   Expected: exit 0, last line `NEXTX_BACKUP status=OK ... encrypted=age offsite=ok ...`, files
   `app.dump.age`, `platform.dump.age`, `storage.tar.gz.age`, `config.tar.gz.age`, `globals.sql.age`,
   `MANIFEST.txt`, `rowcounts.txt`, `SHA256SUMS`, `COMPLETE`, and the same directory on the remote
   (`rclone lsd offsite:nextx-backups`). A first run on a shop with real data should take minutes, not
   hours; note the duration.
10. **Apply the Compose changes (log rotation and the `web` memory cap) in a quiet window.** The
    Compose file now sets `json-file` rotation (10 MB x 5) on every service and `mem_limit: 1g` on
    `web`. Docker only applies this when containers are *recreated*, and `docker compose up -d`
    recreates every service whose configuration changed, **including the database**. Expect one to
    two minutes of downtime while Postgres restarts (data is in a named volume and is not lost).
    Take a backup first (step 9), then:
    ```bash
    cd ~/nextx && sudo bash deploy/vps/deploy-pinned.sh <40-char-sha-that-contains-this-change>
    docker inspect -f '{{.HostConfig.LogConfig}}' nextx-web-1 nextx-db-1   # json-file, max-size:10m max-file:5
    docker inspect -f '{{.HostConfig.Memory}}' nextx-web-1                 # 1073741824
    curl -fsS http://127.0.0.1:13000/api/health                            # "status":"ready"
    ```
    **Global alternative** (also covers the other tenants on this box: Chatwoot, Directus, Pangolin):
    put `{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}` into
    `/etc/docker/daemon.json` and `sudo systemctl restart docker`. That restarts **every** container on
    the host, so it needs the same quiet window and an announcement; the Compose setting above does not
    need it. Do not do both without a reason; they agree.
11. **Verify the timers.**
    ```bash
    systemctl list-timers 'nextx-*'
    sudo systemctl start nextx-cron-recurring-expenses.service && journalctl -u nextx-cron-recurring-expenses -n 20 --no-pager
    sudo nextx-check-health                        # all six lines "ok"
    ```
    Prove the alarm works once: `sudo docker stop nextx-web-1`, wait about 5 minutes (two failed runs
    at the default `FAIL_THRESHOLD=2`), expect a DOWN alert, then `nxc up -d --no-build --no-deps web`
    and expect a RECOVERED message.
12. **Restore drill** (section 4) once the first offsite backup exists, and write the measured time
    into the table there.

To remove the tooling: `sudo systemctl disable --now nextx-{backup,health,cron-reorder,cron-recurring-expenses}.timer`,
delete the `nextx-*` units from `/etc/systemd/system/`, `/usr/local/lib/nextx`, the `nextx-*` links in
`/usr/local/sbin`, `/etc/logrotate.d/nextx`, then `systemctl daemon-reload`. Config and backups stay.

### What runs when

| Job | Schedule (UTC) | Local time | Command |
|---|---|---|---|
| Backup | daily 03:30 (+0 to 5 min random) | 00:30 Paramaribo | `nextx-backup` |
| Recurring expenses | daily 03:10 | 00:10 Paramaribo | `nextx-cron recurring-expenses` -> `GET /api/cron/recurring-expenses` |
| Reorder recommendations | Monday 12:00 | Monday 09:00 Paramaribo | `nextx-cron reorder` -> `GET /api/cron/reorder` |
| Uptime check | every 2 minutes | | `nextx-check-health` |

Suriname has no daylight saving, so these stay fixed. `Persistent=true` makes a missed run (host was
off) run at the next boot; both endpoints are idempotent. The cron secret is read from
`NEXTLY_CRON_SECRET` in `stack.env` at run time and handed to curl on stdin, never written to a file,
log or process list. If you rotate it: edit `stack.env`, recreate `web` (`nxc up -d --no-build --no-deps web`);
the scripts pick up the new value by themselves. A mismatch shows as HTTP 401 and an alert.

### Backup contents, retention and exit codes

Each run writes one directory containing: `app.dump` (schemas `public`, `private`, `drizzle`),
`platform.dump` (`auth` sign-in accounts and the `storage` object index), `globals.sql` (roles, no
passwords), `storage.tar.gz` (product images and receipts, with the `user.*` extended attributes
Supabase Storage needs), `config.tar.gz` (the `deploy/` folder without `.env` files, a redacted
`stack.env`, running container and image list, source commit), `MANIFEST.txt`, `rowcounts.txt`,
`SHA256SUMS`, `COMPLETE`. Dumps are checked with `pg_restore --list` before they are accepted; the
archive with `gzip -t`; everything is checksummed.

Retention keeps the newest backup of each of the last 7 days, 4 ISO weeks and 6 months (the union,
so about 14 to 17 directories). The newest backup is never deleted, and a directory without the
`COMPLETE` marker is never pruned automatically.

| Exit | Meaning | First thing to do |
|---|---|---|
| 0 | OK | nothing |
| 2 | configuration (no key, bad value) | read the ERROR line; `sudo nextx-backup --dry-run` |
| 3 | another backup holds the lock | usually a slow previous run; check `ps` |
| 4 | preflight (Docker, database, free disk) | incident checklists below |
| 5 | dump / storage / config step failed | `/var/log/nextx/backup.log` |
| 6 | integrity check failed | do not trust that run; investigate before the next |
| 7 | encryption failed | key file / gpg keyring |
| 8 | local backup fine, **offsite failed** | `rclone lsd offsite:`; credentials, network, quota |

---

## 2. Deploy a pinned commit

On the VPS, in `~/nextx` (clean tree, the exact commit you reviewed):

```bash
cd ~/nextx && git fetch --all && git checkout <40-char-sha> && git status --short   # must print nothing
sudo nextx-backup                                                                   # fresh backup before any schema change
sudo bash deploy/vps/deploy-pinned.sh <40-char-sha>
tail -3 ~/nextx-migration/deploys.log
curl -fsS http://127.0.0.1:13000/api/health
```

`deploy-pinned.sh` refuses a dirty tree or a different commit, **tags the running image as
`nextx-web:rollback-<UTC timestamp>`**, runs `deploy-nextx.sh` (additive migrations, rebuild and
restart of `web`, health check), and appends one line (commit, exit code, before and after image ids)
to `deploys.log`. Pass extra `deploy-nextx.sh` options after the snapshot argument only when you know
you need them (for example `--user 'email,role,Name'`).

## 3. Roll back a bad deploy

Application code only. Migrations are additive and are **not** reversed; an older image runs against
a newer additive schema. If a migration damaged data, go to section 5 instead.

```bash
# 1. List rollback images (newest first) and confirm which commit one holds.
docker image ls nextx-web --format '{{.Tag}}  {{.ID}}  {{.CreatedSince}}' | grep rollback
docker image inspect nextx-web:rollback-<ts> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'

# 2. Make it the image Compose runs, then recreate only the web container (no build, no dependencies).
docker tag nextx-web:rollback-<ts> nextx-web:latest
cd ~/nextx
sudo docker compose -p nextx --project-directory deploy/supabase --env-file /etc/nextx/stack.env \
  -f deploy/supabase/docker-compose.yml -f deploy/vps/docker-compose.pangolin.yml \
  up -d --no-build --no-deps web

# 3. Verify and record.
curl -fsS http://127.0.0.1:13000/api/health          # "status":"ready"
echo "$(date -u +%FT%TZ) ROLLBACK to nextx-web:rollback-<ts> by $USER" | sudo tee -a ~/nextx-migration/deploys.log
git -C ~/nextx checkout <commit printed in step 1>    # so the next deploy starts from what is running
```

The rolled-back image keeps the `NEXT_PUBLIC_*` values it was built with. The tag `latest` moves, so
the next `deploy-pinned.sh` tags the rolled-back image again, which is fine. Rehearse once on a quiet
day and write the measured time in the table in section 4.

## 4. Restore drill (do this monthly, and after every Supabase upgrade)

A drill restores the latest backup into a **separate throwaway Postgres container** on
`127.0.0.1:55432` and a scratch directory. It never touches the live containers, volumes or ports. It
needs about 1 GB RAM and the disk space of the backup twice (decrypted copy plus restored data), so
run it in a quiet hour, or better on your own computer (Docker, `age`, and a copy of one backup folder
fetched with `rclone copy offsite:nextx-backups/<ts> ./<ts>`, which also proves the offsite copy
works).

```bash
sudo nextx-restore --list
# the age PRIVATE key is copied here only for the drill (scp from your password manager), then deleted:
sudo nextx-restore --backup latest --identity /root/nextx-backup.key
shred -u /root/nextx-backup.key
```

What it does and prints: verifies `SHA256SUMS`, decrypts and compares with the checksums recorded in
the manifest, starts the container from the same image as the live database, restores
`platform.dump` and `app.dump` with `pg_restore --no-owner`, extracts Storage into the scratch
directory, then prints

```
TABLE                          RESTORED  AT_BACKUP  VERDICT
public.products                      34         34  OK
public.product_variants              ...
public.sales / public.ledger_entries / public.members
```

`DRIFT` means the restored count is within max(5 rows, 1 %) of the count taken right after the dump
(the shop wrote in between). `DIFF` or `MISSING` fails the drill (exit 4): treat that backup as
suspect. It then prints the **recovery time per phase and in total** and the line
`RESTORE_DRILL total_seconds=... status=PASS|FAIL`. The script removes the container and the
decrypted files at the end; `--keep` leaves them for inspection (remove with `docker rm -f
nextx-restore-<id>; rm -rf /var/tmp/nextx-restore-*`).

Also check by hand once: open a few product images from the extracted `storage/` directory, and that
`select count(*) from auth.users` is not zero. Exercising the app against the restored database
(point a local checkout's `DATABASE_URL` at `127.0.0.1:55432` with `--keep`) is the strongest proof.

Record every drill here:

| Date | Backup used | Where run | Backup size | Restore seconds (total) | Row counts OK | Who | Notes |
|---|---|---|---|---|---|---|---|
| _not yet run_ | | | | | | | |

The script measures restore time only. A real disaster also needs: a new server with Docker, restoring
`stack.env` from the password manager, `deploy-nextx.sh`, DNS/Pangolin. Time that once as well, and write
the full recovery time target next to the table.

## 5. Disaster restore into the live stack

Only for real data loss. It replaces the live database contents. It needs **both** flags, the second
naming the exact backup, otherwise it exits before touching anything:

```bash
sudo nextx-restore --backup 20261024T033000Z --identity /root/nextx-backup.key \
     --overwrite-live --confirm-live-restore 20261024T033000Z
```

It stops `web`, `auth`, `storage`, `rest`; saves a safety dump of the current state to
`/var/backups/nextx/pre-restore-<ts>/` (delete it once the restore is accepted); restores in one
transaction (all or nothing); extracts Storage over the live volume; and starts the services again.
Afterwards: `curl -fsS http://127.0.0.1:13000/api/health`, sign in, open a product, a sale and the
ledger. A whole-server loss instead means: new VPS, install Docker, restore `/etc/nextx/stack.env`
from the password manager, check out the commit in `deploys.log`, `sudo bash deploy/vps/deploy-nextx.sh`
(creates empty volumes), then restore into that stack as above.

---

## 6. Incident checklists

Start every incident with the same three commands, and write down what you see:

```bash
sudo nextx-check-health                       # which of local / public / tls / containers / disk / memory fails
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'nextx|NAMES'
df -h / /var/lib/docker /var/backups/nextx ; free -m
```

### Site down

| Observation | Meaning | Do |
|---|---|---|
| `local` ok, `public` FAIL | The app is fine; the path to it is not (Pangolin/Traefik/Newt, DNS, TLS, the Pangolin route to `172.18.0.1:13000`) | `docker ps --format '{{.Names}} {{.Status}}'` and look at the pangolin, traefik, gerbil and newt containers; restart the proxy containers per the Pangolin documentation; confirm the DNS record; check certificate (`tls` line). Do not touch the nextx stack. |
| `local` FAIL, `containers` lists `nextx-web-1` | App crashed or is unhealthy | `docker logs --tail 100 nextx-web-1`; `docker inspect -f '{{.State.OOMKilled}}' nextx-web-1` (true: memory cap hit, see below); `nxc up -d --no-build --no-deps web` |
| `/api/health` answers 503, body says database | App is up, database path is not | Database down checklist |
| Health fine, but a page errors | Application error | `docker logs --tail 200 nextx-web-1` (JSON lines with a request id); look at the last line of `deploys.log`; if it began with a deploy, roll back (section 3) |
| Everything down after a reboot | Docker or the stack did not start | `systemctl status docker`; `docker ps -a`; `nxc up -d` (containers have `restart: unless-stopped`) |

OOM: `web` is capped at 1 GiB. `OOMKilled=true` means raise `mem_limit` in `deploy/supabase/docker-compose.yml`
(review `docker stats --no-stream nextx-web-1`; host RAM is 11 GiB with no swap and shared with other
tenants), deploy, and look for the leak or the traffic.

### Database down

1. `docker logs --tail 100 nextx-db-1` and `docker inspect -f '{{.State.Status}} {{.State.Health.Status}}' nextx-db-1`.
2. Disk full is the usual cause: see "Disk full". Memory: `dmesg -T | grep -i 'out of memory'`.
3. `nxc restart db` then wait for `healthy` (`nxc ps`). Dependents (`auth`, `rest`, `storage`, `supavisor`, `web`) recover by themselves; if not, `nxc up -d`.
4. **Never** run `docker compose down -v`, `docker volume rm`, `docker volume prune` or `docker system prune --volumes`: the data lives in the named volume `nextx-supabase-postgres-data`.
5. If the database will not start and the volume is damaged: keep the volume, copy it aside, and restore from the latest verified backup (section 5) into a fresh stack.

### Disk full (or above 85 %)

```bash
df -h ; docker system df
sudo du -xh /var/lib/docker/containers --max-depth 1 2>/dev/null | sort -h | tail -5   # runaway container logs
sudo du -sh /var/backups/nextx /var/log /var/lib/docker/overlay2 2>/dev/null
```

In order of safety: (1) `sudo nextx-backup --prune-only` (applies retention to local backups);
(2) `sudo journalctl --vacuum-size=200M`; (3) `docker image prune -f` (dangling images only; **never**
`-a`, it would delete the `rollback-*` images and anything unused-but-needed), then delete the oldest
rollback tags beyond the newest three (`docker rmi nextx-web:rollback-<old-ts>`); (4) a single huge container
log: `sudo truncate -s 0 "$(docker inspect -f '{{.LogPath}}' <container>)"` (rotation in the Compose file
should make this unnecessary); (5) old Coolify/Chatwoot/Directus data are other tenants: ask before touching.
Then find out why it grew. A backup that cannot run because of free space exits 4 and alerts.

### Bad deploy

1. Rollback: section 3. Then `curl` the health endpoint and open the shop and the dashboard.
2. Look at what the deploy changed: `tail -5 ~/nextx-migration/deploys.log`, `git -C ~/nextx log --oneline -5`.
3. If a migration (additive) corrupted or deleted data, stop writing (stop `web`), decide with the owner, and restore (section 5) from the backup taken just before the deploy. This is why every deploy starts with `sudo nextx-backup`.
4. Write down the cause in `docs/` before the next deploy.

### Backup alert (healthchecks "late" or "fail", or exit code in the journal)

`journalctl -u nextx-backup -n 80 --no-pager` and `/var/log/nextx/backup.log`; the exit-code table in
section 1 says where to look. Exit 8 (offsite) is the common one: check `rclone lsd offsite:`, credentials,
quota. Re-run by hand once fixed: `sudo nextx-backup`. Two days without a good offsite copy is an incident.

### Cron endpoint alert

`401` = `NEXTLY_CRON_SECRET` in `stack.env` differs from the running container: `nxc up -d --no-build --no-deps web`.
`503` = the app is not configured or the database is down. Both jobs are safe to re-run: `sudo nextx-cron reorder`.

## 7. Monthly checklist (first Monday, 30 minutes)

- [ ] Restore drill (section 4) from the **offsite** copy; record the row in the table.
- [ ] `ls /var/backups/nextx` shows daily backups for the last 7 days and the weekly and monthly ones; the healthchecks dashboard shows no late runs; offsite listing matches.
- [ ] `sudo nextx-notify --test` reaches a human; the alert recipients are still right.
- [ ] `systemctl list-timers 'nextx-*'` shows all four timers with a next run; `journalctl -p err -u 'nextx-*' --since '-30 days'` is empty or explained.
- [ ] Disk: `df -h` below 70 %; `docker system df`; old `rollback-*` images trimmed to the newest three.
- [ ] Memory: `docker stats --no-stream` and `free -m` leave headroom; adjust `mem_limit` if `nextx-web-1` sits near 1 GiB.
- [ ] Certificates: `tls` line of `nextx-check-health` shows more than 14 days; note who owns renewal.
- [ ] `/etc/nextx/initial-logins.txt` is deleted once everyone changed their password; members list in the app matches who should have access.
- [ ] OS and Docker patches applied in a quiet window (`sudo apt-get upgrade`, reboot if needed; then `nxc ps` and the health check).
- [ ] Supabase / image versions: read `deploy/supabase/versions.md` and upstream release notes for security fixes; never upgrade the Postgres major without a tested restore.
- [ ] Secrets calendar: age private key location confirmed; `stack.env` copy in the password manager is current; rotate anything on the schedule agreed in [go-live-checklist.md](go-live-checklist.md) section 4.
- [ ] The age private key can still decrypt (the drill proves it). The public key file `backup.age.pub` still matches `age_recipients_sha256` in the newest `MANIFEST.txt`.
- [ ] Update the go-live checklist statuses and this runbook with what was learned.

---

## 8. Going public: the environment flag

**Current behaviour.** `deploy/vps/deploy-nextx.sh` contains the line

```bash
env_set NEXTX_ENVIRONMENT staging
```

and runs it on **every** deploy, so the live stack is always `staging` even if you edit
`/etc/nextx/stack.env` by hand (the next deploy would overwrite it). The app treats exactly the value
`staging` as "not public": `/robots.txt` answers `Disallow: /`, `/sitemap.xml` is empty, and the
storefront layout and product pages add `noindex` (`src/lib/env.ts`, `src/app/robots.ts`,
`src/app/sitemap.ts`). Any other value means production behaviour. The Compose default is also
`${NEXTX_ENVIRONMENT:-staging}`, so a missing value falls back to the safe side. The default in the
script was deliberately **not** changed by this work.

**Do not flip it until all of these are true** (they are the open items of the SEO inventory and the
reconciliation report):

1. The owner has decided the production hostname and canonical host. `NEXTX_STAGING_APP_URL` (which
   becomes `NEXT_PUBLIC_APP_URL`, the canonical origin in metadata, sitemap and JSON-LD) is set by the
   script from `APP_HOST`, default `nextx.nextxagency.com`. If the shop will live on another host
   (for example `www.shop-nextx.com`), deploy with `sudo APP_HOST=www.shop-nextx.com bash deploy/vps/deploy-pinned.sh <sha>`
   after creating the Pangolin route and DNS; `SITE_URL` and the Auth redirect list follow `APP_HOST`.
   The image must be rebuilt for a new origin (the script rebuilds on every deploy). No canonical URL
   may point at a staging host (inventory, open decision 3).
2. The 77 import warnings are signed off and the 16 Oct staging import is accepted as the data of
   record (`docs/audits/2026-10-16-owner-warning-worksheet.csv`), the hero copy in the `settings` row no
   longer mentions watches, and the storefront for watches is inactive.
3. A fresh backup and a successful restore drill exist, and the uptime monitor and alerts are live,
   because the site will now receive search and referral traffic.

**The exact change (when decided).** On your computer, in the repository:

```bash
sed -i 's/^env_set NEXTX_ENVIRONMENT staging$/env_set NEXTX_ENVIRONMENT production/' deploy/vps/deploy-nextx.sh
git diff deploy/vps/deploy-nextx.sh        # exactly one line: staging -> production
git commit -am "Set NEXTX_ENVIRONMENT=production for the public launch" && git push
```

Then on the VPS, check out that commit and deploy it the normal way (section 2: backup, then
`sudo bash deploy/vps/deploy-pinned.sh <new-sha>`). `docker compose up -d` recreates `web` with the new
value. Verify:

```bash
grep '^NEXTX_ENVIRONMENT=' /etc/nextx/stack.env                        # production
curl -s https://<host>/robots.txt                                      # Allow rules and a Sitemap: line, no "Disallow: /"
curl -s https://<host>/sitemap.xml | head                              # audio product URLs, not empty
curl -s https://<host>/audio | grep -io '<meta name="robots"[^>]*>'    # must not say noindex on shop pages
curl -s https://<host>/audio | grep -io '<link rel="canonical"[^>]*>'  # the production host
```

To go back: change the line back to `staging` and redeploy. Search engines may keep what they already
fetched for weeks, so treat the flip as one-way in practice.

**SEO consequences** (from [`docs/audits/2026-10-16-seo-and-url-inventory.md`](../audits/2026-10-16-seo-and-url-inventory.md)):

- Crawlers are allowed in. `robots.txt` still disallows the dashboard, sign-in, `/api`, cart and
  private document paths, and advertises the sitemap; the sitemap lists only the audio shop pages.
  Indexing starts to build from that day; submit the sitemap in Search Console and watch Coverage.
- **Duplicate content with the legacy site.** `www.shop-nextx.com` still sells audio and watches and
  publishes its own sitemap (44 URLs, apex and `www` both used, every sitemap URL a redirect). Until the
  legacy domain is redirected to the new host, the same products exist on two hosts. The canonical tags
  on the new site protect it, but ranking transfers only when the legacy host answers with the redirects
  below.
- **Redirect map is ready but only effective after the DNS cutover.** The new app answers the 15 legacy
  audio product ids with a single-hop 308 to `/audio/<slug>`, `/catalog` with a 301 to `/audio`,
  and `/` with a 307 to `/audio`. The 19 retired watch ids return a real **410 Gone** with `noindex`
  from both `/catalog/<id>` and `/audio/<id>`; 5 other legacy product URLs 404. Watch URLs will drop out
  of the index and no audio page inherits their ranking (an owner decision recorded in the inventory:
  "410 rather than 404" for unknown ids is still open).
- **Known gaps that will be visible to crawlers:** a product slug that does not exist answers `200` with
  `noindex` instead of a hard 404 (the lookup runs inside a streamed `<Suspense>`; Next documents this as
  not indexable, but it is a soft 404), and unknown non-shop paths redirect to `/login` (307).
- **Structured data goes live:** product JSON-LD prices come from the storefront currency (SRD) and
  availability from stock. Check a few products after the flip; wrong prices in rich results are worse
  than no rich results.
- Page titles read `... · NextX Dashboard 2.0` from the branch template; decide the public title suffix
  before indexing, because titles are what searchers see first.
