'use client'

import Image from 'next/image'
import { MapPin, Phone, MessageCircle, Clock, Shield, Truck } from 'lucide-react'

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
    <section className="py-12 sm:py-16 bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-8 sm:mb-12">
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
              className="bg-white rounded-xl p-6 text-center border border-neutral-200 shadow-sm hover:shadow-lg hover:shadow-[#f97015]/10 hover:border-[#f97015]/40 cursor-pointer transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#f97015]/10 flex items-center justify-center mx-auto mb-4">
                <feature.icon size={24} className="text-[#f97015]" />
              </div>
              <h3 className="font-semibold text-[#141c2e] mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-[#141c2e]/60">
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
    <section className="py-12 sm:py-16 bg-linear-to-br from-[#f97015] to-[#e5640d]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Klaar om te bestellen?
          </h2>
          <p className="text-white/80 mb-8">
            Neem direct contact op via WhatsApp voor vragen of om je bestelling te plaatsen. 
            We reageren meestal binnen een uur.
          </p>
          <a
            href={`https://wa.me/${whatsappClean}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-white text-[#f97015] font-medium hover:bg-neutral-50 transition-colors shadow-lg"
          >
            <Image 
              src="/whatsapp.png" 
              alt="WhatsApp" 
              width={20} 
              height={20} 
              className="w-5 h-5"
            />
            Chat met ons op WhatsApp
          </a>
          <p className="mt-6 text-sm text-white/60">
            {whatsappNumber}
          </p>
        </div>
      </div>
    </section>
  )
}
