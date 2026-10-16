import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { publicAppUrl } from '@/lib/env';
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
  const appUrl = new URL(publicAppUrl()).toString();
  const audioUrl = new URL('/audio', appUrl).toString();
  const storefronts = await listActiveStorefronts();
  const entries = await Promise.all(
    storefronts
      .filter((storefront) => {
        // Watches remain in historical operations data, but are no longer sold.
        if (storefront.slug === 'watches') return false;
        const origin = storefrontPublicOrigin(
          storefront.domain,
          appUrl,
          process.env.NEXTX_ENVIRONMENT === 'staging',
        );
        return origin !== appUrl || ['main', 'audio'].includes(storefront.slug);
      })
      .map(async (storefront) => {
        const origin = storefrontPublicOrigin(
          storefront.domain,
          appUrl,
          process.env.NEXTX_ENVIRONMENT === 'staging',
        );
        const products = await listCatalogProducts({ storefrontSlug: storefront.slug });
        const pagePath = storefrontPagePath(storefront.slug);
        return {
          pageUrl: new URL(pagePath, origin).toString(),
          products: products.map((product) => ({
            url: new URL(
              storefrontProductPath(storefront.slug, product.slug),
              origin,
            ).toString(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          })),
        };
      }),
  );

  return [
    { url: audioUrl, changeFrequency: 'daily', priority: 1 },
    ...entries
      .filter(({ pageUrl }) => pageUrl !== appUrl && pageUrl !== audioUrl)
      .map(({ pageUrl }) => ({
        url: pageUrl,
        changeFrequency: 'daily' as const,
        priority: 0.9,
      })),
    ...entries.flatMap(({ products }) => products),
  ];
}
