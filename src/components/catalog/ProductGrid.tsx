'use client'

import { ReactNode } from 'react'
import { Package } from 'lucide-react'

interface ProductGridProps {
  children: ReactNode
  isEmpty?: boolean
  onClearFilters?: () => void
}

export function ProductGrid({ children, isEmpty, onClearFilters }: ProductGridProps) {
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="w-20 h-20 rounded-sm bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
          <Package size={32} className="text-neutral-600" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">
          Geen producten gevonden
        </h3>
        <p className="text-sm text-neutral-500 mb-8 text-center max-w-sm">
          Probeer een andere zoekterm of categorie om producten te vinden
        </p>
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            className="px-6 py-3 rounded-sm bg-white/[0.04] border border-white/[0.06] text-sm font-medium text-white hover:bg-white/[0.06] transition-colors"
          >
            Filters wissen
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-x-6 sm:gap-y-10">
      {children}
    </div>
  )
}

interface ProductGridHeaderProps {
  count: number
  categoryName?: string | null
}

export function ProductGridHeader({ count, categoryName }: ProductGridHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h2 className="text-lg font-medium text-white">
          {categoryName || 'Alle producten'}
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {count} {count === 1 ? 'product' : 'producten'}
        </p>
      </div>
    </div>
  )
}
