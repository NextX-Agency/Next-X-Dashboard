# Design review evidence

Captured 2026-10-17 by `scripts/design-review/shoot.mjs` (Playwright, Chromium) from the local dev
server against the **synthetic** fixture in `scripts/rehearsal/visual-seed.sql`. This is not staging
and not real inventory: product names, prices, stock, contact details and photographs are placeholders
(the photographs are crops of the checked-in `public/iems.webp`). Use these to judge layout,
hierarchy and consistency, not to judge the product range.

Regenerate:

```bash
pnpm db:rehearsal:start                       # then apply migrations and the fixture, see NEXTX_PROGRESS.md
pnpm dev
MSYS_NO_PATHCONV=1 node scripts/design-review/shoot.mjs <label> http://localhost:3000 /,/shop --width=390
```

| Folder | What it shows |
|---|---|
| `before/` | The rejected design: centred hero, identical product cards, blue-tinted dashboard. `/audio`, `/audio/halden-studio-8`, `/audio/cart`, `/dashboard`, `/products`, `/orders` at 390, 768, 1440 |
| `after/` | The rebuilt design: `/`, `/shop`, `/products/halden-studio-8`, `/cart` at 390, 768, 1440 (full page), plus first-screen captures of `/dashboard`, `/items`, `/inventory`, `/sales/new`, `/orders` at 1440 |

Each capture also reports horizontal overflow and console errors. At capture time every storefront and
dashboard page reported `overflowX=0px`.

## What was checked in the images

- Alignment and rhythm: one 1320 px container, 16 / 32 px gutters, consistent section spacing.
- Hero legibility at 390, 768 and 1440: text and one product are both visible without scrolling on a phone.
- Card consistency: square image field, same caption structure, price and stock on one line from 640 px.
- Mobile: header collapses to menu, search, cart; filters open as a sheet; no horizontal scroll.
- Dashboard: charcoal rail, warm paper content, orange only on primary actions and the active item;
  dark theme checked on `/dashboard`.

## Known limits of this evidence

- Not captured or not checked: hover and focus states, keyboard navigation of the filter sheet,
  the WhatsApp hand-off on a real phone, real product photography, staging.
- Fixture photographs are crops of one source photo, so several products share a look. Real photography will vary more, which is why product cards multiply the image onto the field (white backgrounds disappear) and contain, rather than crop, unusual aspect ratios.
- Dev-only Next.js overlay badges ("N", "1 Issue") appear in some captures. They are not part of the app.
