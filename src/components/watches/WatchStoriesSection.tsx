'use client'

import { memo, useEffect, useRef } from 'react'

const STORIES = [
  {
    id: 1,
    origin: 'Japanese Precision',
    title: 'The Art of Movement',
    body: 'Born from centuries of meticulous craftsmanship, Japanese watchmaking perfected the balance between art and engineering. Each spring, gear, and jewel placed with intentionality — time measured to its finest expression.',
    glyph: '精',
    delay: 'd1',
  },
  {
    id: 2,
    origin: 'Bold by Design',
    title: 'Unapologetically Distinct',
    body: 'Where others whisper, bold design speaks. Oversized cases, striking dials, and diver-grade resilience define watches built not just to tell time, but to tell your story — from the ocean floor to the boardroom.',
    glyph: 'PRO',
    delay: 'd2',
  },
  {
    id: 3,
    origin: 'Swiss Heritage',
    title: 'A Century of Craft',
    body: 'The mountains of Switzerland gave birth to a philosophy: that a timepiece is not merely a tool, but a companion for life. Hand-finished cases and temperature-tested movements passed through generations of masters.',
    glyph: 'CH',
    delay: 'd3',
  },
  {
    id: 4,
    origin: 'Modern Innovation',
    title: 'Built for Tomorrow',
    body: 'Solar-powered, shock-resistant, and built to last decades — modern watchmaking bridges heritage and technology. Wear the confidence of knowing your timepiece will outlast every challenge, every season.',
    glyph: 'G',
    delay: 'd4',
  },
] as const

function WatchStoriesSectionComponent() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const reveals = section.querySelectorAll('.w-reveal')
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.07, rootMargin: '0px 0px -60px 0px' }
    )
    reveals.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="stories"
      className="py-20 lg:py-28"
      style={{ background: 'var(--w-surface)' }}
    >
      <div className="px-6 lg:px-12 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="mb-14 lg:mb-20 w-reveal">
          <p
            className="w-subheading mb-4"
            style={{ color: 'var(--w-orange)' }}
          >
            Watch Heritage
          </p>
          <div className="flex items-end gap-8">
            <h2 className="w-heading" style={{ color: 'var(--w-cream)' }}>
              Stories Behind the Craft
            </h2>
          </div>
          <div className="mt-5 h-px w-20" style={{ background: 'var(--w-border-gold)' }} />
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
          {STORIES.map(story => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      </div>
    </section>
  )
}

function StoryCard({
  story,
}: {
  story: (typeof STORIES)[number]
}) {
  return (
    <article
      className={`w-reveal w-reveal-${story.delay} relative overflow-hidden p-8 lg:p-10 group transition-all duration-400`}
      style={{
        background: 'var(--w-surface-2)',
        border: '1px solid var(--w-border)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'
        e.currentTarget.style.background = 'var(--w-surface-3)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--w-border)'
        e.currentTarget.style.background = 'var(--w-surface-2)'
      }}
    >
      {/* Ghost glyph — decorative, not readable */}
      <span
        aria-hidden="true"
        className="absolute top-3 right-5 select-none pointer-events-none font-serif leading-none transition-opacity duration-500 opacity-100 group-hover:opacity-60"
        style={{
          fontSize: 'clamp(4rem, 8vw, 6.5rem)',
          color: 'rgba(201,168,76,0.055)',
          fontFamily: 'var(--font-cormorant, Georgia, serif)',
          fontWeight: 300,
        }}
      >
        {story.glyph}
      </span>

      {/* Top accent rule */}
      <div
        className="mb-7 w-8 h-px"
        style={{ background: 'var(--w-gold-muted)' }}
      />

      {/* Origin label */}
      <p
        className="mb-2 text-[9px] tracking-[0.32em] uppercase font-light"
        style={{
          color: 'var(--w-gold)',
          fontFamily: 'var(--font-jost, system-ui, sans-serif)',
        }}
      >
        {story.origin}
      </p>

      {/* Story title */}
      <h3
        className="mb-5 font-light leading-snug"
        style={{
          fontFamily: 'var(--font-cormorant, Georgia, serif)',
          color: 'var(--w-cream)',
          fontSize: 'clamp(1.35rem, 2.5vw, 1.7rem)',
        }}
      >
        {story.title}
      </h3>

      {/* Body */}
      <p
        className="text-sm font-light leading-[1.8]"
        style={{
          color: 'var(--w-cream-2)',
          fontFamily: 'var(--font-jost, system-ui, sans-serif)',
          maxWidth: '46ch',
        }}
      >
        {story.body}
      </p>
    </article>
  )
}

export const WatchStoriesSection = memo(WatchStoriesSectionComponent)
