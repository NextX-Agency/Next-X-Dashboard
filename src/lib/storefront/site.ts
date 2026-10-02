/**
 * The one canonical origin of the public shop.
 *
 * Vercel serves shop-nextx.com → www.shop-nextx.com (301), so the canonical host is www. Canonical
 * tags, the sitemap, robots and structured data must all agree with the host that actually answers,
 * otherwise Google sees a canonical that itself redirects. Override with NEXT_PUBLIC_SITE_URL only
 * when the primary domain changes.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shop-nextx.com').replace(/\/+$/, '')

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
