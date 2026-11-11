# Dashboard UX and functional pass — 2026-11-11

Branch `claude/dreamy-meitner-xhwj1g`, based on the merged transformation branch. Everything was run
against a disposable local PostgreSQL 16 (port 55432, migrations 0000–0048 plus the repo's fixtures)
with the rehearsal auth shim. **No production data was read or written, nothing was deployed.**

## Method

Baseline first (typecheck, Biome, 764 unit tests, all green), then the repo's own browser suites against
a freshly reset database, then a scripted sweep of 38 routes at 1440 px and 390 px (status, console
errors, horizontal overflow, controls without a name, inputs without a label), then screenshots read by
eye. The suites double as the realistic data: they record sales, a supplier, a purchase order and receipt,
an expense, orders and products.

## Problems found (by severity)

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 1 | P1 | Product picker: typing a SKU and pressing Enter in one burst (barcode scanner, paste, slow phone) opened the **previous** list's first product, so the wrong product could be added to a purchase order or sale. | `purchasing-local` received stock for the wrong SKU; reproduced with CPU throttling; the new test fails on the old code |
| 2 | P1 | Product form: a specification row was keyed by the name being typed. It remounted after the first letter and lost focus, so "Resolution" could not be typed. | Browser: typed 10 letters, field held "R", focus on `<body>` |
| 3 | P2 | Sale page on a phone: four unshrinkable buttons pushed the page 65 px wider and squeezed the sale number, status and customer to zero width. | Sweep: `overflowX=65`; screenshot |
| 4 | P2 | Sale, order and purchase-order forms had no unsaved-changes protection (only the product form had). Closing the tab or tapping a link lost a half-entered document. | Code + browser |
| 5 | P3 | Products toolbar showed ~12 controls at once on desktop. | Screenshot |
| 6 | P3 | Search fields were labelled by placeholder only; spec and price-list filter inputs had no label. Walk-in sales showed "—". | Sweep |
| 7 | test | Four stale e2e selectors blocked serial suites (strict-mode alert match, `Option*` label, alt text of placeholder photos, decorative line thumbnails), so 12 specs never ran. | Release notes of 2026-11-10 |

Not defects: the 400/404 console noise is the gitignored fixture photographs being absent; placeholders
are generated locally in `public/dev-fixtures` (gitignored).

## Changes

- `sale-product-picker.tsx`: Enter filters against the live input value, not the deferred list.
- `surface.tsx`, `sales/[id]/page.tsx`: header actions wrap under the title on a phone.
- `product-form.tsx`: stable `rowId` per specification row; accessible names on both fields.
- New `forms/use-unsaved-guard.ts` (extracted from the product form), now also used by
  `sale-form.tsx`, `order-form.tsx`, `purchase-order-form.tsx`. Armed only while the form differs from
  how it opened; disarmed on a successful save.
- `list-toolbar.tsx` gains an optional `secondary` slot ("More filters" on desktop; open and permanent
  while one of those filters is in use; phone sheet unchanged). Used by Products: Catalog, Cost, Photos,
  Variants, Merchandising, Price now sit behind it.
- `ListSearch`/price-list inputs get `aria-label`; sales list says "Walk-in".

## Verification

| Check | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` (573 files) | clean |
| `pnpm test` | 764 passed, 5 skipped (unchanged) |
| Browser, from a reset DB: dashboard-local 12/12, purchasing-local 1/1, pos 10/10, mobile-shell-local 9/9, catalog-dashboard 18/18, filters-local 7/7 | pass |
| 5 new regression tests (picker race under CPU throttle, spec typing, More filters, unsaved guard) | pass; the picker test fails on the old code |
| Sweep, 18 key routes × 2 widths after the changes | 0 console errors, 0 overflow, 0 unlabeled inputs |

## Not done / not verified

- Run on `next dev`, not a production build (`next.config.ts` requires real HTTPS Supabase URLs for
  one). Real Supabase Auth, role switching (staff, viewer), email, image upload, Safari/Firefox and real
  devices were not exercised. Only the owner persona was driven end to end; "new employee" and
  "manager" were walked through screens and reports, not role-restricted sessions.
- Lighthouse/mobile LCP (still above 2.5 s per the previous release) was not worked on.
- Left alone on purpose: the visual system, sidebar grouping and Overview layout are already coherent;
  a redesign would have been churn. Candidates seen but not changed: "New purchase order" as the
  Overview's only header action; the Overview stock-position card lists never-moved products; search
  placeholders truncate on a 390 px phone (the accessible name is full).
- The sale-cost header backfill and other owner decisions in `OVERNIGHT_RELEASE_2026-11-10.md` remain open.

## Next steps

1. Run the full e2e set against a production build with real auth, including viewer/staff roles.
2. Apply `useUnsavedGuard` to the remaining sheets that collect several fields (finance, reference).
3. Prioritise the first row of POS tiles for mobile LCP.
