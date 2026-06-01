'use client'

import { memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
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
  imageSizes,
  cartQuantity = 0,
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
  const resolvedImageSizes = imageSizes ?? '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, (max-width: 1680px) 33vw, 25vw'
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
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.18)',
      }}
    >
      <div className="relative">
        <Link
          href={productHref}
          className="block relative w-full overflow-hidden border-b"
          style={{ aspectRatio: '5/6', background: 'var(--w-surface)', borderColor: 'var(--w-border)' }}
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
            className="absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.22em]"
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
            className="absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.16em]"
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
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:opacity-100"
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

      <div className="flex flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
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
                  fontSize: 'clamp(1.15rem, 2vw, 1.45rem)',
                }}
              >
                {name}
              </h3>
            </Link>
          </div>
        </div>

        <p
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: inStock ? 'var(--w-cream-2)' : 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
        >
          {inStock ? 'Available for order' : 'Currently unavailable'}
        </p>

        <div className="mt-auto pt-4" style={{ borderTop: '1px solid var(--w-border)' }}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p
                className="mb-1 text-[10px] uppercase tracking-[0.18em]"
                style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                Price
              </p>
              <p
                className="text-lg font-light"
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
                className="inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors"
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
                className="inline-flex h-11 items-center rounded-full border px-4 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors"
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
