import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { isStagingEnvironment, publicAppUrl } from '@/lib/env';

/**
 * Only the storefront is meant to be found. The root layout already sends
 * `noindex` on every route `(store)` doesn't override; this just tells
 * crawlers not to bother requesting the rest at all.
 */
const PRIVATE_PATHS = [
  // Staff dashboard.
  '/dashboard',
  '/items',
  '/customers',
  '/sales',
  '/orders',
  '/quotes',
  '/purchase-orders',
  '/inventory',
  '/bundles',
  '/price-lists',
  '/storefront',
  '/storefronts',
  '/reorder',
  '/activity',
  '/commissions',
  '/ledger',
  '/finance',
  '/wallets',
  '/obligations',
  '/reconciliation',
  '/exchange-rates',
  '/expenses',
  '/owners',
  '/reports',
  '/settings',
  '/categories',
  '/suppliers',
  '/invoices',
  // Sign-in and setup.
  '/login',
  '/setup',
  '/auth',
  '/no-access',
  '/design-system',
  '/preview',
  // Customer documents reached only through a private link, and the shopper's cart.
  '/d/',
  '/invoice',
  '/cart',
  '/api',
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
