'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight, Package, Grid3X3 } from 'lucide-react'

interface Category {
  id: string
  name: string
}

interface NewCategoryNavProps {
  categories: Category[]
  selectedCategory: string
  onCategoryChange: (categoryId: string) => void
  productCounts?: Record<string, number>
}

export function NewCategoryNav({
  categories,
  selectedCategory,
  onCategoryChange,
  productCounts = {}
}: NewCategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  if (categories.length === 0) return null

  return (
    <section className="bg-white border-b border-neutral-100 sticky top-[105px] sm:top-[105px] z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative py-3 sm:py-4">
          {/* Left scroll gradient + button */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-white to-transparent z-10 pointer-events-none hidden md:block" />
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white border border-neutral-200 items-center justify-center text-neutral-600 hover:bg-neutral-50 transition-colors shadow-sm -ml-2 hidden md:flex"
            aria-label="Scroll categorieën links"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Categories container */}
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-0.5 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* All products */}
            <button
              onClick={() => onCategoryChange('')}
              className={`shrink-0 snap-start px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm font-medium transition-all min-h-11 flex items-center ${
                selectedCategory === ''
                  ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30'
                  : 'bg-neutral-100 text-[#141c2e] hover:bg-[#f97015]/10'
              }`}
            >
              <span className="flex items-center gap-2">
                <Grid3X3 size={14} />
                Alle Producten
              </span>
            </button>

            {/* Category buttons */}
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => onCategoryChange(category.id)}
                className={`shrink-0 snap-start px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm font-medium transition-all min-h-11 flex items-center whitespace-nowrap ${
                  selectedCategory === category.id
                    ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30'
                    : 'bg-neutral-100 text-[#141c2e] hover:bg-[#f97015]/10'
                }`}
              >
                {category.name}
                {productCounts[category.id] !== undefined && (
                  <span className={`ml-1.5 text-xs ${
                    selectedCategory === category.id 
                      ? 'text-white/70' 
                      : 'text-[#141c2e]/50'
                  }`}>
                    ({productCounts[category.id]})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right scroll gradient + button */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-white to-transparent z-10 pointer-events-none hidden md:block" />
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white border border-neutral-200 items-center justify-center text-neutral-600 hover:bg-neutral-50 transition-colors shadow-sm -mr-2 hidden md:flex"
            aria-label="Scroll categorieën rechts"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}
