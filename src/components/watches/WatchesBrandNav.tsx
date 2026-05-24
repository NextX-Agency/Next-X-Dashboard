'use client'

import { memo, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface WatchesBrandNavProps {
  brands: string[]
  activeBrand: string | null
  onChange: (brand: string | null) => void
}

function WatchesBrandNavComponent({
  brands,
  activeBrand,
  onChange,
}: WatchesBrandNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })
  }

  return (
    <div
      className="flex items-stretch"
      style={{ borderBottom: '1px solid var(--w-border)' }}
    >
      {/* Left arrow */}
      <button
        onClick={() => scroll('left')}
        className="shrink-0 hidden sm:flex items-center px-3 transition-opacity hover:opacity-100 opacity-35"
        style={{ color: 'var(--w-cream-2)', borderRight: '1px solid var(--w-border)' }}
        aria-label="Scroll brands left"
      >
        <ChevronLeft size={15} strokeWidth={1.5} />
      </button>

      {/* Scrollable tabs */}
      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto scrollbar-none flex-1"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* "All" tab */}
        <Tab
          label="All Watches"
          isActive={activeBrand === null}
          onClick={() => onChange(null)}
        />
        {brands.map((brand) => (
          <Tab
            key={brand}
            label={brand}
            isActive={activeBrand === brand}
            onClick={() => onChange(brand)}
          />
        ))}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll('right')}
        className="shrink-0 hidden sm:flex items-center px-3 transition-opacity hover:opacity-100 opacity-35"
        style={{ color: 'var(--w-cream-2)', borderLeft: '1px solid var(--w-border)' }}
        aria-label="Scroll brands right"
      >
        <ChevronRight size={15} strokeWidth={1.5} />
      </button>
    </div>
  )
}

function Tab({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center px-5 py-4 text-[10px] tracking-[0.22em] uppercase font-light whitespace-nowrap transition-colors"
      style={{
        color: isActive ? 'var(--w-orange)' : 'var(--w-muted)',
        borderBottom: `2px solid ${isActive ? 'var(--w-orange)' : 'transparent'}`,
        fontFamily: 'var(--font-jost, system-ui, sans-serif)',
        scrollSnapAlign: 'start',
      }}
    >
      {label}
    </button>
  )
}

export const WatchesBrandNav = memo(WatchesBrandNavComponent)
