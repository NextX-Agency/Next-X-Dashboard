import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CurrencyProvider } from "@/lib/CurrencyContext";
import { AuthProvider } from "@/lib/AuthContext";
import { LayoutWrapper } from "@/components/LayoutWrapper";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nextx.sr'

export const metadata: Metadata = {
  // Primary SEO - Optimized for "NextX Suriname"
  title: {
    default: "NextX Suriname | Premium Audio & In-Ear Monitors Shop",
    template: "%s | NextX Suriname"
  },
  description: "NextX Suriname - Your trusted source for premium in-ear monitors, KZ earphones, and audio accessories in Suriname. Local pickup in Commewijne, easy WhatsApp ordering. Shop quality audio gear today!",
  keywords: [
    "NextX Suriname",
    "NextX",
    "audio shop Suriname",
    "in-ear monitors Suriname",
    "IEM Suriname",
    "KZ earphones Suriname",
    "headphones Suriname",
    "audio accessories Suriname",
    "buy earphones Suriname",
    "earbuds Suriname",
    "audio gear Commewijne",
    "WhatsApp order Suriname"
  ],
  
  // Branding
  applicationName: "NextX Suriname",
  authors: [{ name: "NextX Suriname" }],
  creator: "NextX Suriname",
  publisher: "NextX Suriname",
  
  // Indexing & Crawling
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  
  // Canonical & Alternates
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: '/',
    languages: {
      'nl-SR': '/',
      'en-SR': '/',
    },
  },
  
  // Open Graph - Social Sharing
  openGraph: {
    type: 'website',
    locale: 'nl_SR',
    alternateLocale: 'en_SR',
    url: BASE_URL,
    siteName: 'NextX Suriname',
    title: 'NextX Suriname | Premium Audio & In-Ear Monitors Shop',
    description: 'NextX Suriname - Your trusted source for premium in-ear monitors, KZ earphones, and audio accessories in Suriname. Local pickup, WhatsApp ordering.',
    images: [
      {
        url: '/nextx-logo-light.png',
        width: 1200,
        height: 630,
        alt: 'NextX Suriname - Premium Audio Shop',
        type: 'image/png',
      },
    ],
  },
  
  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'NextX Suriname | Premium Audio & In-Ear Monitors',
    description: 'Your trusted source for premium in-ear monitors and audio accessories in Suriname. Local pickup, WhatsApp ordering.',
    images: ['/nextx-logo-light.png'],
    creator: '@nextxsuriname',
    site: '@nextxsuriname',
  },
  
  // Icons
  icons: {
    icon: '/favicon.ico',
    apple: '/nextx-logo-light.png',
    shortcut: '/favicon.ico',
  },
  
  // Verification (add your verification codes)
  verification: {
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },
  
  // Category
  category: 'E-commerce',
  
  // Additional meta
  other: {
    'geo.region': 'SR',
    'geo.placename': 'Suriname',
    'geo.position': '5.8664;-55.1668',
    'ICBM': '5.8664, -55.1668',
    'og:locale:alternate': 'en_SR',
    'format-detection': 'telephone=no',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#141c2e' },
  ],
}

// Organization Schema for Google Knowledge Panel
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${BASE_URL}/#organization`,
  name: 'NextX Suriname',
  alternateName: 'NextX',
  url: BASE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${BASE_URL}/nextx-logo-light.png`,
    width: 512,
    height: 512,
  },
  image: `${BASE_URL}/nextx-logo-light.png`,
  description: 'NextX Suriname - Premium in-ear monitors and audio accessories shop in Suriname',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Commewijne',
    addressRegion: 'Commewijne',
    addressCountry: 'SR',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: '5.8664',
    longitude: '-55.1668',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    availableLanguage: ['Dutch', 'English'],
  },
  sameAs: [],
  areaServed: {
    '@type': 'Country',
    name: 'Suriname',
  },
}

// WebSite Schema for Sitelinks Search Box
const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${BASE_URL}/#website`,
  name: 'NextX Suriname',
  alternateName: 'NextX',
  url: BASE_URL,
  description: 'Premium in-ear monitors and audio accessories in Suriname',
  publisher: {
    '@id': `${BASE_URL}/#organization`,
  },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${BASE_URL}/catalog?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  inLanguage: ['nl', 'en'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" dir="ltr">
      <head>
        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* DNS Prefetch for faster loading */}
        <link rel="dns-prefetch" href="//wa.me" />
        
        {/* Organization Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        
        {/* WebSite Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <CurrencyProvider>
            <LayoutWrapper>
              {children}
            </LayoutWrapper>
          </CurrencyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

