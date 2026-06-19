'use client'

import { memo, useCallback, useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingBag, Search, X, Menu } from 'lucide-react'
import { useCurrency } from '@/lib/CurrencyContext'
import type { Currency } from '@/lib/currency'
import { formatCurrencyInputAmount } from '@/lib/pricing'

interface WatchesHeaderProps {
  cartCount?: number
  onCartClick?: () => void
}

const navLinks = [
  { label: 'Collections', href: '/watches#collections' },
  { label: 'New Arrivals', href: '/watches#new' },
  { label: 'About', href: '/watches#about' },
]

const brandLinks = [
  { label: 'Audio', href: '/audio' },
  { label: 'Portal', href: '/' },
]

function WatchesLogoLockup({ onClick }: { onClick?: () => void }) {
  return (
    <div className="flex flex-col items-start leading-none shrink-0">
      <Link href="/watches" onClick={onClick} className="flex flex-col items-start" aria-label="NextX Watches">
        <span className="relative block h-[48px] w-28 sm:h-[63px] sm:w-[148px] lg:h-[70px] lg:w-[164px]">
          <Image
            src="/nextx-logo-dark.png"
            alt="NextX company logo"
            fill
            sizes="(max-width: 640px) 112px, (max-width: 1024px) 148px, 164px"
            quality={100}
            className="object-contain"
            priority
          />
        </span>
      </Link>
    </div>
  )
}

function WatchesCurrencyToggle({
  currency,
  onChange,
}: {
  currency: Currency
  onChange: (currency: Currency) => void
}) {
  return (
    <div
      className="inline-flex items-center gap-1 border px-1 py-0.5"
      style={{
        borderColor: 'rgba(240,235,225,0.12)',
        background: 'rgba(240,235,225,0.025)',
      }}
      role="group"
      aria-label="Display currency"
    >
      {(['SRD', 'USD'] as const).map((option) => {
        const isActive = currency === option

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="px-2 py-1 text-[10px] font-light uppercase tracking-[0.16em] transition-colors sm:px-2.5"
            style={{
              background: isActive ? 'rgba(201,168,76,0.18)' : 'transparent',
              color: isActive ? 'var(--w-gold)' : 'var(--w-muted)',
            }}
            aria-pressed={isActive}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function WatchesHeaderComponent({ cartCount = 0, onCartClick }: WatchesHeaderProps) {
  const { displayCurrency, setDisplayCurrency, exchangeRate } = useCurrency()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleSearchClick = useCallback(() => {
    const searchInput = document.getElementById('watches-search-input') as HTMLInputElement | null

    if (!searchInput) {
      window.location.href = '/watches#collections'
      return
    }

    window.history.replaceState(null, '', '#collections')
    searchInput.focus({ preventScroll: true })
    searchInput.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  return (
    <>
      <header
        className={`watches-header ${scrolled ? 'scrolled' : ''}`}
        style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
      >
        <div className="px-4 sm:px-6 lg:px-12 max-w-screen-2xl mx-auto">
          <div
            className="hidden h-7 items-center justify-between border-b sm:flex"
            style={{ borderColor: 'var(--w-border)' }}
          >
            <p
              className="text-[10px] font-light uppercase tracking-[0.26em]"
              style={{ color: 'var(--w-muted)' }}
            >
              Part of NextX
            </p>

            <div className="flex items-center gap-3 text-[11px] font-light uppercase tracking-[0.22em]" style={{ color: 'var(--w-cream-2)' }}>
              <span
                className="hidden whitespace-nowrap md:inline"
                style={{ color: 'var(--w-muted)', letterSpacing: '0.18em' }}
              >
                1 USD = {formatCurrencyInputAmount(exchangeRate)} SRD
              </span>
              <span className="h-px w-5 shrink-0" style={{ background: 'var(--w-border-gold)' }} />
              {brandLinks.map((link, index) => (
                <div key={link.href} className="flex items-center gap-3 whitespace-nowrap">
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
              <div className="flex items-center gap-3 whitespace-nowrap">
                <span style={{ color: 'var(--w-gold)' }}>•</span>
                <a
                  href="https://www.nextxagency.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:opacity-100"
                  style={{ color: 'var(--w-cream-2)', opacity: 0.88 }}
                >
                  Agency
                </a>
              </div>
            </div>
          </div>

          <div className="flex h-14 items-center justify-between sm:h-14 lg:h-18">
            <WatchesLogoLockup />

            {/* Desktop nav */}
            <nav className="hidden items-center gap-12 lg:flex" aria-label="Primary navigation">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[12px] font-light tracking-[0.18em] uppercase transition-opacity hover:opacity-100 opacity-70"
                  style={{ color: 'var(--w-cream)' }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1.5 sm:gap-3.5">
              <div className="hidden lg:block">
                <WatchesCurrencyToggle
                  currency={displayCurrency}
                  onChange={setDisplayCurrency}
                />
              </div>

              <button
                type="button"
                onClick={handleSearchClick}
                className="p-2 transition-opacity hover:opacity-100 opacity-55 sm:p-2.5"
                style={{ color: 'var(--w-cream)' }}
                aria-label="Search watches"
              >
                <Search size={18} strokeWidth={1.5} />
              </button>

              <button
                onClick={onCartClick}
                className="relative p-2 transition-opacity hover:opacity-100 opacity-75 sm:p-2.5"
                style={{ color: 'var(--w-cream)' }}
                aria-label={`Cart (${cartCount} items)`}
              >
                <ShoppingBag size={18} strokeWidth={1.5} />
                {cartCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center px-0.5 text-[9px] font-medium"
                    style={{ background: 'var(--w-gold)', color: '#09090B' }}
                  >
                    {cartCount}
                  </span>
                )}
              </button>

              {/* Mobile menu toggle */}
              <button
                className="p-2 transition-opacity hover:opacity-100 opacity-75 sm:p-2.5 lg:hidden"
                style={{ color: 'var(--w-cream)' }}
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={21} strokeWidth={1.5} />
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
            <WatchesLogoLockup onClick={() => setMobileOpen(false)} />
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
            <div className="mb-6">
              <p
                className="mb-3 text-[10px] font-light uppercase tracking-[0.28em]"
                style={{ color: 'var(--w-muted)' }}
              >
                Currency
              </p>
              <WatchesCurrencyToggle
                currency={displayCurrency}
                onChange={setDisplayCurrency}
              />
              <p
                className="mt-3 text-[10px] font-light uppercase tracking-[0.18em]"
                style={{ color: 'var(--w-muted)' }}
              >
                1 USD = {formatCurrencyInputAmount(exchangeRate)} SRD
              </p>
            </div>
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
              <span style={{ color: 'var(--w-gold)' }}>•</span>
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="transition-opacity hover:opacity-100"
                style={{ opacity: 0.88 }}
              >
                Agency
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export const WatchesHeader = memo(WatchesHeaderComponent)
