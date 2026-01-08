'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Package, Plus } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

interface Product {
  id: string
  name: string
  description?: string | null
  image_url?: string | null
  price: number
  category_name?: string | null
}

interface ProductCarouselProps {
  title: string
  products: Product[]
  currency: Currency
  onAddToCart?: (productId: string) => void
  viewAllHref?: string
}

export function ProductCarousel({ 
  title, 
  products, 
  currency, 
  onAddToCart,
  viewAllHref 
}: ProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  if (products.length === 0) return null

  return (
    <section className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          {viewAllHref && (
            <Link 
              href={viewAllHref}
              className="text-sm font-medium text-[#f97015] hover:text-[#e5640d] transition-colors"
            >
              Bekijk alles →
            </Link>
          )}
        </div>

        {/* Carousel container */}
        <div className="relative group">
          {/* Left scroll button */}
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-neutral-900/95 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-neutral-800 hover:scale-110 -ml-4 shadow-xl"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Products scroll container */}
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/catalog/${product.id}`}
                className="flex-shrink-0 w-[200px] sm:w-[220px] group/card"
              >
                <article className="bg-neutral-900/50 border border-white/[0.06] rounded-2xl overflow-hidden hover:border-[#f97015]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#f97015]/10">
                  {/* Image */}
                  <div className="aspect-square bg-neutral-800 relative overflow-hidden">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover group-hover/card:scale-105 transition-transform duration-500"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Package size={48} className="text-neutral-700" strokeWidth={1} />
                      </div>
                    )}
                    
                    {/* Quick add button */}
                    {onAddToCart && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onAddToCart(product.id)
                        }}
                        className="absolute bottom-3 right-3 w-10 h-10 rounded-xl bg-[#f97015] hover:bg-[#e5640d] flex items-center justify-center text-white opacity-0 group-hover/card:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/card:translate-y-0 shadow-lg"
                      >
                        <Plus size={20} />
                      </button>
                    )}
                  </div>

                  {/* Product info */}
                  <div className="p-4">
                    {/* Price */}
                    <p className="text-lg font-bold text-[#f97015] mb-1">
                      {formatCurrency(product.price, currency)}
                    </p>
                    
                    {/* Name */}
                    <h3 className="text-sm text-white font-medium line-clamp-2 leading-snug group-hover/card:text-[#f97015] transition-colors">
                      {product.name}
                    </h3>
                  </div>
                </article>
              </Link>
            ))}
          </div>

          {/* Right scroll button */}
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-neutral-900/95 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-neutral-800 hover:scale-110 -mr-4 shadow-xl"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>
    </section>
  )
}
