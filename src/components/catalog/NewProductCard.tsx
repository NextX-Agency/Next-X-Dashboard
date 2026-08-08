'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Plus, Package, Eye, Bell } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'
import { Database } from '@/types/database.types'
import { type StockStatus } from '@/lib/stockUtils'

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
  catalogBasePath?: string
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
  showExactStock = true, // Default to showing exact count for low stock
  catalogBasePath = '/catalog'
}: NewProductCardProps) {
  const isOutOfStock = stockStatus === 'out-of-stock'
  const isLowStock = stockStatus === 'low-stock'
  
  const productHref = `${catalogBasePath}/${id}`

  // Generate SEO-friendly alt text
  const altText = generateAltText(name, categoryName, isCombo)
  
  // Stock availability for schema
  const stockAvailability = isOutOfStock ? 'OutOfStock' : 'InStock'
  
  return (
    <article
      className={`catalog-hover-lift group relative flex h-full flex-col overflow-hidden rounded-sm bg-white ${
        isOutOfStock
          ? 'border border-neutral-200 opacity-70'
          : isCombo
            ? 'border border-[#f97015] hover:border-[#d95c08]'
            : 'border border-neutral-200 hover:border-[#111111]'
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

      {/* Accent rule — the card's only hover flourish */}
      {!isOutOfStock && (
        <span className="absolute inset-x-0 top-0 z-10 h-[3px] origin-left scale-x-0 bg-[#f97015] transition-transform duration-300 group-hover:scale-x-100" />
      )}

      {/* Image Container — tinted well so white product shots read as objects */}
      <Link href={productHref} className="block relative aspect-square bg-[#f6f6f4] overflow-hidden border-b border-neutral-200" itemProp="url">
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
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="px-3 py-1.5 rounded-sm bg-[#111111] text-white text-xs font-semibold uppercase tracking-[0.1em]">
              Uitverkocht
            </span>
          </div>
        )}

        {/* Combo Badge */}
        {isCombo && !isOutOfStock && (
          <span className="absolute top-0 left-0 px-2.5 py-1.5 bg-[#f97015] text-white text-[10px] font-semibold uppercase tracking-[0.1em]">
            Combo
          </span>
        )}

        {/* Quick view — slides in on hover, desktop only */}
        {!isOutOfStock && (
          <button
            onClick={(e) => {
              e.preventDefault()
              onQuickView()
            }}
            className="absolute right-0 top-0 hidden h-10 w-10 translate-x-full items-center justify-center bg-[#f97015] text-white transition-transform duration-300 group-hover:translate-x-0 hover:bg-[#d95c08] lg:flex"
            aria-label="Snel bekijken"
          >
            <Eye size={17} />
          </button>
        )}

        {/* In Cart Indicator */}
        {quantity > 0 && !isOutOfStock && (
          <div className="absolute top-0 right-0 h-6 min-w-6 px-1.5 bg-[#111111] text-white text-[11px] font-bold flex items-center justify-center audio-num">
            {quantity}
          </div>
        )}
      </Link>
      
      {/* Content */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col">
        {/* Category eyebrow — replaces the badge that used to cover the photo */}
        {categoryName && !isCombo && (
          <p className="audio-eyebrow audio-eyebrow-muted mb-1.5 truncate text-[0.625rem]">
            {categoryName}
          </p>
        )}

        {/* Name */}
        <Link href={productHref} className="block shrink-0">
          <h3 className="font-semibold text-[#111111] text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-[#f97015] transition-colors min-h-10 sm:min-h-11">
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

        {/* Price */}
        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-3">
          <div className="flex min-w-0 flex-col">
            {isCombo && originalPrice && originalPrice > price && (
              <span className="audio-num text-[11px] text-neutral-400 line-through">
                {formatCurrency(originalPrice, currency)}
              </span>
            )}
            <span
              className={`audio-num audio-display text-lg leading-none sm:text-xl ${
                isOutOfStock ? 'text-neutral-400' : isCombo ? 'text-[#f97015]' : 'text-[#111111]'
              }`}
            >
              {formatCurrency(price, currency)}
            </span>
          </div>

          {/* Availability as a word, not a coloured pill. Sold-out is already
              stated on the image and in the action bar. */}
          {isOutOfStock ? null : isLowStock ? (
            <span className="audio-num shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-[#f97015]">
              {showExactStock && stockLevel > 0 ? `Nog ${stockLevel}` : 'Beperkt'}
            </span>
          ) : (
            <span className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-neutral-400">
              Op voorraad
            </span>
          )}
        </div>
      </div>

      {/* Action bar — always present, so every card ends on a solid block */}
      {isOutOfStock ? (
        <Link
          href={productHref}
          className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-neutral-200 bg-white text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-neutral-500 transition-colors hover:text-[#111111]"
        >
          <Bell size={14} />
          Meld mij
        </Link>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAddToCart()
          }}
          className="flex h-11 shrink-0 items-center justify-center gap-2 bg-[#f97015] text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[#d95c08]"
        >
          <Plus size={15} strokeWidth={2.5} />
          Toevoegen
        </button>
      )}
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
        <div className={`w-16 h-16 rounded-sm border flex items-center justify-center mb-5 ${isDark ? 'border-neutral-200' : 'border-white/20'}`}>
          <Package size={26} className={isDark ? 'text-neutral-400' : 'text-white/40'} strokeWidth={1.5} />
        </div>
        <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-[#111111]' : 'text-white'}`}>
          {emptyMessage}
        </h3>
        <p className={`text-sm mb-6 text-center max-w-sm ${isDark ? 'text-neutral-600' : 'text-white/60'}`}>
          Probeer een andere zoekterm of bekijk alle producten
        </p>
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            className="h-11 px-6 rounded-sm bg-[#f97015] text-white text-[0.8125rem] font-semibold uppercase tracking-[0.1em] hover:bg-[#d95c08] transition-colors"
          >
            Bekijk alle producten
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
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
  const titleClass = `text-2xl font-bold ${variant === 'light' ? 'text-white' : 'text-[#111111]'}`
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
