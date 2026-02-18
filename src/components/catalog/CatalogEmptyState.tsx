'use client'

import { Package, Search, FolderOpen } from 'lucide-react'

/**
 * CatalogEmptyState - Unified empty state component for the catalog.
 * Used across search results, category views, and collection views.
 */

interface CatalogEmptyStateProps {
  /** Type of empty state to render */
  type?: 'search' | 'category' | 'collection' | 'generic'
  /** Custom heading */
  title?: string
  /** Custom description */
  description?: string
  /** Action button */
  action?: {
    label: string
    onClick: () => void
  }
}

export function CatalogEmptyState({
  type = 'generic',
  title,
  description,
  action,
}: CatalogEmptyStateProps) {
  const defaults: Record<string, { icon: typeof Package; title: string; description: string }> = {
    search: {
      icon: Search,
      title: 'Geen resultaten gevonden',
      description: 'Probeer een andere zoekterm of bekijk alle producten',
    },
    category: {
      icon: FolderOpen,
      title: 'Geen producten in deze categorie',
      description: 'Bekijk andere categorieën of alle producten',
    },
    collection: {
      icon: Package,
      title: 'Deze collectie is leeg',
      description: 'Bekijk andere collecties of alle producten',
    },
    generic: {
      icon: Package,
      title: 'Geen producten gevonden',
      description: 'Probeer een andere zoekterm of bekijk alle producten',
    },
  }

  const config = defaults[type]
  const Icon = config.icon
  const displayTitle = title || config.title
  const displayDescription = description || config.description

  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-20 px-6">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
        <Icon size={32} className="text-neutral-300" strokeWidth={1.5} />
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-[#141c2e] mb-2 text-center">
        {displayTitle}
      </h3>
      <p className="text-sm text-[#141c2e]/60 mb-6 text-center max-w-sm">
        {displayDescription}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2.5 rounded-full bg-[#f97015] text-white text-sm font-medium hover:bg-[#e5640d] transition-colors shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
