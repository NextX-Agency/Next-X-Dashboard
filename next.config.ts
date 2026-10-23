import type { NextConfig } from 'next';
import { isPublicAppUrlAllowed, isSupabaseUrlAllowed } from './src/lib/env';
import { LEGACY_AUDIO_REDIRECTS, LEGACY_RETIRED_WATCH_IDS } from './src/lib/legacy-url-map';

assertProductionBuildEnvironment();

const isProduction = process.env.NODE_ENV === 'production';

// Response headers for every route. Production only: `next dev` tooling should not be
// fenced by them.
//
// There is deliberately NO script/style Content-Security-Policy. Next.js renders
// inline bootstrap scripts and the style system emits inline styles; a strict
// `script-src` needs per-request nonces, which would force every route fully
// dynamic and defeat Partial Prerendering. The CSP below only adds the
// directives that cannot break those inline scripts: framing, `<base>` and plugins.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  },
  // Honoured only over HTTPS (Pangolin terminates TLS); no includeSubDomains/preload
  // so the Supabase and Coolify sibling hostnames are not affected by this app.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
] as const;

const nextConfig: NextConfig = {
  output: 'standalone',
  // The framework's own `X-Powered-By: Next.js` header tells scanners what to aim at.
  poweredByHeader: false,
  // gzip of HTML/RSC/JSON is on by default; stated so nobody turns it off, and so it is
  // obvious it must be switched off if the reverse proxy ever starts compressing instead.
  compress: true,
  // Everything is dynamic unless explicitly marked `'use cache'`. The dashboard's
  // figures are live and never cached. The only cached reads are the public
  // storefront's read-mostly models (settings, host -> storefront, catalogue,
  // exchange rate; see `server/queries/cache-tags.ts`): every one is expired by any
  // staff mutation and bounded by a sub-5-minute lifetime.
  //
  // Load-bearing: a `'use cache'` fill IS awaited while `next build` prerenders, and
  // the build machine has no database (the Dockerfile builds against a placeholder
  // URL), so a database-backed cached read would fail the build ("getaddrinfo
  // ENOTFOUND supavisor"). Each such read therefore awaits `connection()` (or
  // `headers()`) in its uncached wrapper first, which defers it to request time.
  // Keep that line when adding another cached read.
  cacheComponents: true,

  // Automatic memoization. Costs build time, buys us render time on the
  // chart-heavy Overview route.
  reactCompiler: true,

  typedRoutes: true,

  async redirects() {
    // Retired watch ids are excluded from the generic rules so the rewrite below can
    // answer them with 410 instead of a redirect chain that ends in a 404.
    const retired = LEGACY_RETIRED_WATCH_IDS.join('|');
    // Every rule is a single permanent hop to the canonical URL (docs/NEXTX_URL_MIGRATION.md).
    return [
      // Exact legacy audio products go straight to their canonical slug.
      ...LEGACY_AUDIO_REDIRECTS.flatMap(([id, slug]) => [
        { source: `/catalog/${id}`, destination: `/products/${slug}`, permanent: true },
        { source: `/audio/${id}`, destination: `/products/${slug}`, permanent: true },
      ]),
      { source: '/catalog', destination: '/shop', permanent: true },
      { source: '/audio', destination: '/shop', permanent: true },
      { source: '/audio/cart', destination: '/cart', permanent: true },
      { source: '/audio/setups/:slug', destination: '/setups/:slug', permanent: true },
      {
        source: `/catalog/:legacyItemId((?!(?:${retired})$)[^/]+)`,
        destination: '/products/:legacyItemId',
        permanent: true,
      },
      {
        source: `/audio/:slug((?!(?:cart|${retired})$)[^/]+)`,
        destination: '/products/:slug',
        permanent: true,
      },
      { source: '/p/:slug', destination: '/products/:slug', permanent: true },
      // `/products` itself is not a public page; the catalogue lives at /shop.
      { source: '/products', destination: '/shop', permanent: true },
    ];
  },

  async rewrites() {
    // Legacy watch product URLs: a real 410 (the route handler in src/app/watches).
    return {
      beforeFiles: LEGACY_RETIRED_WATCH_IDS.flatMap((id) => [
        { source: `/catalog/${id}`, destination: '/watches/retired' },
        { source: `/audio/${id}`, destination: '/watches/retired' },
      ]),
      afterFiles: [],
      fallback: [],
    };
  },

  experimental: {
    turbopackFileSystemCacheForDev: true,
  },

  async headers() {
    if (!isProduction) return [];
    return [
      { source: '/:path*', headers: [...SECURITY_HEADERS] },
      {
        // Unversioned files copied from `public/` (logos, hero art, favicon): short enough that
        // replacing one is visible within a day, long enough that a returning visitor does not
        // revalidate every request. `/_next/static` is fingerprinted and already
        // `immutable`; `/_next/image` output is governed by `images.minimumCacheTTL`.
        source: '/:file([^/]+\\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?))',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },

  images: {
    // Only self-hosted Storage is allowed for public catalog media.
    // `images.domains` is deprecated in Next 16.
    remotePatterns: supabaseStorageImagePattern(),
    // WebP only. AVIF encodes several times slower than WebP in sharp; on a shared VPS (the
    // Supabase stack runs on the same host) every cold product photo would otherwise pay
    // that CPU cost once per width, and the optimised cache is wiped on each deploy unless
    // `.next/cache` is a volume. WebP is ~20% larger than AVIF at the same quality: the right
    // trade here.
    formats: ['image/webp'],
    // Product photographs are replaced by uploading a new file (a new storage path), never
    // edited in place, so an optimised copy can be kept a month instead of the 4 hour
    // default. Fewer revalidation fetches back to Supabase Storage.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    // The default is half the free disk at start-up. The optimised copies live on the same host as
    // the database and Storage volumes, so cap them; least-recently-used files go first.
    maximumDiskCacheSize: 2_000_000_000,
    // Every extra width is another encode on first request. Nothing on the shop is shown wider
    // than ~1200 CSS px except the full-bleed hero; 2048 and 3840 only multiply the work.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
  },
};

function supabaseStorageImagePattern(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) return [];
  try {
    const url = new URL(rawUrl);
    return [
      {
        protocol: url.protocol.slice(0, -1) as 'http' | 'https',
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: '/storage/v1/object/public/nextly-product-images/**',
      },
    ];
  } catch {
    return [];
  }
}

function assertProductionBuildEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !isSupabaseUrlAllowed(supabaseUrl)) {
    throw new Error(
      'Production images must be built with the HTTPS API/Auth/Storage URL of the self-hosted Supabase stack.',
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    throw new Error(
      'Production image builds require the self-hosted Supabase publishable key.',
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl || !isPublicAppUrlAllowed(appUrl)) {
    throw new Error('Production image builds require the HTTPS NextX application URL.');
  }
}

export default nextConfig;
