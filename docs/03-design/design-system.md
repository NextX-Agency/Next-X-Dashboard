# NextX design system

Status: implemented 2026-10-17. This replaces the earlier blue "Instrument" dashboard skin and the
"Northlight" storefront skin, both rejected by the owner. It documents what the code does, not a
proposal. The source of truth is `src/styles/tokens.css`, `src/app/globals.css` and the components
named below; the live reference page is `/design-system`.

## One brand, two surfaces

NextX is the logo: a rectangular orange frame, a heavy black wordmark, circuit traces. Everything
follows from three decisions.

1. **Colour:** charcoal, warm paper, one orange. No blue anywhere.
2. **Shape:** near-square. The logo is a rectangle, so tiles, buttons and fields have a 2 to 4 px radius.
3. **Type:** a wide, heavy display face for headings (Archivo, width axis), Instrument Sans for text,
   JetBrains Mono for numbers and small technical labels.

| | Storefront (`.nx-store`) | Dashboard (`:root` / `.dark`) |
|---|---|---|
| Job | Discovery and ordering | Daily operation and money |
| Density | Open, editorial | Dense, tabular |
| Page | Warm paper `#f5f3ef` | Warm paper `#f6f5f2`, dark theme supported |
| Chrome | Charcoal header and footer | Charcoal navigation rail (`.nx-rail`) |
| Accent | Orange fill, ink text | Burnt orange, white text |
| Radius | `--radius-tile` 2 px | `--radius-control` 4 px, `--radius-card` 6 px |
| Theme | Light only, forced | Light or dark, follows the system |

Both skins use the same token names (`bg-base`, `text-ink`, `border-line`, `bg-accent`), so a shared
component renders correctly in either. The storefront adds `night`, `night-2`, `night-line`,
`night-ink` and `night-ink-2` for the charcoal fields.

## Colour

**Orange.** The logo orange is `#ee5b0d`. As a fill it carries ink text (`#0f0e0d`, 6.3:1). As text
or as a fill under white text it is darkened to `#b13f06` (5.0:1 on paper), `#8f3200` on hover. In
dark mode it lifts to `#ff7a2e`.

**Neutrals are warm** (hue 30 to 40). Light text steps are `#151413`, `#46423d`, `#645e57`,
`#706a62`; every step clears WCAG AA on the base and raised surfaces.

**Semantic colour is scarce and means something.** Green is money in, red is money out, amber is a
warning, blue-grey is information. They never decorate.

**Chart colours are data only:** orange `#d9500b`, teal `#2b6f73`, ochre `#c08a1c`, charcoal
`#5b5650`, stone `#a79d8e`. Orange leads; the others stay distinguishable from it and each other.

## Typography

| Use | Face | Class |
|---|---|---|
| Storefront headings | Archivo, `wdth` 112, weight 800 | `.nx-display` |
| Dashboard page titles | Archivo, `wdth` 106, weight 750 | `.nx-title` |
| Text | Instrument Sans | default |
| Numbers, prices, SKUs | JetBrains Mono, tabular | `.tabular` |
| Small technical labels | JetBrains Mono, caps, 0.09em | `.nx-label` |

Every number in the dashboard is tabular so columns align on the decimal. Prices on the storefront
use the same face.

## Money on the storefront

SRD leads and always carries its code: `SRD 4.850`, never a bare `$`, which would read as USD.
Dutch thousands separator. When an exchange rate is set, the USD indication follows in small type
(`≈ $126`). `formatSrd()` in `components/store/store-price.tsx` is the single formatter; the cart and
the WhatsApp message use it too.

## Components

**Buttons (storefront):** `.nx-btn` with `-orange` (the one primary action on a screen), `-ink`,
`-line` (secondary), `-line-night` (on charcoal). 44 px high, 36 px for `-sm`.
**Buttons (dashboard):** `ui/button.tsx`, variants `primary` (orange), `secondary`, `ghost`,
`danger`, heights 28 / 32 / 36.

**Product card:** warm field, photograph, brand and category label, name, SRD price, stock. One link
for the whole tile, no second button. Near-square photos fill the field; other shapes are contained.
Photographs are multiplied onto the field so white backgrounds disappear.

**Stage and ticks:** `.nx-stage` is the charcoal field behind hero photography. `.nx-ticks` adds two
orange corner marks taken from the logo frame. Used once per page, on the hero.

**Tables:** server-rendered, 32 px rows, hairline rules, 11 px caps headers, numbers right-aligned
and tabular. Sorting and filtering live in the URL.

**Forms:** sheets for create and edit so the list stays visible. Labels above fields, validation text
under them. Line-item grids must have exactly as many cells as columns (a stray cell once pushed the
product picker into a 72 px column on Record a sale).

**Focus:** a 2 px orange ring on `:focus-visible` only. Never an always-on outline.

## Layout and breakpoints

Storefront container 1320 px, gutters 16 px, 32 px from `lg`. Dashboard rail 232 px from `lg`,
a drawer below. Verified widths: **390** (phone), **768** (tablet), **1440** (desktop).
Product grids are 2 columns on phones, 4 from tablet, with the catalogue at 2 / 3 / 3 / 4 beside its
filter column.

## Motion

150 ms for colour and press feedback, 200 to 300 ms for drawers, 500 to 700 ms for image zoom on
hover. `prefers-reduced-motion` collapses all of it. No decorative animation.

## Rules that keep it from turning generic

- No gradient glows, glass, floating shapes or emoji. The one gradient is a functional fade that
  keeps text legible over a photograph.
- No centred headline-plus-two-pills hero. The first screen is one real product, large, with its
  price and one way in.
- No invented claims. Stock text comes from inventory; pickup and delivery lines appear only when the
  owner has configured them; categories appear only when they have public products.
- The storefront never names a product family in a URL, a header link or a footer.

## Evidence

Before and after captures at 390 / 768 / 1440 are in `docs/design-review/` (see its README), made by
`scripts/design-review/shoot.mjs` against the synthetic local fixture, not staging.
