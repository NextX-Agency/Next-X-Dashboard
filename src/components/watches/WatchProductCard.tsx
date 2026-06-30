'use client'

import { memo, useEffect, useRef, useState } from 'react'
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
  categoryName?: string
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

const MAX_CONCURRENT_WATCH_IMAGES = 2
let activeWatchImageLoads = 0
const pendingWatchImageLoads: Array<() => void> = []

function scheduleWatchImageLoad(start: () => void) {
  let queued = true

  const run = () => {
    if (!queued) return
    queued = false
    activeWatchImageLoads += 1
    start()
  }

  if (activeWatchImageLoads < MAX_CONCURRENT_WATCH_IMAGES) {
    run()
  } else {
    pendingWatchImageLoads.push(run)
  }

  return () => {
    if (!queued) return
    queued = false
    const index = pendingWatchImageLoads.indexOf(run)
    if (index >= 0) {
      pendingWatchImageLoads.splice(index, 1)
    }
  }
}

function releaseWatchImageLoad() {
  activeWatchImageLoads = Math.max(0, activeWatchImageLoads - 1)
  const nextLoad = pendingWatchImageLoads.shift()
  if (nextLoad) {
    nextLoad()
  }
}

function WatchProductCardComponent({
  id,
  name,
  brand,
  categoryName,
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
  const imageContainerRef = useRef<HTMLAnchorElement>(null)
  const [shouldLoadImage, setShouldLoadImage] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const releaseImageSlotRef = useRef<() => void>(() => {})
  const resolvedImageSizes = imageSizes ?? (
    compact
      ? '(max-width: 640px) 48vw, (max-width: 1024px) 32vw, (max-width: 1536px) 24vw, 19vw'
      : '(max-width: 640px) 86vw, (max-width: 1024px) 42vw, (max-width: 1536px) 30vw, 24vw'
  )
  const unoptimizedImage = shouldBypassNextImageOptimization(imageUrl)
  const availabilityLabel = !inStock
    ? 'Sold out'
    : stockCount <= 3
      ? `${stockCount} left`
      : 'Available now'
  const shouldShowCategory = Boolean(categoryName && categoryName.toLowerCase() !== brand?.toLowerCase())

  useEffect(() => {
    if (!imageUrl || shouldLoadImage) return
    const target = imageContainerRef.current
    if (!target) return

    if (!('IntersectionObserver' in window)) {
      setImageLoaded(false)
      setShouldLoadImage(true)
      return
    }

    let slotActive = false
    let slotReleased = false
    const releaseSlot = () => {
      if (!slotActive || slotReleased) return
      slotReleased = true
      releaseWatchImageLoad()
    }
    releaseImageSlotRef.current = releaseSlot

    const requestLoad = () => {
      scheduleWatchImageLoad(() => {
        slotActive = true
        setShouldLoadImage(true)
      })
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
          requestLoad()
          observer.disconnect()
        }
      },
      { rootMargin: compact ? '420px 0px' : '520px 0px', threshold: 0.01 }
    )

    observer.observe(target)
    return () => {
      observer.disconnect()
      releaseSlot()
      releaseImageSlotRef.current = () => {}
    }
  }, [compact, imageUrl, shouldLoadImage])

  useEffect(() => {
    setImageLoaded(false)
    setShouldLoadImage(false)
  }, [imageUrl])

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-[6px] border transition duration-300 hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--w-border)',
        background: 'linear-gradient(180deg, rgba(18,20,24,0.96), rgba(10,10,12,0.98))',
        boxShadow: compact ? '0 10px 28px rgba(0, 0, 0, 0.14)' : '0 14px 38px rgba(0, 0, 0, 0.18)',
      }}
    >
      <div className="relative">
        <Link
          ref={imageContainerRef}
          href={productHref}
          className={`block relative w-full overflow-hidden border-b ${compact ? 'aspect-square sm:aspect-[4/5]' : 'aspect-[4/5]'}`}
          style={{
            background: 'radial-gradient(circle at 50% 28%, rgba(201,168,76,0.08), transparent 34%), var(--w-surface)',
            borderColor: 'var(--w-border)',
          }}
          tabIndex={-1}
          aria-label={name}
        >
          {imageUrl && shouldLoadImage ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              sizes={resolvedImageSizes}
              quality={75}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              unoptimized={unoptimizedImage}
              onLoad={() => {
                setImageLoaded(true)
                releaseImageSlotRef.current()
              }}
              onError={() => releaseImageSlotRef.current()}
              className={`object-contain p-3 transition duration-500 will-change-transform group-hover:scale-[1.025] sm:p-4 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          ) : null}

          {(!imageUrl || !imageLoaded) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div style={{ position: 'relative', width: compact ? 56 : 64, height: compact ? 56 : 64 }}>
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
                {imageUrl ? 'Loading' : 'Image soon'}
              </span>
            </div>
          )}

          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.03) 48%, rgba(9,9,11,0.18) 100%)' }}
          />

          <div
            className={`absolute rounded-[3px] border uppercase tracking-[0.18em] ${compact ? 'left-2 top-2 px-1.5 py-0.5 text-[7px] sm:left-2.5 sm:top-2.5 sm:px-2 sm:text-[8px]' : 'left-3 top-3 px-2.5 py-1 text-[9px]'}`}
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
            className={`absolute rounded-[3px] border uppercase tracking-[0.14em] ${compact ? 'right-2 top-2 px-1.5 py-0.5 text-[7px] sm:right-2.5 sm:top-2.5 sm:px-2 sm:text-[8px]' : 'right-3 top-3 px-2.5 py-1 text-[9px]'}`}
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
            className={`absolute flex items-center justify-center rounded-[4px] border transition-all hover:opacity-100 ${compact ? 'bottom-2 right-2 h-8 w-8 sm:bottom-2.5 sm:right-2.5 sm:h-9 sm:w-9' : 'bottom-3 right-3 h-10 w-10'}`}
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

      <div className={`flex flex-1 flex-col ${compact ? 'px-3 py-3 sm:px-3.5 sm:py-3.5' : 'px-4 py-4 sm:px-5 sm:py-5'}`}>
        <div className={`flex items-start justify-between gap-3 ${compact ? 'mb-2' : 'mb-3'}`}>
          <div className="min-w-0">
            {brand && (
              <p
                className={`truncate uppercase tracking-[0.18em] ${compact ? 'mb-1 text-[8px] sm:text-[9px]' : 'mb-1.5 text-[9px] lg:text-[10px]'}`}
                style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                {brand}
              </p>
            )}

            <Link href={productHref} className="block group/name">
              <h3
                className={`line-clamp-2 font-light leading-snug ${compact ? 'min-h-10 text-[1.02rem] sm:min-h-11 sm:text-[1.12rem]' : 'text-[1.22rem]'}`}
                style={{
                  fontFamily: 'var(--font-cormorant, Georgia, serif)',
                  color: 'var(--w-cream)',
                }}
              >
                {name}
              </h3>
            </Link>

            {shouldShowCategory && (
              <p
                className={`mt-1 truncate uppercase tracking-[0.14em] ${compact ? 'text-[8px]' : 'text-[9px]'}`}
                style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                {categoryName}
              </p>
            )}
          </div>
        </div>

        {!compact && (
          <p
            className="text-[10px] uppercase tracking-[0.16em]"
            style={{ color: inStock ? 'var(--w-cream-2)' : 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            {inStock ? 'Available for order' : 'Currently unavailable'}
          </p>
        )}

        <div className={`mt-auto ${compact ? 'pt-2.5' : 'pt-4'}`} style={{ borderTop: '1px solid var(--w-border)' }}>
          <div className={compact ? 'flex flex-col items-stretch gap-2.5' : 'flex items-end justify-between gap-2.5'}>
            <div className="min-w-0">
              <p
                className={`mb-0.5 uppercase tracking-[0.16em] ${compact ? 'text-[8px]' : 'text-[10px]'}`}
                style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                Price
              </p>
              <p
                className={`font-light ${compact ? 'whitespace-nowrap text-sm sm:text-base' : 'text-lg'}`}
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
                className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-[4px] border font-medium uppercase tracking-[0.14em] transition-colors ${compact ? 'h-9 w-full px-2.5 text-[9px] sm:px-3 sm:text-[10px]' : 'h-11 px-4 text-[11px]'}`}
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
                className={`inline-flex shrink-0 items-center justify-center rounded-[4px] border font-medium uppercase tracking-[0.14em] transition-colors ${compact ? 'h-9 w-full px-2.5 text-[9px] sm:px-3 sm:text-[10px]' : 'h-11 px-4 text-[11px]'}`}
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
