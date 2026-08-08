'use client'

import { memo, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { shouldBypassNextImageOptimization } from '@/lib/imageOptimization'

interface WatchesHeroProps {
  title?: string
  subtitle?: string
  imageUrl?: string
  mobileImageUrl?: string
  ctaLabel?: string
  ctaHref?: string
}

function WatchesHeroComponent({
  title = 'Timeless\nPrecision',
  subtitle = 'A quieter edit of statement and everyday timepieces, selected for collectors who value proportion, presence, and lasting appeal.',
  imageUrl,
  mobileImageUrl,
  ctaLabel = 'Enter The Vault',
  ctaHref = '/watches#featured',
}: WatchesHeroProps) {
  const bgRef = useRef<HTMLDivElement>(null)
  // The original hero art was a 5816x2688 PNG weighing 16 MB, shipped on every
  // watches visit. These WebP renders are visually identical at 114 KB / 28 KB.
  const desktopImage = imageUrl || '/hero_section-watches.webp'
  const mobileImage = mobileImageUrl || (imageUrl ? imageUrl : '/hero_section-watches-mobile.webp')
  const hasDistinctMobileImage = mobileImage !== desktopImage
  const unoptimizedDesktopImage = shouldBypassNextImageOptimization(desktopImage)
  const unoptimizedMobileImage = shouldBypassNextImageOptimization(mobileImage)

  useEffect(() => {
    const bg = bgRef.current
    if (!bg) return
    if (window.matchMedia('(max-width: 767px)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Write the transform inside rAF: the raw scroll handler set style on
    // every event, which forced a style recalc per scroll tick.
    let frame = 0
    const handleScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        bg.style.transform = `translateY(${window.scrollY * 0.28}px)`
        frame = 0
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section
      className="relative flex items-end overflow-hidden sm:items-center"
      style={{ height: 'min(76svh, 880px)', minHeight: 520 }}
      aria-label="Hero section"
    >
      {/* Background image — fills viewport */}
      <div
        ref={bgRef}
        className="absolute will-change-transform"
        style={{ inset: '0', height: '100%' }}
      >
        <Image
          src={desktopImage}
          alt=""
          fill
          className={`${hasDistinctMobileImage ? 'hidden sm:block' : ''} object-cover object-[72%_center] sm:object-[70%_center] lg:object-center`}
          priority
          quality={82}
          unoptimized={unoptimizedDesktopImage}
          sizes="100vw"
        />
        {hasDistinctMobileImage && (
          <Image
            src={mobileImage}
            alt=""
            fill
            className="object-cover object-[68%_center] sm:hidden"
            priority
            quality={88}
            unoptimized={unoptimizedMobileImage}
            sizes="100vw"
          />
        )}
      </div>

      {/* Overlay: bottom-to-top soft gradient for text readability */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(9,9,11,0.96) 0%, rgba(9,9,11,0.6) 28%, rgba(9,9,11,0.18) 54%, transparent 78%)',
        }}
      />
      {/* Left edge subtle darkening */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to right, rgba(9,9,11,0.62) 0%, rgba(9,9,11,0.22) 32%, rgba(9,9,11,0.02) 52%, transparent 66%)',
        }}
      />

      <div
        className="absolute inset-0 sm:hidden"
        style={{
          background: 'linear-gradient(110deg, transparent 42%, rgba(9,9,11,0.08) 56%, rgba(9,9,11,0.26) 72%, rgba(9,9,11,0.42) 100%)',
        }}
      />

      {/* Left decorative rule */}
      <div
        className="absolute left-12 top-28 bottom-28 w-px hidden lg:block"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.3) 30%, rgba(201,168,76,0.3) 70%, transparent)' }}
      />

      {/* Content.
          The header is fixed and roughly 56 / 84 / 100px tall by breakpoint,
          so the top padding has to clear it at every size — a single `pt-24`
          was being overridden by `sm:py-14`, which put the headline under
          the logo and nav. */}
      <div className="relative z-10 mx-auto w-full max-w-screen-2xl px-5 pb-10 pt-24 sm:px-6 sm:pb-14 sm:pt-28 lg:px-12 lg:pb-16 lg:pt-36">
        <div className="max-w-60 sm:max-w-xl">
          {/* Eyebrow label */}
          <p
            aria-label="NextX Watches - Luxury Collection"
            className="relative mb-6 text-[9px] font-light tracking-[0.34em] uppercase text-transparent sm:mb-7 sm:text-[10px] sm:tracking-[0.45em]"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'transparent' }}
          >
            <span aria-hidden="true" className="absolute inset-0" style={{ color: 'var(--w-gold)' }}>
              NextX Watches - Luxury Collection
            </span>
            NextX Watches — Luxury Collection
          </p>

          {/* Main title */}
          <h1
            className="mb-6 font-light leading-[0.88] sm:mb-7"
            style={{
              fontFamily: 'var(--font-cormorant, Georgia, serif)',
              color: 'var(--w-cream)',
              fontSize: 'clamp(2.15rem, 14vw, 7.25rem)',
              whiteSpace: 'pre-line',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h1>

          {/* Thin gold rule */}
          <div className="mb-6 w-10 h-px sm:mb-7" style={{ background: 'var(--w-gold-muted)' }} />

          {/* Subtitle */}
          <p
            className="mb-8 max-w-56 text-[13px] font-light leading-7 sm:mb-10 sm:max-w-sm sm:text-[15px] sm:leading-relaxed"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'var(--w-cream-2)', letterSpacing: '0.02em' }}
          >
            {subtitle}
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Link href={ctaHref} className="w-btn-orange inline-flex w-full items-center justify-center gap-3 sm:w-auto [&>span]:hidden">
              {ctaLabel}
              <ArrowRight size={14} strokeWidth={1.6} />
              <span className="text-xs opacity-80">→</span>
            </Link>
            <Link href="/watches#new" className="hidden sm:inline-flex w-btn-outline items-center justify-center gap-3 sm:w-auto">
              New Arrivals
            </Link>
          </div>
        </div>
      </div>

      {/* Scroll indicator — desktop only */}
      <div className="absolute bottom-10 right-14 hidden lg:flex flex-col items-center gap-3">
        <span
          style={{
            fontFamily: 'var(--font-jost, system-ui, sans-serif)',
            fontSize: '8px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: 'var(--w-muted)',
            writingMode: 'vertical-rl',
          }}
        >
          Scroll
        </span>
        <div className="w-px h-14" style={{ background: 'linear-gradient(to bottom, var(--w-border), transparent)' }} />
      </div>
    </section>
  )
}

export const WatchesHero = memo(WatchesHeroComponent)
