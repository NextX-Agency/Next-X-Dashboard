import type { Metadata } from 'next'
import { Cormorant_Garamond, Jost } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-jost',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NextX Watches — Luxury Timepieces | Suriname',
  description: 'Discover our curated collection of luxury and premium watches. Authorized dealer in Suriname.',
  keywords: ['luxury watches', 'timepieces', 'Suriname', 'NextX', 'horloges'],
  openGraph: {
    title: 'NextX Watches — Luxury Timepieces',
    description: 'Curated luxury timepieces in Suriname.',
    type: 'website',
    siteName: 'NextX',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  alternates: {
    canonical: 'https://shop-nextx.com/watches',
  },
}

export default function WatchesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`watches-scope ${cormorant.variable} ${jost.variable}`}>
      {children}
    </div>
  )
}
