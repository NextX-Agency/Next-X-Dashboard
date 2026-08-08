'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, MessageCircle } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'

const agencyNotes = [
  {
    label: 'Catalogus',
    value: "Producten, categorieen en productpagina's.",
  },
  {
    label: 'Voorraad',
    value: 'Beschikbaarheid blijft zichtbaar voordat klanten contact opnemen.',
  },
  {
    label: 'Bestellen',
    value: 'Bestellen via WhatsApp blijft simpel en direct.',
  },
]

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
      className="relative overflow-hidden border-y border-neutral-200 bg-white py-12 sm:py-14 lg:py-16"
    >
      <div className={`${catalogShellClassName} relative z-10`}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.74fr)_minmax(22rem,0.52fr)] lg:items-start lg:gap-14">
          <div className="max-w-2xl">
            <p className="catalog-reveal-left mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f97015]">
              NextX Agency
            </p>

            <h2 className="catalog-reveal catalog-reveal-d1 audio-display text-2xl leading-tight text-[#111111] sm:text-3xl lg:text-4xl">
              Een eenvoudige webshop voor NextX Audio.
            </h2>

            <p className="catalog-reveal catalog-reveal-d2 mt-5 text-sm leading-relaxed text-neutral-600 sm:text-base">
              Ontworpen en gebouwd door NextX Agency, met precies genoeg structuur voor producten, voorraad en bestellen via WhatsApp.
            </p>

            <div className="catalog-reveal catalog-reveal-d3 mt-7 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-[0.12em]">
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-sm bg-[#f97015] px-5 text-white transition-colors hover:bg-[#d95c08]"
              >
                Bekijk NextX Agency
                <ArrowUpRight size={14} strokeWidth={2} />
              </a>
              <Link
                href="/watches"
                className="inline-flex h-11 items-center rounded-sm border border-[#f97015] px-5 text-[#f97015] transition-colors hover:bg-[#f97015] hover:text-white"
              >
                NextX Watches
              </Link>
            </div>
          </div>

          <aside className="catalog-reveal-right catalog-reveal-d1">
            <div className="border-y border-neutral-200 py-2">
              {agencyNotes.map((note) => (
                <div key={note.label} className="grid gap-2 border-b border-neutral-200 py-5 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f97015]">
                    {note.label}
                  </p>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    {note.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-3 lg:grid-cols-1">
              <Link href="/watches" className="text-sm font-semibold text-[#111111] transition-colors hover:text-[#f97015]">
                NextX Watches
              </Link>
              <Link href="/" className="text-sm font-semibold text-[#111111] transition-colors hover:text-[#f97015]">
                NextX Portal
              </Link>
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-[#f97015]"
              >
                Open agency site
              </a>
            </div>
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
    <section ref={sectionRef} className="border-t border-neutral-200 bg-[#f97015]">
      <div className="mx-auto max-w-4xl px-5 py-14 text-center sm:px-6 sm:py-16">
        <div className="catalog-reveal mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-sm bg-white">
          <Image src="/whatsapp.png" alt="" width={24} height={24} className="h-6 w-6" />
        </div>

        <h2 className="catalog-reveal catalog-reveal-d1 audio-display mb-3 text-2xl text-white sm:text-3xl">
          Klaar om te bestellen?
        </h2>

        <p className="catalog-reveal catalog-reveal-d2 mx-auto mb-8 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
          Neem direct contact op via WhatsApp voor vragen of om je bestelling te plaatsen.
          We reageren meestal binnen een uur.
        </p>

        <div className="catalog-reveal catalog-reveal-d3">
          <a
            href={`https://wa.me/${whatsappClean}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-3 rounded-sm bg-white px-8 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#111111] transition-colors hover:bg-[#f6f6f4]"
          >
            <MessageCircle size={18} className="shrink-0 text-[#25D366]" strokeWidth={2.4} />
            Chat op WhatsApp
          </a>
        </div>

        <p className="catalog-reveal catalog-reveal-d4 audio-num mt-5 text-xs font-medium tracking-wide text-white/60">
          {whatsappNumber}
        </p>
      </div>
    </section>
  )
}
