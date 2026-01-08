'use client'

import Image from 'next/image'
import { MessageCircle, ShoppingCart, Zap } from 'lucide-react'

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
    <header className="sticky top-0 z-50 backdrop-blur-2xl">
      {/* Glass effect background */}
      <div className="absolute inset-0 bg-[#141c2e]/95" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#f97015]/30 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="h-18 py-4 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex-shrink-0">
            {logoUrl ? (
              <Image 
                src={logoUrl} 
                alt={storeName} 
                width={120} 
                height={40} 
                className="h-8 sm:h-9 w-auto object-contain"
                unoptimized
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#f97015] flex items-center justify-center shadow-lg shadow-[#f97015]/30">
                  <Zap size={18} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="text-xl font-black tracking-tight">
                  <span className="text-white">Next</span>
                  <span className="text-[#f97015]">X</span>
                </span>
              </div>
            )}
          </div>

          {/* Desktop actions */}
          <div className="flex items-center gap-4">
            {/* Currency toggle - desktop */}
            <div className="hidden sm:flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <button
                onClick={() => onCurrencyChange('SRD')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${currency === 'SRD' ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30' : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'}`}
              >
                SRD
              </button>
              <button
                onClick={() => onCurrencyChange('USD')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${currency === 'USD' ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30' : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'}`}
              >
                USD
              </button>
            </div>

            {/* WhatsApp - desktop */}
            <a
              href={`https://wa.me/${whatsappClean}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2.5 h-11 px-6 rounded-xl bg-[#141c2e] hover:bg-[#141c2e]/90 text-white text-sm font-bold transition-all duration-300 shadow-lg shadow-[#141c2e]/30 hover:scale-105"
            >
              <MessageCircle size={18} strokeWidth={2.5} />
              <span>WhatsApp</span>
            </a>

            {/* Mobile currency toggle */}
            <div className="sm:hidden flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
              <button
                onClick={() => onCurrencyChange('SRD')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${currency === 'SRD' ? 'bg-[#f97015] text-white' : 'text-neutral-400'}`}
              >
                SRD
              </button>
              <button
                onClick={() => onCurrencyChange('USD')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${currency === 'USD' ? 'bg-[#f97015] text-white' : 'text-neutral-400'}`}
              >
                USD
              </button>
            </div>

            {/* Cart button */}
            <button
              onClick={onCartClick}
              className="relative w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center hover:bg-white/[0.1] hover:border-[#f97015]/40 transition-all duration-300 hover:scale-105 group"
            >
              <ShoppingCart size={20} className="text-white group-hover:text-[#f97015] transition-colors" strokeWidth={2} />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-[#f97015] text-white text-[11px] font-black flex items-center justify-center shadow-xl shadow-[#f97015]/50">
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
