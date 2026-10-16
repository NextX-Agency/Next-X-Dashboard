import { and, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cache } from 'react';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents, CurrencyCode } from '@/lib/money';
import { normalizeStorefrontDomain } from '@/lib/storefront-domain';
import { availableUnits } from '@/lib/storefront-rules';
import { db } from '../db/client';
import { locations, priceListItems, priceLists, storefronts } from '../db/schema';
import { maybe, num, text } from '../queries/row';

export type StorefrontRecord = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: 'draft' | 'active' | 'inactive';
  defaultCurrency: CurrencyCode;
  defaultLocale: string;
  defaultPriceListId: string | null;
  description: string | null;
  logoUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  heroMobileImageUrl: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
};

export type StorefrontAvailability = {
  totalAvailable: number;
  locations: { locationId: string; locationName: string; available: number }[];
};

export type StorefrontPrice = {
  amountCents: Cents;
  currency: CurrencyCode;
  priceListId: string;
};

/** Normalize persisted domains and request hosts to one comparison form. */
function normalizeLocalSlug(hostname: string | null | undefined): string | null {
  const host = normalizeStorefrontDomain(hostname);
  if (!host?.endsWith('.localhost')) return null;
  const slug = host.slice(0, -'.localhost'.length);
  return slug && !slug.includes('.') ? slug : null;
}

function configuredPublicHost(): string | null {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) return null;
  try {
    return normalizeStorefrontDomain(new URL(value).hostname);
  } catch {
    return null;
  }
}

function mapStorefront(row: Record<string, string | null>): StorefrontRecord {
  return {
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    domain: maybe(row.domain),
    status: text(row.status, 'draft') as StorefrontRecord['status'],
    defaultCurrency: text(row.default_currency, 'USD') as CurrencyCode,
    defaultLocale: text(row.default_locale, 'en-SR'),
    defaultPriceListId: maybe(row.default_price_list_id),
    description: maybe(row.description),
    logoUrl: maybe(row.logo_url),
    heroTitle: maybe(row.hero_title),
    heroSubtitle: maybe(row.hero_subtitle),
    heroImageUrl: maybe(row.hero_image_url),
    heroMobileImageUrl: maybe(row.hero_mobile_image_url),
    allowPickup: row.allow_pickup === 'true',
    allowDelivery: row.allow_delivery === 'true',
  };
}

export async function getStorefrontBySlug(slug: string, activeOnly = false) {
  if (!isDatabaseConfigured()) return null;
  if (activeOnly && slug.trim().toLowerCase() === 'watches') return null;
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, slug, domain, status::text, default_currency::text,
           description, logo_url, hero_title, hero_subtitle, hero_image_url, hero_mobile_image_url,
           default_locale, default_price_list_id, allow_pickup::text, allow_delivery::text
      FROM storefronts
     WHERE slug = ${slug.trim().toLowerCase()}
       ${activeOnly ? sql`AND status = 'active'` : sql``}
     LIMIT 1
  `);
  return row ? mapStorefront(row) : null;
}

export async function getStorefrontById(id: string, activeOnly = false) {
  if (!isDatabaseConfigured()) return null;
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, slug, domain, status::text, default_currency::text,
           description, logo_url, hero_title, hero_subtitle, hero_image_url, hero_mobile_image_url,
           default_locale, default_price_list_id, allow_pickup::text, allow_delivery::text
      FROM storefronts
     WHERE id = ${id}
       ${activeOnly ? sql`AND status = 'active'` : sql``}
     LIMIT 1
  `);
  return row ? mapStorefront(row) : null;
}

export async function listActiveStorefronts() {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, slug, domain, status::text, default_currency::text,
           description, logo_url, hero_title, hero_subtitle, hero_image_url, hero_mobile_image_url,
           default_locale, default_price_list_id, allow_pickup::text, allow_delivery::text
      FROM storefronts
     WHERE status = 'active'
     ORDER BY name
  `);
  return rows.map(mapStorefront);
}

/** Resolve custom domains, localhost slug subdomains, and the default app host. */
export async function resolveStorefront(hostname: string | null | undefined) {
  if (!isDatabaseConfigured()) return null;
  const localSlug = normalizeLocalSlug(hostname);
  if (localSlug) return getStorefrontBySlug(localSlug, true);

  const domain = normalizeStorefrontDomain(hostname);
  if (domain) {
    const [row] = await db.execute<Record<string, string | null>>(sql`
      SELECT id, name, slug, domain, status::text, default_currency::text,
             description, logo_url, hero_title, hero_subtitle, hero_image_url, hero_mobile_image_url,
             default_locale, default_price_list_id, allow_pickup::text, allow_delivery::text
        FROM storefronts
       WHERE status = 'active' AND lower(domain) = ${domain}
       LIMIT 1
    `);
    if (row && row.slug !== 'watches') return mapStorefront(row);
  }

  const isLocal = domain === 'localhost' || domain === '127.0.0.1' || !domain;
  if (isLocal || domain === configuredPublicHost()) {
    const [row] = await db.execute<Record<string, string | null>>(sql`
      SELECT id, name, slug, domain, status::text, default_currency::text,
             description, logo_url, hero_title, hero_subtitle, hero_image_url, hero_mobile_image_url,
             default_locale, default_price_list_id, allow_pickup::text, allow_delivery::text
        FROM storefronts
       WHERE status = 'active' AND domain IS NULL
       ORDER BY (slug = 'main') DESC, name
       LIMIT 1
    `);
    return row ? mapStorefront(row) : null;
  }
  return null;
}

/** Request-scoped storefront context for the public App Router tree. */
export const getRequestStorefront = cache(async () => {
  const requestHeaders = await headers();
  const routeSlug = requestHeaders.get('x-nextx-storefront');
  if (routeSlug === 'audio') {
    return getStorefrontBySlug(routeSlug, true);
  }
  return resolveStorefront(requestHeaders.get('host'));
});

export async function getStorefrontAvailability(
  storefrontId: string,
  variantId: string,
): Promise<StorefrontAvailability> {
  if (!isDatabaseConfigured()) return { totalAvailable: 0, locations: [] };
  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT sl.location_id, l.name AS location_name,
           (
             COALESCE((
               SELECT SUM(m.quantity)
                 FROM inventory_movements m
                WHERE m.variant_id = ${variantId}
                  AND m.location_id = sl.location_id
             ), 0)
             - COALESCE((
               SELECT SUM(r.quantity)
                 FROM inventory_reservations r
                WHERE r.variant_id = ${variantId}
                  AND r.location_id = sl.location_id
                  AND r.status = 'active'
                  AND (r.expires_at IS NULL OR r.expires_at > now())
             ), 0)
           )::text AS available
      FROM storefront_locations sl
      JOIN locations l ON l.id = sl.location_id AND l.active
     WHERE sl.storefront_id = ${storefrontId} AND sl.active
     ORDER BY sl.priority, l.name
  `);
  const locationsResult = rows.map((row) => ({
    locationId: text(row.location_id),
    locationName: text(row.location_name),
    available: availableUnits(num(row.available), 0),
  }));
  return {
    totalAvailable: locationsResult.reduce((total, location) => total + location.available, 0),
    locations: locationsResult,
  };
}

export async function getStorefrontPrice(
  storefrontId: string,
  variantId: string,
): Promise<StorefrontPrice | null> {
  if (!isDatabaseConfigured()) return null;
  const [row] = await db
    .select({
      amountCents: priceListItems.amountCents,
      currency: priceLists.currency,
      priceListId: priceLists.id,
    })
    .from(storefronts)
    .innerJoin(priceLists, eq(priceLists.id, storefronts.defaultPriceListId))
    .innerJoin(
      priceListItems,
      and(
        eq(priceListItems.priceListId, priceLists.id),
        eq(priceListItems.variantId, variantId),
      ),
    )
    .where(and(eq(storefronts.id, storefrontId), eq(storefronts.status, 'active')))
    .limit(1);
  if (!row || row.amountCents <= 0) return null;
  return {
    amountCents: row.amountCents,
    currency: row.currency,
    priceListId: row.priceListId,
  };
}

export async function getStorefrontPrices(
  storefrontId: string,
  variantIds: string[],
): Promise<Map<string, StorefrontPrice>> {
  if (!isDatabaseConfigured() || variantIds.length === 0) return new Map();
  const rows = await db
    .select({
      variantId: priceListItems.variantId,
      amountCents: priceListItems.amountCents,
      currency: priceLists.currency,
      priceListId: priceLists.id,
    })
    .from(storefronts)
    .innerJoin(priceLists, eq(priceLists.id, storefronts.defaultPriceListId))
    .innerJoin(priceListItems, eq(priceListItems.priceListId, priceLists.id))
    .where(
      and(
        eq(storefronts.id, storefrontId),
        eq(storefronts.status, 'active'),
        sql`${priceListItems.variantId} IN ${sql.join(
          variantIds.map((id) => sql`${id}`),
          sql`, `,
        )}`,
        sql`${priceListItems.amountCents} > 0`,
      ),
    );
  return new Map(rows.map((row) => [row.variantId, { ...row, amountCents: row.amountCents }]));
}

export async function listStorefrontLocations(storefrontId: string) {
  if (!isDatabaseConfigured()) return [];
  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      active: locations.active,
    })
    .from(locations)
    .orderBy(locations.name);
  const allowed = await db.execute<Record<string, string | null>>(sql`
    SELECT location_id, active::text, priority::text
      FROM storefront_locations
     WHERE storefront_id = ${storefrontId}
     ORDER BY priority, location_id
  `);
  const allowedById = new Map(
    allowed.map((row) => [
      text(row.location_id),
      { active: row.active === 'true', priority: num(row.priority) },
    ]),
  );
  return rows.map((row) => ({
    ...row,
    assigned: allowedById.has(row.id),
    storefrontActive: allowedById.get(row.id)?.active ?? false,
    priority: allowedById.get(row.id)?.priority ?? 0,
  }));
}
