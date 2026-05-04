import type { Metadata } from 'next'
import BrandPortal from '@/components/BrandPortal'

export const metadata: Metadata = {
  title: 'NextX — Premium Audio & Luxury Watches | Suriname',
  description: 'NextX biedt premium audiophile gear en curated luxury timepieces in Suriname.',
  openGraph: {
    title: 'NextX',
    description: 'NextX — Premium Audio & Luxury Watches',
    images: [{ url: '/og-image.png' }],
  },
}

export default function HomePage() {
  return <BrandPortal />
}
