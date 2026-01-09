'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ArrowRight, MapPin, Clock } from 'lucide-react'

interface NewHeroProps {
  storeName: string
  heroTitle: string
  heroSubtitle: string
  storeAddress: string
  logoUrl?: string
  featuredImageUrl?: string
  onExploreClick: () => void
}

export function NewHero({
  storeName,
  heroTitle,
  heroSubtitle,
  storeAddress,
  onExploreClick
}: NewHeroProps) {
  const [mapActive, setMapActive] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mapRef.current && !mapRef.current.contains(event.target as Node)) {
        setMapActive(false)
      }
    }

    if (mapActive) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [mapActive])

  return (
    <section className="relative overflow-hidden catalog-bg-light">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#141c2e]/5 to-transparent" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-[#f97015]/10 to-transparent rounded-full -translate-x-1/2 translate-y-1/2" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center py-16 lg:py-24">
          {/* Content */}
          <div className="order-2 lg:order-1">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-white border border-[#f97015]/20 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#f97015] animate-pulse" />
              <span className="text-xs font-medium text-[#141c2e]">
                Alleen Afhalen in {storeAddress}
              </span>
            </div>
            
            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#141c2e] tracking-tight leading-[1.1] mb-6">
              <span className="inline-flex items-center">
                <span>Welcome to</span>
                <Image 
                  src="/Colored - White background.png" 
                  alt="Next x Logo" 
                  width={280} 
                  height={90}
                  className="ml-3 sm:ml-4 relative"
                  style={{ 
                    height: '1.15em', 
                    width: 'auto',
                    top: '0.08em'
                  }}
                  priority
                />
              </span>
            </h1>
            
            {/* Subtitle */}
            {heroSubtitle && (
              <p className="text-lg text-[#141c2e]/70 max-w-lg mb-8 leading-relaxed">
                {heroSubtitle}
              </p>
            )}
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 mb-12">
              <button
                onClick={onExploreClick}
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#f97015] text-white font-medium hover:bg-[#e5640d] transition-all shadow-lg shadow-[#f97015]/30 hover:shadow-xl hover:shadow-[#f97015]/40"
              >
                Ontdek Producten
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            
            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-[#141c2e]/60">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-[#f97015]" />
                <span>Lokale Afhaallocatie</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[#f97015]" />
                <span>WhatsApp Bestellingen</span>
              </div>
            </div>
          </div>
          
          {/* Map Container */}
          <div className="order-1 lg:order-2 relative">
            <div className="relative aspect-square max-w-md mx-auto lg:max-w-none">
              {/* Main container with Google Maps */}
              <div 
                ref={mapRef}
                className="relative bg-white rounded-2xl border-2 border-[#f97015]/20 shadow-lg overflow-hidden hover:border-[#f97015]/40 transition-all duration-300"
              >
                <div className="aspect-square relative">
                  <iframe
                    src="https://www.google.com/maps/d/embed?mid=13wJoAN8Rq_At7ygnOmA3fxP2abjtj0w&ehbc=2E312F&noprof=1"
                    className="absolute inset-0 w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Store Location Map"
                    style={{ pointerEvents: mapActive ? 'auto' : 'none' }}
                  />
                  
                  {/* Click overlay */}
                  {!mapActive && (
                    <div 
                      className="absolute inset-0 flex items-center justify-center bg-black/5 cursor-pointer group"
                      onClick={() => setMapActive(true)}
                    >
                      <div className="bg-white/95 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg border border-[#f97015]/20 group-hover:border-[#f97015]/40 transition-all">
                        <p className="text-sm font-medium text-[#141c2e] flex items-center gap-2">
                          <MapPin size={16} className="text-[#f97015]" />
                          Klik om kaart te activeren
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Location overlay */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-neutral-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f97015]/10 flex items-center justify-center flex-shrink-0">
                        <MapPin size={18} className="text-[#f97015]" />
                      </div>
                      <div>
                        <p className="text-xs text-[#141c2e]/60 font-medium uppercase tracking-wider">Afhaallocatie</p>
                        <p className="text-sm font-semibold text-[#141c2e]">{storeAddress}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
