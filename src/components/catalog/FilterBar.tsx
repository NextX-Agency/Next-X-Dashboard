'use client'

import { ChevronDown, LayoutGrid, Grid3X3, SlidersHorizontal } from 'lucide-react'

interface Category {
  id: string
  name: string
}

interface FilterBarProps {
  categories: Category[]
  selectedCategory: string
  onCategoryChange: (categoryId: string) => void
  sortBy: string
  onSortChange: (sort: string) => void
  gridView: 'comfortable' | 'compact'
  onGridViewChange: (view: 'comfortable' | 'compact') => void
  currency: 'SRD' | 'USD'
  onCurrencyChange: (currency: 'SRD' | 'USD') => void
}

export function FilterBar({
  categories,
  selectedCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
  gridView,
  onGridViewChange,
  currency,
  onCurrencyChange
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Category filter */}
      <div className="relative group">
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="appearance-none h-12 pl-5 pr-12 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-white hover:bg-white/8 hover:border-[#f97015]/30 focus:outline-none focus:border-[#f97015]/50 focus:ring-2 focus:ring-[#f97015]/20 transition-all cursor-pointer"
        >
          <option value="" className="bg-neutral-900">Alle categorieën</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id} className="bg-neutral-900">
              {cat.name}
            </option>
          ))}
        </select>
        <ChevronDown 
          size={16} 
          className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none group-hover:text-[#f97015] transition-colors" 
        />
      </div>

      {/* Sort */}
      <div className="relative group">
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="appearance-none h-12 pl-5 pr-12 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-white hover:bg-white/8 hover:border-[#f97015]/30 focus:outline-none focus:border-[#f97015]/50 focus:ring-2 focus:ring-[#f97015]/20 transition-all cursor-pointer"
        >
          <option value="name" className="bg-neutral-900">Naam A-Z</option>
          <option value="price-asc" className="bg-neutral-900">Prijs: Laag → Hoog</option>
          <option value="price-desc" className="bg-neutral-900">Prijs: Hoog → Laag</option>
          <option value="newest" className="bg-neutral-900">Nieuwste eerst</option>
        </select>
        <ChevronDown 
          size={16} 
          className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none group-hover:text-[#f97015] transition-colors" 
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Grid view toggle - desktop only */}
      <div className="hidden sm:flex p-1 rounded-xl bg-white/5 border border-white/10">
        <button
          onClick={() => onGridViewChange('comfortable')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
            gridView === 'comfortable' 
              ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30' 
              : 'text-neutral-500 hover:text-white hover:bg-white/6'
          }`}
        >
          <LayoutGrid size={18} strokeWidth={2} />
        </button>
        <button
          onClick={() => onGridViewChange('compact')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
            gridView === 'compact' 
              ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30' 
              : 'text-neutral-500 hover:text-white hover:bg-white/6'
          }`}
        >
          <Grid3X3 size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Currency toggle - mobile */}
      <div className="flex sm:hidden p-1 rounded-xl bg-white/5 border border-white/10">
        <button
          onClick={() => onCurrencyChange('SRD')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            currency === 'SRD' 
              ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30' 
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          SRD
        </button>
        <button
          onClick={() => onCurrencyChange('USD')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            currency === 'USD' 
              ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30' 
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          USD
        </button>
      </div>
    </div>
  )
}
