import { revalidateTag } from 'next/cache';

/**
 * Cache tags for the public storefront's read-mostly data.
 *
 * Every `'use cache'` read model in `queries/catalog.ts`, `queries/reference.ts`
 * (public settings), `queries/overview.ts` (exchange rate) and
 * `services/storefront.ts` carries one of these tags. A tag is the coarse,
 * provable half of freshness: any staff mutation expires ALL of them (see
 * `invalidatePublicData`, called from the write-action middleware in
 * `server/actions/client.ts`). The short `cacheLife` below is the other half,
 * bounding staleness for changes the app does not make itself (a reservation
 * expiring, a migration script, a manual SQL fix).
 */
export const CACHE_TAGS = {
  /** The single `settings` row, public fields only. */
  settings: 'nextx:settings',
  /** Storefront records resolved by host, and their pickup locations. */
  storefronts: 'nextx:storefronts',
  /** Everything derived from products, variants, prices, images, stock and reservations. */
  catalog: 'nextx:catalog',
  /** The USD/SRD exchange-rate series. */
  fxRate: 'nextx:fx-rate',
} as const;

const ALL_TAGS: readonly string[] = Object.values(CACHE_TAGS);

/**
 * Reference data (settings, host -> storefront, pickup locations, exchange rate).
 * Changes are rare and every app write expires the tags, so this only bounds
 * out-of-band edits (a script, a manual SQL fix) to at most `expire` seconds.
 *
 * Every database-backed `'use cache'` read must also await `connection()` (or
 * `headers()`) in its uncached wrapper before calling the cached function: a cache
 * fill is awaited by `next build`'s prerender, and the build machine has no
 * database. `expire` under five minutes keeps entries out of the static shell
 * as well.
 */
export const REFERENCE_CACHE_LIFE = { stale: 30, revalidate: 60, expire: 240 } as const;

/**
 * Anything that depends on stock or price. Short on purpose: a reservation
 * expiring, or a stock change made outside the app, shows within seconds, and
 * every app write expires the tags immediately.
 */
export const LIVE_CACHE_LIFE = { stale: 30, revalidate: 30, expire: 120 } as const;

/**
 * Expire every public cache entry right now (no stale-while-revalidate). Safe
 * in Server Actions and Route Handlers; Next throws if it is called during a
 * render, which is the correct failure for a mutation that tried to run there.
 *
 * Must be called AFTER the database transaction has committed, otherwise a
 * concurrent request could re-fill the cache from the pre-commit snapshot.
 */
export function invalidatePublicData(): void {
  for (const tag of ALL_TAGS) revalidateTag(tag, { expire: 0 });
}
