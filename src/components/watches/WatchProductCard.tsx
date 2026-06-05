'use client'

import { memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { shouldBypassNextImageOptimization } from '@/lib/imageOptimization'
import { getWatchSellingPrice } from '@/lib/watchPricing'
import { DEFAULT_EXCHANGE_RATE } from '@/lib/pricing'
import type { Currency } from '@/lib/currency'

interface WatchProductCardProps {
  id: string
  name: string
  brand?: string
  imageUrl?: string | null
  imageSizes?: string
  cartQuantity?: number
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  displayCurrency?: Currency
  exchangeRate?: number
  stockCount?: number
  href?: string
  compact?: boolean
  onAddToCart?: (id: string) => void
  onQuickView?: (id: string) => void
}

function WatchProductCardComponent({
  id,
  name,
  brand,
  imageUrl,
  imageSizes,
  cartQuantity = 0,
  sellingPriceUsd,
  sellingPriceSrd,
  displayCurrency = 'USD',
  exchangeRate = DEFAULT_EXCHANGE_RATE,
  stockCount = 0,
  href,
  compact = false,
  onAddToCart,
  onQuickView,
}: WatchProductCardProps) {
  const productHref = href ?? `/watches/${id}`
  const price = getWatchSellingPrice({ sellingPriceUsd, sellingPriceSrd }, displayCurrency, exchangeRate)
  const inStock = stockCount > 0
  const resolvedImageSizes = imageSizes ?? '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, (max-width: 1680px) 33vw, 25vw'
  const unoptimizedImage = shouldBypassNextImageOptimization(imageUrl)
  const availabilityLabel = !inStock
    ? 'Sold out'
    : stockCount <= 3
      ? `${stockCount} left`
      : 'Available now'

  return (
    <article
      className="group flex h-full flex-col overflow-hidden border"
      style={{
        borderColor: 'var(--w-border)',
        background: 'linear-gradient(180deg, rgba(18,20,24,0.98), rgba(10,10,12,0.98))',
        boxShadow: compact ? '0 12px 34px rgba(0, 0, 0, 0.16)' : '0 18px 48px rgba(0, 0, 0, 0.18)',
      }}
    >
      <div className="relative">
        <Link
          href={productHref}
          className={`block relative w-full overflow-hidden border-b ${compact ? 'aspect-[4/5] sm:aspect-[5/6]' : 'aspect-[5/6]'}`}
          style={{ background: 'var(--w-surface)', borderColor: 'var(--w-border)' }}
          tabIndex={-1}
          aria-label={name}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              sizes={resolvedImageSizes}
              quality={92}
              unoptimized={unoptimizedImage}
              className="object-cover transition-transform duration-700 will-change-transform group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div style={{ position: 'relative', width: 72, height: 72 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.2)' }} />
                <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.12)' }} />
                <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.02) 40%, rgba(9,9,11,0.24) 100%)' }}
          />

          <div
            className={`absolute rounded-full border uppercase tracking-[0.22em] ${compact ? 'left-2.5 top-2.5 px-2 py-0.5 text-[8px] sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[9px]' : 'left-3 top-3 px-2.5 py-1 text-[9px]'}`}
            style={{
              borderColor: inStock ? 'rgba(201,168,76,0.4)' : 'var(--w-border)',
              background: 'rgba(9,9,11,0.72)',
              color: inStock ? 'var(--w-gold)' : 'var(--w-muted)',
            }}
          >
            {availabilityLabel}
          </div>
        </Link>

        {cartQuantity > 0 && (
          <div
            className={`absolute rounded-full border uppercase tracking-[0.16em] ${compact ? 'right-2.5 top-2.5 px-2 py-0.5 text-[8px] sm:right-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[9px]' : 'right-3 top-3 px-2.5 py-1 text-[9px]'}`}
            style={{
              borderColor: 'rgba(201,168,76,0.45)',
              background: 'rgba(9,9,11,0.82)',
              color: 'var(--w-cream)',
            }}
          >
            {cartQuantity} in cart
          </div>
        )}

        {onQuickView && (
          <button
            onClick={(event) => {
              event.preventDefault()
              onQuickView(id)
            }}
            className={`absolute flex items-center justify-center rounded-full border transition-all hover:opacity-100 ${compact ? 'bottom-2.5 right-2.5 h-9 w-9 sm:bottom-3 sm:right-3 sm:h-10 sm:w-10' : 'bottom-3 right-3 h-10 w-10'}`}
            style={{
              borderColor: 'rgba(201,168,76,0.35)',
              background: 'rgba(9,9,11,0.82)',
              color: 'var(--w-cream)',
              opacity: 0.88,
              backdropFilter: 'blur(8px)',
            }}
            aria-label={`Quick view ${name}`}
          >
            <Eye size={16} strokeWidth={1.7} />
          </button>
        )}
      </div>

      <div className={`flex flex-1 flex-col ${compact ? 'px-3.5 py-3.5 sm:px-4 sm:py-4' : 'px-4 py-4 sm:px-5 sm:py-5'}`}>
        <div className={`flex items-start justify-between gap-3 ${compact ? 'mb-2.5' : 'mb-3'}`}>
          <div className="min-w-0">
            {brand && (
              <p
                className={`tracking-[0.24em] uppercase ${compact ? 'mb-1 text-[8px] sm:mb-1.5 sm:text-[9px] lg:text-[10px]' : 'mb-1.5 text-[9px] lg:text-[10px]'}`}
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
                  fontSize: compact ? 'clamp(1rem, 1.8vw, 1.26rem)' : 'clamp(1.15rem, 2vw, 1.45rem)',
                }}
              >
                {name}
              </h3>
            </Link>
          </div>
        </div>

        <p
          className={compact ? 'text-[9px] uppercase tracking-[0.16em] sm:text-[10px] sm:tracking-[0.18em]' : 'text-[10px] uppercase tracking-[0.18em]'}
          style={{ color: inStock ? 'var(--w-cream-2)' : 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
        >
          {inStock ? 'Available for order' : 'Currently unavailable'}
        </p>

        <div className={`mt-auto ${compact ? 'pt-3' : 'pt-4'}`} style={{ borderTop: '1px solid var(--w-border)' }}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p
                className="mb-1 text-[10px] uppercase tracking-[0.18em]"
                style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                Price
              </p>
              <p
                className={compact ? 'text-base font-light sm:text-lg' : 'text-lg font-light'}
                style={{
                  color: price != null ? 'var(--w-cream)' : 'var(--w-muted)',
                  fontFamily: 'var(--font-jost, system-ui, sans-serif)',
                }}
              >
                {price != null ? formatCurrency(price, displayCurrency) : 'Price on request'}
              </p>
            </div>

            {onAddToCart && inStock ? (
              <button
                onClick={() => onAddToCart(id)}
                className={`inline-flex items-center gap-2 rounded-full border font-medium uppercase tracking-[0.16em] transition-colors ${compact ? 'h-10 px-3 text-[10px] sm:h-11 sm:px-4 sm:text-[11px]' : 'h-11 px-4 text-[11px]'}`}
                style={{
                  borderColor: 'rgba(201,168,76,0.45)',
                  background: 'rgba(201,168,76,0.08)',
                  color: 'var(--w-cream)',
                  fontFamily: 'var(--font-jost, system-ui, sans-serif)',
                }}
                aria-label={`Add ${name} to cart`}
              >
                <ShoppingBag size={15} strokeWidth={1.7} />
                Add
              </button>
            ) : (
              <Link
                href={productHref}
                className={`inline-flex items-center rounded-full border font-medium uppercase tracking-[0.16em] transition-colors ${compact ? 'h-10 px-3 text-[10px] sm:h-11 sm:px-4 sm:text-[11px]' : 'h-11 px-4 text-[11px]'}`}
                style={{
                  borderColor: 'var(--w-border)',
                  color: 'var(--w-cream-2)',
                  fontFamily: 'var(--font-jost, system-ui, sans-serif)',
                }}
              >
                View Piece
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export const WatchProductCard = memo(WatchProductCardComponent)
