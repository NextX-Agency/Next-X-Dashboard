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
  const desktopImage = imageUrl || '/hero_section-watches.png'
  const mobileImage = mobileImageUrl || desktopImage
  const unoptimizedDesktopImage = shouldBypassNextImageOptimization(desktopImage)
  const unoptimizedMobileImage = shouldBypassNextImageOptimization(mobileImage)

  useEffect(() => {
    const bg = bgRef.current
    if (!bg) return
    if (window.matchMedia('(max-width: 767px)').matches) return

    const handleScroll = () => {
      bg.style.transform = `translateY(${window.scrollY * 0.28}px)`
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section
      className="relative flex items-end overflow-hidden sm:items-center"
      style={{ height: 'min(78svh, 860px)', minHeight: 400 }}
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
          className={`${mobileImageUrl ? 'hidden sm:block' : ''} object-cover object-[72%_center] sm:object-[70%_center] lg:object-center`}
          priority
          quality={88}
          unoptimized={unoptimizedDesktopImage}
          sizes="100vw"
        />
        {mobileImageUrl && (
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

      {/* Content */}
      <div className="relative z-10 px-5 pb-8 pt-24 sm:px-6 sm:py-14 lg:px-12 lg:py-16 max-w-screen-2xl mx-auto w-full">
        <div className="max-w-60 sm:max-w-xl">
          {/* Eyebrow label */}
          <p
            aria-label="NextX Watches - Luxury Collection"
            className="relative mb-5 text-[9px] font-light tracking-[0.34em] uppercase text-transparent sm:mb-6 sm:text-[10px] sm:tracking-[0.45em]"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'transparent' }}
          >
            <span aria-hidden="true" className="absolute inset-0" style={{ color: 'var(--w-gold)' }}>
              NextX Watches - Luxury Collection
            </span>
            NextX Watches — Luxury Collection
          </p>

          {/* Main title */}
          <h1
            className="mb-5 font-light leading-[0.88]"
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
          <div className="mb-5 w-10 h-px" style={{ background: 'var(--w-gold-muted)' }} />

          {/* Subtitle */}
          <p
            className="mb-6 max-w-56 text-[13px] font-light leading-7 sm:mb-10 sm:max-w-sm sm:text-[15px] sm:leading-relaxed"
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
