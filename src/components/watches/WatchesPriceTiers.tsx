'use client'

import { memo, useMemo } from 'react'

export type PriceTier = 'all' | 'low' | 'mid' | 'high'

interface PriceTierItem {
  id: string
  sellingPriceUsd?: number | null
}

interface WatchesPriceTiersProps {
  items: PriceTierItem[]
  activeTier: PriceTier
  onChange: (tier: PriceTier) => void
}

const TIERS: {
  id: PriceTier
  label: string
  range: string
  descriptor: string
  min?: number
  max?: number
}[] = [
  {
    id: 'low',
    label: 'Entry Collection',
    range: 'Under $200',
    descriptor: 'Precision for every day',
    max: 200,
  },
  {
    id: 'mid',
    label: 'Premium Collection',
    range: '$200 – $500',
    descriptor: 'Refined craftsmanship',
    min: 200,
    max: 500,
  },
  {
    id: 'high',
    label: 'Luxury Collection',
    range: '$500 & above',
    descriptor: 'Timeless investment pieces',
    min: 500,
  },
]

function WatchesPriceTiersComponent({
  items,
  activeTier,
  onChange,
}: WatchesPriceTiersProps) {
  const counts = useMemo(() => {
    const result: Record<string, number> = { low: 0, mid: 0, high: 0 }
    items.forEach(item => {
      const price = item.sellingPriceUsd ? Number(item.sellingPriceUsd) : 0
      if (price < 200) result.low++
      else if (price < 500) result.mid++
      else result.high++
    })
    return result
  }, [items])

  return (
    <div
      style={{
        borderTop: '1px solid var(--w-border)',
        borderBottom: '1px solid var(--w-border)',
        background: 'var(--w-surface)',
      }}
    >
      <div className="px-6 lg:px-12 py-8 max-w-screen-2xl mx-auto">
        {/* Label row */}
        <p
          className="mb-6 text-[9px] tracking-[0.35em] uppercase font-light text-center"
          style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
        >
          Shop by Price Range
        </p>

        {/* 3-column tier cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {TIERS.map(tier => {
            const isActive = activeTier === tier.id
            const count = counts[tier.id] ?? 0

            return (
              <button
                key={tier.id}
                onClick={() => onChange(isActive ? 'all' : tier.id)}
                className="relative flex flex-col items-center text-center p-4 sm:p-6 transition-all duration-300 overflow-hidden"
                style={{
                  background: isActive ? 'var(--w-orange-dim)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--w-orange)' : 'var(--w-border)'}`,
                  boxShadow: isActive ? '0 0 20px var(--w-orange-glow)' : 'none',
                }}
                aria-pressed={isActive}
              >
                {/* Decorative ghost number */}
                <span
                  className="absolute top-2 right-3 select-none pointer-events-none font-serif font-light leading-none hidden sm:block"
                  style={{
                    fontSize: '3.5rem',
                    color: isActive ? 'rgba(249,112,21,0.07)' : 'rgba(201,168,76,0.05)',
                    fontFamily: 'var(--font-cormorant, Georgia, serif)',
                  }}
                >
                  {tier.id === 'low' ? 'I' : tier.id === 'mid' ? 'II' : 'III'}
                </span>

                <span
                  className="mb-1 text-[8px] sm:text-[9px] tracking-[0.28em] uppercase font-light leading-snug"
                  style={{
                    color: isActive ? 'var(--w-orange)' : 'var(--w-gold)',
                    fontFamily: 'var(--font-jost, system-ui, sans-serif)',
                  }}
                >
                  {tier.label}
                </span>

                <span
                  className="my-1.5 leading-tight font-light"
                  style={{
                    fontFamily: 'var(--font-cormorant, Georgia, serif)',
                    color: 'var(--w-cream)',
                    fontSize: 'clamp(1rem, 2.5vw, 1.4rem)',
                  }}
                >
                  {tier.range}
                </span>

                <p
                  className="hidden sm:block text-[10px] font-light leading-relaxed mb-3"
                  style={{
                    color: 'var(--w-muted)',
                    fontFamily: 'var(--font-jost, system-ui, sans-serif)',
                  }}
                >
                  {tier.descriptor}
                </p>

                {/* Count badge */}
                <span
                  className="text-[8px] sm:text-[9px] px-2.5 py-0.5 tracking-wide"
                  style={{
                    color: isActive ? 'var(--w-orange)' : 'var(--w-muted)',
                    border: `1px solid ${isActive ? 'rgba(249,112,21,0.35)' : 'var(--w-border)'}`,
                    fontFamily: 'var(--font-jost, system-ui, sans-serif)',
                  }}
                >
                  {count} {count === 1 ? 'watch' : 'watches'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const WatchesPriceTiers = memo(WatchesPriceTiersComponent)
