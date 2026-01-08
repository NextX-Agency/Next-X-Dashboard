'use client'

import Image from 'next/image'
import { MapPin, Phone, MessageCircle, Zap, Heart } from 'lucide-react'

interface FooterSectionProps {
  storeName: string
  logoUrl?: string
  storeDescription?: string
  storeAddress: string
  whatsappNumber: string
}

export function FooterSection({
  storeName,
  logoUrl,
  storeDescription,
  storeAddress,
  whatsappNumber
}: FooterSectionProps) {
  const whatsappClean = whatsappNumber.replace(/[^0-9]/g, '')
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden bg-white">
      {/* Background accent */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#f97015]/[0.03] rounded-full blur-3xl" />
      
      <div className="relative border-t border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-20 lg:py-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
            {/* Brand column */}
            <div className="md:col-span-1">
              {logoUrl ? (
                <Image 
                  src={logoUrl} 
                  alt={storeName} 
                  width={140} 
                  height={48} 
                  className="h-10 w-auto object-contain mb-6"
                  unoptimized
                />
              ) : (
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-[#f97015] flex items-center justify-center shadow-lg shadow-[#f97015]/30">
                    <Zap size={20} className="text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-2xl font-black tracking-tight">
                    <span className="text-[#141c2e]">Next</span>
                    <span className="text-[#f97015]">X</span>
                  </span>
                </div>
              )}
              {storeDescription && (
                <p className="text-sm text-[#141c2e]/60 leading-relaxed max-w-sm">
                  {storeDescription}
                </p>
              )}
            </div>
          
          {/* Contact column */}
          <div className="md:col-span-1">
            <h4 className="text-xs font-bold tracking-[0.2em] uppercase text-[#f97015] mb-6">
              Contact
            </h4>
            <ul className="space-y-5">
              <li>
                <div className="flex items-start gap-4 text-sm text-[#141c2e]/70 group">
                  <div className="w-10 h-10 rounded-xl bg-[#f97015]/10 border border-[#f97015]/20 flex items-center justify-center flex-shrink-0 group-hover:border-[#f97015]/40 group-hover:bg-[#f97015]/20 transition-all">
                    <MapPin size={16} className="text-[#f97015]" />
                  </div>
                  <span className="leading-relaxed pt-2.5">{storeAddress}</span>
                </div>
              </li>
              <li>
                <div className="flex items-center gap-4 text-sm text-[#141c2e]/70 group">
                  <div className="w-10 h-10 rounded-xl bg-[#f97015]/10 border border-[#f97015]/20 flex items-center justify-center flex-shrink-0 group-hover:border-[#f97015]/40 group-hover:bg-[#f97015]/20 transition-all">
                    <Phone size={16} className="text-[#f97015]" />
                  </div>
                  <span>{whatsappNumber}</span>
                </div>
              </li>
            </ul>
          </div>
          
          {/* CTA column */}
          <div className="md:col-span-1">
            <h4 className="text-xs font-bold tracking-[0.2em] uppercase text-[#f97015] mb-6">
              Bestellen
            </h4>
            <p className="text-sm text-[#141c2e]/60 mb-8 leading-relaxed">
              Neem contact op via WhatsApp om je bestelling te plaatsen.
            </p>
            <a
              href={`https://wa.me/${whatsappClean}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-7 py-4 rounded-2xl bg-[#25D366] hover:bg-[#22c55e] text-white text-sm font-bold transition-all duration-300 shadow-xl shadow-[#25D366]/30 hover:shadow-[#25D366]/50 hover:scale-105"
            >
              <MessageCircle size={18} strokeWidth={2.5} />
              <span>Start een chat</span>
            </a>
          </div>
        </div>
        
        {/* Bottom bar */}
        <div className="mt-20 pt-8 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#141c2e]/50">
            © {currentYear} {storeName}. Alle rechten voorbehouden.
          </p>
          <p className="flex items-center gap-2 text-sm text-[#141c2e]/40">
            <span>Made with</span>
            <Heart size={14} className="text-red-500 fill-red-500" />
            <span>by NextX</span>
          </p>
        </div>
      </div>
    </div>
    </footer>
  )
}
