# Media pipeline (Supabase Storage)

Product images upload to a private staging bucket. The server checks the actual
file bytes, creates two derivatives with Sharp, writes public derivatives to a
separate bucket, and records their storage keys in `product_images`.

## Upload sequence

1. The signed-in dashboard asks a server action for an upload ticket.
2. The server checks write access and confirms the product exists, then issues
   a short-lived signed upload token scoped to a random path under
   `products/<product-id>/` in `nextly-product-staging`.
3. The browser uploads directly to Supabase Storage. File bytes do not pass
   through a Next.js Server Action.
4. The browser calls the finalize action with the path. The server downloads
   that object, checks its size and decoded format, limits image decoding to 40
   megapixels, and derives the display and thumbnail files.
5. The server uploads derivatives into the public `nextly-product-images`
   bucket, stores the public URLs and object keys, then removes the temporary
   upload. The upload path is a unique retry key.

The browser MIME and size checks are only for fast feedback. The server checks
the decoded format and byte size before accepting an image. The private staging
bucket also limits upload size and MIME type; signed-in users do not receive the
Storage secret key.

| Purpose | Output | Width | Format | Quality |
|---|---|---:|---|---:|
| Product display | Public product-images bucket | 1600 px maximum | AVIF | 75 |
| Grid thumbnail | Public product-images bucket | 400 px maximum | WebP | 75 |

Both outputs preserve aspect ratio and are not enlarged. Display dimensions,
alt text, purpose, variant assignment, order, primary-image status and byte size
are stored in `product_images`. Storage object keys are kept so deletion can
remove both derivatives. Existing externally hosted images are not deleted by
this pipeline.

## Buckets and access

Migrations `0034_self_hosted_media` and `0039_expense_receipt_storage` create or
update these buckets when the Supabase Storage schema exists. Migration 0039
also adds the dedicated expense receipt-reference field.

| Bucket | Public reads | Upload | Limits |
|---|---|---|---|
| `nextly-product-staging` | No | Short-lived signed token issued after server authorization | 10 MB; JPEG, PNG, WebP, AVIF |
| `nextly-product-images` | Yes | Server-side derivative upload only | 10 MB; AVIF and WebP |
| `nextly-expense-receipts` | No | Short-lived signed token issued after server authorization | 10 MB; PDF, JPEG, PNG, WebP |

Local PostgreSQL rehearsal has no Supabase Storage schema; the migration skips
bucket provisioning there. Before deploying to a Supabase environment, confirm
all three buckets exist with these settings and the API URL is reachable over HTTPS.
The public bucket contains only catalog images. Never place receipts, invoices,
or private customer files there.

Expense receipt uploads use direct-to-Storage signed uploads. The server
generates `expenses/<expense-id>/<random-v4-id>` paths, verifies both that path
and the downloaded file signature before saving the key, and keeps
`receipt_url` empty. Authorized members receive a one-minute signed download
link; only owners can remove receipts. Storage deletion occurs after the
database reference is cleared, and a failed delete restores the reference when
no replacement upload has appeared. Receipt objects belong in the separate
Storage backup and restore set with the product media objects.

The server-side `SUPABASE_SECRET_KEY` bypasses Storage RLS and must remain a
runtime secret. The public Supabase URL and publishable key are safe for the
browser. Supabase Storage uploads use a signed upload token, not the secret key.

## Next.js image configuration

`next.config.ts` permits the configured Supabase origin and the public
`nextly-product-images` path. Vercel Blob is not an allowed production image
origin. `NEXT_PUBLIC_SUPABASE_URL` must be available as a Docker build argument
so the allow-list is embedded in the standalone Next.js image. Use the same
public API origin at runtime.

## Legacy media migration

The migration tooling collects product photos and image-valued logo/hero
settings from a read-only source snapshot, downloads only from the verified
legacy Blob host, validates and re-encodes each asset, uploads public
derivatives to the self-hosted `nextly-product-images` bucket, and emits a
source-URL map for the dry-run/importer to create `product_images` rows. Store
logo and hero settings are translated through the same map. Unmapped external
image URLs fail the import plan instead of being retained.

Media preparation writes to staging Storage. It requires an HTTPS self-hosted
target matching `NEXTX_STAGING_HOST`, explicit staging confirmation, and a
readiness report marking all ten required gates `PASS`. The report must match
the exact current Git working-tree fingerprint; code changes invalidate it.
The media-preparation command has not been run because the staging stack and
the required readiness gates are not yet complete. Legacy Blob objects remain
untouched.
