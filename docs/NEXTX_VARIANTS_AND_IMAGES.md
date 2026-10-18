# Variants, photographs and filters: how they work

Written 2026-10-18. This is the reference for how a product's options (colour, size, connector and so on)
are modelled, which photograph is shown where, and how the shop filters combine. The code lives in the files
named in each section; nothing here introduces a second image system or a new table.

## 1. Model

- A **product** is what a customer recognises. A **variant** is what is stocked, priced and sold; it carries
  `sku`, a display `name`, structured `attributes` (free-form `{ "colour": "Black", "connector": "3.5mm" }`),
  price, cost, stock, `is_active` and `position`. There is no fixed list of option types.
- A **photograph** (`product_images`) belongs to a product. `variant_id` optionally pins it to one variant of
  *that* product (`updateProductImageDetails` rejects a variant of another product). `is_primary` marks the
  product's representative photograph (one per product); `position` is the owner's order.
- Disabling a variant (`is_active = false`) keeps its history. Removing a variant that ever moved stock or
  appeared on a sale or purchase line only deactivates it. Sale lines keep their own name/SKU snapshots, so
  editing a variant never rewrites a past sale (the sale page shows the *current* photograph beside the
  *snapshotted* name).

## 2. The one image policy (`src/lib/product-images.ts`)

For an explicitly chosen variant, in this order:

1. the variant's own first photograph (by `position`; "main photo of this option"),
2. otherwise a shared photograph (not pinned to any variant), primary first,
3. otherwise the product's primary photograph, **only when the product has a single option**,
4. otherwise a neutral placeholder.

For a multi-option product with no option chosen (cards, search results, the representative of a product):
the owner-flagged primary, else the first shared photograph, else the first photograph.

**Deliberate stricter-than-the-brief choice:** an option with no photograph of its own is never shown another
option's photograph. If the product has no shared photograph either, the page shows a placeholder and the
words "No photo of the Silver option yet." A Black photograph on the Silver page is a wrong product, which is
worse than an honest gap. The media audit lists such options as P1 so they get photographed.

The same rule is applied in four places that must agree, and a change must touch all of them:

| Surface | Where |
|---|---|
| Shop product page gallery, cart, sale picker, sale form lines | `src/lib/product-images.ts` (`galleryImages`, `resolveVariantImage`) |
| Shop cart quote (server, authoritative) | `getPublicStoreCartQuote` in `src/server/queries/catalog.ts` |
| Shop product cards | `LATERAL` image join in `catalogFrom` (`ORDER BY is_primary DESC, (variant_id IS NULL) DESC, position`), then the matched option's own photograph when a colour/option filter is active |
| Dashboard lists (products, inventory, sale lines) | `variantImageSql` in `src/server/queries/image-sql.ts` (SQL mirror) |

Cards and selectors use the `thumb_url` derivative when one exists. Public URLs are the public bucket's;
private staging objects are never referenced (the media audit flags any that are).

## 3. Product page (`src/components/store/product-selection.tsx`)

One `ProductSelectionProvider` holds the chosen option. The gallery, price and stock, the pickup list, the
add-to-cart button, the WhatsApp message and the cart line all read it, so they cannot disagree. The choice is
mirrored to `?variant=<SKU>` (SKU or variant id accepted) so a shared link or a filtered shop result opens on
the same option. With no `?variant=`, the page opens on the first option that is in stock.

- Colours render as labelled swatches; other options as readable buttons. The selected option shows a tick and
  a heavier outline, and a sold-out option says "Sold out" in words, so nothing relies on colour alone.
  Swatch colours exist for common colour names only (`src/lib/product-options.ts`); an unknown name is shown as
  plain text rather than a guessed colour.
- Pickup stock is per option (`getStorefrontAvailability` per variant). Legacy movements with no location count
  at the main location, as they already did in the headline figure.
- A sold-out option offers "Ask when it is back" instead of Add to cart.

## 4. Shop filters (`src/server/queries/catalog.ts`, `src/components/store/shop-controls.tsx`)

Filters: category chips, brand (any of), colour (any of), other options such as connector (any of per key),
price tier, availability (in stock / coming soon), new arrivals, works-with, connection, search, sort. All of it
is in the address (`?brand=kz,essager&colour=Black&opt=connector:Type-C&availability=in-stock&sort=price-asc`).

**Matching rule.** Groups combine with AND; values inside a group with OR. Colour, other options and "in stock"
are all required of the **same variant**: a product matches only if at least one active, priced variant
satisfies every selected variant-level filter together. "Silver + in stock" shows nothing when Silver is sold
out even if Black is in stock. A result card opens on the matching option and shows its photograph.

**Counting rule.** Each group's count is the number of products that would match if that value were chosen
under every *other* active filter (the group's own selection is ignored, so picking a second brand adds to the
first). A value no public product has is not offered; a value that exists but matches nothing right now stays
listed with a 0. Colour and option groups appear only when the catalogue really varies on them (two or more
values), so a group is never built from empty or single-valued data.

Search matches name, summary, model number, brand, features, compatibility, and variant name or SKU.
`%` and `_` are escaped. Sorting by price uses the lowest (ascending) or highest (descending) active priced
variant in the storefront's own price list and currency.

## 5. Dashboard

- **Record a sale / New order**: a photo browser (grid or compact list) with search over name, model, brand,
  SKU and option values, category and stock filters, a per-option list with photograph, SKU, price in the
  sale currency and stock per location, a quantity, and "Add to sale" that keeps the dialog open. The same
  option added twice adds to its line. Pricing, FX, cost of goods, commissions and posting are unchanged: the
  picker only chooses a variant (or bundle) and a quantity, and the server still validates and prices.
- **Product page**: option photos are badged ("Black · main", "Shared"); new photos can be filed under an
  option as they are uploaded; "Make this the main photo of its option" reorders; variants can be moved up
  and down; a taken SKU is refused by name ("SKU X is already used by Y").
- **Purchase orders, bundles, quotes**: the same photo browser (`SaleProductPicker`, with `labels`, `priceOf`,
  `showQuantity` and `warnOverstock` for the differences). A purchase order line shows the option's photograph,
  SKU and the **reference cost** (not the list price); a bundle component likewise; a quote (create or convert
  from the request list) chooses one option and keeps the request's quantity. The form still submits only
  variant ids, quantities and the amounts typed by the person.
- **Lists**: products (SKU/model/brand search, photo, variant-count and price filters, thumbnails), inventory
  (category, stock level, location with a per-location quantity, thumbnails), sales (product/SKU search,
  payment, currency, seller, date range compared in UTC like the display), orders (customer, date range,
  payment), cash ledger (type, currency, wallet, date range, category), customers (last-order range),
  expenses (date range). Exact rules: `docs/NEXTX_BROWSER_QA.md` section 7.

## 6. Known limits

- The variant "main photo" is the first photograph of that variant by order; there is no separate stored flag.
  That avoided a schema change, but it means "primary" (product representative) and "main of an option" are
  two different ideas shown by two badges.
- Deleting a variant that has no history sets its photographs' `variant_id` to NULL (existing FK `ON DELETE
  SET NULL`), which turns them into *shared* photographs. Reassign or delete them first.
- The sale picker loads every non-archived variant at once (a few hundred rows is fine; it shows 48 results
  and "Show more"). A catalogue in the thousands needs server-side search.
