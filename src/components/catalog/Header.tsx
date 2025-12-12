'use client'

import Image from 'next/image'
import { MessageCircle, ShoppingCart } from 'lucide-react'

interface HeaderProps {
  storeName: string
  logoUrl?: string
  whatsappNumber: string
  currency: 'SRD' | 'USD'
  onCurrencyChange: (currency: 'SRD' | 'USD') => void
  cartCount: number
  onCartClick: () => void
}

export function Header({
  storeName,
  logoUrl,
  whatsappNumber,
  currency,
  onCurrencyChange,
  cartCount,
  onCartClick
}: HeaderProps) {
  const whatsappClean = whatsappNumber.replace(/[^0-9]/g, '')

  return (
    <header className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex-shrink-0">
            {logoUrl ? (
              <Image 
                src={logoUrl} 
                alt={storeName} 
                width={120} 
                height={40} 
                className="h-7 sm:h-8 w-auto object-contain"
                unoptimized
              />
            ) : (
              <span className="text-xl font-semibold tracking-tight">
                <span className="text-white">Next</span>
                <span className="text-orange-500">X</span>
              </span>
            )}
          </div>

          {/* Desktop actions */}
          <div className="flex items-center gap-3">
            {/* Currency toggle - desktop */}
            <div className="hidden sm:flex p-1 rounded-full bg-white/[0.03] border border-white/[0.06]">
              <button
                onClick={() => onCurrencyChange('SRD')}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  currency === 'SRD' 
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                SRD
              </button>
              <button
                onClick={() => onCurrencyChange('USD')}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  currency === 'USD' 
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                USD
              </button>
            </div>

            {/* WhatsApp - desktop */}
            <a
              href={`https://wa.me/${whatsappClean}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 h-10 px-5 rounded-full bg-[#25D366] hover:bg-[#22c55e] text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-[#25D366]/20 hover:shadow-[#25D366]/30"
            >
              <MessageCircle size={16} strokeWidth={2} />
              <span>WhatsApp</span>
            </a>

            {/* Cart button */}
            <button
              onClick={onCartClick}
              className="relative w-11 h-11 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-200"
            >
              <ShoppingCart size={18} className="text-white" strokeWidth={1.5} />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-semibold flex items-center justify-center shadow-lg shadow-orange-500/40">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
