import { MetadataRoute } from 'next'

// Dynamic robots.txt generation for Next.js
// This will be automatically served at /robots.txt

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nextx.sr'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin/',
          '/login/',
          '/cms/',
          '/settings/',
          '/orders/',
          '/invoices/',
          '/reports/',
          '/stock/',
          '/items/',
          '/expenses/',
          '/wallets/',
          '/commissions/',
          '/reservations/',
          '/sales/',
          '/budgets/',
          '/exchange/',
          '/locations/',
          '/activity/',
          '/migrate/',
          '/recalculate-commissions/',
          '/upload-example/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin/',
          '/login/',
          '/cms/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
