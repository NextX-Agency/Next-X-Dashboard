'use client'

import Image from 'next/image'
import { useRef, useEffect } from 'react'

/* ─── Agency cross-reference section ─────────────────────────────────── */

interface NewValueSectionProps {
  storeAddress?: string
  whatsappNumber?: string
  storeDescription?: string
}

const services = ['Webdesign', 'E-Commerce', 'Branding', 'SEO'] as const

export function NewValueSection(_props: NewValueSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const targets = el.querySelectorAll('.catalog-reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('catalog-reveal-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative py-20 lg:py-28 overflow-hidden"
      style={{ backgroundColor: '#0f172a' }}
    >
      {/* Top edge glow */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#f97015]/40 to-transparent pointer-events-none" />

      {/* Dot-grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #f97015 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.03,
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Left: content ── */}
          <div className="flex flex-col gap-6">
            {/* Pill badge */}
            <div className="catalog-reveal">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#f97015]/25 bg-[#f97015]/10 text-[#f97015] text-xs font-bold tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f97015] animate-pulse" />
                Gebouwd door NextX
              </span>
            </div>

            {/* Headline */}
            <div className="catalog-reveal catalog-reveal-d1">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.05]">
                <span className="text-white">Uw volgende website?</span>
                <br />
                <span className="text-[#f97015]">Wij bouwen het.</span>
              </h2>
            </div>

            {/* Description */}
            <p className="catalog-reveal catalog-reveal-d2 text-slate-400 text-sm sm:text-base leading-relaxed max-w-md">
              NextX Agency ontwerpt en bouwt moderne websites, webshops en visuele
              identiteiten voor bedrijven in Suriname — snel, betaalbaar en volledig op maat.
            </p>

            {/* Service tags */}
            <div className="catalog-reveal catalog-reveal-d3 flex flex-wrap gap-2">
              {services.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-400 text-xs font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* CTA */}
            <div className="catalog-reveal catalog-reveal-d4 pt-2">
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#f97015] text-white text-sm font-bold tracking-wide hover:bg-[#e5640d] transition-colors duration-200 shadow-lg shadow-[#f97015]/20"
              >
                Bekijk NextX Agency
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
            </div>
          </div>

          {/* ── Right: browser mockup ── */}
          <div className="catalog-reveal catalog-reveal-d2">
            <div className="rounded-2xl bg-[#1e293b] border border-slate-700/60 overflow-hidden shadow-2xl shadow-black/40">

              {/* Chrome bar */}
              <div className="flex items-center gap-1.5 px-3 py-2.5 bg-[#1e293b] border-b border-slate-700/50">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                <div className="ml-2 flex-1 rounded-md bg-slate-700/80 h-5 flex items-center px-2.5 gap-1.5">
                  <svg className="w-2.5 h-2.5 text-emerald-400/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-[9px] text-slate-400 font-mono truncate">www.nextxagency.com</span>
                </div>
              </div>

              {/* Website preview */}
              <div className="relative" style={{ height: '280px' }}>
                <iframe
                  src="https://www.nextxagency.com"
                  title="NextX Agency"
                  className="pointer-events-none bg-white"
                  style={{
                    border: 'none',
                    width: '1440px',
                    height: '900px',
                    transform: 'scale(0.33)',
                    transformOrigin: 'top left',
                  }}
                  loading="lazy"
                  sandbox="allow-scripts allow-same-origin"
                />

                {/* Live pill */}
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold tracking-widest uppercase z-10 pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>

                {/* Bottom gradient fade */}
                <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-[#1e293b] to-transparent pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom edge glow */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#f97015]/30 to-transparent pointer-events-none" />
    </section>
  )
}

/* ─── WhatsApp CTA section (restyled dark + orange card) ─────────────── */

interface NewCtaSectionProps {
  whatsappNumber: string
  storeName: string
}

export function NewCtaSection({ whatsappNumber, storeName }: NewCtaSectionProps) {
  const whatsappClean = whatsappNumber.replace(/[^0-9]/g, '')
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const targets = el.querySelectorAll('.catalog-reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('catalog-reveal-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.2 }
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative py-16 sm:py-20 overflow-hidden"
      style={{ backgroundColor: '#0f172a' }}
    >
      {/* Dot-grid texture (matching value section) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #f97015 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.02,
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-6">
        {/* Orange gradient card */}
        <div className="catalog-reveal relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#f97015] to-[#e5640d] px-6 py-12 sm:px-12 sm:py-14 text-center shadow-2xl shadow-[#f97015]/15">

          {/* Card dot-grid texture */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative z-10">
            {/* WhatsApp icon */}
            <div className="catalog-reveal catalog-reveal-d1 w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center mx-auto mb-6">
              <Image
                src="/whatsapp.png"
                alt="WhatsApp"
                width={28}
                height={28}
                className="w-7 h-7"
              />
            </div>

            <h2 className="catalog-reveal catalog-reveal-d2 text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
              Klaar om te bestellen?
            </h2>

            <p className="catalog-reveal catalog-reveal-d3 text-white/80 max-w-md mx-auto mb-8 text-sm sm:text-base leading-relaxed">
              Neem direct contact op via WhatsApp voor vragen of om je bestelling te plaatsen.
              We reageren meestal binnen een uur.
            </p>

            <div className="catalog-reveal catalog-reveal-d4">
              <a
                href={`https://wa.me/${whatsappClean}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-3.5 rounded-full bg-white text-[#f97015] font-bold text-sm hover:bg-white/90 transition-colors shadow-lg"
              >
                <Image
                  src="/whatsapp.png"
                  alt=""
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
                Chat met ons op WhatsApp
              </a>
            </div>

            <p className="catalog-reveal catalog-reveal-d5 mt-5 text-xs text-white/50 font-medium tracking-wide">
              {whatsappNumber}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom glow */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#f97015]/20 to-transparent pointer-events-none" />
    </section>
  )
}
