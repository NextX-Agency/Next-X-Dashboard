# NextX design system: "Rustig"

Status: implemented 2026-10-17 and made English the same day, chosen by the owner from three working previews
(`docs/design-review/CREATIVE_DIRECTION.md`). It replaces the blue "Instrument" dashboard skin, the
"Northlight" storefront skin and the charcoal-and-orange redesign, all rejected. This document describes
what the code does. The sources of truth are `src/styles/tokens.css`, `src/app/globals.css` and the
components named below; the live reference page is `/design-system`.

## Principle

Quiet, fast, easy to read. The shop is the shop and the dashboard is a workbench; both are white, softly
rounded, set in one typeface, with **black for the main action** and **orange only as a signal**. Nothing
is decorative. The identity is carried by the logo, the clarity of prices and stock, and consistency,
not by effects.

## One system, two skins

| | Storefront (`.nx-store`) | Dashboard (`:root` / `.dark`) |
|---|---|---|
| Job | Find and order | Do the daily work, keep the books |
| Page | White | Warm paper `#f6f5f2`, dark theme supported |
| Fields | Soft grey `#f5f5f2` behind photos | White panels on paper |
| Primary action | Black | Black (inverts to white in dark theme) |
| Orange | Last pieces, logo, small signals | Links, active states, warnings; never a main button |
| Radius | Cards 14 px, controls 10 to 12 px | Panels 14 px, controls 8 px |
| Theme | Light only | Light or dark, follows the system |

Both skins use the same token names (`bg-base`, `text-ink`, `border-line`, `bg-sunken`), so a shared
component renders correctly in either.

## Colour

- **Ink** `#141414` (text, primary buttons), secondary `#3f3f3b`, tertiary `#5c5c57`, faint `#6b6b65`.
  Every text step clears WCAG AA on white and on the soft grey.
- **Orange** `#e8590c` is the logo orange and appears as a dot, a bar, a small fill. As text it is
  darkened to `#a8440a` on the shop, `#b13f06` in the dashboard (AA).
- **Green and red mean money direction** and nothing else. Amber is a warning.
- **Chart colours are data only**: orange, teal, ochre, charcoal, stone.
- `text-base` is Tailwind's *font size*, not a colour. Text on an ink fill is `text-on-ink`.

## Typography

**Manrope** for the shop's text and for every heading in both skins (`.nx-display` for the shop,
`.nx-title` for dashboard page titles; 800 weight, -0.03em). **Instrument Sans** stays for the dense
staff interface, **JetBrains Mono** for dashboard figures. Shop prices and counts are Manrope with
tabular figures (`.tabular` inside `.nx-store`), never mono.

## Money on the storefront

SRD leads and always carries its code: `SRD 4,850`, never a bare `$`, which would read as USD. English
separators (comma thousands, point decimals), formatted by `src/lib/store-money.ts`. When an exchange rate is set the USD indication follows in small type
(`≈ $126`). `formatSrd()` in `lib/store-money.ts` is the single formatter; the cart and the WhatsApp message use it
too. The page language is `en-SR`; dates and numbers are formatted as `en-GB` (no `en-SR` data in `Intl`).

## Language

The public shop is English, the staff dashboard is English. All shop wording lives in the components and in
`lib/store-messages.ts` (WhatsApp). A guard test fails the build if Dutch returns. See
`docs/NEXTX_ENGLISH_CONTENT.md`.

## Components

**Storefront**
- *Header:* logo, a wide search field (`/shop?q=`), "Questions?" (WhatsApp), the cart. Phones put search
  under the logo and add a four-tab bar (Home, Shop, Cart, WhatsApp).
- *Category chips:* links to `/shop?category=`, with counts; the filter a customer uses first.
- *Product card:* photograph on the soft field (multiplied, so white cut-outs sit on it), name, **price as
  the largest thing**, a stock pill, one action. The whole card is one link.
- *Stock pill* (`stock-pill.tsx`): "In stock", "Only n left" only at 2 or fewer, "Sold out" / "On the way".
  Counts above that are never shown.
- *"Low stock":* a strip on the home page built from real stock at 2 or fewer.
- *Product page:* large photograph (press to enlarge), price and stock, quantity and add, WhatsApp, **stock per pickup
  location**, description, specifications. On phones the add button lives in a bar fixed to the bottom.
- *Buttons:* `.nx-btn` 48 px; `-primary` (black), `-line` (outline), `-signal` (orange, reserved for
  "back in stock" style signals), `-sm`.

**Dashboard**
- *Navigation:* eight groups (Home, Sell, Products, Stock, Buy, Money, Reports, Shop & settings) holding all
  28 pages. The group you are in is open; the current page is the one solid pill. `lib/navigation.ts`.
- *Home:* four action tiles (Record a sale is the filled one), then "Needs attention", then the position
  strip, then detail panels.
- *Page header:* the title; a page's explanatory text is behind an info mark, not printed on every page.
- *Buttons:* `ui/button.tsx`; `primary` is ink, heights 28, 32, 36.
- *Tables:* server-rendered, 32 px rows, numbers right-aligned and tabular; on the Products table two
  secondary columns hide below `2xl` so it does not scroll sideways at 1440.
- *Forms:* sheets for create and edit. A line-item grid must have exactly as many cells as columns.

**Focus:** a visible 2 px ring on `:focus-visible` for links, buttons, selects and the quantity field;
text inputs change border colour instead. Never an always-on outline.

## Layout

Container 1320 px, gutters 16 px (32 px from `lg`). Verified at **390**, **768** and **1440**. Product
grids are 2 columns on phones, 3 on tablet, 4 on desktop. Dashboard rail 232 px from `lg`, a drawer below.

## Motion

150 ms for colour and press feedback, 200 to 300 ms for drawers, 300 ms for the product-photo hover.
`prefers-reduced-motion` collapses all of it. No decorative animation.

## Rules that keep it from turning generic

- No gradient glows, glass or floating shapes. No emoji.
- No hero banner. The home page is the shop.
- No invented claims. Stock text comes from inventory; pickup and delivery lines appear only when the
  owner configured them; categories appear only when they have public products.
- The storefront never names a product family in a URL.
- Photographs are the weak point of the shop today (see the creative-direction document). The system is
  built to make any consistent, well-shot photograph look good; it cannot fix a poor one.

## Evidence

Captures at 390, 768 and 1440 are in `docs/design-review/` (see its README), made by
`scripts/design-review/shoot.mjs` against the local fixture, not staging.
