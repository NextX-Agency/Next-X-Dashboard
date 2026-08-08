'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Clock, MapPin } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'
import { useScrollReveal } from '@/lib/useScrollReveal'

const MAP_EMBED_SRC =
  'https://www.google.com/maps/d/embed?mid=13wJoAN8Rq_At7ygnOmA3fxP2abjtj0w&ehbc=2E312F&noprof=1'

interface PickupLocation {
  id: string
  name: string
  address?: string | null
}

interface PickupSectionProps {
  storeAddress: string
  whatsappNumber: string
  locations?: PickupLocation[]
}

/**
 * Pickup + ordering info. The store map used to sit in the hero, where it
 * pushed the products below the fold; here it sits with the rest of the
 * practical information, close to the point where someone decides to order.
 */
export function PickupSection({ storeAddress, whatsappNumber, locations = [] }: PickupSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const [mapActive, setMapActive] = useState(false)

  useScrollReveal(sectionRef, { threshold: 0.12 })

  const whatsappClean = whatsappNumber.replace(/[^0-9]/g, '')

  // Clicking away releases the map so the page scrolls normally again.
  useEffect(() => {
    if (!mapActive) return

    const handlePointerDown = (event: MouseEvent) => {
      if (mapWrapRef.current && !mapWrapRef.current.contains(event.target as Node)) {
        setMapActive(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [mapActive])

  const namedLocations = locations.filter((location) => location.name)

  return (
    <section
      ref={sectionRef}
      className="border-t border-neutral-200 bg-[#f6f6f4]"
      aria-label="Afhalen en bestellen"
    >
      <div className={`${catalogShellClassName} py-9 sm:py-14 lg:py-16`}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
          {/* ── Info ───────────────────────────────── */}
          <div>
            <p className="catalog-reveal audio-eyebrow mb-4 flex items-center gap-3">
              <span className="h-px w-8 bg-[#f97015]" />
              Afhalen
            </p>

            <h2 className="catalog-reveal catalog-reveal-d1 audio-display text-2xl leading-tight text-[#111111] sm:text-3xl">
              Bestel via WhatsApp,<br />haal lokaal op.
            </h2>

            <p className="catalog-reveal catalog-reveal-d2 mt-4 max-w-md text-sm leading-relaxed text-neutral-600">
              Alle bestellingen worden persoonlijk afgehandeld. Je krijgt bevestiging van
              beschikbaarheid en spreekt zelf een afhaalmoment af — geen bezorging, geen wachttijd.
            </p>

            <dl className="catalog-reveal catalog-reveal-d3 mt-8 border-t border-neutral-200">
              <div className="flex items-start gap-3 border-b border-neutral-200 py-4">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[#f97015]" strokeWidth={2} />
                <div>
                  <dt className="audio-eyebrow audio-eyebrow-muted mb-1">Locaties</dt>
                  <dd className="text-sm text-[#111111]">
                    {namedLocations.length > 0
                      ? namedLocations.map((location) => location.name).join(' · ')
                      : storeAddress}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3 border-b border-neutral-200 py-4">
                <Clock size={16} className="mt-0.5 shrink-0 text-[#f97015]" strokeWidth={2} />
                <div>
                  <dt className="audio-eyebrow audio-eyebrow-muted mb-1">Afspraak</dt>
                  <dd className="text-sm text-[#111111]">Vandaag, morgen of een eigen datum</dd>
                </div>
              </div>
            </dl>

            <a
              href={`https://wa.me/${whatsappClean}`}
              target="_blank"
              rel="noopener noreferrer"
              className="catalog-reveal catalog-reveal-d4 mt-7 inline-flex h-12 items-center gap-2.5 rounded-sm bg-[#f97015] px-6 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[#d95c08]"
            >
              <Image src="/whatsapp-white.png" alt="" width={16} height={16} className="h-4 w-4" />
              Start een bestelling
            </a>
          </div>

          {/* ── Map ────────────────────────────────── */}
          {/* flex + flex-1 so the map fills the grid row instead of keeping a
              fixed aspect ratio and leaving white space under it. */}
          <div
            ref={mapWrapRef}
            className="catalog-reveal catalog-reveal-d2 flex overflow-hidden border border-neutral-300 bg-white"
          >
            <div className="relative aspect-16/10 w-full lg:aspect-auto lg:min-h-[26rem] lg:flex-1">
              {mapActive ? (
                <iframe
                  src={MAP_EMBED_SRC}
                  className="absolute inset-0 h-full w-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Afhaallocaties NextX Suriname"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setMapActive(true)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white text-[#111111] transition-colors hover:bg-[#f6f6f4]"
                >
                  <MapPin size={26} strokeWidth={1.6} className="text-[#f97015]" />
                  <span className="text-sm font-semibold">Bekijk afhaallocaties</span>
                  <span className="text-xs text-neutral-500">Tik om de kaart te laden</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
