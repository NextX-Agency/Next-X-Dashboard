'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { X, Plus, Minus, Package, MessageCircle, MapPin, ExternalLink } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

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
  onAddToCart
}: NewQuickViewModalProps) {
  const [quantity, setQuantity] = useState(1)

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
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Package size={64} className="text-neutral-300" strokeWidth={1} />
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
              <p className="text-sm text-[#141c2e]/70 leading-relaxed mb-6">
                {description}
              </p>
            )}

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
                <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-10 h-10 flex items-center justify-center text-[#141c2e]/50 hover:text-[#141c2e] transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-10 text-center font-medium text-[#141c2e]">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(q => q + 1)}
                    className="w-10 h-10 flex items-center justify-center text-[#141c2e]/50 hover:text-[#141c2e] transition-colors"
                  >
                    <Plus size={16} />
                  </button>
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
                <button
                  onClick={handleAddToCart}
                  className="w-full h-12 rounded-xl bg-[#f97015] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#e5640d] transition-colors"
                >
                  <Plus size={18} />
                  Toevoegen aan winkelwagen
                </button>
                
                <button
                  onClick={handleWhatsAppOrder}
                  className="w-full h-12 rounded-xl bg-[#25D366] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#22c55e] transition-colors"
                >
                  <MessageCircle size={18} />
                  Direct bestellen via WhatsApp
                </button>
                
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
