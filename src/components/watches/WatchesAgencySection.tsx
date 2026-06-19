'use client'

import { memo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, ExternalLink, MonitorSmartphone, PackageCheck } from 'lucide-react'

const agencyNotes = [
  {
    label: 'Catalog',
    value: 'Collection filters, product pages and availability stay focused on the current watch edit.',
  },
  {
    label: 'Stock',
    value: 'The storefront follows the same dashboard data used for live availability and product status.',
  },
  {
    label: 'Orders',
    value: 'Clients can move from browsing to a WhatsApp order without leaving the boutique flow.',
  },
] as const

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
        background: 'linear-gradient(180deg, var(--w-surface), var(--w-bg))',
        borderTop: '1px solid var(--w-border)',
        borderBottom: '1px solid var(--w-border)',
      }}
    >
      <div className="mx-auto grid max-w-screen-2xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-20">
        <div className="w-reveal">
          <p
            className="mb-4 inline-flex items-center gap-2 text-[9px] font-light uppercase tracking-[0.32em]"
            style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            <MonitorSmartphone size={13} strokeWidth={1.6} />
            Storefront by NextX Agency
          </p>

          <h2
            className="max-w-xl text-3xl font-light leading-tight sm:text-4xl"
            style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            A quiet commerce layer for a curated watch catalog.
          </h2>

          <div className="my-6 h-px w-12" style={{ background: 'var(--w-gold-muted)' }} />

          <p
            className="max-w-xl text-sm font-light leading-loose"
            style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            NextX Watches uses a storefront built by NextX Agency: restrained on the surface, practical underneath, and connected to the same inventory and WhatsApp order flow as the wider NextX shop family.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="https://www.nextxagency.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-btn-gold inline-flex items-center gap-2"
            >
              NextX Agency
              <ExternalLink size={13} strokeWidth={1.6} />
            </a>
            <Link href="/audio" className="w-btn-outline inline-flex items-center gap-2">
              NextX Audio
              <ArrowRight size={13} strokeWidth={1.6} />
            </Link>
          </div>
        </div>

        <div
          className="w-reveal w-reveal-d1 border p-5 sm:p-6 lg:p-7"
          style={{
            borderColor: 'var(--w-border)',
            background: 'rgba(17,17,19,0.72)',
            fontFamily: 'var(--font-jost, system-ui, sans-serif)',
          }}
        >
          <div className="mb-5 flex items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--w-border)' }}>
            <div>
              <p className="text-[9px] font-light uppercase tracking-[0.3em]" style={{ color: 'var(--w-gold)' }}>
                Commerce build
              </p>
              <h3
                className="mt-2 text-2xl font-light leading-tight"
                style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
              >
                Built to stay out of the way.
              </h3>
            </div>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center border"
              style={{ borderColor: 'var(--w-border-gold)', color: 'var(--w-gold)', background: 'rgba(201,168,76,0.06)' }}
            >
              <PackageCheck size={19} strokeWidth={1.5} />
            </span>
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--w-border)' }}>
            {agencyNotes.map(note => (
              <div key={note.label} className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
                <p className="text-[10px] font-light uppercase tracking-[0.24em]" style={{ color: 'var(--w-muted)' }}>
                  {note.label}
                </p>
                <p className="text-sm font-light leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                  {note.value}
                </p>
              </div>
            ))}
          </div>

          <a
            href="https://www.nextxagency.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-[10px] font-light uppercase tracking-[0.22em] transition-opacity hover:opacity-100"
            style={{ color: 'var(--w-gold)', opacity: 0.82 }}
          >
            View the agency behind the storefront
            <ExternalLink size={12} strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </section>
  )
}

export const WatchesAgencySection = memo(WatchesAgencySectionComponent)
