'use client'

import { memo, useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingBag, Search, X, Menu } from 'lucide-react'

interface WatchesHeaderProps {
  cartCount?: number
  onCartClick?: () => void
}

function WatchesHeaderComponent({ cartCount = 0, onCartClick }: WatchesHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { label: 'Collections', href: '/watches#collections' },
    { label: 'New Arrivals', href: '/watches#new' },
    { label: 'About', href: '/watches#about' },
  ]

  const brandLinks = [
    { label: 'Audio', href: '/audio' },
    { label: 'Portal', href: '/' },
  ]

  const LogoLockup = ({ onClick }: { onClick?: () => void }) => (
    <div className="flex flex-col items-start leading-none shrink-0">
      <Link href="/watches" onClick={onClick} className="flex flex-col items-start" aria-label="NextX Watches">
        <Image
          src="/nextx-logo-dark.png"
          alt="NextX"
          width={104}
          height={41}
          className="w-[92px] object-contain lg:w-[104px]"
          style={{ height: 'auto' }}
          priority
        />
      </Link>
    </div>
  )

  return (
    <>
      <header
        className={`watches-header ${scrolled ? 'scrolled' : ''}`}
        style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
      >
        <div className="px-6 lg:px-12 max-w-screen-2xl mx-auto">
          <div
            className="hidden h-6 items-center justify-between border-b sm:flex"
            style={{ borderColor: 'var(--w-border)' }}
          >
            <p
              className="text-[9px] font-light uppercase tracking-[0.28em]"
              style={{ color: 'var(--w-muted)' }}
            >
              Part of NextX
            </p>

            <div className="flex items-center gap-2.5 text-[10px] font-light uppercase tracking-[0.24em]" style={{ color: 'var(--w-cream-2)' }}>
              <span className="h-px w-5 shrink-0" style={{ background: 'var(--w-border-gold)' }} />
              {brandLinks.map((link, index) => (
                <div key={link.href} className="flex items-center gap-2.5 whitespace-nowrap">
                  {index > 0 && <span style={{ color: 'var(--w-gold)' }}>•</span>}
                  <Link
                    href={link.href}
                    className="transition-colors hover:opacity-100"
                    style={{ color: 'var(--w-cream-2)', opacity: 0.88 }}
                  >
                    {link.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="flex h-16 items-center justify-between sm:h-10 lg:h-14">
            <LogoLockup />

            {/* Desktop nav */}
            <nav className="hidden items-center gap-10 lg:flex" aria-label="Primary navigation">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[11px] font-light tracking-[0.2em] uppercase transition-opacity hover:opacity-100 opacity-60"
                  style={{ color: 'var(--w-cream)' }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                className="p-2 transition-opacity hover:opacity-100 opacity-50"
                style={{ color: 'var(--w-cream)' }}
                aria-label="Search"
              >
                <Search size={17} strokeWidth={1.5} />
              </button>

              <button
                onClick={onCartClick}
                className="relative p-2 transition-opacity hover:opacity-100 opacity-70"
                style={{ color: 'var(--w-cream)' }}
                aria-label={`Cart (${cartCount} items)`}
              >
                <ShoppingBag size={17} strokeWidth={1.5} />
                {cartCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-4 h-4 flex items-center justify-center text-[9px] font-medium rounded-full px-0.5"
                    style={{ background: 'var(--w-gold)', color: '#09090B' }}
                  >
                    {cartCount}
                  </span>
                )}
              </button>

              {/* Mobile menu toggle */}
              <button
                className="p-2 transition-opacity hover:opacity-100 opacity-70 lg:hidden"
                style={{ color: 'var(--w-cream)' }}
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={20} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-200 flex flex-col"
          style={{ background: 'var(--w-bg)' }}
        >
          <div className="flex items-center justify-between h-16 px-6 border-b" style={{ borderColor: 'var(--w-border)' }}>
            <LogoLockup onClick={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              className="p-2 opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--w-cream)' }}
              aria-label="Close menu"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>

          <nav className="flex flex-col px-6 mt-10" aria-label="Mobile navigation">
            {navLinks.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-6 border-b transition-colors"
                style={{
                  fontFamily: 'var(--font-cormorant, Georgia, serif)',
                  fontSize: 'clamp(1.75rem, 6vw, 2.5rem)',
                  fontWeight: 300,
                  color: 'var(--w-cream)',
                  borderColor: 'var(--w-border)',
                  letterSpacing: '0.02em',
                }}
              >
                <span style={{ color: 'var(--w-muted)', fontSize: '0.7rem', display: 'block', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '4px' }}>0{i + 1}</span>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto px-6 pb-12">
            <div className="flex items-center gap-2.5 border-t pt-4 text-[11px] font-light uppercase tracking-[0.22em]" style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream-2)' }}>
              <span className="h-px w-5 shrink-0" style={{ background: 'var(--w-border-gold)' }} />
              <Link
                href="/audio"
                onClick={() => setMobileOpen(false)}
                className="transition-opacity hover:opacity-100"
                style={{ opacity: 0.88 }}
              >
                Audio
              </Link>
              <span style={{ color: 'var(--w-gold)' }}>•</span>
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="transition-opacity hover:opacity-100"
                style={{ opacity: 0.88 }}
              >
                Portal
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export const WatchesHeader = memo(WatchesHeaderComponent)
