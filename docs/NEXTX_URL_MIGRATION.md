# NextX public URL migration

Legacy canonical origin: `https://shop-nextx.com`, verified in NextX page
metadata, sitemap and storefront code. The final Nextly origin has not been
selected or verified. DNS remains unchanged.

## Public URL structure (implemented 2026-10-17, verified locally, not yet on staging)

The store is **NextX**, not any one product family. No public URL, header link or footer link names a
category. Product families appear only as `?category=` filters built from products that are actually
published.

| URL | Purpose |
|---|---|
| `/` | NextX home page (a real page, never a redirect) |
| `/shop` | Catalogue: search, category, brand, price, availability, sort |
| `/products/[slug]` | Product page. Canonical for every product |
| `/setups/[slug]` | Bundle ("set") page |
| `/cart` | Cart and WhatsApp order hand-off. `noindex` |
| `/faq`, `/testimonials`, `/blog` | Kept; empty-state pages, `noindex` until they have content |
| `/dashboard` and the rest of the staff app | Protected. Staff products moved from `/products` to `/items` so `/products/[slug]` could be public |
| `/login` | Staff sign-in. Linked only from the footer |

### Redirect matrix

Every rule is one permanent (308) hop to a canonical URL, defined in `next.config.ts` and covered by
`tests/unit/legacy-url-and-indexing.test.ts`, `tests/unit/legacy-url-map.test.ts` and
`tests/e2e/store-local.spec.ts`. Query strings are preserved.

| Old URL | New URL | Status | Notes |
|---|---|---|---|
| `/audio` | `/shop` | 308 | |
| `/audio/[slug]` | `/products/[slug]` | 308 | Excludes `cart` and retired watch ids |
| `/audio/[legacy-id]` (15 known ids) | `/products/[canonical-slug]` | 308 | Exact map in `src/lib/legacy-url-map.ts` |
| `/audio/cart` | `/cart` | 308 | |
| `/audio/setups/[slug]` | `/setups/[slug]` | 308 | |
| `/catalog` | `/shop` | 308 | |
| `/catalog/[legacy-id]` (known) | `/products/[canonical-slug]` | 308 | Single hop |
| `/catalog/[other-id]` | `/products/[other-id]` | 308 | The product page resolves imported legacy ids and redirects once more to the canonical slug if different |
| `/p/[slug]` | `/products/[slug]` | 308 | |
| `/products` | `/shop` | 308 | Not a public page |
| `/watches`, `/watches/*` | none | **410** | Retired. Not redirected |
| `/catalog/[retired-watch-id]`, `/audio/[retired-watch-id]` | none | **410** | 19 ids, rewritten to the retired page |
| unknown `/products/[slug]` | none | **404** | A real HTTP 404, `noindex` |

Checks: no rule's destination is another rule's source (no chains or loops); the root is never
redirected; robots and sitemap list only `/`, `/shop` and `/products/*`; the product page emits
`rel=canonical` and `Product` JSON-LD with price, currency and availability per variant.

The old unknown-product behaviour (HTTP 200 with `noindex`) came from reading the product inside a
Suspense boundary after the status line was already sent. The product page now reads the product
before streaming (`export const instant = false`), so a missing product is a genuine 404.

### Watches: owner checkpoint (open)

On 16 Oct 2026 the owner decided NextX no longer sells watches. This restructure does **not** reverse
that. What it does instead:

- Watches stay out of the public shop: the retired storefront is never selected as the request
  storefront, is excluded from the sitemap, and its URLs answer 410.
- Watch products, stock, orders and finance history are untouched in the database.
- The structure is category-neutral. If the owner later decides to sell watches again, that is a
  publication decision (publish products, set the storefront active, remove the 410 rewrite), not a
  routing or design change.

**Decision needed from the owner:** keep Watches retired (current behaviour), or plan a relaunch. No
code assumes either answer.

### Still unverified on staging

Staging is still running an older build, so none of the above has been observed there. Verify after
the pinned deploy: the redirect table above with `curl -I`, `/` returning 200, `/products/<unknown>`
returning 404, the sitemap and robots on the production host, and the rendered canonical host (never a
staging hostname or an IP address).

## Checked-in static assets

These assets are part of the legacy URL surface. The 12 business assets below
are in Nextly's `public/` directory under their original root-relative paths.
Ten files are byte-for-byte copies; the two SVGs have nonvisual `<title>`
elements added for accessibility. SHA-256 source/destination equality was
checked at copy time before those title additions. The old
`Colored - White background.png` file has the same hash as
`nextx-logo-light.png`; the five remaining legacy public files are generic
framework starter graphics and are not NextX content.

| Existing NextX asset URL | Nextly destination | Rule |
|---|---|---|
| `/nextx-logo.svg` | `/nextx-logo.svg` | Preserve static logo file. |
| `/nextx-logo-light.png` | `/nextx-logo-light.png` | Preserve static logo file. |
| `/nextx-logo-dark.png` | `/nextx-logo-dark.png` | Preserve static logo file. |
| `/nextx-hero-accent.svg` | `/nextx-hero-accent.svg` | Preserve static brand decoration. |
| `/favicon.png` | `/favicon.png` | Preserve favicon. |
| `/og-image.png` | `/og-image.png` | Preserve OpenGraph image. |
| `/hero_section-watches.webp` | `/hero_section-watches.webp` | Preserve desktop Watches hero. |
| `/hero_section-watches-mobile.webp` | `/hero_section-watches-mobile.webp` | Preserve mobile Watches hero. |
| `/iems.webp` | `/iems.webp` | Preserve Audio/brand asset. |
| `/pro-diver.jpg` | `/pro-diver.jpg` | Preserve checked-in product image. |
| `/whatsapp.png` | `/whatsapp.png` | Preserve light-background contact icon. |
| `/whatsapp-white.png` | `/whatsapp-white.png` | Preserve dark-background contact icon. |

## Redirect release sequence

1. Generate a mapping from every legacy product id/slug to the imported Nextly
   product. Report missing, duplicate and unpublished targets.
2. Add and test permanent path redirects on the Nextly deployment with the old
   domain still pointing to NextX. Use a temporary staging hostname and verify
   both status code and final page.
3. Keep the source application, database and Blob media available for rollback
   and link comparison. Do not change DNS in this migration task.
4. When the business later approves a domain change, update DNS only after the
   production go/no-go review. Check TLS, canonical URL, sitemap, robots,
   redirects, social cards, invoice links and WhatsApp messages after
   propagation.

The new domain, old-domain redirect ownership, and any `www` behavior still
need an owner-approved decision. Never substitute a Coolify IP address or
temporary staging hostname into canonical metadata.
