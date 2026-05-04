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
    <article
      className="w-product-card group"
      style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
    >
      {/* Image container — 5:6 aspect ratio */}
      <Link href={productHref} className="block relative w-full overflow-hidden" style={{ aspectRatio: '5/6' }}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 will-change-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'var(--w-surface)' }}
          >
            <span
              className="text-4xl font-light"
              style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-border)' }}
            >
              W
            </span>
          </div>
        )}

        {/* Quick view overlay */}
        {onQuickView && (
          <button
            onClick={e => { e.preventDefault(); onQuickView(id) }}
            className="absolute bottom-0 left-0 right-0 py-3 text-[10px] font-light tracking-[0.2em] uppercase text-center transition-all duration-300 opacity-0 group-hover:opacity-100 translate-y-full group-hover:translate-y-0"
            style={{ background: 'rgba(9,9,11,0.85)', color: 'var(--w-cream)', backdropFilter: 'blur(4px)' }}
          >
            Quick View
          </button>
        )}

        {/* Out of stock badge */}
        {!inStock && (
          <div
            className="absolute top-3 left-3 px-2 py-1 text-[9px] font-light tracking-[0.2em] uppercase"
            style={{ background: 'var(--w-bg)', color: 'var(--w-muted)' }}
          >
            Sold Out
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="pt-3 pb-1">
        {/* Brand */}
        {brand && (
          <p
            className="mb-0.5 text-[9px] font-light tracking-[0.25em] uppercase"
            style={{ color: 'var(--w-gold)' }}
          >
            {brand}
          </p>
        )}

        {/* Name */}
        <Link href={productHref} className="block">
          <h3
            className="text-base font-light leading-snug hover:opacity-70 transition-opacity"
            style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
          >
            {name}
          </h3>
        </Link>

        {/* Price + add to cart row */}
        <div className="flex items-center justify-between mt-2">
          <p
            className="text-sm font-light"
            style={{ color: price ? 'var(--w-cream)' : 'var(--w-muted)' }}
          >
            {price != null ? formatCurrency(price, displayCurrency) : 'Price on request'}
          </p>

          {onAddToCart && inStock && (
            <button
              onClick={() => onAddToCart(id)}
              className="p-2 transition-all hover:opacity-70"
              style={{ color: 'var(--w-gold)' }}
              aria-label={`Add ${name} to cart`}
            >
              <ShoppingBag size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export const WatchProductCard = memo(WatchProductCardComponent)
