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
- *Announcement bar:* the owner's announcement, else pickup, delivery and currency from settings; absent when empty.
- *Header:* logo, a wide search field (`/shop?q=`), "Questions?" (WhatsApp), the cart; from `lg` a second row of
  places (all products, each category). On a phone it is ONE 56 px row (logo, a search field that opens over the
  row with a Cancel button when tapped, the cart), solid (no blur), and it slides away while the visitor reads on
  (`store-chrome.tsx`, see Phones below). A four-tab bar (Home, Shop, Cart, WhatsApp, 52 px) is the phone's main
  navigation.
- *Category chips:* links to `/shop?category=`, with counts; the filter a customer uses first.
- *Product card:* photograph on the soft field (multiplied, so white cut-outs sit on it), brand or category, name,
  **price as the largest thing**, a stock pill, one action: **Add to cart** (one purchasable option), **Choose
  options** (a choice exists) or **See availability** (sold out). The name is a stretched link over the whole card;
  Add to cart is a separate button raised above it, so nothing is nested.
- *Stock pill* (`stock-pill.tsx`): "In stock", "Only n left" only at 2 or fewer, "Sold out" / "On the way".
  Counts above that are never shown.
- *"Low stock":* a strip on the home page built from real stock at 2 or fewer.
- *Product page:* large photograph (press to enlarge), price and stock, quantity and add, WhatsApp, **stock per pickup
  location**, description, specifications. On phones the photographs are a swipeable scroll-snap strip with dots
  (thumbnails return from `lg`), the description is cut to six lines behind "Read more", and ONE bar is fixed to the
  bottom: price, a WhatsApp shortcut and Add to cart (the tab bar steps aside).
- *Cart on phones:* the order bar (estimated total and Send order) is the only bottom bar, and steps aside while a
  field has the keyboard. Pickup dates are a row of chips.
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

## Phones

The shop is designed for a phone first; the owner measured 178 px of a 812 px screen (22 %) permanently covered
(a 121 px header and a 57 px tab bar), which is why the chrome is now small and moves out of the way.

- **Permanent chrome:** one 56 px header row on top, at most one bottom bar (52 px tab bar, 64 px buy bar or order
  bar), each plus the safe-area inset. `viewport-fit=cover` is set in the shop layout and `.nx-store` pads the page by
  the side insets.
- **Auto-hide:** `StoreChrome` (one passive scroll listener, one `requestAnimationFrame` per frame, ~560 B gzipped) sets
  `data-nx-chrome="hidden"` on `<html>` while the visitor scrolls down and removes it on scroll up, at the top of the
  page and while the search field or anything in the header has focus. Position is clamped to the document, so an iOS
  rubber band is never read as a direction. CSS moves the header and the tab bar with `transform` only, so nothing
  changes size. It applies below `sm` and on a phone on its side (short and narrow), never on a tablet or desktop.
- **Sticky parts of a page** read `--nx-header-h` (tokens.css). The shop toolbar (`.nx-subbar`: sort and filters) sits
  under the header and at the very top once the header is gone.
- **Touch:** targets are 44 x 44 px or more, fields are 16 px (no zoom on focus), controls carry
  `touch-action: manipulation`, no tap highlight, sheets and dialogs `overscroll-behavior: contain`. The filters sheet
  is a bottom sheet (at most 85 % of the screen, clear of the home indicator) below `md`, a side sheet from `md`.
- **Header and bars are px, not rem**, with px text, so a larger root font size cannot clip them or squeeze the page.
- The header's scroll-driven shadow (Motion) is off on phones: the hairline is a border, and animating a shadow
  repaints every frame.

## The dashboard on a phone

Staff sell, receive stock and check money on phones, so below `md` (768 px) the dashboard is built
phone-first and everything else (`lg` and up) is the desktop it always was. Rules, and where they live:

- **Chrome.** One 48 px top bar (search, bell, account) and, below `md`, one 52 px bottom bar
  (Overview, Sales, New sale, Inventory, Menu). Both slide away on scroll down and return on scroll up
  (`shell/scroll-chrome.tsx` flips `data-chrome="hidden"` on `<html>`; `app/(app)/mobile.css` moves them,
  transform only). `--shell-top` is the visible height of the top bar for sticky children. A page with its
  own fixed footer (`ui/action-bar.tsx`: sale, order, purchase order, product) carries `data-hides-tabbar`
  and the bottom bar steps aside, so there is never more than one bar at the foot of the screen.
- **Menu.** A Radix dialog drawer (`shell/mobile-nav.tsx`): focus trap, Escape and backdrop close it,
  it closes on navigation, 44 px items, the current page marked with a bar and `aria-current`, safe-area padding.
- **Lists.** A table with many columns becomes stacked rows (`ui/mobile-list.tsx`): title, key figure, status,
  secondary line, the whole row a link, the "..." menu pinned top right. A table that must stay a table
  (reports, reorder) scrolls sideways with an edge fade and pinned first column(s) (`TableWrap`, `sticky` on
  `TH`/`TD`). Filters collapse behind one "Filters" button with an active count and a bottom sheet
  (`patterns/list-toolbar.tsx`); search stays in view and pins under the top bar.
- **Sheets and forms.** `ui/sheet.tsx` is a 92 dvh bottom sheet below `sm` (side sheet above) with a sticky
  header and a sticky footer whose submit button is 48 px and full width; `ui/viewport.tsx` publishes the
  visual viewport (`--vv-h`, `--vv-bottom`) so the footer rides above the on-screen keyboard. Pickers
  (`ui/combobox.tsx`) open as bottom sheets with 48 px rows. Fields are 44 px tall and 16 px type so iOS
  never zooms; numbers use `inputMode`, quantities have a stepper (`forms/quantity-stepper.tsx`).
- **Touch.** Every control is at least 44 px (a `pointer: coarse` floor in `mobile.css` covers landscape and
  tablets), `touch-action: manipulation`, no hover-only affordances. `scripts/design-review/mobile-audit.mjs`
  lists the offenders per page, plus overflow and pinned chrome.

## Catalog and inventory screens

The product and stock screens (`/items`, `/inventory`, `/items/[id]`, `/inventory/count`) share these parts,
all in `src/components/catalog/`:

- **`ProductThumb`** is the one product photograph (`xs` 32, `sm` 44, `md` 64, `lg` 120 px, or `fill`). It has a fixed
  box (no layout shift), a skeleton while loading, `next/image` only for addresses the image configuration allows
  (`lib/image-src.ts`; anything else is shown directly), one retry straight from the host, then a labelled placeholder
  with the product's initials. Use it everywhere a product or variant is shown; never a bare `<Image>`.
- **Quick views** (`saved-views.tsx`) are chips with counts above the list; the counts use the list's own SQL
  conditions. Custom views live in this browser only (localStorage).
- **Selection and the bulk bar** (`selection.tsx`, `bulk-bar.tsx`): checkbox column from `lg`; on a phone a "Select"
  button or a long press. Every bulk action confirms with a summary, runs in one transaction, reports per item,
  and can be undone for 30 seconds from the toast (`lib/bulk-undo.ts`).
- **Inline edit** (`quick-edit.tsx`): tap a price or a stock figure; a bottom sheet on a phone, a popover from `sm`.
- **Product screen**: sections are collapsible cards (`collapsible-card.tsx`, a native `<details>`); a link such as
  `/items/{id}#photos` opens its section.
- Tables on these screens must fit their frame at 1440 and 1024 without scrolling sideways: secondary columns are
  hidden with `xl:` / `2xl:` classes (`THSort` takes a `className` for that).

## Motion

150 ms for colour and press feedback, 200 to 300 ms for drawers, 300 ms for the product-photo hover.
`prefers-reduced-motion` collapses all of it. No decorative animation.

## Rules that keep it from turning generic

- No gradient glows, glass or floating shapes. No emoji.
- No decorative hero. The opening composition shows the shop's own products (three photographs in white frames on the
  logo orange, each linked, with name and price) and a headline that says what is sold; it disappears when there are
  fewer than two good photographs. See `docs/NEXTX_STOREFRONT_REDESIGN_2026-10-18.md`.
- No invented claims. Stock text comes from inventory; pickup and delivery lines appear only when the
  owner configured them; categories appear only when they have public products.
- The storefront never names a product family in a URL.
- Photographs are the weak point of the shop today (see the creative-direction document). The system is
  built to make any consistent, well-shot photograph look good; it cannot fix a poor one.

## Evidence

Captures at 390, 768 and 1440 are in `docs/design-review/` (see its README), made by
`scripts/design-review/shoot.mjs` against the local fixture, not staging.
