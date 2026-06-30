'use client'

import { memo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

const agencyNotes = [
  {
    label: 'Catalog',
    value: 'Filters, product detail pages and collection browsing.',
  },
  {
    label: 'Operations',
    value: 'Stock visibility and WhatsApp enquiry handling.',
  },
  {
    label: 'Care',
    value: 'Designed to stay quiet as the watch list grows.',
  },
]

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
      <div className="mx-auto grid max-w-screen-2xl gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(22rem,0.54fr)] lg:items-start lg:gap-20">
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
            A quiet storefront for the NextX Watches collection.
          </h2>

          <div className="my-6 h-px w-12" style={{ background: 'var(--w-gold-muted)' }} />

          <p
            className="max-w-xl text-sm font-light leading-loose"
            style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            Built and maintained by NextX Agency so the collection can grow without making the page feel crowded. The focus stays on browsing, availability and direct contact.
          </p>

          <div className="mt-8 flex flex-wrap gap-3 text-[10px] font-light uppercase tracking-[0.18em]">
            <a
              href="https://www.nextxagency.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-[4px] border px-4 transition-opacity hover:opacity-85"
              style={{ borderColor: 'rgba(201,168,76,0.4)', color: 'var(--w-gold)', background: 'rgba(201,168,76,0.06)' }}
            >
              NextX Agency
              <ArrowUpRight size={13} strokeWidth={1.5} />
            </a>
            <Link
              href="/audio"
              className="inline-flex h-11 items-center rounded-[4px] border px-4 transition-opacity hover:opacity-85"
              style={{ borderColor: 'rgba(240,235,225,0.2)', color: 'var(--w-cream-2)' }}
            >
              NextX Audio
            </Link>
          </div>
        </div>

        <aside
          className="w-reveal w-reveal-d1 lg:pt-2"
          style={{ borderColor: 'var(--w-border)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
        >
          <div
            className="border-y py-2"
            style={{
              borderColor: 'var(--w-border)',
            }}
          >
            {agencyNotes.map((note) => (
              <div key={note.label} className="grid gap-2 border-b py-5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]" style={{ borderColor: 'var(--w-border)' }}>
                <p className="text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--w-gold)' }}>
                  {note.label}
                </p>
                <p className="text-sm font-light leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                  {note.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 border-t pt-5 text-sm font-light sm:grid-cols-3 lg:grid-cols-1" style={{ borderColor: 'var(--w-border)' }}>
            <Link href="/audio" className="transition-opacity hover:opacity-100" style={{ color: 'var(--w-cream-2)' }}>
              NextX Audio
            </Link>
            <Link href="/" className="transition-opacity hover:opacity-100" style={{ color: 'var(--w-cream-2)' }}>
              NextX Portal
            </Link>
            <a
              href="https://www.nextxagency.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-light uppercase tracking-[0.22em] transition-opacity hover:opacity-100"
              style={{ color: 'var(--w-gold)', opacity: 0.82 }}
            >
              Open agency site
            </a>
          </div>
        </aside>
      </div>
    </section>
  )
}

export const WatchesAgencySection = memo(WatchesAgencySectionComponent)
