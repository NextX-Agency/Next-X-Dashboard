'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Plus, Package, ShoppingCart, Eye } from 'lucide-react'
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
    <article className={`group relative bg-white rounded-xl overflow-hidden shadow-sm transition-all duration-300 ${
      isCombo 
        ? 'border-2 border-[#f97015]/50 hover:shadow-lg hover:shadow-[#f97015]/20' 
        : 'border border-neutral-200 hover:border-[#f97015]/40 hover:shadow-lg hover:shadow-[#f97015]/10'
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
          <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/90 backdrop-blur-sm text-xs font-medium text-[#141c2e] shadow-sm">
            {categoryName}
          </span>
        )}
        
        {/* Combo Badge */}
        {isCombo && (
          <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-gradient-to-r from-[#000000] to-[#7d3302] text-white text-xs font-semibold shadow-lg">
            Combo Deal
          </span>
        )}
        
        {/* Hover Actions */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
        <div className="absolute bottom-4 left-4 right-4 flex gap-2 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          <button
            onClick={(e) => {
              e.preventDefault()
              onAddToCart()
            }}
            className="flex-1 h-11 rounded-xl bg-[#f97015] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#e5640d] transition-colors shadow-lg"
          >
            <Plus size={16} />
            Toevoegen
          </button>
          <button
            onClick={(e) => {
              e.preventDefault()
              onQuickView()
            }}
            className="w-11 h-11 rounded-xl bg-white text-[#141c2e] flex items-center justify-center hover:bg-neutral-100 transition-colors shadow-lg"
          >
            <Eye size={18} />
          </button>
        </div>
        
        {/* In Cart Indicator */}
        {quantity > 0 && (
          <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[#f97015] text-white text-xs font-bold flex items-center justify-center shadow-lg">
            {quantity}
          </div>
        )}
      </Link>
      
      {/* Content */}
      <div className="p-4 h-32 flex flex-col justify-between">
        <div className="flex-1">
          {/* Name */}
          <Link href={`/catalog/${id}`}>
            <h3 className="font-medium text-[#141c2e] line-clamp-2 leading-snug group-hover:text-[#f97015] transition-colors h-10">
              {name}
            </h3>
          </Link>
          
          {/* Description or Combo Items */}
          <div className="mt-2 h-8 overflow-hidden">
            {isCombo && comboItems && comboItems.length > 0 ? (
              <div className="space-y-1">
                {comboItems.slice(0, 2).map((item, index) => (
                  <div key={index} className="text-xs text-neutral-600 flex items-center gap-1 line-clamp-1">
                    <span className="text-[#f97015] font-medium">{item.quantity}x</span>
                    <span className="truncate">{item.child_item.name}</span>
                  </div>
                ))}
              </div>
            ) : description ? (
              <p className="text-sm text-neutral-500 line-clamp-2">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        
        {/* Price */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex flex-col min-h-[3rem]">
            {isCombo && originalPrice && originalPrice > price ? (
              <>
                <span className="text-xs text-neutral-400 line-through">
                  {formatCurrency(originalPrice, currency)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-[#f97015]">
                    {formatCurrency(price, currency)}
                  </span>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                    Bespaar {formatCurrency(originalPrice - price, currency)}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-lg font-bold text-[#141c2e]">
                {formatCurrency(price, currency)}
              </span>
            )}
          </div>
          
          {/* Quick Add Button (Mobile) */}
          <button
            onClick={onAddToCart}
            className="lg:hidden w-9 h-9 rounded-full bg-[#f97015] text-white flex items-center justify-center hover:bg-[#e5640d] transition-colors"
          >
            <Plus size={16} />
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
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
