'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { getImageProps } from 'next/image'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'
import { useScrollReveal } from '@/lib/useScrollReveal'

interface Banner {
  id: string
  title: string
  subtitle: string | null
  image_url: string
  mobile_image: string | null
  link_url: string | null
  link_text: string | null
}

interface BannerSliderProps {
  banners: Banner[]
  autoPlayInterval?: number
  /** Fallback copy when a banner has no subtitle of its own. */
  storeAddress?: string
}

/**
 * Campaign hero. Copy sits on white beside the image rather than on top of it:
 * CMS banner images are uploaded by hand and are not composed to carry text,
 * so overlaying a headline made legibility depend on whatever was uploaded.
 */
export function BannerSlider({ banners, autoPlayInterval = 6000, storeAddress }: BannerSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useScrollReveal(sectionRef, { threshold: 0.05, deps: [currentIndex] })

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % banners.length)
  }, [banners.length])

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)
  }, [banners.length])

  // Auto-advance, but hold while the visitor is interacting and skip it
  // entirely when they have asked for reduced motion.
  useEffect(() => {
    if (banners.length <= 1 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const interval = setInterval(goToNext, autoPlayInterval)
    return () => clearInterval(interval)
  }, [banners.length, autoPlayInterval, goToNext, paused])

  if (banners.length === 0) return null

  const currentBanner = banners[currentIndex]
  const imageOptions = {
    alt: '',
    fill: true,
    sizes: '(max-width: 1024px) 100vw, 30rem',
    quality: 78,
    priority: true,
  } as const
  const { props: desktopImageProps } = getImageProps({
    ...imageOptions,
    src: currentBanner.image_url,
  })
  const mobileImageProps = currentBanner.mobile_image
    ? getImageProps({ ...imageOptions, src: currentBanner.mobile_image }).props
    : null

  return (
    <section
      ref={sectionRef}
      className="relative bg-white"
      aria-roledescription="carousel"
      aria-label="Uitgelichte acties"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={catalogShellClassName}>
        <div className="grid items-center gap-8 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,27rem)] lg:gap-16 lg:py-16">
          {/* ── Copy ───────────────────────────────── */}
          <div className="max-w-xl" aria-live="polite">
            <p className="catalog-reveal audio-eyebrow mb-5 flex items-center gap-3">
              <span className="h-px w-8 bg-[#f97015]" />
              NextX Audio · Suriname
            </p>

            <h2
              key={`${currentBanner.id}-title`}
              className="catalog-reveal catalog-reveal-d1 audio-display text-[2.5rem] leading-[0.95] text-[#111111] sm:text-[3.25rem] lg:text-[4rem]"
            >
              {currentBanner.title}
            </h2>

            <p
              key={`${currentBanner.id}-sub`}
              className="catalog-reveal catalog-reveal-d2 mt-6 max-w-md text-[0.975rem] leading-7 text-neutral-600"
            >
              {currentBanner.subtitle ||
                `In-ear monitors, oordopjes en accessoires. Bestel via WhatsApp en haal op${storeAddress ? ` in ${storeAddress}` : ''}.`}
            </p>

            <div className="catalog-reveal catalog-reveal-d3 mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={currentBanner.link_url || '#category-products'}
                className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-sm bg-[#f97015] px-7 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[#d95c08]"
              >
                {currentBanner.link_text || 'Bekijk de collectie'}
                <ArrowRight size={16} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
              </Link>

              {/* Slide controls */}
              {banners.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPrev}
                    className="flex h-12 w-12 items-center justify-center rounded-sm border border-neutral-200 text-[#111111] transition-colors hover:border-[#111111]"
                    aria-label="Vorige actie"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={goToNext}
                    className="flex h-12 w-12 items-center justify-center rounded-sm border border-neutral-200 text-[#111111] transition-colors hover:border-[#111111]"
                    aria-label="Volgende actie"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Progress bars */}
            {banners.length > 1 && (
              <div className="mt-8 flex items-center gap-2">
                {banners.map((banner, index) => (
                  <button
                    key={banner.id}
                    onClick={() => setCurrentIndex(index)}
                    className="group py-2"
                    aria-label={`Ga naar actie ${index + 1}: ${banner.title}`}
                    aria-current={index === currentIndex}
                  >
                    <span
                      className={`block h-0.5 transition-all ${
                        index === currentIndex
                          ? 'w-10 bg-[#f97015]'
                          : 'w-5 bg-neutral-300 group-hover:bg-neutral-400'
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Banner image on an orange panel ────── */}
          <div className="catalog-reveal catalog-reveal-d2 order-first lg:order-last">
            <div className="rounded-sm bg-[#f97015] p-4 sm:p-5">
              <div className="relative aspect-4/3 overflow-hidden bg-white sm:aspect-square lg:aspect-4/5">
                <picture key={currentBanner.id}>
                  {mobileImageProps && (
                    <source
                      media="(max-width: 768px)"
                      srcSet={mobileImageProps.srcSet}
                      sizes={mobileImageProps.sizes}
                    />
                  )}
                  <img
                    {...desktopImageProps}
                    alt={currentBanner.title}
                    className="h-full w-full object-cover"
                    style={{ ...desktopImageProps.style, objectFit: 'cover' }}
                  />
                </picture>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="audio-rule" />
    </section>
  )
}
