import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/storefront/site'

// Dynamic robots.txt generation for Next.js
// This will be automatically served at /robots.txt

const BASE_URL = SITE_URL

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
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
