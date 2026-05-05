'use client'

import { memo, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface WatchesHeroProps {
  title?: string
  subtitle?: string
  ctaLabel?: string
  ctaHref?: string
}

function WatchesHeroComponent({
  title = 'Timeless\nPrecision',
  subtitle = 'Curated luxury timepieces for the discerning collector',
  ctaLabel = 'Explore Collection',
  ctaHref = '/watches#featured',
}: WatchesHeroProps) {
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bg = bgRef.current
    if (!bg) return
    const handleScroll = () => {
      bg.style.transform = `translateY(${window.scrollY * 0.28}px)`
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section
      className="relative flex items-center overflow-hidden"
      style={{ height: 'min(100svh, 980px)', minHeight: 520 }}
      aria-label="Hero section"
    >
      {/* Background image — fills viewport */}
      <div
        ref={bgRef}
        className="absolute will-change-transform"
        style={{ inset: '0', height: '100%' }}
      >
        <Image
          src="/hero_section-watches.png"
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
      </div>

      {/* Overlay: bottom-to-top soft gradient for text readability */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.55) 30%, rgba(9,9,11,0.15) 55%, transparent 80%)',
        }}
      />
      {/* Left edge subtle darkening */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to right, rgba(9,9,11,0.4) 0%, rgba(9,9,11,0.05) 35%, transparent 55%)',
        }}
      />

      {/* Left decorative rule */}
      <div
        className="absolute left-12 top-28 bottom-28 w-px hidden lg:block"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.3) 30%, rgba(201,168,76,0.3) 70%, transparent)' }}
      />

      {/* Content */}
      <div className="relative z-10 px-6 lg:px-12 py-12 lg:py-16 max-w-screen-2xl mx-auto w-full">
        <div className="max-w-lg">
          {/* Eyebrow label */}
          <p
            className="mb-6 text-[10px] font-light tracking-[0.45em] uppercase"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'var(--w-gold)' }}
          >
            NextX Watches — Luxury Collection
          </p>

          {/* Main title */}
          <h1
            className="mb-5 font-light leading-[0.88]"
            style={{
              fontFamily: 'var(--font-cormorant, Georgia, serif)',
              color: 'var(--w-cream)',
              fontSize: 'clamp(3.5rem, 8vw, 7.5rem)',
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
            className="mb-10 max-w-sm text-sm font-light leading-relaxed"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'var(--w-cream-2)', letterSpacing: '0.02em' }}
          >
            {subtitle}
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-4">
            <Link href={ctaHref} className="w-btn-orange inline-flex items-center gap-3">
              {ctaLabel}
              <span className="text-xs opacity-80">→</span>
            </Link>
            <Link href="/watches#new" className="w-btn-outline inline-flex items-center gap-3">
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
