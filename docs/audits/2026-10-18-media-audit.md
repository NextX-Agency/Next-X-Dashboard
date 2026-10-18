# Product photograph audit, 18 Oct 2026

What it covers: the 15 published audio products. The 19 archived watch products are retired and were not audited.
Nothing was changed and no photograph was invented, replaced or re-cropped.

## How it was measured

| Check | Source | Notes |
|---|---|---|
| Pixel size, type, order, primary, variant assignment, alt text, duplicates | `scripts/audit/media-integrity.ts` against the local rehearsal database, which is loaded with the same 15 products and the pixel sizes the live shop showed on 2026-10-17 (`scripts/rehearsal/visual-seed.sql`) | **Not run against the staging database**: I did not use the VPS password pasted into the chat (a password typed to authenticate stays the owner's to enter), so the real `product_images` rows (byte sizes, alt text, `variant_id`) were not read directly. Run the script on the VPS to close this: `DATABASE_URL=… pnpm exec tsx scripts/audit/media-integrity.ts --base https://nextx.nextxagency.com` |
| Delivery | The signed-in staging browser session, 15 requests to the public image URLs behind `https://nextx.nextxagency.com/shop` | HTTP 200, `image/avif`, 17 KB to 64 KB each, all from the **public** bucket path `nextly-product-images/legacy/<hash>/1600.avif`. No private staging object is referenced. The shop's optimised copy is within a few KB of the original |
| What the photograph shows | Looking at the staging shop grid | Every photograph matches its product name. Whether a photograph is a marketplace image you do not hold rights to, or the right model, needs you |

## Result

Zero P1 findings: no broken link, no product without a photograph, no variant-pinned photograph on the wrong
product, no private storage URL. No product has more than one option today, so variant assignment is untested
on real data (see the variant-fixture tests for the synthetic proof).

### Products that need better photographs (P2)

Resolution is the pixel size of the stored file; the shop shows photographs up to about 1,000 px wide on a
desktop and up to 1,600 px in the enlarged view.

| Product | Stored size | Issue | Priority |
|---|---|---|---|
| KZ Vader | 500 × 500 | Smallest photograph; soft when enlarged | Reshoot first |
| KZ EDX PRO | 640 × 640 | Low resolution | Reshoot |
| KZ EDX Pro X | 640 × 640 | Low resolution | Reshoot |
| ESSAGER 1m Aux | 720 × 720 | Low resolution | Reshoot |
| ESSAGER 2m Aux | 720 × 720 | Low resolution, and **the same picture as the 1m** (identical file size on staging, 23,702 bytes each): a customer cannot see the difference between the two products | Reshoot with the length visible |
| M-Vave SWS12 | 894 × 837 | Below the 1,000 px target; not square | Improve |
| KZ AS16 Pro X | 894 × 906 | Below target | Improve |
| KZ ZS10 PRO X | 863 × 1000 | Below target | Improve |
| KZ IEM 3.5mm Cable | 1000 × 927 | Slightly below target; not square | Optional |

Fine on resolution: KZ ZSN Pro 2 (1160), KZ Elliptical Pouch (1160), KZ Carol, ESSAGER Type-C DAC (1000), KZ AZ09 and KZ Castor PRO (998 × 1000).

### All 15 products (P2)

- **One photograph each, no second angle.** A customer cannot see the connector, the nozzle or the box.
- Several look like marketplace product images. Confirm you hold the rights before keeping them.
- Three sold-out products (KZ Vader, KZ AZ09, KZ Castor PRO) are shown dimmed on the shop, by design.

### Not measured

- File size on disk of the original uploads (`byte_size` is empty in the local copy). The AVIF derivatives are small.
- Alt text of the real rows. The shop falls back to the product name.
- Cropping on the real files (the tile letterboxes rather than crops, so a non-square image is never cut).

## When options arrive

Any option of a multi-option product with no photograph of its own and no shared photograph will show the
placeholder "No photo of the <option> option yet." and appears in this audit as **P1 `option-without-photo`**.
Shoot or assign photographs before publishing a new option.
