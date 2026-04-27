'use client'

import Image from 'next/image'
import { MapPin, MessageCircle, Clock, Shield } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'

interface NewValueSectionProps {
  storeAddress: string
  whatsappNumber: string
  storeDescription?: string
}

export function NewValueSection({ 
  storeAddress, 
  whatsappNumber,
  storeDescription 
}: NewValueSectionProps) {
  const features = [
    {
      icon: MapPin,
      title: 'Lokaal Afhalen',
      description: `Haal je bestelling op bij onze locatie in ${storeAddress}`
    },
    {
      icon: MessageCircle,
      title: 'WhatsApp Bestellen',
      description: 'Bestel eenvoudig via WhatsApp en ontvang direct bevestiging'
    },
    {
      icon: Clock,
      title: 'Snelle Verwerking',
      description: 'Bestellingen worden dezelfde of volgende dag verwerkt'
    },
    {
      icon: Shield,
      title: 'Kwaliteitsgarantie',
      description: 'Al onze producten zijn zorgvuldig geselecteerd'
    }
  ]

  return (
    <section className="border-y border-neutral-200/70 bg-[#fffdfb] py-12 sm:py-16">
      <div className={catalogShellClassName}>
        {/* Section Header */}
        <div className="text-center mb-8 sm:mb-12">
          <span className="mb-4 inline-flex items-center gap-2 rounded-lg border border-[#f97015]/15 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f97015] shadow-sm">
            Waarom NextX
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#141c2e] mb-3 sm:mb-4">
            Waarom bij ons bestellen?
          </h2>
          {storeDescription && (
            <p className="text-[#141c2e]/70 max-w-2xl mx-auto">
              {storeDescription}
            </p>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="group relative overflow-hidden rounded-[24px] border border-neutral-200/80 bg-white p-5 text-left shadow-[0_16px_34px_rgba(20,28,46,0.06)] [transition:all_0.3s_cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-1 hover:border-[#f97015]/25 hover:shadow-[0_22px_42px_rgba(20,28,46,0.1)]"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[#f97015]/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#f97015]/15 bg-[#fff7f2]">
                <feature.icon size={24} className="text-[#f97015]" />
              </div>
              <h3 className="mb-2 font-semibold text-[#141c2e]">
                {feature.title}
              </h3>
              <p className="text-sm leading-6 text-[#141c2e]/60">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Call to Action Section
interface NewCtaSectionProps {
  whatsappNumber: string
  storeName: string
}

export function NewCtaSection({ whatsappNumber, storeName }: NewCtaSectionProps) {
  const whatsappClean = whatsappNumber.replace(/[^0-9]/g, '')

  return (
    <section className="border-t border-[#f97015]/10 bg-[#fff7f2] py-12 sm:py-16">
      <div className={catalogShellClassName}>
        <div className="mx-auto max-w-3xl rounded-[32px] border border-[#f97015]/15 bg-white px-6 py-10 text-center shadow-[0_24px_60px_rgba(20,28,46,0.08)] sm:px-10 sm:py-12">
          <span className="mb-4 inline-flex items-center gap-2 rounded-lg border border-[#f97015]/15 bg-[#fff7f2] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f97015]">
            Direct contact
          </span>
          <h2 className="mb-4 text-2xl font-bold text-[#141c2e] sm:text-3xl">
            Klaar om te bestellen?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-[#141c2e]/68">
            Neem direct contact op via WhatsApp voor vragen of om je bestelling te plaatsen. 
            We reageren meestal binnen een uur.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={`https://wa.me/${whatsappClean}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-lg bg-[#141c2e] px-6 py-3.5 font-medium text-white shadow-[0_18px_36px_rgba(20,28,46,0.18)] [transition:all_0.3s_cubic-bezier(0.4,0,0.2,1)] hover:bg-[#1c2945] active:scale-[0.98]"
            >
              <Image 
                src="/whatsapp.png" 
                alt="WhatsApp" 
                width={20} 
                height={20} 
                className="h-5 w-5"
              />
              Chat met ons op WhatsApp
            </a>
            <div className="rounded-lg border border-[#f97015]/15 bg-[#fff7f2] px-4 py-3 text-sm text-[#141c2e]/65">
              Bereikbaar via {whatsappNumber}
            </div>
          </div>
          <p className="mt-6 text-sm text-[#141c2e]/48">
            {storeName} verwerkt bestellingen handmatig voor een snelle bevestiging.
          </p>
        </div>
      </div>
    </section>
  )
}
