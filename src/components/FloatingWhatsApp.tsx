'use client'

import { MessageCircle } from 'lucide-react'

interface FloatingWhatsAppProps {
  whatsappNumber: string
  message?: string
  className?: string
}

export default function FloatingWhatsApp({ 
  whatsappNumber, 
  message = '', 
  className = '' 
}: FloatingWhatsAppProps) {
  const handleClick = () => {
    const cleanNumber = whatsappNumber.replace(/[^0-9]/g, '')
    const whatsappUrl = message 
      ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
      : `https://wa.me/${cleanNumber}`
    
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      onClick={handleClick}
      className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full bg-[#25D366] shadow-lg shadow-green-500/30 hover:scale-105 transition-all duration-200 flex items-center justify-center hover:shadow-green-500/40 ${className}`}
      aria-label="Contact us on WhatsApp"
      title="Chat met ons op WhatsApp"
    >
      <MessageCircle size={24} className="text-white" strokeWidth={2} />
    </button>
  )
}