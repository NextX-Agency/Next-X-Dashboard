'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ArrowRight, MapPin, Clock } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'

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
  const sectionRef = useRef<HTMLElement>(null)

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

  const badgeClassName = 'inline-flex items-center gap-2 rounded-lg border border-[#f97015]/15 bg-white px-4 py-2 text-xs font-medium text-[#141c2e] shadow-[0_14px_28px_rgba(20,28,46,0.07)]'
  const primaryActionClassName = 'group inline-flex items-center gap-2 rounded-lg bg-[#141c2e] px-8 py-4 font-medium text-white shadow-[0_18px_36px_rgba(20,28,46,0.16)] [transition:all_0.3s_cubic-bezier(0.4,0,0.2,1)] hover:bg-[#1c2945] active:scale-[0.98]'

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const targets = el.querySelectorAll('.catalog-reveal, .catalog-reveal-left')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('catalog-reveal-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.05 }
    )
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} className="relative overflow-hidden catalog-bg-light">
      <div className="absolute top-0 right-0 h-full w-1/2 bg-linear-to-l from-[#141c2e]/5 to-transparent" />
      <div className="absolute bottom-0 left-0 h-96 w-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-linear-to-tr from-[#f97015]/10 to-transparent" />

      <div className={catalogShellClassName}>
        <div className="lg:hidden">
          <div className="py-8 text-center">
            <h1 className="catalog-reveal mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-[#141c2e] sm:text-5xl">
              <span className="flex flex-col items-center gap-2">
                <span>Welcome to</span>
                <Image
                  src="/Colored - White background.png"
                  alt="Next x Logo"
                  width={240}
                  height={77}
                  className="relative"
                  style={{ height: 'auto', width: '240px' }}
                  priority
                />
              </span>
            </h1>

            {heroSubtitle && (
              <p className="catalog-reveal catalog-reveal-d1 mx-auto mb-8 max-w-lg text-lg leading-relaxed text-[#141c2e]/70">
                {heroSubtitle}
              </p>
            )}
          </div>

          <div className="catalog-reveal catalog-reveal-d2 pb-4 text-center">
            <div className={badgeClassName}>
              <span className="h-2 w-2 rounded-full bg-[#f97015] animate-pulse" />
              <span className="text-xs font-medium text-[#141c2e]">
                Alleen Afhalen in {storeAddress}
              </span>
            </div>
          </div>

          <div className="pb-8">
            <div className="relative mx-auto aspect-square max-w-sm">
              <div
                ref={mapRef}
                className="relative overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300"
                style={{ border: mapActive ? '2px solid #f97015' : '2px solid rgba(249, 112, 21, 0.2)' }}
              >
                <div className="relative aspect-square">
                  <iframe
                    src="https://www.google.com/maps/d/embed?mid=13wJoAN8Rq_At7ygnOmA3fxP2abjtj0w&ehbc=2E312F&noprof=1"
                    className="absolute inset-0 h-full w-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Store Location Map - Sinaiplein Surinam Ooststraat 132 / Parool Tbadjonsoweg 108"
                    style={{ pointerEvents: mapActive ? 'auto' : 'none' }}
                  />

                  {!mapActive && (
                    <>
                      <div className="absolute inset-0 cursor-pointer" onClick={() => setMapActive(true)} />
                      <div className="absolute right-3 top-3 rounded-lg border border-[#f97015]/30 bg-white/90 px-2 py-1 shadow-sm backdrop-blur-sm">
                        <p className="text-xs font-medium text-[#141c2e]/80">Tap to interact</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pb-8 text-center">
            <div className="catalog-reveal catalog-reveal-d3 mb-8 flex flex-wrap justify-center gap-4">
              <button onClick={onExploreClick} className={primaryActionClassName}>
                Ontdek Producten
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className="catalog-reveal catalog-reveal-d4 flex flex-wrap items-center justify-center gap-6 text-sm text-[#141c2e]/60">
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
        </div>

        <div className="hidden items-center gap-8 py-16 lg:grid lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div className="order-2 lg:order-1">
            <div className="catalog-reveal">
              <div className={`${badgeClassName} mb-6`}>
                <span className="h-2 w-2 rounded-full bg-[#f97015] animate-pulse" />
                <span className="text-xs font-medium text-[#141c2e]">
                  Alleen Afhalen in {storeAddress}
                </span>
              </div>
            </div>

            <h1 className="catalog-reveal catalog-reveal-d1 mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-[#141c2e] sm:text-5xl lg:text-6xl">
              <span className="inline-flex items-center">
                <span>Welcome to</span>
                <Image
                  src="/Colored - White background.png"
                  alt="Next x Logo"
                  width={280}
                  height={90}
                  className="relative ml-3 sm:ml-4"
                  style={{ height: '1.15em', width: 'auto', top: '0.08em' }}
                  priority
                />
              </span>
            </h1>

            {heroSubtitle && (
              <p className="catalog-reveal catalog-reveal-d2 mb-8 max-w-lg text-lg leading-relaxed text-[#141c2e]/70">
                {heroSubtitle}
              </p>
            )}

            <div className="catalog-reveal catalog-reveal-d3 mb-12 flex flex-wrap gap-4">
              <button onClick={onExploreClick} className={primaryActionClassName}>
                Ontdek Producten
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className="catalog-reveal catalog-reveal-d4 flex flex-wrap items-center gap-6 text-sm text-[#141c2e]/60">
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

          <div className="order-1 relative lg:order-2">
            <div className="relative mx-auto aspect-square max-w-md lg:max-w-none">
              <div
                ref={mapRef}
                className="relative overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300"
                style={{ border: mapActive ? '2px solid #f97015' : '2px solid rgba(249, 112, 21, 0.2)' }}
              >
                <div className="relative aspect-square">
                  <iframe
                    src="https://www.google.com/maps/d/embed?mid=13wJoAN8Rq_At7ygnOmA3fxP2abjtj0w&ehbc=2E312F&noprof=1"
                    className="absolute inset-0 h-full w-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Store Location Map - Sinaiplein Surinam Ooststraat 132 / Parool Tbadjonsoweg 108"
                    style={{ pointerEvents: mapActive ? 'auto' : 'none' }}
                  />

                  {!mapActive && (
                    <>
                      <div className="absolute inset-0 cursor-pointer" onClick={() => setMapActive(true)} />
                      <div className="absolute right-4 top-4 rounded-lg border border-[#f97015]/30 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
                        <p className="text-sm font-medium text-[#141c2e]/80">Click to interact</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
