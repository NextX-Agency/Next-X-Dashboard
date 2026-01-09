'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Plus, Package, Eye } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'
import { Database } from '@/types/database.types'

type Item = Database['public']['Tables']['items']['Row']

interface ComboItem {
  quantity: number
  child_item: Item
}

interface NewProductCardProps {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  price: number
  currency: Currency
  categoryName?: string | null
  quantity: number
  onAddToCart: () => void
  onQuickView: () => void
  isCombo?: boolean
  originalPrice?: number
  comboItems?: ComboItem[]
}

export function NewProductCard({
  id,
  name,
  description,
  imageUrl,
  price,
  currency,
  categoryName,
  quantity,
  onAddToCart,
  onQuickView,
  isCombo = false,
  originalPrice,
  comboItems
}: NewProductCardProps) {
  return (
    <article className={`group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 h-full flex flex-col ${
      isCombo 
        ? 'border-2 border-[#f97015]/40 shadow-md hover:shadow-xl hover:shadow-[#f97015]/15' 
        : 'border border-neutral-200/80 shadow-sm hover:border-[#f97015]/30 hover:shadow-lg'
    }`}>
      {/* Image Container */}
      <Link href={`/catalog/${id}`} className="block relative aspect-square bg-neutral-50 overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package size={48} className="text-neutral-200" strokeWidth={1} />
          </div>
        )}
        
        {/* Category Badge */}
        {categoryName && !isCombo && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[11px] font-medium text-[#141c2e] shadow-sm">
            {categoryName}
          </span>
        )}
        
        {/* Combo Badge */}
        {isCombo && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#f97015] to-[#e5640d] text-white text-[11px] font-semibold shadow-md">
            Combo Deal
          </span>
        )}
        
        {/* Desktop Hover Actions */}
        <div className="hidden lg:block">
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
          <div className="absolute bottom-3 left-3 right-3 flex gap-2 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
            <button
              onClick={(e) => {
                e.preventDefault()
                onAddToCart()
              }}
              className="flex-1 h-10 rounded-xl bg-[#f97015] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#e5640d] active:scale-[0.98] transition-all shadow-lg"
            >
              <Plus size={16} strokeWidth={2.5} />
              Toevoegen
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                onQuickView()
              }}
              className="w-10 h-10 rounded-xl bg-white text-[#141c2e] flex items-center justify-center hover:bg-neutral-100 active:scale-[0.98] transition-all shadow-lg"
            >
              <Eye size={18} />
            </button>
          </div>
        </div>
        
        {/* In Cart Indicator */}
        {quantity > 0 && (
          <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-[#f97015] text-white text-[11px] font-bold flex items-center justify-center shadow-md">
            {quantity}
          </div>
        )}
      </Link>
      
      {/* Content */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col">
        {/* Name */}
        <Link href={`/catalog/${id}`} className="block flex-shrink-0">
          <h3 className="font-semibold text-[#141c2e] text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-[#f97015] transition-colors min-h-[2.5rem] sm:min-h-[2.75rem]">
            {name}
          </h3>
        </Link>
        
        {/* Description or Combo Items */}
        {(isCombo && comboItems && comboItems.length > 0) || description ? (
          <div className="mt-1.5 flex-shrink-0 min-h-[1.25rem]">
            {isCombo && comboItems && comboItems.length > 0 ? (
              <div className="space-y-0.5">
                {comboItems.slice(0, 2).map((item, index) => (
                  <div key={index} className="text-[11px] sm:text-xs text-neutral-500 flex items-center gap-1">
                    <span className="text-[#f97015] font-medium">{item.quantity}×</span>
                    <span className="truncate">{item.child_item.name}</span>
                  </div>
                ))}
              </div>
            ) : description ? (
              <p className="text-[11px] sm:text-xs text-neutral-500 line-clamp-1">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        
        {/* Spacer */}
        <div className="flex-1 min-h-2" />
        
        {/* Price and Add Button Row */}
        <div className="flex items-end justify-between gap-2 mt-auto pt-2">
          <div className="flex flex-col min-w-0">
            {isCombo && originalPrice && originalPrice > price ? (
              <>
                <span className="text-[11px] text-neutral-400 line-through">
                  {formatCurrency(originalPrice, currency)}
                </span>
                <span className="text-base sm:text-lg font-bold text-[#f97015]">
                  {formatCurrency(price, currency)}
                </span>
              </>
            ) : (
              <span className="text-base sm:text-lg font-bold text-[#141c2e]">
                {formatCurrency(price, currency)}
              </span>
            )}
          </div>
          
          {/* Add Button - Always visible on mobile, visible on desktop too */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddToCart()
            }}
            className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#f97015] text-white flex items-center justify-center hover:bg-[#e5640d] active:scale-95 transition-all shadow-sm lg:opacity-0 lg:group-hover:opacity-100"
            aria-label="Toevoegen aan winkelwagen"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </article>
  )
}

// Grid Component
interface NewProductGridProps {
  children: React.ReactNode
  isEmpty?: boolean
  onClearFilters?: () => void
  emptyMessage?: string
  variant?: 'light' | 'dark'
}

export function NewProductGrid({ 
  children, 
  isEmpty, 
  onClearFilters,
  emptyMessage = "Geen producten gevonden",
  variant = 'light'
}: NewProductGridProps) {
  if (isEmpty) {
    const isDark = variant === 'dark'
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-neutral-200' : 'bg-white/10'}`}>
          <Package size={32} className={isDark ? 'text-neutral-400' : 'text-white/40'} strokeWidth={1.5} />
        </div>
        <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-[#141c2e]' : 'text-white'}`}>
          {emptyMessage}
        </h3>
        <p className={`text-sm mb-6 text-center max-w-sm ${isDark ? 'text-[#141c2e]/60' : 'text-white/60'}`}>
          Probeer een andere zoekterm of bekijk alle producten
        </p>
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            className="px-6 py-2.5 rounded-full bg-[#f97015] text-white text-sm font-medium hover:bg-[#e5640d] transition-colors"
          >
            Bekijk alle producten
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
      {children}
    </div>
  )
}

// Section Header Component
interface ProductSectionHeaderProps {
  title: string
  subtitle?: string
  count?: number
  variant?: 'light' | 'dark'
  action?: {
    label: string
    onClick: () => void
  }
}

export function ProductSectionHeader({ 
  title, 
  subtitle,
  count,
  variant = 'light',
  action 
}: ProductSectionHeaderProps) {
  const titleClass = `text-2xl font-bold ${variant === 'light' ? 'text-white' : 'text-[#141c2e]'}`
  const subtitleClass = `text-sm ${variant === 'light' ? 'text-white/60' : 'text-neutral-600'} mt-1`

  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h2 className={titleClass}>
          {title}
        </h2>
        {(subtitle || count !== undefined) && (
          <p className={subtitleClass}>
            {subtitle || `${count} producten`}
          </p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-medium text-[#f97015] hover:text-[#e5640d] transition-colors"
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}
