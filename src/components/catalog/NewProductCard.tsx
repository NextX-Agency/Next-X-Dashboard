'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Plus, Package, Eye, AlertCircle, Bell } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'
import { Database } from '@/types/database.types'
import { getStockBadgeText, type StockStatus } from '@/lib/stockUtils'

type Item = Database['public']['Tables']['items']['Row']

interface ComboItem {
  quantity: number
  child_item: Item
}

// Re-export StockStatus for backwards compatibility
export type { StockStatus }

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
  stockStatus?: StockStatus
  stockLevel?: number
  showExactStock?: boolean // Whether to show exact "X left" count
}

// Generate SEO-friendly alt text for product images
function generateAltText(name: string, categoryName?: string | null, isCombo?: boolean): string {
  const cleanName = name.trim()
  if (isCombo) {
    return `${cleanName} combo deal bundle`
  }
  if (categoryName) {
    return `${cleanName} ${categoryName.toLowerCase()} - available in Suriname`
  }
  return `${cleanName} - buy at NextX Suriname`
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
  comboItems,
  stockStatus = 'in-stock',
  stockLevel = 0,
  showExactStock = true // Default to showing exact count for low stock
}: NewProductCardProps) {
  const isOutOfStock = stockStatus === 'out-of-stock'
  const isLowStock = stockStatus === 'low-stock'
  
  // Get the stock badge text based on stock level
  const stockBadgeText = isLowStock && showExactStock && stockLevel > 0
    ? `Nog ${stockLevel}`
    : getStockBadgeText(stockStatus)

  // Generate SEO-friendly alt text
  const altText = generateAltText(name, categoryName, isCombo)
  
  // Stock availability for schema
  const stockAvailability = isOutOfStock ? 'OutOfStock' : 'InStock'
  
  return (
    <article 
      className={`group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 h-full flex flex-col ${
        isOutOfStock
          ? 'border border-neutral-300 opacity-75'
          : isCombo 
            ? 'border-2 border-[#f97015]/40 shadow-md hover:shadow-xl hover:shadow-[#f97015]/15' 
            : 'border border-neutral-200/80 shadow-sm hover:border-[#f97015]/30 hover:shadow-lg'
      }`}
      itemScope 
      itemType="https://schema.org/Product"
    >
      {/* Hidden SEO metadata */}
      <meta itemProp="name" content={name} />
      {description && <meta itemProp="description" content={description} />}
      <span itemProp="offers" itemScope itemType="https://schema.org/Offer" className="hidden">
        <meta itemProp="priceCurrency" content={currency} />
        <meta itemProp="price" content={String(price)} />
        <link itemProp="availability" href={`https://schema.org/${stockAvailability}`} />
      </span>

      {/* Image Container */}
      <Link href={`/catalog/${id}`} className="block relative aspect-square bg-neutral-50 overflow-hidden" itemProp="url">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={altText}
            fill
            className={`object-cover transition-transform duration-500 ${isOutOfStock ? 'grayscale' : 'group-hover:scale-105'}`}
            itemProp="image"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package size={48} className="text-neutral-200" strokeWidth={1} />
          </div>
        )}
        
        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <span className="px-3 py-1.5 rounded-lg bg-neutral-800/90 text-white text-sm font-semibold">
              Uitverkocht
            </span>
          </div>
        )}
        
        {/* Category Badge */}
        {categoryName && !isCombo && !isOutOfStock && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[11px] font-medium text-[#141c2e] shadow-sm">
            {categoryName}
          </span>
        )}
        
        {/* Combo Badge */}
        {isCombo && !isOutOfStock && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-linear-to-r from-[#f97015] to-[#e5640d] text-white text-[11px] font-semibold shadow-md">
            Combo Deal
          </span>
        )}

        {/* Low Stock Badge - Shows exact count when available */}
        {isLowStock && !isOutOfStock && stockBadgeText && (
          <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-amber-500/95 text-white text-[10px] font-bold shadow-md flex items-center gap-1 animate-pulse">
            <AlertCircle size={11} />
            {stockBadgeText}
          </span>
        )}
        
        {/* Desktop Hover Actions */}
        {!isOutOfStock && (
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
        )}
        
        {/* In Cart Indicator */}
        {quantity > 0 && !isOutOfStock && (
          <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-[#f97015] text-white text-[11px] font-bold flex items-center justify-center shadow-md">
            {quantity}
          </div>
        )}
      </Link>
      
      {/* Content */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col">
        {/* Name */}
        <Link href={`/catalog/${id}`} className="block shrink-0">
          <h3 className="font-semibold text-[#141c2e] text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-[#f97015] transition-colors min-h-10 sm:min-h-11">
            {name}
          </h3>
        </Link>
        
        {/* Description or Combo Items */}
        {(isCombo && comboItems && comboItems.length > 0) || description ? (
          <div className="mt-1.5 shrink-0 min-h-5">
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
              <span className={`text-base sm:text-lg font-bold ${isOutOfStock ? 'text-neutral-400' : 'text-[#141c2e]'}`}>
                {formatCurrency(price, currency)}
              </span>
            )}
            {/* Stock Status Text for mobile - enhanced with exact count */}
            {isOutOfStock && (
              <span className="text-[10px] text-red-500 font-semibold">Uitverkocht</span>
            )}
            {isLowStock && !isOutOfStock && (
              <span className="text-[10px] text-amber-600 font-semibold">
                {showExactStock && stockLevel > 0 ? `Nog ${stockLevel} beschikbaar` : 'Beperkte voorraad'}
              </span>
            )}
          </div>
          
          {/* Add Button or Notify Button */}
          {isOutOfStock ? (
            /* Notify Me Button for out of stock items */
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                // Open product page where notification can be set up
                window.location.href = `/catalog/${id}`
              }}
              className="shrink-0 px-3 h-9 sm:h-10 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-600 text-xs font-medium"
              aria-label="Melding bij beschikbaarheid"
            >
              <Bell size={14} />
              <span className="hidden sm:inline">Meld mij</span>
            </button>
          ) : (
            /* Add Button - Always visible on mobile, visible on desktop too */
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddToCart()
              }}
              className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all shadow-sm lg:opacity-0 lg:group-hover:opacity-100 bg-[#f97015] text-white hover:bg-[#e5640d] active:scale-95"
              aria-label="Toevoegen aan winkelwagen"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          )}
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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 lg:gap-5">
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
