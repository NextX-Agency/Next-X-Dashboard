'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'

export function NewValueSection() {
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
      className="relative overflow-hidden border-y border-neutral-200 bg-white py-10 sm:py-12 lg:py-14"
    >
      <div className={`${catalogShellClassName} relative z-10`}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)] lg:gap-12">
          <div>
            <p className="catalog-reveal-left mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f97015]">
              NextX Agency
            </p>

            <h2 className="catalog-reveal catalog-reveal-d1 max-w-2xl text-2xl font-black leading-tight text-[#141c2e] sm:text-3xl lg:text-4xl">
              Webshop door NextX Agency.
            </h2>

            <p className="catalog-reveal catalog-reveal-d2 mt-5 max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-base">
              NextX Audio is ingericht voor snel bladeren, duidelijke voorraad en bestellen via WhatsApp. Het ontwerp en de bouw komen van NextX Agency.
            </p>

            <div className="catalog-reveal catalog-reveal-d3 mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold uppercase tracking-[0.14em]">
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="border-b border-[#f97015]/35 pb-1 text-[#141c2e] transition-colors hover:border-[#f97015] hover:text-[#f97015]"
              >
                Bekijk NextX Agency
              </a>
              <Link
                href="/watches"
                className="border-b border-neutral-300 pb-1 text-neutral-500 transition-colors hover:border-[#f97015] hover:text-[#f97015]"
              >
                NextX Watches
              </Link>
            </div>
          </div>

          <aside className="catalog-reveal-right catalog-reveal-d1 border-t border-neutral-200 pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">
              Meer van NextX
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <Link
                href="/watches"
                className="font-semibold text-[#141c2e] transition-colors hover:text-[#f97015]"
              >
                NextX Watches
              </Link>
              <Link
                href="/"
                className="font-semibold text-[#141c2e] transition-colors hover:text-[#f97015]"
              >
                NextX Portal
              </Link>
            </div>
            <a
              href="https://www.nextxagency.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block text-xs font-bold uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-[#f97015]"
            >
              NextX Agency
            </a>
          </aside>
        </div>
      </div>
    </section>
  )
}

interface NewCtaSectionProps {
  whatsappNumber: string
  storeName: string
}

export function NewCtaSection({ whatsappNumber }: NewCtaSectionProps) {
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
