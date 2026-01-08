'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Plus, Minus, Package, ChevronRight } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

interface ProductCardProps {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  price: number
  currency: Currency
  categoryName?: string | null
  quantity: number
  onAddToCart: () => void
  onUpdateQuantity: (quantity: number) => void
  onViewDetail: () => void
}

export function ProductCard({
  id,
  name,
  description,
  imageUrl,
  price,
  currency,
  categoryName,
  quantity,
  onAddToCart,
  onUpdateQuantity,
  onViewDetail
}: ProductCardProps) {
  return (
    <article className="group relative flex flex-col">
      {/* Card glow effect */}
      <div className="absolute -inset-2 bg-gradient-to-r from-[#f97015]/0 via-[#f97015]/0 to-[#f97015]/0 rounded-3xl blur-xl group-hover:from-[#f97015]/20 group-hover:via-[#f97015]/10 group-hover:to-[#f97015]/20 transition-all duration-500 opacity-0 group-hover:opacity-100" />
      
      {/* Entire card is a link for navigation */}
      <Link
        href={`/catalog/${id}`}
        className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 cursor-pointer mb-4 border border-white/[0.08] group-hover:border-[#f97015]/40 transition-all duration-500 shadow-lg group-hover:shadow-2xl group-hover:shadow-[#f97015]/20 block"
      >
        {/* Shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent" />
        
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package 
              size={48} 
              className="text-neutral-800" 
              strokeWidth={1}
            />
          </div>
        )}
        
        {/* Category badge */}
        {categoryName && (
          <div className="absolute top-4 left-4 z-10">
            <span className="px-3.5 py-1.5 rounded-xl bg-black/70 backdrop-blur-xl border border-white/[0.15] text-[11px] font-bold text-white tracking-wide shadow-xl">
              {categoryName}
            </span>
          </div>
        )}
        
        {/* View product indicator */}
        <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
            <ChevronRight size={18} className="text-white" />
          </div>
        </div>
        
        {/* Hover overlay with add button */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
          <div className="absolute bottom-5 left-5 right-5">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onAddToCart()
              }}
              className="w-full py-3.5 px-5 rounded-2xl bg-[#f97015] hover:bg-[#e5640d] text-white text-sm font-bold flex items-center justify-center gap-2.5 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0 shadow-2xl shadow-[#f97015]/50 min-h-[48px]"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>Toevoegen</span>
            </button>
          </div>
        </div>
      </Link>
      
      {/* Product info - also clickable */}
      <Link href={`/catalog/${id}`} className="flex flex-col flex-1 group/info">
        {/* Title */}
        <h3 className="text-sm font-medium text-white leading-tight mb-1 line-clamp-2 transition-colors group-hover/info:text-[#f97015]">
          {name}
        </h3>
        
        {/* Description - only show first line */}
        {description && (
          <p className="text-xs text-neutral-500 line-clamp-1 mb-2.5">
            {description}
          </p>
        )}
      </Link>
        
      {/* Price and cart controls - separate from link */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-lg font-black text-[#f97015]">
          {formatCurrency(price, currency)}
        </span>
        
        {quantity > 0 ? (
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={(e) => {
                e.preventDefault()
                onUpdateQuantity(quantity - 1)
              }}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <Minus size={16} strokeWidth={2} />
            </button>
            <span className="w-8 text-center text-sm font-medium text-white">
              {quantity}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault()
                onAddToCart()
              }}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.preventDefault()
              onAddToCart()
            }}
            className="w-12 h-12 rounded-xl bg-[#f97015] hover:bg-[#e5640d] flex items-center justify-center transition-all duration-300 hover:scale-105 shadow-lg shadow-[#f97015]/40"
          >
            <Plus size={20} className="text-white" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </article>
  )
}
