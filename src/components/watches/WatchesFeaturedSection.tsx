'use client'

import { memo, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { Currency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { WatchProductCard } from './WatchProductCard'

interface FeaturedItem {
  id: string
  name: string
  brand?: string | null
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  categoryId?: string | null
}

interface WatchesFeaturedSectionProps {
  items: FeaturedItem[]
  stockMap: Record<string, number>
  brandByItemId?: Record<string, string>
  cartQuantityByItemId?: Record<string, number>
  displayCurrency: Currency
  exchangeRate: number
  onAddToCart?: (id: string) => void
  onQuickView?: (id: string) => void
}

function WatchesFeaturedSectionComponent({
  items,
  stockMap,
  brandByItemId,
  cartQuantityByItemId,
  displayCurrency,
  exchangeRate,
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
                brandByItemId={brandByItemId}
                cartQuantityByItemId={cartQuantityByItemId}
                displayCurrency={displayCurrency}
                exchangeRate={exchangeRate}
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
              brandByItemId={brandByItemId}
              cartQuantityByItemId={cartQuantityByItemId}
              displayCurrency={displayCurrency}
              exchangeRate={exchangeRate}
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
                brandByItemId={brandByItemId}
                cartQuantityByItemId={cartQuantityByItemId}
                displayCurrency={displayCurrency}
                exchangeRate={exchangeRate}
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
  brandByItemId?: Record<string, string>
  cartQuantityByItemId?: Record<string, number>
  displayCurrency: Currency
  exchangeRate: number
  isHero?: boolean
  onAddToCart?: (id: string) => void
  onQuickView?: (id: string) => void
}

function FeaturedCard({
  item,
  stockMap,
  brandByItemId,
  cartQuantityByItemId,
  displayCurrency,
  exchangeRate,
  isHero,
  onAddToCart,
  onQuickView,
}: FeaturedCardProps) {
  return (
    <WatchProductCard
      id={item.id}
      name={item.name}
      brand={brandByItemId?.[item.id] ?? item.brand ?? undefined}
      imageUrl={item.imageUrl}
      imageSizes={isHero ? '(max-width: 1024px) 100vw, 44vw' : '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'}
      cartQuantity={cartQuantityByItemId?.[item.id] ?? 0}
      sellingPriceUsd={item.sellingPriceUsd}
      sellingPriceSrd={item.sellingPriceSrd}
      displayCurrency={displayCurrency}
      exchangeRate={exchangeRate}
      stockCount={stockMap[item.id] ?? 0}
      onAddToCart={onAddToCart}
      onQuickView={onQuickView}
    />
  )
}

export const WatchesFeaturedSection = memo(WatchesFeaturedSectionComponent)
