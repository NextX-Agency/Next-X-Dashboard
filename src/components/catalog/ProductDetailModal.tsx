'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { X, Plus, Minus, Package, Tag, ExternalLink, MessageCircle, MapPin } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

interface ProductDetailModalProps {
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

export function ProductDetailModal({
  isOpen,
  onClose,
  id,
  name,
  description,
  imageUrl,
  price,
  currency,
  categoryName,
  storeAddress = 'Commewijne, Noord',
  whatsappNumber = '+5978318508',
  storeName = 'NextX',
  onAddToCart
}: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1)

  if (!isOpen) return null

  const handleAddToCart = () => {
    onAddToCart(quantity)
    setQuantity(1)
    onClose()
  }

  // Generate WhatsApp message for quick order
  const generateWhatsAppMessage = () => {
    const total = price * quantity
    let message = `Hallo ${storeName}!\n\n`
    message += `Ik wil graag het volgende product ophalen:\n\n`
    message += `━━━━━━━━━━━━━━━━━━\n`
    message += `📦 Product: ${name}\n`
    message += `💰 Prijs: ${formatCurrency(price, currency)}\n`
    message += `🔢 Aantal: ${quantity}\n`
    message += `💵 Totaal: ${formatCurrency(total, currency)}\n`
    message += `━━━━━━━━━━━━━━━━━━\n\n`
    message += `📍 Ophaallocatie: ${storeAddress}\n\n`
    message += `Bedankt!`
    
    return message
  }

  const handleWhatsAppOrder = () => {
    const message = generateWhatsAppMessage()
    const cleanNumber = whatsappNumber.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`, '_blank')
    setQuantity(1)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-3xl bg-neutral-950 rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto border border-white/[0.06] shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-xl bg-black/40 backdrop-blur-md border border-white/[0.06] flex items-center justify-center hover:bg-black/60 transition-colors min-h-[44px] min-w-[44px]"
        >
          <X size={18} className="text-white" />
        </button>

        <div className="md:flex">
          {/* Image */}
          <div className="md:w-1/2 aspect-square bg-neutral-900 relative">
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
                <Package size={80} className="text-neutral-800" strokeWidth={1} />
              </div>
            )}
            
            {/* Category badge on image */}
            {categoryName && (
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/[0.06] text-xs font-medium text-white/90">
                  {categoryName}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="md:w-1/2 p-6 sm:p-8 flex flex-col">
            {/* Category tag */}
            {categoryName && (
              <div className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-full bg-[#f97015]/10 text-[#f97015] text-xs font-medium mb-4 md:hidden">
                <Tag size={12} strokeWidth={2} />
                <span>{categoryName}</span>
              </div>
            )}
            
            {/* Title */}
            <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-4">
              {name}
            </h2>
            
            {/* Description */}
            {description && (
              <p className="text-sm text-neutral-400 leading-relaxed mb-6 flex-1 line-clamp-4">
                {description}
              </p>
            )}

            {/* Pickup Info */}
            <div className="flex items-center gap-2 text-sm text-neutral-500 mb-6 p-3 rounded-xl bg-[#f97015]/5 border border-[#f97015]/10">
              <MapPin size={16} className="text-[#f97015] flex-shrink-0" />
              <span>Ophalen in {storeAddress}</span>
            </div>

            {/* Price and CTA */}
            <div className="pt-6 border-t border-white/[0.04] mt-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-neutral-500 mb-1">Prijs</p>
                  <span className="text-2xl font-bold text-[#f97015]">
                    {formatCurrency(price, currency)}
                  </span>
                </div>
                
                {/* Quantity Selector */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Minus size={16} strokeWidth={2} />
                  </button>
                  <span className="w-10 text-center text-base font-semibold text-white">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(q => q + 1)}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Plus size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Total when quantity > 1 */}
              {quantity > 1 && (
                <div className="flex items-center justify-between py-3 mb-4 border-t border-white/[0.04]">
                  <span className="text-sm text-neutral-400">Totaal ({quantity} stuks)</span>
                  <span className="text-lg font-bold text-white">{formatCurrency(price * quantity, currency)}</span>
                </div>
              )}
              
              {/* Buttons */}
              <div className="flex flex-col gap-3">
                {/* WhatsApp Order Button */}
                <button
                  onClick={handleWhatsAppOrder}
                  className="w-full h-14 rounded-2xl bg-[#25D366] hover:bg-[#22c55e] text-white font-semibold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg shadow-green-500/20 hover:shadow-green-500/30 min-h-[56px]"
                >
                  <MessageCircle size={20} strokeWidth={2} />
                  <span>Bestel voor ophalen</span>
                </button>

                {/* Add to cart or View full page */}
                <div className="flex gap-3">
                  <button
                    onClick={handleAddToCart}
                    className="flex-1 h-12 rounded-xl bg-[#f97015] hover:bg-[#e5640d] text-white font-medium flex items-center justify-center gap-2 transition-all duration-200 min-h-[48px]"
                  >
                    <Plus size={18} strokeWidth={2} />
                    <span>{quantity > 1 ? `${quantity}× toevoegen` : 'In winkelwagen'}</span>
                  </button>
                  
                  <Link
                    href={`/catalog/${id}`}
                    onClick={onClose}
                    className="h-12 px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-white font-medium flex items-center justify-center gap-2 transition-all duration-200 min-h-[48px]"
                  >
                    <ExternalLink size={18} />
                    <span className="hidden sm:inline">Bekijk product</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
