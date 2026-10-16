import type { NextConfig } from 'next';
import { isPublicAppUrlAllowed, isSupabaseUrlAllowed } from './src/lib/env';
import { LEGACY_AUDIO_REDIRECTS, LEGACY_RETIRED_WATCH_IDS } from './src/lib/legacy-url-map';

assertProductionBuildEnvironment();

const nextConfig: NextConfig = {
  output: 'standalone',
  // Everything is dynamic unless explicitly marked `'use cache'`, and nothing
  // is: this dashboard's figures are live, every write invalidates them, and
  // caching them made `next build` reach for the database, which turned a
  // transient connection problem into a failed deploy. Kept on for the
  // Partial Prerendering it gives the public routes, and because dynamic by
  // default is the correct posture for a set of books.
  cacheComponents: true,

  // Automatic memoization. Costs build time, buys us render time on the
  // chart-heavy Overview route.
  reactCompiler: true,

  typedRoutes: true,

  async redirects() {
    // Retired watch ids are excluded from the generic rule so the rewrite below can
    // answer them with 410 instead of a redirect chain that ends in a 404.
    const retired = LEGACY_RETIRED_WATCH_IDS.join('|');
    return [
      // NextX sells audio only: the root opens the audio shop. Retired watch URLs
      // are not redirected; src/app/watches answers them with 410 Gone.
      { source: '/', destination: '/audio', permanent: false },
      // Exact, single-hop permanent redirects for the legacy audio products.
      ...LEGACY_AUDIO_REDIRECTS.flatMap(([id, slug]) => [
        { source: `/catalog/${id}`, destination: `/audio/${slug}`, permanent: true },
        { source: `/audio/${id}`, destination: `/audio/${slug}`, permanent: true },
      ]),
      { source: '/catalog', destination: '/audio', permanent: true },
      {
        source: `/catalog/:legacyItemId((?!(?:${retired})$)[^/]+)`,
        destination: '/audio/:legacyItemId',
        permanent: true,
      },
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

  images: {
    // Only self-hosted Storage is allowed for public catalog media.
    // `images.domains` is deprecated in Next 16.
    remotePatterns: supabaseStorageImagePattern(),
    formats: ['image/avif', 'image/webp'],
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
