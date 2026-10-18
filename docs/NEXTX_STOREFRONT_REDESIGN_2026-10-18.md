# Storefront redesign, 18 Oct 2026 (seventh session)

Branch `nextx-dashboard-2.0`. Read with `docs/03-design/design-system.md` (updated), `docs/NEXTX_BROWSER_QA.md`
(defect register) and `docs/NEXTX_PROGRESS.md`. Screenshots: `docs/design-review/redesign-a/`.

Why: the owner judged the 2.0 shop "too plain" next to the live shop. This document records what was looked
at, what was wrong, what changed, and what is **not** proven.

## 1. What the two shops were actually doing (browsed, not read from source)

**Old live shop** (`shop-nextx.com`, Dutch, read-only visit): a split entry page (Audio / Watches); `/audio`
with a large logo hero, a "Net binnen" carousel, one horizontal row per category with a numbered header
(`01`, `02`), an orange "+ Toevoegen" button on **every** card, "NOG 1" low-stock tags, "UITVERKOCHT" overlays
with a "Meld mij" (notify me) button, an SRD/USD toggle, a "pickup only, no delivery" bar, footer with
address, phone, Instagram and Facebook. It is strongly orange and black, and it is merchandised: you can see
what the shop sells in one scroll, and add to the cart without opening a page.

**NextX 2.0 as the owner saw it:** the home page was the catalogue at another URL: category chips, a line of
facts, a strip of low stock, a product grid, four numbered steps. No opening composition, no categories as
places, no brand colour beyond a logo, one action per card ("View product"), a footer with four lines.

**Why it felt unfinished** (the defects, not the taste): (1) nothing said what the shop sells before the first
product; (2) no purchasing action on a card, so a one-item purchase took four screens; (3) the brand colour
was absent; (4) the business facts the owner *had* configured (pickup places, hours, payment, delivery) were
not shown anywhere a customer would look; (5) three real defects below.

**What the new shop already did better** and was kept: English throughout, SRD with its code, one image policy
per option, an option-aware product page and cart, filters on one variant, stock per pickup place, neutral
URLs, 404/410/308 behaviour, accessibility checks, no invented claims.

## 2. Direction

Not another palette. Three decisions, each fixing a named defect:

1. **Product-first opening on the brand colour.** The hero is three of the shop's own photographs, each in a
   white frame (so a product's colour is never tinted) on the logo orange, with the name and price on the
   frame. The headline says what the shop sells. No glow, no 3D, no stock imagery. Fewer than two good photographs
   (in stock, at least 800 px) means no composition at all.
2. **The shop is places, not a grid.** Header navigation (all products, each category, how ordering works),
   category tiles with a real photograph and the real lowest price (one large, two small, alternating tint),
   two shelves that never repeat each other (latest additions, accessories), and a dark "pickup and contact"
   card.
3. **A card that sells.** Quick Add for a product with one purchasable option; "Choose options" for a product
   with a choice; "See availability" when sold out.

Everything on the home page, header, announcement bar and footer comes from the catalogue or the owner's
settings; a line that has not been entered is not shown. `src/lib/home-merchandising.ts` is the whole of the
selection logic and is unit-tested: no invented best-sellers, ratings or discounts.

## 3. What changed

| Area | Change | Evidence |
|---|---|---|
| Home | New hero, category tiles, "Latest additions", accessory shelf, last pieces, ordering and visit card, bundles unchanged | screenshots; `store-local`; `home-merchandising.test.ts` (9) |
| Header, bar, footer | Slim announcement bar (owner's announcement, else pickup / delivery / currency), second header row with categories, four-column footer (shop, collection and payment, contact) | `store-local` |
| Cards | Brand or category eyebrow, "3 options", Quick Add, Choose options, "New" and "Sold out" badges, broken-image fallback | `catalog-local` (mouse, keyboard, touch, no nesting) |
| Catalogue | Desktop sidebar of filters, sheet on phones, results count, "Show more" (24 at a time), "Did you mean", empty state with ways out | `catalog-local`, screenshots |
| Price | **Variant-aware** min/max range plus four one-tap ranges; old `?price=` links still work | `price-range.test.ts` (12), `catalog-local` on `scripts/rehearsal/price-fixture.sql` |
| Search | Every word must match anywhere (name, model, brand, category, features, option name and SKU), spacing and punctuation ignored ("zs 10" finds "ZS10"), best match first, typo suggestions from the shop's own words | `search-query.test.ts` (8), `catalog-local` |
| History | Each filter is a history entry: Back undoes it, Forward redoes it, the price fields follow | `catalog-local` |
| Product page | Model and SKU that follow the chosen option; arrow keys and swipe in the gallery; position counter | `catalog-local` |
| Cart | "What happens next" under the send button; stale prices and unavailable lines proven | `catalog-local` |
| SEO | Home title and a branded social image | curl |
| Speed | Opening the filters sheet no longer blocks the tap | lab figures below |

### Defects found and fixed (also in the QA register)

- **R-1, P1, price filter is not variant-aware.** `price.min_price` (the product's cheapest option) was compared
  to the range while colour, options and stock matched one variant. Black at SRD 3,000 and Silver at SRD 1,500
  matched "Black, SRD 1,000 to 2,000". Now one condition on one variant. Proven on a synthetic fixture
  (Graphite 3,000 and Pearl 1,500), **not** on real data (no real product has two options).
- **R-2, P2, hero collapsed between 768 and 1023 px.** The product frames had no height below `lg`; fixed.
- **R-3, P2, dead-end filters.** "Connection" with one choice and "New arrivals only" with no new arrival were
  offered; both are hidden unless they can change the result.
- **R-4, P2, opening the filters sheet took 190 to 340 ms** (lab, 4x CPU). 56 ms after the fix.
- **R-5, P2, no fallback for a photograph that will not load.** It showed a broken icon; now a placeholder.

## 4. Numbers (all local; lab only)

- Unit tests 375/375 (29 new). Biome and `tsc` clean. Production build passes.
- Playwright, storefront and dashboard on the plain fixture: 46/46. On the variant and price fixtures: 82/82
  (store, accessibility, variants, filters, catalogue). 22 of those are new (`catalog-local.spec.ts`).
- Lab vitals, production build, Pixel-class profile, 4x CPU, Fast 4G, median of 3: home LCP 852 ms,
  `/shop` 728 ms, product 992 ms, cart 1,324 ms; CLS 0 on all; about 239 KB of JavaScript. Slowest measured
  tap (filters sheet) 56 ms, Quick Add about 70 ms, stock toggle about 115 ms.

## 5. Not proven. Do not claim

- The new build on staging or production (it needs the owner's sudo, see the release document).
- Real phones, real WhatsApp, any screen reader. Emulated 390, 768 and 1440 px only.
- Multi-option behaviour on **real** products: there are none. Everything about colours and ranges across
  options was proven on synthetic fixtures.
- "Show more": it appears only above 24 matching products, and the catalogue has 15 to 18. The logic is a plain
  slice of the page number; it has no browser test.
- Real photograph quality: see the media audit. The hero uses only photographs at least 800 px wide; if the
  owner's three best products are weaker, the hero shows other products or none.

## 6. Owner decisions and content that would improve the shop

1. **Settings the shop would show if filled in** (Settings, storefront): phone number, opening hours, payment
   methods, address, hero headline and text, announcement. On the local fixture all of these are empty, so the
   visit card shows only pickup places. Staging's values were not inspected (needs a signed-in session).
2. **Facebook.** The old shop linked Facebook; settings only have Instagram. Adding a field is a small change
   with a migration; not done without approval.
3. **A USD toggle** (old shop had SRD/USD). Not rebuilt: the owner asked for SRD as the main currency, and
   the USD amount already appears in small type when a rate is set.
4. **Photography that would help most:** a second angle for every product; replacement photographs for KZ Vader
   (500 px), EDX Pro and EDX Pro X (640 px), ESSAGER 1 m and 2 m (720 px, identical); one lifestyle photograph
   (a pair of IEMs in use) for the hero if the owner wants a warmer first impression.
5. **Archived watches** stay unpublished; nothing here changes that.
6. **Colour options on real products** (e.g. KZ in Black, Silver, Purple) become visible the moment the owner
   adds a variant per colour with a photograph each; the filters, cards, page and cart already handle them.
