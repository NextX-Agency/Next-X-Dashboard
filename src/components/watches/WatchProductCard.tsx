'use client'

import { memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import type { Currency } from '@/lib/currency'

interface WatchProductCardProps {
  id: string
  name: string
  brand?: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  displayCurrency?: Currency
  stockCount?: number
  href?: string
  onAddToCart?: (id: string) => void
  onQuickView?: (id: string) => void
}

function WatchProductCardComponent({
  id,
  name,
  brand,
  imageUrl,
  sellingPriceUsd,
  sellingPriceSrd,
  displayCurrency = 'USD',
  stockCount = 0,
  href,
  onAddToCart,
  onQuickView,
}: WatchProductCardProps) {
  const productHref = href ?? `/watches/${id}`
  const price = displayCurrency === 'SRD' ? sellingPriceSrd : sellingPriceUsd
  const inStock = stockCount > 0

  return (
    <article className="w-product-card group">
      {/* Image — 5:6 ratio, dark surface bg for consistent framing */}
      <Link
        href={productHref}
        className="block relative w-full overflow-hidden"
        style={{ aspectRatio: '5/6', background: 'var(--w-surface)' }}
        tabIndex={-1}
        aria-label={name}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 will-change-transform group-hover:scale-[1.04]"
          />
        ) : (
          /* Elegant placeholder — not a generic letter */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            {/* Decorative watch-face rings */}
            <div style={{ position: 'relative', width: 72, height: 72 }}>
              <div style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                border: '1px solid rgba(201,168,76,0.2)',
              }} />
              <div style={{
                position: 'absolute', inset: 8,
                borderRadius: '50%',
                border: '1px solid rgba(201,168,76,0.12)',
              }} />
              <div style={{
                position: 'absolute', inset: 16,
                borderRadius: '50%',
                border: '1px solid rgba(201,168,76,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(201,168,76,0.25)' }} />
              </div>
            </div>
            <span
              className="text-[8px] tracking-[0.3em] uppercase"
              style={{ color: 'rgba(201,168,76,0.3)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
            >
              Image soon
            </span>
          </div>
        )}

        {/* Quick view — slides up from bottom on hover */}
        {onQuickView && (
          <button
            onClick={e => { e.preventDefault(); onQuickView(id) }}
            className="absolute bottom-0 left-0 right-0 py-3 text-[9px] font-light tracking-[0.25em] uppercase text-center transition-all duration-400 opacity-0 group-hover:opacity-100 translate-y-full group-hover:translate-y-0"
            style={{ background: 'rgba(9,9,11,0.88)', color: 'var(--w-cream-2)', backdropFilter: 'blur(6px)', letterSpacing: '0.25em' }}
          >
            Quick View
          </button>
        )}

        {/* Sold out badge */}
        {!inStock && (
          <div
            className="absolute top-3 left-3 px-2.5 py-1 text-[8px] tracking-[0.2em] uppercase"
            style={{ background: 'rgba(9,9,11,0.7)', color: 'var(--w-muted)', backdropFilter: 'blur(4px)', border: '1px solid var(--w-border)' }}
          >
            Sold Out
          </div>
        )}
      </Link>

      {/* Product info */}
      <div className="pt-5 pb-3">
        {brand && (
          <p
            className="mb-1.5 text-[9px] tracking-[0.24em] uppercase lg:text-[10px]"
            style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            {brand}
          </p>
        )}

        <Link href={productHref} className="block group/name">
          <h3
            className="font-light leading-snug"
            style={{
              fontFamily: 'var(--font-cormorant, Georgia, serif)',
              color: 'var(--w-cream)',
              fontSize: 'clamp(1.125rem, 2vw, 1.35rem)',
            }}
          >
            {name}
          </h3>
        </Link>

        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--w-border)' }}>
          <p
            className="text-base font-light"
            style={{
              color: price ? 'var(--w-cream-2)' : 'var(--w-muted)',
              fontFamily: 'var(--font-jost, system-ui, sans-serif)',
            }}
          >
            {price != null ? formatCurrency(price, displayCurrency) : 'Price on request'}
          </p>

          {onAddToCart && inStock && (
            <button
              onClick={() => onAddToCart(id)}
              className="p-1.5 transition-all hover:opacity-100 opacity-40 group-hover:opacity-70"
              style={{ color: 'var(--w-gold)' }}
              aria-label={`Add ${name} to cart`}
            >
              <ShoppingBag size={15} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export const WatchProductCard = memo(WatchProductCardComponent)
