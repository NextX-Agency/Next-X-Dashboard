'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Package, Plus, ArrowRight, AlertCircle, Bell } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'
import { getStockBadgeText, type StockStatus } from '@/lib/stockUtils'

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
  isComboCarousel = false
}: NewProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

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

  const backgroundClass = bgColor === 'neutral-50' ? 'bg-neutral-50' : 'bg-white'

  return (
    <section className={`py-10 ${backgroundClass}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#141c2e]">{title}</h2>
            {subtitle && (
              <p className="text-sm text-[#141c2e]/60 mt-1">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Scroll buttons */}
            <div className="hidden sm:flex items-center gap-2 mr-4">
              <button
                onClick={() => scroll('left')}
                className="w-9 h-9 rounded-full border-2 border-neutral-300 flex items-center justify-center text-[#141c2e] hover:bg-[#f97015]/10 hover:border-[#f97015]/50 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-9 h-9 rounded-full border-2 border-neutral-300 flex items-center justify-center text-[#141c2e] hover:bg-[#f97015]/10 hover:border-[#f97015]/50 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            
            {/* View all */}
            {(viewAllHref || viewAllClick) && (
              viewAllHref ? (
                <Link 
                  href={viewAllHref}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[#f97015] border-2 border-[#f97015]/30 rounded-lg hover:text-[#e5640d] hover:border-[#f97015]/50 hover:bg-[#f97015]/5 transition-all"
                >
                  Bekijk alles
                  <ArrowRight size={14} />
                </Link>
              ) : (
                <button
                  onClick={viewAllClick}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[#f97015] border-2 border-[#f97015]/30 rounded-lg hover:text-[#e5640d] hover:border-[#f97015]/50 hover:bg-[#f97015]/5 transition-all"
                >
                  Bekijk alles
                  <ArrowRight size={14} />
                </button>
              )
            )}
          </div>
        </div>

        {/* Products Carousel */}
        <div className="relative -mx-4 sm:mx-0">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-4 sm:px-0 pb-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {products.map((product) => {
              const isOutOfStock = product.stockStatus === 'out-of-stock'
              const isLowStock = product.stockStatus === 'low-stock'
              const stockBadgeText = isLowStock && product.stockLevel && product.stockLevel > 0
                ? `Nog ${product.stockLevel}`
                : getStockBadgeText(product.stockStatus || 'in-stock')
              
              return (
                <div key={product.id} className="flex-shrink-0 w-[160px] sm:w-[200px] lg:w-[220px]">
                  <article className={`group bg-white rounded-2xl overflow-hidden transition-all duration-300 h-full flex flex-col ${
                    isOutOfStock
                      ? 'border border-neutral-300 opacity-75'
                      : isComboCarousel || product.isCombo
                        ? 'border-2 border-[#f97015]/40 shadow-md hover:shadow-xl hover:shadow-[#f97015]/15' 
                        : 'border border-neutral-200/80 shadow-sm hover:border-[#f97015]/30 hover:shadow-lg'
                  }`}>
                    {/* Image */}
                    <Link href={`/catalog/${product.id}`} className="block relative aspect-square bg-neutral-50 overflow-hidden">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className={`object-cover transition-transform duration-500 ${isOutOfStock ? 'grayscale' : 'group-hover:scale-105'}`}
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Package size={36} className="text-neutral-200" strokeWidth={1} />
                        </div>
                      )}
                      
                      {/* Out of Stock Overlay */}
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                          <span className="px-2.5 py-1 rounded-lg bg-neutral-800/90 text-white text-xs font-semibold">
                            Uitverkocht
                          </span>
                        </div>
                      )}
                      
                      {/* Combo Badge */}
                      {(isComboCarousel || product.isCombo) && !isOutOfStock && (
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#f97015] to-[#e5640d] text-white text-[11px] font-semibold shadow-md">
                          Combo Deal
                        </span>
                      )}

                      {/* Low Stock Badge - Shows exact count */}
                      {isLowStock && !isOutOfStock && stockBadgeText && (
                        <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full bg-amber-500/95 text-white text-[9px] font-bold shadow-md flex items-center gap-0.5 animate-pulse">
                          <AlertCircle size={9} />
                          {stockBadgeText}
                        </span>
                      )}
                      
                      {/* Desktop Hover Quick Add */}
                      {onAddToCart && !isOutOfStock && (
                        <div className="hidden lg:block">
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              onAddToCart(product.id)
                            }}
                            className="absolute bottom-3 right-3 w-9 h-9 rounded-xl bg-[#f97015] text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:bg-[#e5640d] active:scale-95 shadow-lg"
                          >
                            <Plus size={18} strokeWidth={2.5} />
                          </button>
                        </div>
                      )}
                    </Link>
                    
                    {/* Info */}
                    <div className="p-3 flex-1 flex flex-col">
                      <Link href={`/catalog/${product.id}`} className="block flex-1">
                        <h3 className="text-sm text-[#141c2e] font-semibold line-clamp-2 leading-snug group-hover:text-[#f97015] transition-colors min-h-[2.5rem]">
                          {product.name}
                        </h3>
                      </Link>
                      
                      {/* Price and Button Row */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-neutral-100">
                        <div className="flex flex-col">
                          <p className={`text-base sm:text-lg font-bold ${isOutOfStock ? 'text-neutral-400' : 'text-[#141c2e]'}`}>
                            {formatCurrency(product.price, currency)}
                          </p>
                          {isOutOfStock && (
                            <span className="text-[9px] text-red-500 font-semibold">Uitverkocht</span>
                          )}
                          {isLowStock && !isOutOfStock && (
                            <span className="text-[9px] text-amber-600 font-semibold">
                              {product.stockLevel && product.stockLevel > 0 
                                ? `Nog ${product.stockLevel} beschikbaar` 
                                : 'Beperkte voorraad'}
                            </span>
                          )}
                        </div>
                        {onAddToCart && (
                          isOutOfStock ? (
                            /* Notify button for out of stock */
                            <Link
                              href={`/catalog/${product.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="lg:hidden flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-500"
                              aria-label="Bekijk product"
                            >
                              <Bell size={14} />
                            </Link>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onAddToCart(product.id)
                              }}
                              className="lg:hidden flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm bg-[#f97015] text-white hover:bg-[#e5640d] active:scale-95"
                              aria-label="Toevoegen aan winkelwagen"
                            >
                              <Plus size={16} strokeWidth={2.5} />
                            </button>
                          )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
