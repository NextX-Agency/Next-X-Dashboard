'use client'

import { ChevronDown, LayoutGrid, Grid3X3 } from 'lucide-react'

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
    <div className="flex flex-wrap items-center gap-3">
      {/* Category filter */}
      <div className="relative">
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="appearance-none h-10 pl-4 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white hover:bg-white/[0.06] hover:border-white/[0.12] focus:outline-none focus:border-orange-500/30 transition-all cursor-pointer"
        >
          <option value="" className="bg-neutral-900">Alle categorieën</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id} className="bg-neutral-900">
              {cat.name}
            </option>
          ))}
        </select>
        <ChevronDown 
          size={14} 
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" 
        />
      </div>

      {/* Sort */}
      <div className="relative">
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="appearance-none h-10 pl-4 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white hover:bg-white/[0.06] hover:border-white/[0.12] focus:outline-none focus:border-orange-500/30 transition-all cursor-pointer"
        >
          <option value="name" className="bg-neutral-900">Naam A-Z</option>
          <option value="price-asc" className="bg-neutral-900">Prijs: Laag → Hoog</option>
          <option value="price-desc" className="bg-neutral-900">Prijs: Hoog → Laag</option>
          <option value="newest" className="bg-neutral-900">Nieuwste eerst</option>
        </select>
        <ChevronDown 
          size={14} 
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" 
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Grid view toggle - desktop only */}
      <div className="hidden sm:flex p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
        <button
          onClick={() => onGridViewChange('comfortable')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            gridView === 'comfortable' 
              ? 'bg-orange-500 text-white' 
              : 'text-neutral-500 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <LayoutGrid size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onGridViewChange('compact')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            gridView === 'compact' 
              ? 'bg-orange-500 text-white' 
              : 'text-neutral-500 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Grid3X3 size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Currency toggle - mobile */}
      <div className="flex sm:hidden p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <button
          onClick={() => onCurrencyChange('SRD')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
            currency === 'SRD' 
              ? 'bg-orange-500 text-white' 
              : 'text-neutral-500 hover:text-white'
          }`}
        >
          SRD
        </button>
        <button
          onClick={() => onCurrencyChange('USD')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
            currency === 'USD' 
              ? 'bg-orange-500 text-white' 
              : 'text-neutral-500 hover:text-white'
          }`}
        >
          USD
        </button>
      </div>
    </div>
  )
}
