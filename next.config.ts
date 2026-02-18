import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization - DO NOT set unoptimized globally; handled per-component
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        // Allow localhost blob previews in dev
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
    // Enable modern image formats for maximum compression
    formats: ['image/avif', 'image/webp'],
    // Standard responsive breakpoints
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Aggressive caching: images cached for 1 year
    minimumCacheTTL: 31536000,
    // Allow SVG (logo)
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Compression for better performance
  compress: true,
  
  // Power optimizations
  poweredByHeader: false,
  
  // Strict mode for better React patterns
  reactStrictMode: true,

  // Experimental options for faster builds
  experimental: {
    // Optimize package imports to reduce bundle size
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    // Increase image proxy timeout from default 7s to 15s for Vercel blob storage
    proxyTimeout: 15_000,
  },
  
  // Headers for SEO, security and caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Cache static assets aggressively (1 year, immutable)
        source: '/(.*)\\.(ico|png|jpg|jpeg|gif|webp|avif|svg|woff|woff2|ttf|otf)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // API catalog: short cache to keep products fresh but reduce DB hits
        source: '/api/catalog',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=120' },
        ],
      },
      {
        source: '/catalog/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Robots-Tag', value: 'index, follow, max-image-preview:large, max-snippet:-1' },
        ],
      },
    ];
  },
  
  async redirects() {
    return [];
  },
};

export default nextConfig;
