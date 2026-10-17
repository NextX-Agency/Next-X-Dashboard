import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { isStagingEnvironment, publicAppUrl } from '@/lib/env';

/**
 * Only the storefront is meant to be found. The root layout already sends
 * `noindex` on every route `(store)` doesn't override; this just tells
 * crawlers not to bother requesting the rest at all.
 */
const PRIVATE_PATHS = [
  '/dashboard',
  '/items',
  '/customers',
  '/sales',
  '/purchase-orders',
  '/inventory',
  '/ledger',
  '/expenses',
  '/owners',
  '/reports',
  '/settings',
  '/categories',
  '/suppliers',
  '/login',
  '/setup',
  '/design-system',
  '/api',
  '/cart',
  '/no-access',
];

/**
 * `connection()` makes this a request-time route. Without it Next prerenders robots.txt at
 * build, before NEXTX_ENVIRONMENT exists, and a staging host would publish the public rules.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  if (isStagingEnvironment()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const appUrl = publicAppUrl();

  return {
    rules: [{ userAgent: '*', allow: ['/', '/shop', '/products/'], disallow: PRIVATE_PATHS }],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
