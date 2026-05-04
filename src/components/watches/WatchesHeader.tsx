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

  return (
    <>
      <header
        className={`watches-header ${scrolled ? 'scrolled' : ''}`}
        style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
      >
        <div className="flex items-center justify-between h-16 lg:h-20 px-6 lg:px-12 max-w-screen-2xl mx-auto">
          {/* Logo */}
          <Link href="/watches" className="flex flex-col leading-none group" aria-label="NextX Watches">
            <span
              className="text-xs font-light tracking-[0.3em] uppercase"
              style={{ color: 'var(--w-muted)' }}
            >
              NextX
            </span>
            <span
              className="text-base font-light tracking-[0.15em] uppercase transition-colors"
              style={{
                fontFamily: 'var(--font-cormorant, Georgia, serif)',
                color: 'var(--w-cream)',
              }}
            >
              Watches
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-10" aria-label="Primary navigation">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[11px] font-light tracking-[0.2em] uppercase transition-colors hover:opacity-100"
                style={{ color: 'var(--w-cream-2)' }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button
              className="p-2 transition-opacity hover:opacity-70"
              style={{ color: 'var(--w-cream-2)' }}
              aria-label="Search"
            >
              <Search size={18} strokeWidth={1.5} />
            </button>

            <button
              onClick={onCartClick}
              className="relative p-2 transition-opacity hover:opacity-70"
              style={{ color: 'var(--w-cream)' }}
              aria-label={`Cart (${cartCount} items)`}
            >
              <ShoppingBag size={18} strokeWidth={1.5} />
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-medium rounded-full px-0.5"
                  style={{ background: 'var(--w-gold)', color: '#09090B' }}
                >
                  {cartCount}
                </span>
              )}
            </button>

            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-2 transition-opacity hover:opacity-70"
              style={{ color: 'var(--w-cream)' }}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay menu */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: 'var(--w-bg)' }}
        >
          <div className="flex items-center justify-between h-16 px-6">
            <Link
              href="/watches"
              className="flex flex-col leading-none"
              onClick={() => setMobileOpen(false)}
            >
              <span className="text-xs font-light tracking-[0.3em] uppercase" style={{ color: 'var(--w-muted)' }}>
                NextX
              </span>
              <span
                className="text-base font-light tracking-[0.15em] uppercase"
                style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
              >
                Watches
              </span>
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="p-2"
              style={{ color: 'var(--w-muted)' }}
              aria-label="Close menu"
            >
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>

          <nav className="flex flex-col gap-0 px-6 mt-8" aria-label="Mobile navigation">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-5 text-2xl font-light border-b transition-colors"
                style={{
                  fontFamily: 'var(--font-cormorant, Georgia, serif)',
                  color: 'var(--w-cream)',
                  borderColor: 'var(--w-border)',
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto px-6 pb-12">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="text-xs font-light tracking-[0.15em] uppercase"
              style={{ color: 'var(--w-muted)' }}
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
