'use client'

import { memo, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Category {
  id: string
  name: string
}

interface WatchesCategoryNavProps {
  categories: Category[]
  activeCategory: string | null
  onCategoryChange: (id: string | null) => void
}

function WatchesCategoryNavComponent({
  categories,
  activeCategory,
  onCategoryChange,
}: WatchesCategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })
  }

  const allPills = [{ id: null, name: 'All Watches' }, ...categories.map(c => ({ id: c.id, name: c.name }))]

  return (
    <div className="w-category-nav" style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
      <div className="relative max-w-screen-2xl mx-auto">
        {/* Left scroll btn */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 transition-opacity hover:opacity-70 lg:hidden"
          style={{ color: 'var(--w-muted)' }}
          aria-label="Scroll left"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>

        {/* Pills scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-6 lg:px-12 py-4 scrollbar-hide"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {allPills.map(pill => (
            <button
              key={pill.id ?? '__all__'}
              onClick={() => onCategoryChange(pill.id)}
              className={`w-category-pill flex-shrink-0 ${activeCategory === pill.id ? 'active' : ''}`}
              style={{ scrollSnapAlign: 'start' }}
            >
              {pill.name}
            </button>
          ))}
        </div>

        {/* Right scroll btn */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 transition-opacity hover:opacity-70 lg:hidden"
          style={{ color: 'var(--w-muted)' }}
          aria-label="Scroll right"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

export const WatchesCategoryNav = memo(WatchesCategoryNavComponent)
