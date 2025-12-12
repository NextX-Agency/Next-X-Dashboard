'use client'

import { MapPin, Phone } from 'lucide-react'

interface HeroSectionProps {
  storeName: string
  heroTitle: string
  heroSubtitle: string
  storeAddress: string
  whatsappNumber: string
}

export function HeroSection({ 
  storeName, 
  heroTitle, 
  heroSubtitle, 
  storeAddress, 
  whatsappNumber 
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950" />
      
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/[0.03] rounded-full blur-3xl pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Premium badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-6 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[10px] font-medium tracking-[0.15em] uppercase text-neutral-400">
              Premium Collection
            </span>
          </div>
          
          {/* Main title */}
          <h1 className="text-3xl sm:text-4xl lg:text-6xl font-semibold tracking-tight text-white mb-4 leading-[1.15]">
            {heroTitle || `Welkom bij ${storeName}`}
          </h1>
          
          {/* Subtitle */}
          {heroSubtitle && (
            <p className="text-base sm:text-lg text-neutral-400 max-w-xl mx-auto mb-10 leading-relaxed">
              {heroSubtitle}
            </p>
          )}
          
          {/* Contact pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-neutral-400 transition-all hover:bg-white/[0.06] hover:border-white/[0.12]">
              <MapPin size={13} className="text-orange-500/70" strokeWidth={1.5} />
              <span>{storeAddress}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-neutral-400 transition-all hover:bg-white/[0.06] hover:border-white/[0.12]">
              <Phone size={13} className="text-orange-500/70" strokeWidth={1.5} />
              <span>{whatsappNumber}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </section>
  )
}
