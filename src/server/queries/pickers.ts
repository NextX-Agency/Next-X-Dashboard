import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { type ResolvableImage, resolveVariantImage, thumbSrc } from '@/lib/product-images';
import { db } from '../db/client';
import { bool, maybe, num, text } from './row';

function parseStringArray(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP state,
 * not an outage. Only an ABSENT connection string returns empty; a failing
 * query still throws, because an empty dashboard must never be able to mean
 * "the database is down". See src/app/setup/page.tsx.
 */

/**
 * Option lists for form pickers.
 *
 * Each one carries the *decision-relevant* detail alongside the label, because
 * a picker that shows only names forces the person filling in the form to go
 * and look up the price or the stock level somewhere else. That round trip is
 * what makes people give up and reach for the spreadsheet instead.
 */

export type VariantOption = {
  id: string;
  sku: string;
  productName: string;
  variantName: string;
  listPriceCents: Cents;
  referenceCostCents: Cents;
  weightGrams: number;
  onHand: number;
  /** Total cost of the units on hand. Carried so the form can compute the
   *  cost of goods with exactly the arithmetic the server will use, rather
   *  than showing a margin that shifts by a cent on submit. */
  valueCents: Cents;
  /** Weighted-average cost per unit, in cents. Null when nothing is on hand. */
  unitCostCents: number | null;
  isActive: boolean;
};

export async function listVariantOptions(): Promise<VariantOption[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      v.id, v.sku, v.name AS variant_name, v.is_active::text AS is_active,
      v.list_price_cents::text, v.reference_cost_cents::text, v.weight_grams::text,
      p.name AS product_name,
      COALESCE(s.on_hand, 0)::text     AS on_hand,
      COALESCE(s.value_cents, 0)::text AS value_cents
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN v_stock_levels s ON s.variant_id = v.id
    WHERE p.status <> 'archived'
    ORDER BY p.name, v.position
  `);

  return rows.map((row) => {
    const onHand = num(row.on_hand);
    const valueCents = num(row.value_cents);
    return {
      id: text(row.id),
      sku: text(row.sku),
      productName: text(row.product_name),
      variantName: text(row.variant_name),
      listPriceCents: num(row.list_price_cents),
      referenceCostCents: num(row.reference_cost_cents),
      weightGrams: num(row.weight_grams),
      onHand,
      valueCents,
      unitCostCents: onHand > 0 ? valueCents / onHand : null,
      isActive: bool(row.is_active),
    };
  });
}

/**
 * A variant as the visual sale picker needs to show it: what it looks like, what it is, what it
 * costs and where it is. Everything past `VariantOption` is presentation; the sale form still
 * submits only a variant id, a quantity and a price, and the server decides the rest.
 */
export type SaleVariantOption = VariantOption & {
  productId: string;
  brandName: string | null;
  categoryName: string | null;
  modelNumber: string | null;
  /** Structured options such as { colour: "Black" }; empty for a single-option product. */
  attributes: Record<string, string>;
  /** Number of selectable options on the parent product, active ones only. */
  siblingCount: number;
  /** The resolved photograph for this exact variant (see src/lib/product-images.ts). Null: placeholder. */
  image: { url: string; alt: string | null } | null;
  /** Stock per location for this variant, only where something is held. */
  locations: { id: string; name: string; onHand: number }[];
};

function parseAttributes(value: string | null | undefined): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && !entry[0].startsWith('legacy'),
      ),
    );
  } catch {
    return {};
  }
}

export async function listSaleVariantOptions(): Promise<SaleVariantOption[]> {
  if (!isDatabaseConfigured()) return [];
  const [base, details, images, stock] = await Promise.all([
    listVariantOptions(),
    db.execute<Record<string, string | null>>(sql`
      SELECT v.id, v.product_id, v.attributes::text AS attributes,
             b.name AS brand_name, c.name AS category_name, p.model_number,
             (SELECT COUNT(*) FROM product_variants s
               WHERE s.product_id = v.product_id AND s.is_active)::text AS sibling_count
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status <> 'archived'
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT i.product_id, i.variant_id, i.url, i.thumb_url, i.width::text, i.height::text,
             i.alt, i.is_primary::text AS is_primary, i.position::text AS position
        FROM product_images i
        JOIN products p ON p.id = i.product_id
       WHERE p.status <> 'archived'
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT m.variant_id,
             COALESCE(m.location_id, (SELECT id FROM locations WHERE slug = 'main' LIMIT 1))
               AS location_id,
             SUM(m.quantity)::text AS on_hand
        FROM inventory_movements m
       GROUP BY 1, 2
      HAVING SUM(m.quantity) <> 0
    `),
  ]);
  const locationNames = new Map(
    (await listLocationOptions()).map((location) => [location.id, location.name]),
  );

  const detailById = new Map(details.map((row) => [text(row.id), row]));
  const imagesByProduct = new Map<string, ResolvableImage[]>();
  for (const row of images) {
    const list = imagesByProduct.get(text(row.product_id)) ?? [];
    list.push({
      url: text(row.url),
      thumbUrl: maybe(row.thumb_url),
      width: num(row.width),
      height: num(row.height),
      alt: maybe(row.alt),
      blurDataUrl: null,
      variantId: maybe(row.variant_id),
      isPrimary: bool(row.is_primary),
      position: num(row.position),
    });
    imagesByProduct.set(text(row.product_id), list);
  }
  const stockByVariant = new Map<string, { id: string; name: string; onHand: number }[]>();
  for (const row of stock) {
    const id = maybe(row.location_id);
    if (!id) continue;
    const list = stockByVariant.get(text(row.variant_id)) ?? [];
    list.push({
      id,
      name: locationNames.get(id) ?? 'Unknown location',
      onHand: num(row.on_hand),
    });
    stockByVariant.set(text(row.variant_id), list);
  }

  return base.map((variant) => {
    const detail = detailById.get(variant.id);
    const productId = text(detail?.product_id);
    const siblingCount = num(detail?.sibling_count, 1);
    const resolved = resolveVariantImage(
      imagesByProduct.get(productId) ?? [],
      variant.id,
      siblingCount,
    );
    return {
      ...variant,
      productId,
      brandName: maybe(detail?.brand_name),
      categoryName: maybe(detail?.category_name),
      modelNumber: maybe(detail?.model_number),
      attributes: parseAttributes(detail?.attributes),
      siblingCount,
      image: resolved.image
        ? { url: thumbSrc(resolved.image) ?? resolved.image.url, alt: resolved.image.alt }
        : null,
      locations: (stockByVariant.get(variant.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  });
}

export type Option = { id: string; label: string; hint?: string | null };

export type BundleComponentOption = {
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  sku: string;
  listPriceCents: Cents;
  landedUnitCostCents: Cents;
  onHand: number;
  weightGrams: number;
};

export type BundleOption = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  slug: string | null;
  summary: string | null;
  storefrontImageUrl: string | null;
  bestFor: string[];
  compatibilityNotes: string | null;
  nextlyTake: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  catalogPublished: boolean;
  featured: boolean;
  position: number;
  priceCents: Cents;
  availability: number;
  componentRetailCents: Cents;
  landedCostCents: Cents;
  components: BundleComponentOption[];
};

export async function listBundleOptions(): Promise<BundleOption[]> {
  if (!isDatabaseConfigured()) return [];
  const [headers, componentRows] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT id, sku, name, description, slug, summary, storefront_image_url,
             best_for, compatibility_notes, nextly_take, seo_title, seo_description,
             catalog_published::text, featured::text, position::text, price_cents::text
      FROM bundles WHERE is_active = true ORDER BY name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT bc.bundle_id, bc.variant_id, bc.quantity, bc.product_name, bc.variant_name,
        bc.sku, bc.weight_grams,
        v.list_price_cents::text,
        COALESCE(ROUND(s.value_cents::numeric / NULLIF(s.on_hand, 0)), v.reference_cost_cents, 0)::text AS landed_unit_cost_cents,
        COALESCE(s.on_hand, 0)::text AS on_hand
      FROM bundle_components bc
      JOIN product_variants v ON v.id = bc.variant_id
      LEFT JOIN v_stock_levels s ON s.variant_id = v.id
      ORDER BY bc.bundle_id, bc.position
    `),
  ]);
  const byBundle = new Map<string, BundleComponentOption[]>();
  for (const row of componentRows) {
    const component = {
      variantId: text(row.variant_id),
      quantity: num(row.quantity, 1),
      productName: text(row.product_name),
      variantName: text(row.variant_name),
      sku: text(row.sku),
      listPriceCents: num(row.list_price_cents),
      landedUnitCostCents: num(row.landed_unit_cost_cents),
      onHand: num(row.on_hand),
      weightGrams: num(row.weight_grams),
    };
    byBundle.set(text(row.bundle_id), [
      ...(byBundle.get(text(row.bundle_id)) ?? []),
      component,
    ]);
  }
  return headers.map((row) => {
    const components = byBundle.get(text(row.id)) ?? [];
    return {
      id: text(row.id),
      sku: text(row.sku),
      name: text(row.name),
      description: maybe(row.description),
      slug: maybe(row.slug),
      summary: maybe(row.summary),
      storefrontImageUrl: maybe(row.storefront_image_url),
      bestFor: parseStringArray(row.best_for),
      compatibilityNotes: maybe(row.compatibility_notes),
      nextlyTake: maybe(row.nextly_take),
      seoTitle: maybe(row.seo_title),
      seoDescription: maybe(row.seo_description),
      catalogPublished: bool(row.catalog_published),
      featured: bool(row.featured),
      position: num(row.position),
      priceCents: num(row.price_cents),
      components,
      availability: components.length
        ? Math.min(
            ...components.map((component) => Math.floor(component.onHand / component.quantity)),
          )
        : 0,
      componentRetailCents: components.reduce(
        (sum, component) => sum + component.quantity * component.listPriceCents,
        0,
      ),
      landedCostCents: components.reduce(
        (sum, component) => sum + component.quantity * component.landedUnitCostCents,
        0,
      ),
    };
  });
}

export async function listCustomerOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, code, phone FROM customers ORDER BY name
  `);

  return rows.map((row) => ({
    id: text(row.id),
    label: text(row.name),
    hint: maybe(row.phone) ?? text(row.code),
  }));
}

export type LocationOption = { id: string; name: string };

export async function listLocationOptions(): Promise<LocationOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(
    sql`SELECT id, name FROM locations WHERE active ORDER BY name`,
  );
  return rows.map((row) => ({ id: text(row.id), name: text(row.name) }));
}

export async function listSellerOptions(): Promise<(Option & { active: boolean })[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT s.id, s.name, s.active::text AS active, l.name AS location_name,
           s.default_rate_bps::text
      FROM sellers s
      LEFT JOIN locations l ON l.id = s.location_id
     ORDER BY s.active DESC, s.name
  `);
  return rows.map((row) => ({
    id: text(row.id),
    label: text(row.name),
    hint: `${row.location_name ? `${text(row.location_name)} · ` : ''}${(num(row.default_rate_bps) / 100).toFixed(2)}% default${text(row.active) === 'true' ? '' : ' · inactive'}`,
    active: bool(row.active),
  }));
}

export async function listCategoryOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name FROM categories ORDER BY position, name
  `);
  return rows.map((row) => ({ id: text(row.id), label: text(row.name) }));
}

export async function listBrandOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(
    sql`SELECT id, name FROM brands WHERE active ORDER BY name`,
  );
  return rows.map((row) => ({ id: text(row.id), label: text(row.name) }));
}

export async function listSupplierOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, kind::text AS kind FROM suppliers ORDER BY name
  `);
  return rows.map((row) => ({
    id: text(row.id),
    label: text(row.name),
    hint: maybe(row.kind),
  }));
}

export async function listExpenseCategoryOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name FROM expense_categories ORDER BY position, name
  `);
  return rows.map((row) => ({ id: text(row.id), label: text(row.name) }));
}

export async function listWalletOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, currency::text AS currency
      FROM wallets
     WHERE active = true
     ORDER BY currency, name
  `);
  return rows.map((row) => ({
    id: text(row.id),
    label: `${text(row.name)} (${text(row.currency)})`,
    hint: text(row.currency),
  }));
}

/** Principals only: the people an owner contribution or draw can belong to. */
export async function listPrincipalOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, full_name FROM members WHERE is_principal ORDER BY full_name
  `);
  return rows.map((row) => ({ id: text(row.id), label: text(row.full_name) }));
}

/** Orders that can still be received, for the receive dialog. */
export async function listOpenPurchaseOrders(): Promise<
  { id: string; number: string; supplierName: string | null; totalCents: Cents }[]
> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.number, s.name AS supplier_name,
      (COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i
                  WHERE i.purchase_order_id = p.id), 0)
       + p.tax_cents + p.card_fee_cents + p.delivery_cents
       + p.shipping_cents + p.shipping_tax_cents)::text AS total_cents
    FROM purchase_orders p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.status IN ('draft', 'ordered', 'shipped')
    ORDER BY p.ordered_at DESC NULLS LAST, p.number DESC
  `);

  return rows.map((row) => ({
    id: text(row.id),
    number: text(row.number),
    supplierName: maybe(row.supplier_name),
    totalCents: num(row.total_cents),
  }));
}
