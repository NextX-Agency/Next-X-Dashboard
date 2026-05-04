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

  const LogoLockup = ({ onClick }: { onClick?: () => void }) => (
    <Link href="/watches" onClick={onClick} className="flex flex-col items-start leading-none shrink-0" aria-label="NextX Watches">
      <Image
        src="/nextx-logo-light.png"
        alt="NextX"
        width={54}
        height={28}
        className="object-contain"
        priority
      />
      <span
        className="mt-[5px] text-[8px] font-light tracking-[0.38em] uppercase"
        style={{
          fontFamily: 'var(--font-jost, system-ui, sans-serif)',
          color: 'var(--w-gold)',
          letterSpacing: '0.38em',
        }}
      >
        Watches
      </span>
    </Link>
  )

  return (
    <>
      <header
        className={`watches-header ${scrolled ? 'scrolled' : ''}`}
        style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
      >
        <div className="flex items-center justify-between h-16 lg:h-20 px-6 lg:px-12 max-w-screen-2xl mx-auto">
          <LogoLockup />

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-10" aria-label="Primary navigation">
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
              className="lg:hidden p-2 transition-opacity hover:opacity-100 opacity-70"
              style={{ color: 'var(--w-cream)' }}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
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

          <div className="mt-auto px-6 pb-12 flex items-center justify-between">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="text-[10px] font-light tracking-[0.2em] uppercase opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--w-cream)' }}
            >
              ← Back to NextX
            </Link>
          </div>
        </div>
      )}
    </>
  )
}

export const WatchesHeader = memo(WatchesHeaderComponent)
