# NextX public URL migration

Legacy canonical origin: `https://shop-nextx.com`, verified in NextX page
metadata, sitemap and storefront code. The final Nextly origin has not been
selected or verified. DNS remains unchanged.

## URL mapping implemented locally; staging verification pending

| Existing NextX URL | Nextly destination | Rule |
|---|---|---|
| `/` | Nextly NextX brand entry page | The root now restores the legacy Audio/Watches choice using the checked-in NextX brand assets. Verify rendered metadata, links and mobile layout on staging. |
| `/catalog` | `/audio` | The audited legacy route uses the audio catalog client and `catalog_type = 'audio'`; preserve that intent with a permanent redirect. |
| `/audio` | `/audio` | Local route resolves the Audio storefront; verify source copy, SEO and hero in staging. |
| `/watches`, `/watches/*` | `410 Gone` | Superseded 16 Oct 2026: NextX is audio only. Retired watch URLs answer 410 with a link to `/audio`; see `docs/audits/2026-10-16-seo-and-url-inventory.md`. |
| `/p/[slug]` | `/p/[new-slug]` | Product slug resolves in the current storefront; legacy ids resolve through the imported `product_variants.attributes.legacy_id` mapping and receive a permanent redirect to the new canonical path. |
| `/catalog/[id]`, `/audio/[id]`, `/watches/[id]` | `/p/[new-slug]` | The legacy catalog route is audio; its IDs permanently redirect through `/audio/[id]`, then the shared canonical product query resolves imported legacy IDs within that storefront and redirects to the new slug. |
| `/faq` | `/faq` | Preserve the public FAQ URL and its clear empty state; the source FAQ table has no live rows. Contact uses the configured NextX WhatsApp number when one is available. |
| `/testimonials` | `/testimonials` | Preserve the public customer-review URL and empty state; the source testimonials table has no live rows. The share-review action uses configured NextX contact details when available. |
| `/blog` | `/blog` | Preserve the public blog landing URL and empty state. No live `blog_posts` or `blog_categories` tables or article records were found in the source schema. |
| `/blog/[slug]` | 404 with a link to `/blog` | No published legacy posts exist to migrate; unknown article links receive an intentional not-found response. |
| `/invoices` | Authenticated NextX invoice workspace | This is a dashboard route, not a public share URL. The legacy App Router has no public invoice-token route. Map public links only if an existing issued-link inventory proves they exist. |
| Public invoice shares | No verified legacy route; Nextly has `/invoice/[id]` and `/d/invoice/[token]` | Do not invent legacy URLs. If issued public links are found, preserve valid access and test revocation/redaction before cutover. |
| `/shop`, `/store` | No legacy App Router route found | No redirect is configured; revisit only if access logs establish real legacy traffic on either path. |

The local tree now has a NextX-branded `/` entry page, public `/audio`,
`/watches`, FAQ, testimonial, blog, cart and product routes. The request
storefront is derived from the path in the server proxy, and legacy item IDs
resolve through the imported variant metadata before canonical redirect. Route
code has not been exercised against staging data. Do not put multiple stores
behind a single generic catalog while old links still identify a specific
brand.

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
