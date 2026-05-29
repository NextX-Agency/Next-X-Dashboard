'use client'

import { memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Instagram, MessageCircle } from 'lucide-react'

interface WatchesFooterProps {
  whatsappNumber?: string
  storeAddress?: string
  storeDescription?: string
}

function WatchesFooterComponent({
  whatsappNumber = '5978555555',
  storeAddress = 'Paramaribo, Suriname',
  storeDescription = 'Curated luxury timepieces from NextX — delivering exceptional watches with personal service and expertise.',
}: WatchesFooterProps) {
  const year = new Date().getFullYear()

  const columns = [
    {
      heading: 'Catalog',
      links: [
        { label: 'All Watches', href: '/watches' },
        { label: 'New Arrivals', href: '/watches#new' },
        { label: 'Collections', href: '/watches#collections' },
      ],
    },
    {
      heading: 'NextX',
      links: [
        { label: 'Audio', href: '/audio' },
        { label: 'Portal', href: '/' },
      ],
    },
    {
      heading: 'Contact',
      links: [
        {
          label: 'WhatsApp',
          href: `https://wa.me/${whatsappNumber}`,
          external: true,
        },
        {
          label: '@nextxwatches',
          href: 'https://instagram.com/nextxwatches',
          external: true,
        },
        {
          label: storeAddress,
          href: '#',
          isText: true,
        },
      ],
    },
  ]

  return (
    <footer
      style={{
        background: 'var(--w-surface)',
        borderTop: '1px solid var(--w-border-gold)',
        fontFamily: 'var(--font-jost, system-ui, sans-serif)',
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 py-14 sm:py-16">
        {/* Top: brand + columns */}
        <div className="grid grid-cols-1 gap-10 mb-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <Link href="/watches" className="inline-flex flex-col items-start mb-5">
              <Image
                src="/nextx-logo-dark.png"
                alt="NextX company logo"
                width={136}
                height={58}
                sizes="(max-width: 640px) 120px, 136px"
                quality={100}
                className="w-[120px] object-contain sm:w-[136px]"
              />
              <span
                className="mt-1.5 text-[8px] font-light tracking-[0.38em] uppercase"
                style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                Watches
              </span>
            </Link>
            <p className="text-xs font-light leading-relaxed" style={{ color: 'var(--w-muted)' }}>
              {storeDescription}
            </p>

            {/* Social links */}
            <div className="flex gap-4 mt-6">
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 transition-opacity hover:opacity-60"
                style={{ color: 'var(--w-muted)' }}
                aria-label="WhatsApp"
              >
                <MessageCircle size={18} strokeWidth={1.5} />
              </a>
              <a
                href="https://instagram.com/nextxwatches"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 transition-opacity hover:opacity-60"
                style={{ color: 'var(--w-muted)' }}
                aria-label="Instagram"
              >
                <Instagram size={18} strokeWidth={1.5} />
              </a>
            </div>
          </div>

          {/* Nav columns */}
          {columns.map(col => (
            <div key={col.heading}>
              <h3
                className="text-[10px] font-light tracking-[0.3em] uppercase mb-5"
                style={{ color: 'var(--w-gold)' }}
              >
                {col.heading}
              </h3>
              <ul className="flex flex-col gap-3.5">
                {col.links.map(link => {
                  const isText = (link as { isText?: boolean }).isText
                  if (isText) {
                    return (
                      <li key={link.label}>
                        <span
                          className="text-sm font-light"
                          style={{ color: 'var(--w-cream-2)' }}
                        >
                          {link.label}
                        </span>
                      </li>
                    )
                  }
                  return (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        target={(link as { external?: boolean }).external ? '_blank' : undefined}
                        rel={(link as { external?: boolean }).external ? 'noopener noreferrer' : undefined}
                        className="text-sm font-light transition-opacity hover:opacity-70"
                        style={{ color: 'var(--w-cream-2)' }}
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: '1px solid var(--w-border)' }}
        >
          <p className="text-[10px] font-light" style={{ color: 'var(--w-muted)' }}>
            © {year} NextX Watches. All rights reserved.
          </p>
          <Link
            href="/"
            className="text-[10px] font-light tracking-[0.15em] uppercase transition-opacity hover:opacity-70"
            style={{ color: 'var(--w-muted)' }}
          >
            Portal
          </Link>
        </div>
      </div>
    </footer>
  )
}

export const WatchesFooter = memo(WatchesFooterComponent)
