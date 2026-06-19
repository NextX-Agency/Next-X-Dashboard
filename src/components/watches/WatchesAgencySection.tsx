'use client'

import { memo, useEffect, useRef } from 'react'
import Link from 'next/link'

function WatchesAgencySectionComponent() {
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
      { threshold: 0.08 }
    )

    reveals.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="agency"
      className="scroll-mt-28 px-6 py-16 lg:scroll-mt-32 lg:px-12 lg:py-20"
      style={{
        background: 'var(--w-bg)',
        borderTop: '1px solid var(--w-border)',
        borderBottom: '1px solid var(--w-border)',
      }}
    >
      <div className="mx-auto grid max-w-screen-2xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.36fr)] lg:items-start lg:gap-16">
        <div className="w-reveal">
          <p
            className="mb-4 text-[9px] font-light uppercase tracking-[0.32em]"
            style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            NextX Agency
          </p>

          <h2
            className="max-w-xl text-3xl font-light leading-tight sm:text-4xl"
            style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            Storefront for NextX Watches.
          </h2>

          <div className="my-6 h-px w-12" style={{ background: 'var(--w-gold-muted)' }} />

          <p
            className="max-w-xl text-sm font-light leading-loose"
            style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            Built by NextX Agency for the current watch collection: restrained browsing, clear availability and WhatsApp enquiries in one place.
          </p>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[10px] font-light uppercase tracking-[0.22em]">
            <a
              href="https://www.nextxagency.com"
              target="_blank"
              rel="noopener noreferrer"
              className="border-b pb-1 transition-colors hover:opacity-100"
              style={{ borderColor: 'rgba(201,168,76,0.38)', color: 'var(--w-gold)' }}
            >
              NextX Agency
            </a>
            <Link
              href="/audio"
              className="border-b pb-1 transition-colors hover:opacity-100"
              style={{ borderColor: 'rgba(240,235,225,0.2)', color: 'var(--w-cream-2)' }}
            >
              NextX Audio
            </Link>
          </div>
        </div>

        <aside
          className="w-reveal w-reveal-d1 border-t pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-1"
          style={{ borderColor: 'var(--w-border)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
        >
          <p className="text-[9px] font-light uppercase tracking-[0.28em]" style={{ color: 'var(--w-muted)' }}>
            More from NextX
          </p>
          <div className="mt-5 flex flex-col gap-3 text-sm font-light">
            <Link href="/audio" className="transition-opacity hover:opacity-100" style={{ color: 'var(--w-cream-2)' }}>
              NextX Audio
            </Link>
            <Link href="/" className="transition-opacity hover:opacity-100" style={{ color: 'var(--w-cream-2)' }}>
              NextX Portal
            </Link>
          </div>

          <a
            href="https://www.nextxagency.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-block text-[10px] font-light uppercase tracking-[0.22em] transition-opacity hover:opacity-100"
            style={{ color: 'var(--w-gold)', opacity: 0.82 }}
          >
            NextX Agency
          </a>
        </aside>
      </div>
    </section>
  )
}

export const WatchesAgencySection = memo(WatchesAgencySectionComponent)
