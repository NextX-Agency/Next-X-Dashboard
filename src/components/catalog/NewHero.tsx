'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'
import { useScrollReveal } from '@/lib/useScrollReveal'

interface NewHeroProps {
  storeName: string
  heroTitle: string
  heroSubtitle: string
  storeAddress: string
  logoUrl?: string
  featuredImageUrl?: string
  featuredName?: string
  whatsappNumber?: string
  productCount?: number
  categoryCount?: number
  onExploreClick: () => void
  accentVariant?: 'default' | 'audio'
}

const DEFAULT_TITLE_LINES = ['Geluid dat', 'klopt.']
const DEFAULT_SUBTITLE =
  'In-ear monitors, oordopjes en accessoires voor wie verschil hoort. Bestel via WhatsApp, haal op in Commewijne.'

/**
 * Splits a CMS hero title into at most two display lines so long titles
 * break on a word boundary instead of wrapping arbitrarily.
 */
function toTitleLines(title: string): string[] {
  const clean = title.trim()
  if (!clean || clean.toLowerCase() === 'welkom') return DEFAULT_TITLE_LINES

  const words = clean.split(/\s+/)
  if (words.length < 3) return [clean]

  const breakAt = Math.ceil(words.length / 2)
  return [words.slice(0, breakAt).join(' '), words.slice(breakAt).join(' ')]
}

export function NewHero({
  heroTitle,
  heroSubtitle,
  whatsappNumber,
  onExploreClick,
}: NewHeroProps) {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef, { threshold: 0.05 })

  const titleLines = toTitleLines(heroTitle)
  const subtitle = heroSubtitle?.trim() || DEFAULT_SUBTITLE
  const whatsappClean = whatsappNumber?.replace(/[^0-9]/g, '')

  return (
    <section ref={sectionRef} className="relative bg-white" aria-label="Introductie">
      <div className={catalogShellClassName}>
        <div className="grid items-center gap-6 py-7 sm:gap-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,27rem)] lg:gap-16 lg:py-16">
          {/* ── Copy ───────────────────────────────── */}
          <div className="max-w-xl">
            <p className="catalog-reveal audio-eyebrow mb-5 flex items-center gap-3">
              <span className="h-px w-8 bg-[#f97015]" />
              NextX Audio · Suriname
            </p>

            <h2 className="catalog-reveal catalog-reveal-d1 audio-display text-[2.1rem] leading-[0.95] text-[#111111] sm:text-[3.25rem] lg:text-[4rem]">
              {titleLines.map((line, index) => (
                <span key={index} className="block">
                  {line}
                </span>
              ))}
            </h2>

            <p className="catalog-reveal catalog-reveal-d2 mt-4 max-w-md text-[0.9375rem] leading-6 text-neutral-600 sm:mt-6 sm:text-[0.975rem] sm:leading-7">
              {subtitle}
            </p>

            <div className="catalog-reveal catalog-reveal-d3 mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
              <button
                onClick={onExploreClick}
                className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-sm bg-[#f97015] px-7 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[#d95c08]"
              >
                Bekijk de collectie
                <ArrowRight size={16} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
              </button>

              {whatsappClean && (
                <a
                  href={`https://wa.me/${whatsappClean}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2.5 rounded-sm border border-[#f97015] px-7 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#f97015] transition-colors hover:bg-[#f97015] hover:text-white"
                >
                  <Image src="/whatsapp.png" alt="" width={16} height={16} className="h-4 w-4" />
                  Bestel direct
                </a>
              )}
            </div>
          </div>

          {/* ── Brandmark ──────────────────────────── */}
          <div className="catalog-reveal catalog-reveal-d2 order-first lg:order-last">
            <Image
              src="/nextx-logo-light.png"
              alt="NextX"
              width={940}
              height={385}
              className="mx-auto h-auto w-full max-w-[13rem] sm:max-w-[18rem] lg:max-w-full"
              priority
            />
          </div>
        </div>
      </div>

      <div className="audio-rule" />
    </section>
  )
}
