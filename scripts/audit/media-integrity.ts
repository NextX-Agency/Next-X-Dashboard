/**
 * Media integrity audit for product and variant photographs. Read-only.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/audit/media-integrity.ts [--base https://shop.example] [--no-fetch] [--json]
 *
 * It reports, per product, what is wrong with the photographs the shop actually serves, so the owner can
 * decide what to reshoot. It never writes, never fabricates an image and never decides what a photograph
 * shows: pixel size, file type, file size, link health, duplication and assignment are measurable;
 * "is this the right product" and "is this a marketplace image" need a person looking at it.
 *
 * Findings use severities the same way the QA register does:
 *   P1  customer-visible defect (broken link, product with no photo, a variant would show the wrong one)
 *   P2  quality gap (small, oversized, unsupported format, missing alt, duplicate)
 */
import postgres from 'postgres';

type Row = {
  id: string;
  product_id: string;
  product_name: string;
  product_status: string;
  published: boolean;
  variant_id: string | null;
  variant_product_id: string | null;
  variant_name: string | null;
  url: string;
  thumb_url: string | null;
  blob_pathname: string;
  width: number;
  height: number;
  alt: string | null;
  is_primary: boolean;
  position: number;
  byte_size: string | null;
};

type Finding = { severity: 'P1' | 'P2'; product: string; code: string; detail: string };

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const MIN_EDGE = 960; // the shop shows photographs up to ~1,000 px wide on desktop
const WEAK_EDGE = 800;
const MAX_BYTES = 1_500_000;
const OK_TYPES = /\.(jpe?g|png|webp|avif)(\?|$)/i;

async function head(url: string): Promise<{ ok: boolean; status: number; type: string | null; bytes: number | null }> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const length = response.headers.get('content-length');
    return {
      ok: response.ok,
      status: response.status,
      type: response.headers.get('content-type'),
      bytes: length ? Number(length) : null,
    };
  } catch {
    return { ok: false, status: 0, type: null, bytes: null };
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL (read-only access is enough).');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const base = option('--base');
  const findings: Finding[] = [];

  const rows = await sql<Row[]>`
    SELECT i.id, i.product_id, p.name AS product_name, p.status::text AS product_status,
           p.catalog_published AS published, i.variant_id, v.product_id AS variant_product_id,
           v.name AS variant_name, i.url, i.thumb_url, i.blob_pathname, i.width, i.height, i.alt,
           i.is_primary, i.position, i.byte_size::text
      FROM product_images i
      JOIN products p ON p.id = i.product_id
      LEFT JOIN product_variants v ON v.id = i.variant_id
     ORDER BY p.name, i.position
  `;
  const products = await sql<
    { id: string; name: string; status: string; published: boolean; options: string }[]
  >`
    SELECT p.id, p.name, p.status::text AS status, p.catalog_published AS published,
           (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active)::text AS options
      FROM products p
     ORDER BY p.name
  `;
  const variants = await sql<{ id: string; product_id: string; name: string; sku: string }[]>`
    SELECT id, product_id, name, sku FROM product_variants WHERE is_active
  `;

  const byProduct = new Map<string, Row[]>();
  for (const row of rows) byProduct.set(row.product_id, [...(byProduct.get(row.product_id) ?? []), row]);

  // ---- per product
  for (const product of products) {
    if (product.status === 'archived') continue;
    const mine = byProduct.get(product.id) ?? [];
    const label = `${product.name}${product.published ? '' : ' (not published)'}`;
    if (mine.length === 0) {
      findings.push({
        severity: product.published ? 'P1' : 'P2',
        product: label,
        code: 'no-photo',
        detail: 'No photograph at all.',
      });
      continue;
    }
    const primaries = mine.filter((image) => image.is_primary);
    if (primaries.length !== 1) {
      findings.push({
        severity: 'P1',
        product: label,
        code: 'primary-count',
        detail: `${primaries.length} primary photographs (exactly one is expected).`,
      });
    }
    if (mine.length === 1) {
      findings.push({
        severity: 'P2',
        product: label,
        code: 'single-angle',
        detail: 'One photograph only; no second angle.',
      });
    }

    // Every active option of a multi-option product should have a photograph that is truly its own,
    // or at least a shared one. Otherwise the page shows a placeholder for it.
    const options = variants.filter((variant) => variant.product_id === product.id);
    if (options.length > 1) {
      const shared = mine.filter((image) => image.variant_id === null);
      for (const option of options) {
        const own = mine.filter((image) => image.variant_id === option.id);
        if (own.length === 0 && shared.length === 0) {
          findings.push({
            severity: 'P1',
            product: label,
            code: 'option-without-photo',
            detail: `Option "${option.name}" (${option.sku}) has no photograph and the product has no shared one: the page shows a placeholder.`,
          });
        } else if (own.length === 0) {
          findings.push({
            severity: 'P2',
            product: label,
            code: 'option-uses-shared',
            detail: `Option "${option.name}" (${option.sku}) has no photograph of its own; it shows the shared one.`,
          });
        }
      }
    }
  }

  // ---- per image
  const byUrl = new Map<string, Row[]>();
  const bySignature = new Map<string, Row[]>();
  for (const image of rows) {
    const label = `${image.product_name}${image.variant_name ? ` – ${image.variant_name}` : ''}`;
    if (image.variant_id && image.variant_product_id !== image.product_id) {
      findings.push({
        severity: 'P1',
        product: label,
        code: 'wrong-parent',
        detail: 'The photograph is pinned to a variant of a different product.',
      });
    }
    const shortest = Math.min(image.width, image.height);
    if (shortest < WEAK_EDGE) {
      findings.push({
        severity: 'P2',
        product: label,
        code: 'low-resolution',
        detail: `${image.width}×${image.height}px (under ${WEAK_EDGE}px on the short side); it will look soft on large screens.`,
      });
    } else if (shortest < MIN_EDGE) {
      findings.push({
        severity: 'P2',
        product: label,
        code: 'below-target',
        detail: `${image.width}×${image.height}px; the target is about 1,000px or more.`,
      });
    }
    const ratio = image.width / image.height;
    if (ratio > 1.3 || ratio < 0.77) {
      findings.push({
        severity: 'P2',
        product: label,
        code: 'aspect',
        detail: `${image.width}×${image.height}px is far from square; the product tile crops or letterboxes it.`,
      });
    }
    if (!OK_TYPES.test(image.url)) {
      findings.push({
        severity: 'P2',
        product: label,
        code: 'format',
        detail: `Unexpected file type in ${image.url}.`,
      });
    }
    if (/staging|token=|signed/i.test(image.url) || /nextly-product-staging/.test(image.blob_pathname)) {
      findings.push({
        severity: 'P1',
        product: label,
        code: 'private-url',
        detail: 'The public address points at a private or signed storage object.',
      });
    }
    if (image.byte_size && Number(image.byte_size) > MAX_BYTES) {
      findings.push({
        severity: 'P2',
        product: label,
        code: 'oversized',
        detail: `${(Number(image.byte_size) / 1_000_000).toFixed(1)} MB; the shop serves resized copies, but this is heavy to store and fetch.`,
      });
    }
    if (!image.alt || !image.alt.trim()) {
      findings.push({ severity: 'P2', product: label, code: 'no-alt', detail: 'No alternative text.' });
    }
    byUrl.set(image.url, [...(byUrl.get(image.url) ?? []), image]);
    const signature = `${image.width}x${image.height}:${image.byte_size ?? '?'}`;
    if (image.byte_size) bySignature.set(signature, [...(bySignature.get(signature) ?? []), image]);
  }
  for (const [address, list] of byUrl) {
    const owners = new Set(list.map((image) => image.product_id));
    if (list.length > 1) {
      findings.push({
        severity: 'P2',
        product: [...new Set(list.map((image) => image.product_name))].join(' / '),
        code: owners.size > 1 ? 'shared-across-products' : 'duplicate-row',
        detail: `The same file (${address}) is attached ${list.length} times${owners.size > 1 ? ' to different products' : ''}.`,
      });
    }
  }
  for (const [signature, list] of bySignature) {
    const owners = new Set(list.map((image) => image.product_id));
    if (owners.size > 1 && new Set(list.map((image) => image.url)).size > 1) {
      findings.push({
        severity: 'P2',
        product: [...new Set(list.map((image) => image.product_name))].join(' / '),
        code: 'identical-size',
        detail: `Different files with identical pixel size and byte size (${signature}); possible copies of one photograph.`,
      });
    }
  }

  // ---- link health
  if (!flag('--no-fetch')) {
    for (const image of rows) {
      const address = /^https?:/.test(image.url) ? image.url : base ? new URL(image.url, base).toString() : null;
      if (!address) continue;
      const result = await head(address);
      const label = `${image.product_name}${image.variant_name ? ` – ${image.variant_name}` : ''}`;
      if (!result.ok) {
        findings.push({
          severity: 'P1',
          product: label,
          code: 'broken-link',
          detail: `${address} answered ${result.status || 'no response'}.`,
        });
      } else if (result.type && !/^image\//.test(result.type)) {
        findings.push({
          severity: 'P1',
          product: label,
          code: 'not-an-image',
          detail: `${address} answered with ${result.type}.`,
        });
      }
    }
  }

  await sql.end();

  if (flag('--json')) {
    console.log(JSON.stringify({ images: rows.length, products: products.length, findings }, null, 2));
    return;
  }
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) grouped.set(finding.product, [...(grouped.get(finding.product) ?? []), finding]);
  console.log(`# Media integrity audit\n`);
  console.log(`Photographs: ${rows.length}; products (not archived): ${products.filter((p) => p.status !== 'archived').length}; findings: ${findings.length} (${findings.filter((f) => f.severity === 'P1').length} P1, ${findings.filter((f) => f.severity === 'P2').length} P2)\n`);
  for (const [product, list] of [...grouped].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`## ${product}`);
    for (const finding of list.sort((a, b) => a.severity.localeCompare(b.severity))) {
      console.log(`- **${finding.severity}** \`${finding.code}\`: ${finding.detail}`);
    }
    console.log('');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
