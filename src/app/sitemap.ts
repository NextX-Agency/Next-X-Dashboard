import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { isStagingEnvironment, publicAppUrl } from '@/lib/env';
import {
  storefrontPagePath,
  storefrontProductPath,
  storefrontPublicOrigin,
} from '@/lib/storefront-domain';
import { listCatalogProducts } from '@/server/queries/catalog';
import { listActiveStorefronts } from '@/server/services/storefront';

/**
 * `export const dynamic = 'force-dynamic'` is rejected outright under
 * `cacheComponents` (see next.config.ts) — but unlike a page, this file has
 * no Suspense boundary for the framework to defer behind, so without
 * something forcing the issue it would run at `next build` and reach the
 * database. `connection()` is that something: the same dynamic-data-access
 * marker used on the list pages (`lib/list-params.ts`'s callers).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  // Staging must not advertise URLs to crawlers; robots.txt disallows it too.
  if (isStagingEnvironment()) return [];
  const appUrl = new URL(publicAppUrl()).toString();
  const storefronts = (await listActiveStorefronts()).filter(
    // Watches remain in historical operations data, but are not published.
    (storefront) => storefront.slug !== 'watches',
  );
  // Only a storefront with its own domain is served from another origin; the rest share the app host.
  const origins = new Map<string, string>();
  for (const storefront of storefronts) {
    const origin = storefrontPublicOrigin(storefront.domain, appUrl, false);
    if (!origins.has(origin)) origins.set(origin, storefront.slug);
  }

  const entries = await Promise.all(
    [...origins].map(async ([origin, slug]) => {
      const products = await listCatalogProducts({ storefrontSlug: slug });
      return [
        {
          url: new URL('/', origin).toString(),
          changeFrequency: 'daily' as const,
          priority: 1,
        },
        {
          url: new URL(storefrontPagePath(slug), origin).toString(),
          changeFrequency: 'daily' as const,
          priority: 0.9,
        },
        {
          url: new URL(storefrontPagePath(slug, 'faq'), origin).toString(),
          changeFrequency: 'monthly' as const,
          priority: 0.3,
        },
        ...products.map((product) => ({
          url: new URL(storefrontProductPath(slug, product.slug), origin).toString(),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        })),
      ];
    }),
  );
  return entries.flat();
}
