'use client'

import Image from 'next/image'
import { Plus, Minus, Package } from 'lucide-react'
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
      {/* Image container with 1:1 ratio */}
      <div 
        className="relative aspect-square rounded-2xl overflow-hidden bg-neutral-900 cursor-pointer mb-3.5"
        onClick={onViewDetail}
      >
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10" />
        
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
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/[0.06] text-[11px] font-medium text-white/90 tracking-wide">
              {categoryName}
            </span>
          </div>
        )}
        
        {/* Hover overlay with add button */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute bottom-4 left-4 right-4">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddToCart()
              }}
              className="w-full py-3 px-4 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 shadow-lg shadow-orange-500/25"
            >
              <Plus size={16} strokeWidth={2} />
              <span>Toevoegen</span>
            </button>
          </div>
        </div>
        
        {/* Floating shadow on hover */}
        <div className="absolute -inset-2 rounded-3xl bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl" />
      </div>
      
      {/* Product info */}
      <div className="flex flex-col flex-1">
        {/* Title */}
        <h3 
          className="text-sm font-medium text-white leading-tight mb-1 line-clamp-2 cursor-pointer transition-colors hover:text-orange-500"
          onClick={onViewDetail}
        >
          {name}
        </h3>
        
        {/* Description - only show first line */}
        {description && (
          <p className="text-xs text-neutral-500 line-clamp-1 mb-2.5">
            {description}
          </p>
        )}
        
        {/* Price and cart controls */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white">
            {formatCurrency(price, currency)}
          </span>
          
          {quantity > 0 ? (
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <button
                onClick={() => onUpdateQuantity(quantity - 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <Minus size={14} strokeWidth={2} />
              </button>
              <span className="w-8 text-center text-sm font-medium text-white">
                {quantity}
              </span>
              <button
                onClick={onAddToCart}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <button
              onClick={onAddToCart}
              className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-400 flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-lg shadow-orange-500/20"
            >
              <Plus size={18} className="text-white" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
