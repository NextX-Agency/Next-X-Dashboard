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
  accentVariant?: 'default' | 'audio'
}

export function NewHero({
  storeName,
  heroTitle,
  heroSubtitle,
  storeAddress,
  onExploreClick,
  accentVariant = 'default'
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

  const isAudioAccent = accentVariant === 'audio'
  const primaryActionClassName = isAudioAccent
    ? 'group inline-flex items-center gap-2 rounded-lg bg-[#f97015] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(20,28,46,0.12)] ring-1 ring-black/5 [transition:all_0.3s_cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:bg-[#ea630e] hover:shadow-[0_18px_34px_rgba(20,28,46,0.16)] active:translate-y-0 active:scale-[0.98] sm:px-8 sm:py-4 sm:text-base'
    : 'group inline-flex items-center gap-2 rounded-lg bg-[#141c2e] px-8 py-4 font-medium text-white shadow-[0_18px_36px_rgba(20,28,46,0.16)] [transition:all_0.3s_cubic-bezier(0.4,0,0.2,1)] hover:bg-[#1c2945] active:scale-[0.98]'
  const mapCardClassName = isAudioAccent
    ? 'relative overflow-hidden rounded-3xl bg-white shadow-[0_18px_40px_rgba(20,28,46,0.10)] transition-all duration-300'
    : 'relative overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300'

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
      {isAudioAccent && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#141c2e]/8" />}
      {!isAudioAccent && <div className="absolute top-0 right-0 h-full w-1/2 bg-linear-to-l from-[#141c2e]/5 to-transparent" />}
      {!isAudioAccent && <div className="absolute bottom-0 left-0 h-96 w-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-linear-to-tr from-[#f97015]/10 to-transparent" />}

      <div className={catalogShellClassName}>
        <div className="lg:hidden">
          <div className="pt-6 pb-5 text-center sm:pt-8 sm:pb-6">
            {isAudioAccent && <div className="mx-auto mb-6 h-1 w-16 rounded-full bg-[#f97015]" />}

            <h1 className={`${isAudioAccent ? '' : 'catalog-reveal '}mb-5 text-4xl font-bold leading-[1.05] tracking-tight text-[#141c2e] sm:text-5xl ${isAudioAccent ? 'sm:max-w-xl sm:mx-auto' : ''}`}>
              <span className="flex flex-col items-center gap-2">
                <span>Welcome to</span>
                <Image
                  src="/Colored - White background.png"
                  alt="Next x Logo"
                  width={240}
                  height={77}
                  className="relative"
                  style={{ height: 'auto', width: '228px' }}
                  priority
                />
              </span>
            </h1>

            {heroSubtitle && (
              <p className={`${isAudioAccent ? '' : 'catalog-reveal catalog-reveal-d1 '}mx-auto mb-7 max-w-[20rem] text-base leading-8 text-[#141c2e]/70 sm:max-w-lg sm:text-lg sm:leading-relaxed`}>
                {heroSubtitle}
              </p>
            )}

            <div className={`${isAudioAccent ? '' : 'catalog-reveal catalog-reveal-d2 '}mb-6 flex flex-wrap justify-center gap-4`}>
              <button onClick={onExploreClick} className={primaryActionClassName}>
                Ontdek Producten
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className={`${isAudioAccent ? '' : 'catalog-reveal catalog-reveal-d3 '}flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm text-[#141c2e]/60`}>
              <div className={`flex items-center gap-2 ${isAudioAccent ? 'font-medium text-[#141c2e]/72' : ''}`}>
                <MapPin size={16} className="text-[#f97015]" />
                <span>Lokale Afhaallocatie</span>
              </div>
              <div className={`flex items-center gap-2 ${isAudioAccent ? 'font-medium text-[#141c2e]/72' : ''}`}>
                <Clock size={16} className="text-[#f97015]" />
                <span>WhatsApp Bestellingen</span>
              </div>
            </div>
          </div>

          <div className="pb-8 pt-1">
            <div className="relative mx-auto aspect-5/4 max-w-86 sm:aspect-square sm:max-w-sm">
              {isAudioAccent && (
                <div className="absolute inset-3 rounded-4xl border border-[#141c2e]/8 bg-white/80" />
              )}

              <div
                ref={mapRef}
                className={mapCardClassName}
                style={{ border: mapActive ? '2px solid #f97015' : '2px solid rgba(249, 112, 21, 0.2)' }}
              >
                {isAudioAccent && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-[#f97015]" />
                )}

                <div className="relative aspect-5/4 sm:aspect-square">
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
                      <div className={`absolute right-3 top-3 border border-[#f97015]/30 bg-white/90 shadow-sm backdrop-blur-sm ${isAudioAccent ? 'rounded-lg px-3 py-1.5' : 'rounded-lg px-2 py-1'}`}>
                        <p className="text-xs font-medium text-[#141c2e]/80">Tap to interact</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-12 py-12 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(28rem,32rem)] lg:gap-14 lg:py-14 xl:gap-18 xl:py-16">
          <div className="order-2 max-w-xl lg:order-1 lg:pr-2">
            {isAudioAccent && <div className="mb-6 h-1 w-16 rounded-full bg-[#f97015]" />}

            <h1 className={`${isAudioAccent ? '' : 'catalog-reveal catalog-reveal-d1 '}mb-6 text-4xl font-bold leading-[0.98] tracking-tight text-[#141c2e] sm:text-5xl lg:text-[4rem] ${isAudioAccent ? 'max-w-xl' : ''}`}>
              <span className="block">Welcome to</span>
              <span className="mt-3 block xl:mt-4">
                <Image
                  src="/Colored - White background.png"
                  alt="Next x Logo"
                  width={268}
                  height={86}
                  className="relative"
                  style={{ height: 'auto', width: '268px' }}
                  priority
                />
              </span>
            </h1>

            {heroSubtitle && (
              <p className={`${isAudioAccent ? '' : 'catalog-reveal catalog-reveal-d2 '}mb-8 max-w-lg text-[1.15rem] leading-9 text-[#141c2e]/70`}>
                {heroSubtitle}
              </p>
            )}

            <div className={`${isAudioAccent ? '' : 'catalog-reveal catalog-reveal-d3 '}mb-10 flex flex-wrap gap-4`}>
              <button onClick={onExploreClick} className={primaryActionClassName}>
                Ontdek Producten
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className={`${isAudioAccent ? '' : 'catalog-reveal catalog-reveal-d4 '}flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[#141c2e]/60`}>
              <div className={`flex items-center gap-2 ${isAudioAccent ? 'font-medium text-[#141c2e]/72' : ''}`}>
                <MapPin size={16} className="text-[#f97015]" />
                <span>Lokale Afhaallocatie</span>
              </div>
              <div className={`flex items-center gap-2 ${isAudioAccent ? 'font-medium text-[#141c2e]/72' : ''}`}>
                <Clock size={16} className="text-[#f97015]" />
                <span>WhatsApp Bestellingen</span>
              </div>
            </div>
          </div>

          <div className="order-1 relative lg:order-2">
            <div className="relative mx-auto aspect-[1.02/1] max-w-124 lg:ml-auto xl:max-w-lg">
              {isAudioAccent && (
                <div className="absolute inset-4 rounded-4xl border border-[#141c2e]/8 bg-white/82" />
              )}

              <div
                ref={mapRef}
                className={mapCardClassName}
                style={{ border: mapActive ? '2px solid #f97015' : '2px solid rgba(249, 112, 21, 0.2)' }}
              >
                {isAudioAccent && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-[#f97015]" />
                )}

                <div className="relative aspect-[1.02/1]">
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
                      <div className={`absolute right-4 top-4 border border-[#f97015]/30 bg-white/90 shadow-sm backdrop-blur-sm ${isAudioAccent ? 'rounded-lg px-4 py-2' : 'rounded-lg px-3 py-2'}`}>
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
