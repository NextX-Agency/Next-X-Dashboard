'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Package, Plus, ArrowRight } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

interface Product {
  id: string
  name: string
  description?: string | null
  image_url?: string | null
  price: number
  isCombo?: boolean
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
            {products.map((product) => (
              <div key={product.id} className="flex-shrink-0 w-[240px] sm:w-[280px]">
                <article className={`group bg-white rounded-xl overflow-hidden shadow-sm transition-all duration-300 ${
                  isComboCarousel || product.isCombo
                    ? 'border-2 border-[#f97015]/50 hover:shadow-lg hover:shadow-[#f97015]/20' 
                    : 'border border-neutral-200 hover:border-[#f97015]/40 hover:shadow-lg hover:shadow-[#f97015]/10'
                }`}>
                  {/* Image */}
                  <Link href={`/catalog/${product.id}`} className="block relative aspect-[4/3] bg-neutral-50 overflow-hidden">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Package size={40} className="text-neutral-200" strokeWidth={1} />
                      </div>
                    )}
                    
                    {/* Combo Badge */}
                    {(isComboCarousel || product.isCombo) && (
                      <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-gradient-to-r from-[#f97015] to-[#e5640d] text-white text-xs font-semibold shadow-lg">
                        Combo Deal
                      </span>
                    )}
                    
                    {/* Quick Add */}
                    {onAddToCart && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          onAddToCart(product.id)
                        }}
                        className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-[#f97015] text-white flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:bg-[#e5640d] shadow-lg"
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </Link>
                  
                  {/* Info */}
                  <Link href={`/catalog/${product.id}`} className="block p-4">
                    <p className="text-lg font-bold text-[#141c2e] mb-1">
                      {formatCurrency(product.price, currency)}
                    </p>
                    <h3 className="text-sm text-[#141c2e]/70 line-clamp-2 leading-snug group-hover:text-[#f97015] transition-colors">
                      {product.name}
                    </h3>
                  </Link>
                </article>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
