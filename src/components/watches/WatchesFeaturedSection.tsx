'use client'

import { memo, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import type { Currency } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface FeaturedItem {
  id: string
  name: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  categoryId?: string | null
}

interface WatchesFeaturedSectionProps {
  items: FeaturedItem[]
  stockMap: Record<string, number>
  displayCurrency: Currency
  onAddToCart?: (id: string) => void
  onQuickView?: (id: string) => void
}

function WatchesFeaturedSectionComponent({
  items,
  stockMap,
  displayCurrency,
  onAddToCart,
  onQuickView,
}: WatchesFeaturedSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const reveals = section.querySelectorAll('.w-reveal')
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.08 }
    )
    reveals.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  if (items.length === 0) return null

  if (items.length <= 3) {
    const gridClassName = items.length === 1
      ? 'mx-auto grid max-w-xl grid-cols-1 gap-5'
      : items.length === 2
        ? 'mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-2 lg:gap-6'
        : 'mx-auto grid max-w-7xl grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 lg:gap-6'

    return (
      <section
        ref={sectionRef}
        id="featured"
        className="px-6 py-16 lg:px-12 lg:py-20 max-w-screen-2xl mx-auto"
      >
        <div className="mb-10 w-reveal">
          <p
            className="w-subheading mb-4"
            style={{ color: 'var(--w-gold)' }}
          >
            Featured Collection
          </p>
          <div className="flex items-end justify-between gap-4">
            <h2 className="w-heading" style={{ color: 'var(--w-cream)' }}>
              Handpicked Timepieces
            </h2>
            <Link
              href="/watches#collections"
              className="hidden sm:inline-flex w-btn-outline"
              style={{ padding: '0.6rem 1.5rem' }}
            >
              Browse All
            </Link>
          </div>
          <div className="mt-5 h-px w-20" style={{ background: 'var(--w-border-gold)' }} />
        </div>

        <div className={gridClassName}>
          {items.map((item, i) => (
            <div
              key={item.id}
              className={`w-reveal w-reveal-d${Math.min(i + 1, 6)}`}
            >
              <FeaturedCard
                item={item}
                stockMap={stockMap}
                displayCurrency={displayCurrency}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
              />
            </div>
          ))}
        </div>
      </section>
    )
  }

  const [hero, ...rest] = items.slice(0, 6)
  const sideItems = rest.slice(0, 5)

  return (
    <section
      ref={sectionRef}
      id="featured"
      className="px-6 lg:px-12 py-20 lg:py-28 max-w-screen-2xl mx-auto"
    >
      {/* Section header */}
      <div className="mb-12 lg:mb-16 w-reveal">
        <p
          className="w-subheading mb-4"
          style={{ color: 'var(--w-orange)' }}
        >
          Featured Collection
        </p>
        <div className="flex items-end justify-between gap-4">
          <h2 className="w-heading" style={{ color: 'var(--w-cream)' }}>
            Handpicked Timepieces
          </h2>
          <Link
            href="/watches#collections"
            className="hidden sm:inline-flex w-btn-outline"
            style={{ padding: '0.6rem 1.5rem' }}
          >
            Browse All
          </Link>
        </div>
        <div className="mt-5 h-px w-20" style={{ background: 'var(--w-border-gold)' }} />
      </div>

      {/* Layout: 1 tall hero card left + 2×2/3 grid right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 lg:gap-6">
        {/* Hero card — spans 2 of 5 cols */}
        {hero && (
          <div className="lg:col-span-2 w-reveal w-reveal-d1">
            <FeaturedCard
              item={hero}
              stockMap={stockMap}
              displayCurrency={displayCurrency}
              isHero
              onAddToCart={onAddToCart}
              onQuickView={onQuickView}
            />
          </div>
        )}

        {/* Smaller cards — 3 cols, 2 rows */}
        <div className={cn('lg:col-span-3 grid gap-4 lg:gap-5', sideItems.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
          {sideItems.map((item, i) => (
            <div
              key={item.id}
              className={`w-reveal w-reveal-d${Math.min(i + 2, 6)}`}
            >
              <FeaturedCard
                item={item}
                stockMap={stockMap}
                displayCurrency={displayCurrency}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile CTA */}
      <div className="mt-10 flex justify-center sm:hidden">
        <Link href="/watches#collections" className="w-btn-outline">
          Browse All Watches
        </Link>
      </div>
    </section>
  )
}

/* ── Individual card ─────────────────────────────── */

interface FeaturedCardProps {
  item: FeaturedItem
  stockMap: Record<string, number>
  displayCurrency: Currency
  isHero?: boolean
  onAddToCart?: (id: string) => void
  onQuickView?: (id: string) => void
}

function FeaturedCard({
  item,
  stockMap,
  displayCurrency,
  isHero,
  onAddToCart,
  onQuickView,
}: FeaturedCardProps) {
  const price = displayCurrency === 'SRD' ? item.sellingPriceSrd : item.sellingPriceUsd
  const inStock = (stockMap[item.id] ?? 0) > 0

  return (
    <article
      className="group flex flex-col h-full"
      style={{
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        transition: 'border-color 0.4s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--w-border)')}
    >
      {/* Image */}
      <Link
        href={`/watches/${item.id}`}
        className="block relative overflow-hidden flex-1"
        style={{
          aspectRatio: isHero ? '3/4' : '5/6',
          background: 'var(--w-surface-2)',
          minHeight: isHero ? 320 : undefined,
        }}
        tabIndex={-1}
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes={isHero ? '(max-width: 1024px) 100vw, 40vw' : '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw'}
            className="object-cover transition-transform duration-700 will-change-transform group-hover:scale-[1.05]"
          />
        ) : (
          /* Elegant watch-face placeholder */
          <div className="absolute inset-0 flex items-center justify-center">
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.18)' }} />
              <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.10)' }} />
              <div style={{ position: 'absolute', inset: 20, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(201,168,76,0.25)' }} />
              </div>
            </div>
          </div>
        )}

        {/* Hover gradient */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(9,9,11,0.65) 0%, transparent 55%)' }}
        />

        {/* Quick view */}
        {onQuickView && (
          <button
            onClick={e => { e.preventDefault(); onQuickView(item.id) }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 text-[9px] tracking-[0.22em] uppercase px-5 py-2.5"
            style={{
              background: 'rgba(9,9,11,0.92)',
              color: 'var(--w-cream-2)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(201,168,76,0.3)',
              letterSpacing: '0.22em',
            }}
          >
            Quick View
          </button>
        )}

        {/* Sold-out badge */}
        {!inStock && (
          <div
            className="absolute top-3 left-3 px-2.5 py-1 text-[8px] tracking-[0.2em] uppercase"
            style={{ background: 'rgba(9,9,11,0.82)', color: 'var(--w-muted)', backdropFilter: 'blur(4px)' }}
          >
            Sold Out
          </div>
        )}
      </Link>

      {/* Info row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--w-border)' }}>
        <div className="min-w-0">
          <Link href={`/watches/${item.id}`}>
            <h3
              className="font-light leading-snug truncate group-hover:opacity-75 transition-opacity"
              style={{
                fontFamily: 'var(--font-cormorant, Georgia, serif)',
                color: 'var(--w-cream)',
                fontSize: isHero ? '1.15rem' : '0.95rem',
              }}
            >
              {item.name}
            </h3>
          </Link>
          <p
            className="text-xs font-light mt-0.5"
            style={{ color: price != null ? 'var(--w-cream-2)' : 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            {price != null ? formatCurrency(Number(price), displayCurrency) : 'Price on request'}
          </p>
        </div>

        {onAddToCart && inStock && (
          <button
            onClick={() => onAddToCart(item.id)}
            className="shrink-0 p-2 transition-all"
            style={{ color: 'var(--w-orange)', border: '1px solid var(--w-orange)', background: 'var(--w-orange-dim)' }}
            aria-label={`Add ${item.name} to cart`}
          >
            <ShoppingBag size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </article>
  )
}

export const WatchesFeaturedSection = memo(WatchesFeaturedSectionComponent)
