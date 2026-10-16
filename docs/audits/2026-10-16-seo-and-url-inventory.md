# SEO and legacy URL inventory, 16 October 2026

Evidence gathered by fetching `https://www.shop-nextx.com` and
`https://nextx.nextxagency.com` on 16 Oct 2026. Exact per-URL rows are in
[`2026-10-16-legacy-url-map.csv`](2026-10-16-legacy-url-map.csv).

## Legacy site facts (verified)

- `robots.txt` and the sitemap name `https://shop-nextx.com` (apex). The apex answers
  `301` to `www.shop-nextx.com`, so every sitemap URL is a redirect. Fix the canonical
  host decision before cutover.
- The sitemap lists 44 URLs: `/`, `/catalog`, `/blog`, `/faq`, `/testimonials` and 39
  `/catalog/<uuid>` product pages.
- Of the 39 product URLs, **15 return 200** (audio products) and **24 do not**:
  - **19** are watch products. `/watches/<uuid>` returns 200, but `/catalog/<uuid>` answers
    `308` to `/audio/<uuid>`, which is a `404`. The legacy sitemap therefore advertises
    redirect chains that end in 404.
  - **5** return 404 on every legacy route.
- `/watches` still returns 200 today; the legacy site still sells watches until cutover.

## Decisions taken in code (this branch)

| Legacy URL | New behaviour | Why |
|---|---|---|
| `/catalog` | `301` to `/audio` | Legacy catalog is the audio catalog. |
| `/catalog/<uuid>` of an audio product | `301` to `/audio/<uuid>`, then canonical redirect to `/audio/<slug>` | 15 products; table below. |
| `/watches`, `/watches/<anything>` | **`410 Gone`** page with link to the audio shop, `noindex` | Previously a temporary redirect to `/audio`. No audio page is a relevant replacement for a watch, so the URL is retired instead of transferred. |
| `/catalog/<uuid>` of a watch or unknown ID | `404` | No destination exists. Owner may prefer 410; see open decisions. |
| `/` | `307` to `/audio` | NextX sells audio only. |

Slugs are deterministic: each product slug is `slugify(name)` plus the first 6 hex
characters of SHA-256 of the legacy ID. All 15 staging slug suffixes were recomputed
and match, so the redirect table does not change between import runs.

## The 15 audio redirects

Legacy ID to new path (`/audio/…`). Names matched one-to-one between legacy and staging.

| Product | Legacy ID | New path |
|---|---|---|
| KZ Elliptical Pouch | 61b007df-3edd-4b12-b13b-3687198fcc27 | kz-elliptical-pouch-044c81 |
| KZ ZSN Pro 2 | af49afda-56e8-4b25-823a-fc91f9e7949f | kz-zsn-pro-2-fb2ce6 |
| KZ EDX PRO | 77d9aedd-8f45-47cc-928c-e2ecee3ee888 | kz-edx-pro-978ae9 |
| KZ Castor PRO | 388c31fc-d118-4ab3-ad9f-62303f69e878 | kz-castor-pro-f99aaa |
| ESSAGER AUX(3.5mm) to Type-C DAC | e9f079f3-64d4-4fe0-b0f5-5b92700b4ec2 | essager-aux-3-5mm-to-type-c-dac-d51556 |
| KZ IEM 3.5mm Kabel | c6e72547-4632-49b0-ba78-ee9774349757 | kz-iem-3-5mm-kabel-f24447 |
| M-Vave SWS12 Wireless IEM System | 226efd8e-0a24-4709-85dd-655fbccc0866 | m-vave-sws12-wireless-iem-system-0d912b |
| KZ AS16 Pro X | 3f794fb4-b718-4fb0-af2f-54facfb11d95 | kz-as16-pro-x-7596d0 |
| KZ ZS10 PRO X | e891d5e1-de3f-4321-9782-36523bc5a84f | kz-zs10-pro-x-730ef8 |
| ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel | 30594bb0-b4f2-4316-b877-ffc7102fe1fd | essager-1m-aux-3-5mm-to-aux-verlengkabel-b44bbf |
| ESSAGER 2m Aux(3.5mm) to Aux Verlengkabel | 2bd236a5-7d5a-4d03-8f1a-7d165f5111a5 | essager-2m-aux-3-5mm-to-aux-verlengkabel-bffa90 |
| KZ Carol | fe4e7b56-0858-469f-ba95-2e402b6acf03 | kz-carol-9dcfe0 |
| KZ AZ09 | e8287ef5-e09c-4f76-864d-8b008829e750 | kz-az09-17624f |
| KZ Vader | 796c32f2-1e79-4826-b653-aa9ee24f0d66 | kz-vader-4dc769 |
| KZ EDX Pro X | ce6a6431-14c9-4208-b5e7-bc5a97ecd075 | kz-edx-pro-x-222f79 |

The full 39-row table (all 15 audio rows plus the 24 dead rows) is in the CSV.

## Staging defects found (staging runs an older build than the branch)

| Finding | Evidence | Status on branch |
|---|---|---|
| Product JSON-LD price is `39.50 USD`, availability `OutOfStock`; the live shop sells the same item at 1,500 SRD | `/audio/kz-zsn-pro-2-fb2ce6` | Cause: importer set every storefront to USD. **Fixed** in `4d8c790` and covered by a test. Needs a re-import to take effect. |
| Hero says "…tot Invicta-horloges" on the audio shop | `/audio` | Cause: legacy copy imported verbatim. **Fixed** in `4d8c790` (dropped and reported as `WATCH_COPY_DROPPED`). Needs a re-import. |
| Buttons are blue, not NextX orange | `/audio` screenshot | Branch uses `#c45200`; needs deployment. |
| Title ends in `· Nextly` | `<title>` | Branch template is `NextX Dashboard 2.0`; needs deployment. |
| OG image alt says "smart home devices" | `og:image:alt` | Branch alt is corrected; needs deployment. |
| `robots.txt` says `Allow: /` and the sitemap is populated | `/robots.txt` | Branch disallows all on staging; needs deployment. The page itself is `noindex`, so the exposure is low. |
| Footer says "Prices in USD", mixed Dutch and English labels | `/audio` footer | Currency follows the storefront setting (see first row). Copy review still open. |
| Product description contains stray `￼` characters | JSON-LD `description` | **Open.** Legacy text artifact; strip on import. |
| FAQ, blog, testimonials are listed in the staging sitemap | `/sitemap.xml` | Branch sitemap lists only audio pages. |

## Verified on a production build of this branch

`/watches`, `/watches/<uuid>` and `/watches/anything/deep` return `410` with
`x-robots-tag: noindex, nofollow`; `/` returns `307` to `/audio`.
Screenshots of the 410 page at desktop and 375px width were taken and read correctly.

## Open decisions for the owner

1. Should unresolvable `/catalog/<watch-uuid>` URLs return 410 (retired) rather than 404?
   The list of 19 known watch IDs makes an exact 410 possible.
2. Canonical host: apex `shop-nextx.com` or `www`. The legacy site mixes both.
3. Production domain for the new shop. No canonical URL should be set to a staging host.

## Not yet verified

Rendered titles, canonicals, sitemap and structured data on the **production host**
(it does not exist yet); redirect behaviour on the VPS (needs a deployed build);
Search Console indexing state of the 24 dead URLs.

## Update: staging deploy of `a750a6e` and what it exposed

Deployed and imported on staging (exit 0, 794 batches, 1,934 operations, online validation `pass`).
Direct checks of `https://nextx.nextxagency.com` afterwards:

| Check | Result |
|---|---|
| `<title>` | `NEXT X Audio · NextX Dashboard 2.0` (was `· Nextly`) |
| Product JSON-LD (KZ ZSN Pro 2) | `SRD 1500.00`, `InStock` (was `USD 39.50`, `OutOfStock`) |
| `/watches`, `/watches/<id>` | `410` |
| Hero text | **Still showed "Welcome To NextX" and "…Invicta-horloges"**: that copy lives in the `settings` row (`hero_title`, `hero_body`), which the first guard did not cover. |
| `robots.txt` | **Still `Allow: /`**: Next prerendered it at build, before `NEXTX_ENVIRONMENT` existed. |
| `/catalog/<audio id>` | **`/audio/<uuid>` with 200, no HTTP redirect**: the product page's `permanentRedirect` runs inside a streamed `<Suspense>`, so it becomes a client-side redirect (Next documents this). |
| `/audio/<unknown>` | **200 + `noindex`** (soft 404), same streaming contract. |

Fixed in the next commit, each verified against a production build (built without staging variables,
run with `NEXTX_ENVIRONMENT=staging`):

- Settings-level copy that mentions watches is cleared with an explicit `null` and reported; generic
  "Welkom/Welcome" hero titles are ignored at render time.
- `robots.txt` and the sitemap are request-time routes; staging returns `Disallow: /` and an empty sitemap.
- Exact single-hop **308** redirects for all 15 legacy audio ids, from both `/catalog/<id>` and
  `/audio/<id>`: **30 of 30** verified.
- All 19 known retired watch ids return a real **410** from both `/catalog/<id>` and `/audio/<id>`:
  **38 of 38** verified. They are excluded from the generic `/catalog/:id` redirect.
- `/catalog` is public and database-free so these rules apply before authentication.

**Residual (not fixed):** a product slug that does not exist returns `200` with `noindex`, not `404`,
because the lookup happens inside `<Suspense>`. Next documents that this is not indexable. A true 404
needs an existence check before the first `<Suspense>` on `/p/[slug]` and `/audio/[slug]`; that is a
page restructure under `cacheComponents` and should be done and measured separately.
Unknown non-shop paths redirect to `/login` (307), the dashboard's design for unauthenticated hosts.
