'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Smartphone, Tablet, Laptop, Gamepad2, Tv, Speaker, Watch, Camera, Headphones, Package } from 'lucide-react'

interface Category {
  id: string
  name: string
  image_url?: string | null
  item_count?: number
}

interface CategorySliderProps {
  categories: Category[]
  selectedCategory: string
  onCategoryChange: (categoryId: string) => void
}

// Map category names to icons (fallback when no image)
const getCategoryIcon = (name: string) => {
  const lower = name.toLowerCase()
  if (lower.includes('phone') || lower.includes('telefoon')) return Smartphone
  if (lower.includes('tablet')) return Tablet
  if (lower.includes('laptop') || lower.includes('computer')) return Laptop
  if (lower.includes('game') || lower.includes('gaming')) return Gamepad2
  if (lower.includes('tv') || lower.includes('television') || lower.includes('televisie')) return Tv
  if (lower.includes('speaker') || lower.includes('audio')) return Speaker
  if (lower.includes('watch') || lower.includes('horloge')) return Watch
  if (lower.includes('camera')) return Camera
  if (lower.includes('headphone') || lower.includes('earphone') || lower.includes('koptelefoon')) return Headphones
  return Package
}

export function CategorySlider({ categories, selectedCategory, onCategoryChange }: CategorySliderProps) {
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
    <section className="relative bg-neutral-900/50 border-y border-white/[0.04]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Section title */}
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
          Shop per categorie
        </h2>

        <div className="relative group">
          {/* Left scroll button */}
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-neutral-900/90 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-800 -ml-2"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Categories container */}
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* All products option */}
            <button
              onClick={() => onCategoryChange('')}
              className={`flex-shrink-0 flex flex-col items-center gap-3 p-4 rounded-2xl transition-all duration-200 w-[110px] ${
                selectedCategory === ''
                  ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30'
                  : 'bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                selectedCategory === '' ? 'bg-white/20' : 'bg-white/[0.04]'
              }`}>
                <Package size={28} strokeWidth={1.5} />
              </div>
              <span className="text-xs font-semibold text-center truncate w-full px-1">Alles</span>
            </button>

            {/* Category buttons */}
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.name)
              const isSelected = selectedCategory === category.id

              return (
                <button
                  key={category.id}
                  onClick={() => onCategoryChange(category.id)}
                  className={`flex-shrink-0 flex flex-col items-center gap-3 p-4 rounded-2xl transition-all duration-200 w-[110px] ${
                    isSelected
                      ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30'
                      : 'bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden ${
                    isSelected ? 'bg-white/20' : 'bg-white/[0.04]'
                  }`}>
                    {category.image_url ? (
                      <Image
                        src={category.image_url}
                        alt={category.name}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon size={28} strokeWidth={1.5} />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-center uppercase tracking-wide truncate w-full px-1" title={category.name}>
                    {category.name}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Right scroll button */}
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-neutral-900/90 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-800 -mr-2"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </section>
  )
}
