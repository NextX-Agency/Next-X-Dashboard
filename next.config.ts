import type { NextConfig } from 'next';
import { isPublicAppUrlAllowed, isSupabaseUrlAllowed } from './src/lib/env';

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
    return [
      // NextX sells audio only: the root opens the audio shop. Retired watch URLs
      // are not redirected; src/app/watches answers them with 410 Gone.
      { source: '/', destination: '/audio', permanent: false },
      { source: '/catalog', destination: '/audio', permanent: true },
      {
        source: '/catalog/:legacyItemId',
        destination: '/audio/:legacyItemId',
        permanent: true,
      },
    ];
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
