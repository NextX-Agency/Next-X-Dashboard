'use client'

import { memo, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { WatchProductCard } from '@/components/watches'
import type { Currency } from '@/lib/currency'
import { DEFAULT_EXCHANGE_RATE } from '@/lib/pricing'

interface NewArrivalItem {
  id: string
  name: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
}

interface WatchNewArrivalsSectionProps {
  items: NewArrivalItem[]
  stockMap: Record<string, number>
  displayCurrency: Currency
  exchangeRate?: number
  onAddToCart?: (id: string) => void
  onQuickView?: (id: string) => void
}

function WatchNewArrivalsSectionComponent({
  items,
  stockMap,
  displayCurrency,
  exchangeRate = DEFAULT_EXCHANGE_RATE,
  onAddToCart,
  onQuickView,
}: WatchNewArrivalsSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' })
  }, [])

  if (items.length === 0) return null

  return (
    <section
      id="new"
      className="py-16 lg:py-24"
      style={{ borderTop: '1px solid var(--w-border)' }}
    >
      <div className="max-w-screen-2xl mx-auto">
        {/* Header + controls */}
        <div className="px-6 lg:px-12 mb-10 flex items-end justify-between">
          <div>
            <p
              className="w-subheading mb-3"
              style={{ color: 'var(--w-orange)' }}
            >
              New Arrivals
            </p>
            <h2
              className="font-light leading-tight"
              style={{
                fontFamily: 'var(--font-cormorant, Georgia, serif)',
                color: 'var(--w-cream)',
                fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
              }}
            >
              Just Landed
            </h2>
          </div>

          {/* Navigation arrows */}
          <div className="flex items-center gap-2">
            <ArrowBtn onClick={() => scroll('left')} dir="left" />
            <ArrowBtn onClick={() => scroll('right')} dir="right" />
          </div>
        </div>

        {/* Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-4 lg:gap-5 overflow-x-auto scrollbar-none px-6 lg:px-12 pb-4"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {items.map(item => (
            <div
              key={item.id}
              className="shrink-0"
              style={{
                width: 'min(240px, 68vw)',
                scrollSnapAlign: 'start',
              }}
            >
              <WatchProductCard
                id={item.id}
                name={item.name}
                imageUrl={item.imageUrl}
                sellingPriceUsd={item.sellingPriceUsd ? Number(item.sellingPriceUsd) : null}
                sellingPriceSrd={item.sellingPriceSrd ? Number(item.sellingPriceSrd) : null}
                displayCurrency={displayCurrency}
                exchangeRate={exchangeRate}
                stockCount={stockMap[item.id] ?? 0}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ArrowBtn({
  onClick,
  dir,
}: {
  onClick: () => void
  dir: 'left' | 'right'
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-9 h-9 shrink-0 transition-all duration-300"
      style={{ border: '1px solid var(--w-border)', color: 'var(--w-cream-2)' }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'
        e.currentTarget.style.color = 'var(--w-gold)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--w-border)'
        e.currentTarget.style.color = 'var(--w-cream-2)'
      }}
      aria-label={dir === 'left' ? 'Scroll left' : 'Scroll right'}
    >
      {dir === 'left'
        ? <ChevronLeft size={16} strokeWidth={1.5} />
        : <ChevronRight size={16} strokeWidth={1.5} />
      }
    </button>
  )
}

export const WatchNewArrivalsSection = memo(WatchNewArrivalsSectionComponent)
