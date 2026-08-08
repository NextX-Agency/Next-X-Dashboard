'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Package, Plus, ArrowRight, Bell } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'
import { type StockStatus } from '@/lib/stockUtils'
import { useScrollReveal } from '@/lib/useScrollReveal'

// Re-export for backwards compatibility
export type { StockStatus }

interface Product {
  id: string
  name: string
  description?: string | null
  image_url?: string | null
  price: number
  isCombo?: boolean
  stockStatus?: StockStatus
  stockLevel?: number // Add stock level for exact count display
}

interface NewProductCarouselProps {
  title: string
  subtitle?: string
  products: Product[]
  currency: Currency
  onAddToCart?: (productId: string) => void
  viewAllHref?: string
  viewAllClick?: () => void
  bgColor?: 'white' | 'neutral-50'
  isComboCarousel?: boolean
  catalogBasePath?: string
  /** Micro-label above the section title. */
  eyebrow?: string
  /** 1-based position on the page, rendered as a large index numeral. */
  index?: number
}

export function NewProductCarousel({
  title,
  subtitle,
  products,
  currency,
  onAddToCart,
  viewAllHref,
  viewAllClick,
  bgColor = 'white',
  isComboCarousel = false,
  catalogBasePath = '/catalog',
  eyebrow,
  index
}: NewProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useScrollReveal(sectionRef, { threshold: 0.1 })

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 320
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  if (products.length === 0) return null

  const backgroundClass = bgColor === 'neutral-50' ? 'bg-[#f6f6f4]' : 'bg-white'
  const sectionEyebrow = eyebrow || (isComboCarousel ? 'Voordeel' : 'Collectie')

  return (
    <section ref={sectionRef} className={`py-8 sm:py-12 ${backgroundClass} border-b border-neutral-200`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-5 flex items-end justify-between gap-4 border-b-2 border-[#111111] pb-3 sm:mb-6 sm:pb-4">
          <div className="flex min-w-0 items-start gap-4 sm:gap-6">
            {index !== undefined && (
              <span
                className="audio-display audio-num catalog-reveal-left hidden shrink-0 text-[2.75rem] leading-[0.8] text-[#f97015] sm:block lg:text-[3.5rem]"
                aria-hidden="true"
              >
                {String(index).padStart(2, '0')}
              </span>
            )}
            <div className="min-w-0">
              <p className="catalog-reveal-left audio-eyebrow mb-2 flex items-center gap-3">
                <span className="h-px w-6 bg-[#f97015]" />
                {sectionEyebrow}
              </p>
              <h2 className="catalog-reveal audio-display text-2xl leading-[1.05] text-[#111111] sm:text-3xl lg:text-[2.5rem]">
                {title}
              </h2>
              {subtitle && (
                <p className="catalog-reveal catalog-reveal-d1 text-sm text-neutral-500 mt-2">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Scroll buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => scroll('left')}
                className="w-9 h-9 rounded-sm border border-[#f97015] flex items-center justify-center text-[#f97015] transition-colors hover:bg-[#f97015] hover:text-white"
                aria-label="Vorige producten"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-9 h-9 rounded-sm border border-[#f97015] flex items-center justify-center text-[#f97015] transition-colors hover:bg-[#f97015] hover:text-white"
                aria-label="Volgende producten"
              >
                <ChevronRight size={17} />
              </button>
            </div>

            {/* View all */}
            {(viewAllHref || viewAllClick) && (
              viewAllHref ? (
                <Link
                  href={viewAllHref}
                  className="flex h-9 items-center gap-1.5 rounded-sm border border-[#f97015] px-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#f97015] transition-colors hover:bg-[#f97015] hover:text-white"
                >
                  Alles
                  <ArrowRight size={13} />
                </Link>
              ) : (
                <button
                  onClick={viewAllClick}
                  className="flex h-9 items-center gap-1.5 rounded-sm border border-[#f97015] px-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#f97015] transition-colors hover:bg-[#f97015] hover:text-white"
                >
                  Alles
                  <ArrowRight size={13} />
                </button>
              )
            )}
          </div>
        </div>

        {/* Products Carousel */}
        <div className="relative -mx-4 sm:mx-0">
          <div
            ref={scrollRef}
            className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 sm:px-0 pb-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {products.map((product) => {
              const isOutOfStock = product.stockStatus === 'out-of-stock'
              const isLowStock = product.stockStatus === 'low-stock'
              const productHref = `${catalogBasePath}/${product.id}`

              return (
                <div key={product.id} className="shrink-0 w-[42vw] sm:w-[200px] md:w-[210px] lg:w-[220px] snap-start">
                  <article className={`catalog-hover-lift group relative flex h-full flex-col overflow-hidden rounded-sm bg-white ${
                    isOutOfStock
                      ? 'border border-neutral-200 opacity-70'
                      : isComboCarousel || product.isCombo
                        ? 'border border-[#f97015] hover:border-[#d95c08]'
                        : 'border border-neutral-200 hover:border-[#111111]'
                  }`}>
                    {!isOutOfStock && (
                      <span className="absolute inset-x-0 top-0 z-10 h-[3px] origin-left scale-x-0 bg-[#f97015] transition-transform duration-300 group-hover:scale-x-100" />
                    )}

                    {/* Image */}
                    <Link href={productHref} className="block relative aspect-square bg-[#f6f6f4] overflow-hidden border-b border-neutral-200">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className={`object-cover transition-transform duration-500 ${isOutOfStock ? 'grayscale' : 'group-hover:scale-105'}`}
                          sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 220px"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Package size={36} className="text-neutral-200" strokeWidth={1} />
                        </div>
                      )}
                      
                      {/* Out of Stock Overlay */}
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <span className="px-2.5 py-1 rounded-sm bg-[#111111] text-white text-[10px] font-semibold uppercase tracking-[0.1em]">
                            Uitverkocht
                          </span>
                        </div>
                      )}

                      {/* Combo Badge */}
                      {(isComboCarousel || product.isCombo) && !isOutOfStock && (
                        <span className="absolute top-0 left-0 px-2.5 py-1.5 bg-[#f97015] text-white text-[10px] font-semibold uppercase tracking-[0.1em]">
                          Combo
                        </span>
                      )}

                      {/* Desktop Hover Quick Add */}
                    </Link>

                    {/* Info */}
                    <div className="flex flex-1 flex-col p-3">
                      <Link href={productHref} className="block flex-1">
                        <h3 className="audio-heading line-clamp-2 min-h-10 text-sm leading-snug text-[#111111] transition-colors group-hover:text-[#f97015]">
                          {product.name}
                        </h3>
                      </Link>

                      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-2.5">
                        <p className={`audio-num audio-display text-lg leading-none ${isOutOfStock ? 'text-neutral-400' : 'text-[#111111]'}`}>
                          {formatCurrency(product.price, currency)}
                        </p>
                        {/* Sold-out is already stated on the image and in the
                            action bar, so it is not repeated here. */}
                        {!isOutOfStock && isLowStock ? (
                          <span className="audio-num shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-[#f97015]">
                            {product.stockLevel && product.stockLevel > 0 ? `Nog ${product.stockLevel}` : 'Beperkt'}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Action bar — always present, on every breakpoint */}
                    {onAddToCart && (
                      isOutOfStock ? (
                        <Link
                          href={productHref}
                          className="flex h-10 shrink-0 items-center justify-center gap-2 border-t border-neutral-200 bg-white text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-neutral-500 transition-colors hover:text-[#111111]"
                        >
                          <Bell size={13} />
                          Meld mij
                        </Link>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onAddToCart(product.id)
                          }}
                          className="flex h-10 shrink-0 items-center justify-center gap-2 bg-[#f97015] text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[#d95c08]"
                        >
                          <Plus size={14} strokeWidth={2.5} />
                          Toevoegen
                        </button>
                      )
                    )}
                  </article>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
