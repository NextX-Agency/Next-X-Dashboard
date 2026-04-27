'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { MessageCircle } from 'lucide-react'

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
    const targets = el.querySelectorAll('.catalog-reveal, .catalog-reveal-left, .catalog-reveal-right')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('catalog-reveal-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden py-20 lg:py-28"
      style={{ backgroundColor: '#0f172a' }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[#f97015]/40 to-transparent" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, #f97015 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.03,
        }}
      />
      <div
        className="pointer-events-none absolute right-0 top-1/2 h-96 w-96 -translate-y-1/2"
        style={{
          background: 'radial-gradient(circle, rgba(249,112,21,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-6">
            <div className="catalog-reveal-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#f97015]/25 bg-[#f97015]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#f97015]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f97015] animate-pulse" />
                Gebouwd door NextX
              </span>
            </div>

            <div className="catalog-reveal catalog-reveal-d1">
              <h2 className="text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
                <span className="text-white">Uw volgende website?</span>
                <br />
                <span className="text-[#f97015]">Wij bouwen het.</span>
              </h2>
            </div>

            <p className="catalog-reveal catalog-reveal-d2 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
              NextX Agency ontwerpt en bouwt moderne websites, webshops en visuele identiteiten voor bedrijven in Suriname, snel, betaalbaar en volledig op maat.
            </p>

            <div className="catalog-reveal catalog-reveal-d3 flex flex-wrap gap-2">
              {services.map((tag) => (
                <span
                  key={tag}
                  className="rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-300 transition-colors duration-200 hover:border-[#f97015]/40 hover:text-[#f97015]"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="catalog-reveal catalog-reveal-d4 pt-2">
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full bg-[#f97015] px-7 py-3.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-[#f97015]/25 transition-all duration-200 hover:scale-[1.02] hover:bg-[#e5640d] hover:shadow-[#f97015]/40"
              >
                Bekijk NextX Agency
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>
          </div>

          <div className="catalog-reveal-right catalog-reveal-d1">
            <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-[#1e293b] shadow-2xl shadow-black/50">
              <div className="flex items-center gap-1.5 border-b border-slate-700/50 bg-[#1a2744] px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                <div className="ml-2 flex h-5 flex-1 items-center gap-1.5 rounded-md bg-slate-700/80 px-2.5">
                  <svg className="h-2.5 w-2.5 shrink-0 text-emerald-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="truncate font-mono text-[9px] text-slate-400">www.nextxagency.com</span>
                </div>
              </div>

              <div className="relative overflow-hidden bg-[#0f172a]" style={{ height: '300px' }}>
                <span className="pointer-events-none absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>

                <iframe
                  src="https://www.nextxagency.com"
                  title="NextX Agency website"
                  sandbox="allow-scripts allow-same-origin"
                  referrerPolicy="no-referrer"
                  style={{
                    width: '200%',
                    height: '600px',
                    border: 'none',
                    transform: 'scale(0.5)',
                    transformOrigin: 'top left',
                    pointerEvents: 'none',
                  }}
                />

                <a
                  href="https://www.nextxagency.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 z-10"
                  aria-label="Bekijk NextX Agency website"
                />

                <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 h-16 bg-linear-to-t from-[#1e293b] to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-[#f97015]/30 to-transparent" />
    </section>
  )
}

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
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden py-16 sm:py-20"
      style={{ backgroundColor: '#0f172a' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, #f97015 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.02,
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-5 sm:px-6">
        <div className="catalog-reveal relative overflow-hidden rounded-2xl bg-linear-to-br from-[#f97015] to-[#e5640d] px-6 py-12 text-center shadow-2xl shadow-[#f97015]/15 sm:px-12 sm:py-14">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative z-10">
            <div className="catalog-reveal catalog-reveal-d1 mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15">
              <Image
                src="/whatsapp.png"
                alt="WhatsApp"
                width={28}
                height={28}
                className="h-7 w-7"
              />
            </div>

            <h2 className="catalog-reveal catalog-reveal-d2 mb-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Klaar om te bestellen?
            </h2>

            <p className="catalog-reveal catalog-reveal-d3 mx-auto mb-8 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
              Neem direct contact op via WhatsApp voor vragen of om je bestelling te plaatsen. We reageren meestal binnen een uur.
            </p>

            <div className="catalog-reveal catalog-reveal-d4">
              <a
                href={`https://wa.me/${whatsappClean}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#f97015] shadow-lg transition-colors hover:bg-white/90"
              >
                <MessageCircle size={20} className="shrink-0 text-[#25D366]" strokeWidth={2.5} />
                Chat met ons op WhatsApp
              </a>
            </div>

            <p className="catalog-reveal catalog-reveal-d5 mt-5 text-xs font-medium tracking-wide text-white/50">
              {whatsappNumber}
            </p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-[#f97015]/20 to-transparent" />
    </section>
  )
}
