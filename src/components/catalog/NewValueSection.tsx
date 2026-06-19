'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ExternalLink, Headphones, MessageCircle, MonitorSmartphone, PackageCheck, Watch } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'

const storefronts = [
  {
    href: '/audio',
    label: 'NextX Audio',
    eyebrow: 'Audio catalogus',
    description: 'IEMs, accessoires en combo deals met lokale afhaalflow.',
    Icon: Headphones,
  },
  {
    href: '/watches',
    label: 'NextX Watches',
    eyebrow: 'Watches catalogus',
    description: 'Horloges in een eigen, rustige storefront.',
    Icon: Watch,
  },
] as const

const capabilities = [
  {
    label: 'Catalogus',
    value: 'Audio en Watches hebben elk een eigen winkelervaring, met dezelfde beheerflow achter de schermen.',
  },
  {
    label: 'Voorraad',
    value: 'Producten, combo deals en afhaallocaties blijven gekoppeld aan de dashboarddata.',
  },
  {
    label: 'Checkout',
    value: 'Bestellen blijft snel en lokaal via WhatsApp, zonder onnodige stappen.',
  },
] as const

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
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <div className="flex flex-col gap-6">
            <div className="catalog-reveal-left">
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#f97015]/20 bg-[#fff7f2] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f97015]">
                <MonitorSmartphone size={14} strokeWidth={2.2} />
                Storefront door NextX Agency
              </span>
            </div>

            <div className="catalog-reveal catalog-reveal-d1">
              <h2 className="max-w-xl text-2xl font-black leading-tight text-[#141c2e] sm:text-3xl lg:text-4xl">
                Gebouwd voor snel kiezen, actuele voorraad en direct bestellen.
              </h2>
            </div>

            <p className="catalog-reveal catalog-reveal-d2 max-w-xl text-sm leading-relaxed text-neutral-600 sm:text-base">
              Deze webshop is ontworpen en gebouwd door NextX Agency: compact genoeg om snel te shoppen, stevig genoeg om catalogus, voorraad en WhatsApp-orders netjes samen te houden.
            </p>

            <div className="catalog-reveal catalog-reveal-d3 flex flex-wrap gap-3">
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#141c2e] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#1d2940] active:scale-[0.98]"
              >
                Bekijk NextX Agency
                <ExternalLink size={14} strokeWidth={2} />
              </a>
              <Link
                href="/watches"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[#141c2e] transition-colors hover:border-[#f97015]/40 hover:text-[#f97015] active:scale-[0.98]"
              >
                NextX Watches
                <ArrowRight size={14} strokeWidth={2} />
              </Link>
            </div>
          </div>

          <div className="catalog-reveal-right catalog-reveal-d1">
            <div className="rounded-lg border border-neutral-200 bg-[#f8fafc] p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4 border-b border-neutral-200 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f97015]">
                    Achter de shop
                  </p>
                  <h3 className="mt-1 text-lg font-extrabold leading-tight text-[#141c2e]">
                    Een basis, twee webshops.
                  </h3>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[#f97015]">
                  <PackageCheck size={20} strokeWidth={2} />
                </span>
              </div>

              <div className="grid divide-y divide-neutral-200 border-y border-neutral-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {capabilities.map((item) => (
                  <div key={item.label} className="py-4 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f97015]">
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-2">
                {storefronts.map(({ href, label, eyebrow, description, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex items-center justify-between gap-4 bg-white p-4 transition-colors hover:bg-[#fff7f2]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-[#f97015]">
                        <Icon size={17} strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-400">
                          {eyebrow}
                        </span>
                        <span className="block truncate text-sm font-bold text-[#141c2e]">
                          {label}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {description}
                        </span>
                      </span>
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-neutral-400 transition-colors group-hover:text-[#f97015]" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="catalog-reveal catalog-reveal-d3 mt-8 flex flex-col gap-4 border-t border-neutral-200 pt-5 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Digitale storefront door{' '}
            <a
              href="https://www.nextxagency.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#141c2e] underline decoration-[#f97015]/35 underline-offset-4 transition-colors hover:text-[#f97015]"
            >
              NextX Agency
            </a>
          </p>
          <a
            href="https://www.nextxagency.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.16em] text-neutral-500 transition-colors hover:text-[#f97015]"
          >
            Bekijk het bureau
            <ExternalLink size={12} strokeWidth={2} />
          </a>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-[#f97015]/25 to-transparent" />
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
