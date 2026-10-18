# Release candidate and GO / NO-GO, 18 Oct 2026

## Decision

| | |
|---|---|
| **Deploy this build to staging** | **GO.** Code is complete, tested locally, and changes no schema. The deployment itself is the owner's step (below). |
| **Switch production traffic** | **NO-GO.** Not because of the code. Four gates are open and only the owner can close them. They are listed in §5. Do not skip them to meet a date. |

"Ready to operate today" is true for staging once it is deployed and the checklist in §4 passes. It is not true
of production, because the new code has never run on real migrated data and the migration sign-off is blank.

## 1. The release candidate

- Branch `nextx-dashboard-2.0`. The code last changed in `5448223`; the commits after it only add or change
  documentation. The **full tip SHA** is `git rev-parse origin/nextx-dashboard-2.0` and is in the hand-off message.
  Deploy that exact SHA with `deploy/vps/deploy-pinned.sh`, which refuses a different checkout or a dirty tree and
  tags the running image first as `nextx-web:rollback-<time>`.
- **No database migration, no dependency change, no deploy-script change** since `78bc0d1` (the last pushed
  commit before this session): `git diff 78bc0d1..HEAD --stat -- src/server/db deploy package.json pnpm-lock.yaml`
  is empty. Rolling back therefore needs no database step: redeploy the previous SHA (the line before this one
  in `~/nextx-migration/deploys.log`).
- The old `main` application is untouched.

### What the owner gets

1. Record a sale and New order choose products from a photo browser (search, category, stock, the exact option with
   its own photograph, price and stock per location), and sale lines show the photograph.
2. A product page where the photograph, price, stock, pickup stock, cart line and WhatsApp message all follow the
   chosen option; labelled colour swatches; links that open on an option (`?variant=SKU`).
3. Shop filters for brand, colour and other options that combine on one variant, with counts, chips and Clear all.
4. Product, inventory and sales lists with the filters and thumbnails the daily work needs.
5. Fixes to money that would have misled people: SRD amounts no longer wear the US dollar sign; SRD orders start
   from the converted price.

Behaviour on today's real catalogue is unchanged: every active product has one option, so there is no colour or
option filter to show (a filter is only offered when the catalogue really varies) and every page behaves as before.
The new behaviour appears when the first real option is added.

## 2. Evidence

All local, against the disposable rehearsal database (`docs/NEXTX_BROWSER_QA.md` for the detail and the defect
register; `docs/NEXTX_PROGRESS.md` for the table):

| Check | Result |
|---|---|
| Biome, TypeScript | clean |
| Unit tests | 337 of 337 |
| Playwright: storefront + accessibility | 36 of 36 |
| Playwright: dashboard workflows, buy-receive-sell | 8 of 8 (write data) |
| Playwright: variants and picker, 3 widths | 15 of 15 (synthetic variant fixture) |
| Production build | passes |
| Constraint rehearsal | 16 of 17 on the visual fixture (the failure needs the imported invoice row) |
| Staging, read-only observation | 15 of 15 product photographs served, public bucket, HTTP 200, AVIF 17 to 64 KB; old build confirmed |

**Synthetic data caveat.** The variant behaviour was proven on a fixture (`KZ Test IEM` Black/Silver/Purple, `KZ Test
Case` Red/Blue) with stand-in photographs. No real product has more than one option, so there is no real KZ
Black/Silver/Purple page to look at yet. Nothing here counts as launch evidence for variants on real data.

## 3. What was not verified

Real phones and WhatsApp hand-off; any screen reader; staff and viewer roles on this code; image upload; the
migration rehearsal, RLS runtime and concurrency re-run (the importer refuses to write without the owner's
readiness report); the post-import backup restore; financial and stock reconciliation re-run; email delivery;
finance, orders, customers and expense filters (not built); the new code on staging.

## 4. Staging: deploy and verify (owner, with the owner's sudo)

1. Rotate the VPS password (it was pasted into the chat) and sign in yourself.
2. `cd ~/nextx && git fetch origin nextx-dashboard-2.0 && git checkout --detach <full-sha> && git status --porcelain`
   (must print nothing).
3. `sudo bash ~/nextx/deploy/vps/deploy-pinned.sh <full-sha>` (no snapshot argument: do **not** re-import).
   Expect: a rollback image tag, migrations "already applied", the web image rebuilt, a line in `deploys.log`.
4. Run `scripts/ops/vps-readonly-audit.sh` before and after; the table counts must be identical (nothing in this
   release writes data) and the web image id must have changed.
5. In the signed-in browser, check on staging:
   - `/shop`: 15 products, the Filters sheet shows Brand, Price, Availability and **no** Colour or Option group
     (no real option exists); `?brand=kz&availability=in-stock` returns the KZ products that have stock (it
     returned none on the old build; if it still does, record it).
   - A product page, e.g. `/products/kz-zsn-pro-2-fb2ce6`: one option, price SRD 1,500, stock and pickup rows agree
     with Inventory; "Order via WhatsApp" message names the product and SKU.
   - Add to cart; the cart line shows the photograph.
   - Dashboard, Record a sale: open the picker, find "ZSN" and "KZ-AS16", see photographs, SRD prices at the
     current rate, stock per location. **Save as draft only; do not confirm a sale on staging data you want to keep.**
   - Sales: filter by payment "Overdue"; the $35 sale from January appears. Filter by a date range; a known sale appears under its own day.
   - Products: filter "No photo" (expect none), "Several variants" (expect none).
6. Run the media audit on the VPS against the real rows and attach the output:
   `DATABASE_URL=… pnpm exec tsx scripts/audit/media-integrity.ts --base https://nextx.nextxagency.com`.
7. With a staff and a viewer login, confirm a viewer cannot record a sale and cannot reach Settings.
8. Send the results back. Anything that differs from the local evidence is a defect to fix before production.

## 5. Gates for production (all owner-side)

1. **Staging passes §4**, including a staff and a viewer session.
2. **The reconciliation is signed** (`docs/audits/2026-10-16-reconciliation-report.md`, block blank). Staging's own
   Overview still reports "21 confirmed sales have no receipt in the ledger"; the report explains 20 of them as
   zero-total orders derived from reservations and 1 as a posted sale with no payment event. The owner has to
   accept or correct that.
3. **The post-import backup is restore-tested** (only the pre-import dump was).
4. **The readiness report passes** so the migration rehearsal, RLS and concurrency checks can be re-run on the final
   build, and the 80 owner worksheet findings have decisions.

Then follow `docs/NEXTX_PRODUCTION_CUTOVER.md` and `docs/NEXTX_URL_MIGRATION.md` (DNS, redirects, legacy
shutdown). Production traffic is switched only on the owner's explicit confirmation of the exact SHA.

## 6. Rollback

- Code: redeploy the previous pinned SHA with `deploy-pinned.sh`, or retag the image
  `nextx-web:rollback-<time>` that step 3 created. There is no migration to undo.
- Data: this release writes nothing new. The only new stored value is an `?variant=` address; the cart cache in
  browsers gains an optional `imageUrl` and older carts still load.
