'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { X, Plus, Minus, Package, MessageCircle, MapPin, ExternalLink, AlertCircle, Check, Bell } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'
import { STOCK_THRESHOLDS, getStockStatusText, type StockStatus } from '@/lib/stockUtils'

interface NewQuickViewModalProps {
  isOpen: boolean
  onClose: () => void
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  price: number
  currency: Currency
  categoryName?: string | null
  storeAddress?: string
  whatsappNumber?: string
  storeName?: string
  onAddToCart: (quantity: number) => void
  stockLevel?: number
  stockStatus?: StockStatus
}

export function NewQuickViewModal({
  isOpen,
  onClose,
  id,
  name,
  description,
  imageUrl,
  price,
  currency,
  categoryName,
  storeAddress = '',
  whatsappNumber = '',
  storeName = '',
  onAddToCart,
  stockLevel = Infinity,
  stockStatus = 'in-stock'
}: NewQuickViewModalProps) {
  const [quantity, setQuantity] = useState(1)
  
  // Stock state derived from props
  const isOutOfStock = stockStatus === 'out-of-stock' || stockLevel <= STOCK_THRESHOLDS.OUT_OF_STOCK
  const isLowStock = stockStatus === 'low-stock' || (stockLevel <= STOCK_THRESHOLDS.LOW_STOCK && !isOutOfStock)
  const maxQuantity = isOutOfStock ? 0 : stockLevel
  const canIncrement = quantity < maxQuantity

  if (!isOpen) return null

  const handleAddToCart = () => {
    onAddToCart(quantity)
    setQuantity(1)
    onClose()
  }

  const handleWhatsAppOrder = () => {
    const total = price * quantity
    let message = `Hallo ${storeName}!\n\n`
    message += `Ik wil graag het volgende product ophalen:\n\n`
    message += `📦 Product: ${name}\n`
    message += `💰 Prijs: ${formatCurrency(price, currency)}\n`
    message += `🔢 Aantal: ${quantity}\n`
    message += `💵 Totaal: ${formatCurrency(total, currency)}\n\n`
    message += `📍 Ophaallocatie: ${storeAddress}\n\n`
    message += `Bedankt!`
    
    const cleanNumber = whatsappNumber.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`, '_blank')
    setQuantity(1)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-3xl bg-white rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-[#f97015]/10 transition-colors"
        >
          <X size={18} className="text-[#141c2e]" />
        </button>

        <div className="md:flex">
          {/* Image */}
          <div className="md:w-1/2 aspect-square bg-neutral-100 relative">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={name}
                fill
                className={`object-cover ${isOutOfStock ? 'opacity-50 grayscale' : ''}`}
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Package size={64} className="text-neutral-300" strokeWidth={1} />
              </div>
            )}
            
            {/* Out of stock overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="px-4 py-2 rounded-full bg-white/90 text-sm font-semibold text-red-600">
                  Uitverkocht
                </span>
              </div>
            )}
            
            {/* Category badge */}
            {categoryName && (
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm text-xs font-medium text-[#141c2e] shadow-sm">
                  {categoryName}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="md:w-1/2 p-6 sm:p-8 flex flex-col">
            {/* Title */}
            <h2 className="text-2xl font-bold text-[#141c2e] mb-2">
              {name}
            </h2>
            
            {/* Description */}
            {description && (
              <p className="text-sm text-[#141c2e]/70 leading-relaxed mb-4">
                {description}
              </p>
            )}
            
            {/* Stock Status Indicator */}
            <div className="mb-4">
              {isOutOfStock ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-700">
                  <AlertCircle size={14} />
                  <span className="text-sm font-semibold">Uitverkocht</span>
                </div>
              ) : isLowStock ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700">
                  <AlertCircle size={14} />
                  <span className="text-sm font-semibold">Nog {stockLevel} beschikbaar</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 text-green-700">
                  <Check size={14} />
                  <span className="text-sm font-semibold">Op voorraad</span>
                </div>
              )}
            </div>

            {/* Pickup Info */}
            <div className="flex items-center gap-2 text-sm text-[#141c2e]/60 mb-6 p-3 rounded-xl bg-[#f97015]/5 border border-[#f97015]/10">
              <MapPin size={16} className="text-[#f97015] flex-shrink-0" />
              <span>Alleen afhalen in {storeAddress}</span>
            </div>

            <div className="mt-auto">
              {/* Price */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-[#141c2e]/50 mb-1">Prijs per stuk</p>
                  <span className="text-2xl font-bold text-[#141c2e]">
                    {formatCurrency(price, currency)}
                  </span>
                </div>
                
                {/* Quantity Selector */}
                <div>
                  <div className={`flex items-center rounded-xl border bg-neutral-50 ${
                    isOutOfStock ? 'border-neutral-300 opacity-50' : 'border-neutral-200'
                  }`}>
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      disabled={isOutOfStock || quantity <= 1}
                      className={`w-10 h-10 flex items-center justify-center transition-colors ${
                        isOutOfStock || quantity <= 1
                          ? 'text-neutral-300 cursor-not-allowed'
                          : 'text-[#141c2e]/50 hover:text-[#141c2e]'
                      }`}
                    >
                      <Minus size={16} />
                    </button>
                    <span className={`w-10 text-center font-medium ${isOutOfStock ? 'text-neutral-400' : 'text-[#141c2e]'}`}>
                      {isOutOfStock ? 0 : quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                      disabled={!canIncrement || isOutOfStock}
                      className={`w-10 h-10 flex items-center justify-center transition-colors ${
                        !canIncrement || isOutOfStock
                          ? 'text-neutral-300 cursor-not-allowed'
                          : 'text-[#141c2e]/50 hover:text-[#141c2e]'
                      }`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {!isOutOfStock && quantity >= maxQuantity && maxQuantity !== Infinity && (
                    <p className="text-xs text-amber-600 mt-1 text-center">Max</p>
                  )}
                </div>
              </div>

              {/* Total when quantity > 1 */}
              {quantity > 1 && (
                <div className="flex items-center justify-between py-3 mb-4 border-t border-neutral-100">
                  <span className="text-sm text-[#141c2e]/60">Totaal ({quantity} stuks)</span>
                  <span className="text-lg font-bold text-[#141c2e]">
                    {formatCurrency(price * quantity, currency)}
                  </span>
                </div>
              )}
              
              {/* Action Buttons */}
              <div className="space-y-3">
                {isOutOfStock ? (
                  <button
                    className="w-full h-12 rounded-xl bg-neutral-200 text-neutral-500 font-medium flex items-center justify-center gap-2 cursor-not-allowed"
                    disabled
                  >
                    <AlertCircle size={18} />
                    Uitverkocht
                  </button>
                ) : (
                  <button
                    onClick={handleAddToCart}
                    className="w-full h-12 rounded-xl bg-[#f97015] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#e5640d] transition-colors"
                  >
                    <Plus size={18} />
                    Toevoegen aan winkelwagen
                  </button>
                )}
                
                {isOutOfStock ? (
                  <button
                    onClick={() => {
                      const message = `Hallo ${storeName}!\n\nIk ben geïnteresseerd in "${name}" maar deze is uitverkocht. Kunt u mij laten weten wanneer dit product weer beschikbaar is?\n\nBedankt!`
                      const cleanNumber = whatsappNumber.replace(/[^0-9]/g, '')
                      window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`, '_blank')
                    }}
                    className="w-full h-12 rounded-xl bg-[#25D366] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#22c55e] transition-colors"
                  >
                    <Bell size={18} />
                    Meld mij wanneer beschikbaar
                  </button>
                ) : (
                  <button
                    onClick={handleWhatsAppOrder}
                    className="w-full h-12 rounded-xl bg-[#25D366] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#22c55e] transition-colors"
                  >
                    <MessageCircle size={18} />
                    Direct bestellen via WhatsApp
                  </button>
                )}
                
                <Link
                  href={`/catalog/${id}`}
                  className="w-full h-12 rounded-xl border border-neutral-200 text-[#141c2e] font-medium flex items-center justify-center gap-2 hover:bg-[#f97015]/5 hover:border-[#f97015]/30 transition-colors"
                >
                  Bekijk details
                  <ExternalLink size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
