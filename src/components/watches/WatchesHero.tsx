'use client'

import { memo, useEffect, useRef } from 'react'
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
  ctaHref = '/watches#collections',
}: WatchesHeroProps) {
  const heroRef = useRef<HTMLDivElement>(null)

  // Parallax on scroll
  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const bg = hero.querySelector<HTMLDivElement>('.w-hero-bg')
    if (!bg) return

    const handleScroll = () => {
      const offset = window.scrollY * 0.3
      bg.style.transform = `translateY(${offset}px)`
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section
      ref={heroRef}
      className="relative flex items-end overflow-hidden"
      style={{ height: 'min(100svh, 960px)', minHeight: 480 }}
      aria-label="Hero section"
    >
      {/* Background */}
      <div
        className="w-hero-bg absolute inset-0 will-change-transform"
        style={{
          background: 'linear-gradient(135deg, #09090b 0%, #1a1207 50%, #0d0a03 100%)',
        }}
      />

      {/* Decorative gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.4) 50%, rgba(9,9,11,0.1) 100%)',
        }}
      />

      {/* Decorative vertical line */}
      <div
        className="absolute left-12 top-24 bottom-24 w-px hidden lg:block"
        style={{ background: 'var(--w-border)' }}
      />

      {/* Content */}
      <div className="relative z-10 px-6 lg:px-12 pb-16 lg:pb-24 max-w-screen-2xl mx-auto w-full">
        <div className="max-w-2xl">
          {/* Eyebrow */}
          <p
            className="mb-6 text-[11px] font-light tracking-[0.4em] uppercase"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'var(--w-gold)' }}
          >
            NextX Watches — Luxury Collection
          </p>

          {/* Main title */}
          <h1
            className="mb-6 font-light leading-none"
            style={{
              fontFamily: 'var(--font-cormorant, Georgia, serif)',
              color: 'var(--w-cream)',
              fontSize: 'clamp(3.5rem, 9vw, 8rem)',
              whiteSpace: 'pre-line',
            }}
          >
            {title}
          </h1>

          {/* Subtitle */}
          <p
            className="mb-10 max-w-md text-base font-light leading-relaxed"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'var(--w-cream-2)' }}
          >
            {subtitle}
          </p>

          {/* CTA */}
          <Link href={ctaHref} className="w-btn-gold inline-flex items-center gap-3">
            {ctaLabel}
            <span className="text-xs">→</span>
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 right-12 hidden lg:flex flex-col items-center gap-3">
        <span
          className="text-[9px] tracking-[0.3em] uppercase"
          style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'var(--w-muted)', writingMode: 'vertical-rl' }}
        >
          Scroll
        </span>
        <div
          className="w-px h-12"
          style={{ background: 'var(--w-border)' }}
        />
      </div>
    </section>
  )
}

export const WatchesHero = memo(WatchesHeroComponent)
