# Brand polish and release record, 18 Oct 2026 (eighth session)

Branch `nextx-dashboard-2.0`, from `32e04a04def36bc3a78371b394d1689dc69f2dea`. Screenshots:
`docs/design-review/brand-orange/` (shop, 390 / 768 / 1440), `brand-orange-dash/` and `brand-orange-dash-dark/`
(dashboard light and dark), `brand-dash2/` (products, record a sale, inventory, wallets). "Before" is
`docs/design-review/redesign-a/`.

## 1. The correction: NextX orange is the interactive accent

The shop used `--nx-night` (black) for every primary control. Interactive colour now comes from the semantic
accent tokens; charcoal stays for type, the contact card and overlays.

| Token (scope) | Before | After | Contrast |
|---|---|---|---|
| `--nx-accent` (`.nx-store`) | `#a8440a` | `#c2410c` | white on it 5.18; on `#fff1e6` tint 4.68 |
| `--nx-accent-hover` (`.nx-store`) | `#8a3606` | `#9a3412` | white on it 7.31 |
| `--nx-ring` (`.nx-store`) | `#141414` | `#c2410c` | focus ring on white 5.18 |
| dashboard `--nx-accent` light / dark | `#b13f06` / `#ff7a2e` | unchanged | white 5.86; dark ink on `#ff7a2e` 7.37 |

The logo orange `#e8590c` (white text 3.58:1) is **not** used for white-text buttons; it stays for the hero, the
logo and signals. New utility `text-accent-ink` (it was used in four places but never defined, so its text had
no colour).

Shop: `.nx-btn-primary` (every main button, WhatsApp, cart, checkout), Quick Add, selected category chip, active
filter chips, filter count, the in-stock switch, selected option and colour swatch (orange border and tint), active
gallery thumbnail, pickup-date toggle, cart badge, mobile tab bar active item, header link hover, search and
field focus, "View product / Choose options" outline, step numbers on the home page, outline buttons on hover.
The announcement bar is now a soft warm strip (was a black bar) with orange separators.

Dashboard: primary `Button`, the Record-a-sale tile, active navigation (orange tint, orange text). Success,
warning and error colours are unchanged; chart colours are unchanged. Photographs are never tinted.

## 2. Verification (local, disposable rehearsal database)

| Check | Result |
|---|---|
| Biome, `tsc` | clean |
| Unit | 375 / 375 |
| Production build | passes (placeholder self-hosted env) |
| Playwright plain fixture: `store-local`, `store-a11y` (incl. WCAG AA contrast on `/`, `/shop`, a product, `/cart`, `/faq`, the filters sheet on a phone), `dashboard-local`, `purchasing-local` | 46 / 46 |
| Playwright variant + price fixtures: `catalog-local`, `variants-local`, `filters-local` | 46 / 46 |
| Dashboard pages at 390 / 768 / 1440, light and dark (shoot script) | 0 console errors, 0 px horizontal overflow |

A test fix: the cart test clicked "Increase quantity" before the page had hydrated on a cold dev server and lost
the click (cart stayed at 1; failed on the unchanged `32e04a0` too). It now waits for the page to settle; 3 of 3.

## 3. Findings

- **`?brand=kz` returns nothing on staging: a data gap, not a query defect.** The staging API
  (`/api/v1/storefront/products`) returns `"brand": null` for all 15 products, and `scripts/migrate-nextx`
  never maps a brand. The brand filter has nothing to match, so the Brand group is also absent there. On the
  rehearsal data (brands set) `?brand=kz&availability=in-stock` returns the 11 in-stock KZ products with both
  chips. Owner decision: set a brand per product in the dashboard, or approve a one-off backfill (KZ, ESSAGER,
  M-Vave by name prefix). Nothing was written to staging or production.
- Everything else in the release notes' "not verified" list is still not verified (real phones, WhatsApp
  hand-off, screen readers, staff and viewer roles on this build, image upload, email).

## 4. Deployment and production state: see the hand-off message

The deployment to staging needs the owner's sudo on the VPS and a rotated VPS password; the production gates in
`NEXTX_RELEASE_2026-10-18.md` section 5 are owner-side. None was closed by this session. Production
(`www.shop-nextx.com`) was only read (HTTP 200) and is untouched.

## 5. Frontend UAT: AI boilerplate and branding pass (21 Oct 2026)

Method: read the rendered text and metadata of every public route and the error pages, searched the source for
stock marketing words, emoji, gradients and leftover names, then looked at the shop at 1440 and 390 px.
Screenshots: `docs/design-review/uat1/`, `uat2/`.

| Finding | Fix |
|---|---|
| **Ghosting on the home category tiles.** The large tile stacked a second photograph over the first, both `mix-blend-multiply`, so the cable showed through the case. | One photograph per tile. |
| Main buttons read rust-brown, not NextX orange (white text forced a dark orange). | Shop buttons, chips, switches and badges use the logo orange `#e8590c` with charcoal text (5.15:1, AA); hover `#f2691a`. Dark-orange stays for orange *text* and links. New tokens `--nx-cta`, `--nx-cta-hover`, `--nx-cta-fg`. |
| A mistyped shop URL showed the staff dashboard's 404: "Dashboard 2.0" tag, "Back to NextX Audio". | Customer-facing 404 (logo only, "Back to the shop", `noindex`). |
| A shop error told customers that "NextX Dashboard could not load this page". | `(store)/error.tsx`: "Something went wrong on our side", Try again, Back to the shop. |
| Page titles "FAQ \| NextX Suriname · NextX" (brand twice). | `Frequently asked questions · NextX`, same for blog and customer experiences. |
| Leftovers: "Nextly needs at least one owner." and a homepage-settings fallback "Hear the difference. Shop NextX Audio." that the shop never shows. | "NextX needs…"; the fallback now matches the shop's own headline. |
| Test races: sale picker pressed Enter before results narrowed; cart test clicked before hydration. | Both wait for the state they need (passed repeatedly). |

Checked and clean: no stock marketing words ("seamless", "unlock", "elevate" and the like), no emoji, no gradients
or glows in the shop, one product photograph per card, copy comes from the catalogue and settings.

Not changed, for the owner: the empty FAQ, blog and customer-experience pages are reachable by URL, `noindex` and
linked from nowhere; they carry honest "nothing published yet" text. `businessName` still defaults to `Nextly` in
the database schema (the live value is set in Settings); changing the default needs a migration.
