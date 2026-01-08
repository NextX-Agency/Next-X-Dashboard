'use client'

import { MapPin, Phone, Sparkles } from 'lucide-react'

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
      {/* Unique gradient mesh background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[#141c2e]" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#f97015]/20 via-transparent to-transparent" />
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#f97015]/10 via-transparent to-transparent" />
      </div>
      
      {/* Floating orbs for depth */}
      <div className="absolute top-20 left-[15%] w-72 h-72 bg-gradient-to-br from-[#f97015]/25 to-[#f97015]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-10 right-[10%] w-96 h-96 bg-gradient-to-br from-[#f97015]/15 to-[#f97015]/5 rounded-full blur-3xl" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
        <div className="max-w-4xl mx-auto text-center">
          {/* Glowing badge */}
          <div className="inline-flex items-center gap-2.5 px-5 py-2.5 mb-8 rounded-full bg-[#f97015]/20 border border-[#f97015]/30 shadow-[0_0_30px_-5px_rgba(249,112,21,0.4)]">
            <Sparkles size={14} className="text-[#f97015]" />
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#f97015]">
              Premium Collection
            </span>
          </div>
          
          {/* Main title with glow */}
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-white mb-6 leading-[1.1] drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">
            {heroTitle || `Welkom bij ${storeName}`}
          </h1>
          
          {/* Subtitle */}
          {heroSubtitle && (
            <p className="text-lg sm:text-xl text-neutral-300 max-w-2xl mx-auto mb-12 leading-relaxed font-light">
              {heroSubtitle}
            </p>
          )}
          
          {/* Contact pills with glassmorphism */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="group flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/[0.07] backdrop-blur-xl border border-white/[0.15] text-sm text-white transition-all duration-300 hover:bg-white/[0.12] hover:border-[#f97015]/40 hover:shadow-[0_8px_30px_-5px_rgba(249,112,21,0.3)] hover:scale-105">
              <div className="w-8 h-8 rounded-xl bg-[#f97015] flex items-center justify-center shadow-lg shadow-[#f97015]/30 group-hover:shadow-[#f97015]/50 transition-all">
                <MapPin size={14} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="font-medium">{storeAddress}</span>
            </div>
            <div className="group flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/[0.07] backdrop-blur-xl border border-white/[0.15] text-sm text-white transition-all duration-300 hover:bg-white/[0.12] hover:border-[#f97015]/40 hover:shadow-[0_8px_30px_-5px_rgba(249,112,21,0.3)] hover:scale-105">
              <div className="w-8 h-8 rounded-xl bg-[#f97015] flex items-center justify-center shadow-lg shadow-[#f97015]/30 group-hover:shadow-[#f97015]/50 transition-all">
                <Phone size={14} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="font-medium">{whatsappNumber}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#141c2e] to-transparent" />
    </section>
  )
}
