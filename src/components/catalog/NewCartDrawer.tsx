'use client'

import Image from 'next/image'
import { X, Plus, Minus, Package, MessageCircle, ShoppingBag, MapPin, Calendar, ChevronDown } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

interface CartItem {
  id: string
  name: string
  imageUrl?: string | null
  price: number
  quantity: number
}

interface Location {
  id: string
  name: string
  address: string | null
}

interface NewCartDrawerProps {
  isOpen: boolean
  onClose: () => void
  items: CartItem[]
  currency: Currency
  storeName: string
  whatsappNumber: string
  storeAddress?: string
  locations: Location[]
  selectedLocation: string
  onLocationChange: (locationId: string) => void
  pickupDate: 'today' | 'tomorrow' | 'custom'
  onPickupDateChange: (date: 'today' | 'tomorrow' | 'custom') => void
  customPickupDate: string
  onCustomPickupDateChange: (date: string) => void
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onAddOne: (itemId: string) => void
  customerName: string
  onCustomerNameChange: (name: string) => void
  customerPhone: string
  onCustomerPhoneChange: (phone: string) => void
  customerNotes: string
  onCustomerNotesChange: (notes: string) => void
  onSubmitOrder: () => void
}

export function NewCartDrawer({
  isOpen,
  onClose,
  items,
  currency,
  storeName,
  storeAddress = '',
  locations,
  selectedLocation,
  onLocationChange,
  pickupDate,
  onPickupDateChange,
  customPickupDate,
  onCustomPickupDateChange,
  onUpdateQuantity,
  onAddOne,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  customerNotes,
  onCustomerNotesChange,
  onSubmitOrder
}: NewCartDrawerProps) {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  if (!isOpen) return null

  const selectedLocationData = locations.find(l => l.id === selectedLocation)

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#f97015]/10 flex items-center justify-center">
              <ShoppingBag size={18} className="text-[#f97015]" />
            </div>
            <div>
              <h2 className="font-semibold text-[#141c2e]">Winkelwagen</h2>
              <p className="text-xs text-[#141c2e]/60">
                {totalItems} {totalItems === 1 ? 'product' : 'producten'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl hover:bg-[#f97015]/10 flex items-center justify-center transition-colors"
          >
            <X size={20} className="text-[#141c2e]/60" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 px-6">
              <div className="w-20 h-20 rounded-2xl bg-[#f97015]/10 flex items-center justify-center mb-4">
                <ShoppingBag size={32} className="text-[#f97015]/40" />
              </div>
              <h3 className="font-medium text-[#141c2e] mb-2">
                Je winkelwagen is leeg
              </h3>
              <p className="text-sm text-[#141c2e]/60 text-center mb-6">
                Voeg producten toe om een bestelling te plaatsen
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-full bg-[#f97015] text-white text-sm font-medium hover:bg-[#e5640d] transition-colors"
              >
                Verder winkelen
              </button>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {items.map((item) => (
                <div 
                  key={item.id}
                  className="flex gap-4 p-4 rounded-2xl bg-neutral-50"
                >
                  {/* Image */}
                  <div className="w-20 h-20 rounded-xl bg-white overflow-hidden flex-shrink-0">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={24} className="text-neutral-300" />
                      </div>
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-[#141c2e] text-sm line-clamp-2 mb-1">
                      {item.name}
                    </h4>
                    <p className="text-sm font-semibold text-[#141c2e] mb-3">
                      {formatCurrency(item.price, currency)}
                    </p>
                    
                    {/* Quantity controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-0 rounded-lg border border-neutral-200 bg-white">
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center text-[#141c2e]/50 hover:text-[#141c2e] transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-[#141c2e]">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onAddOne(item.id)}
                          className="w-8 h-8 flex items-center justify-center text-[#141c2e]/50 hover:text-[#141c2e] transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => onUpdateQuantity(item.id, 0)}
                        className="text-xs text-[#141c2e]/40 hover:text-red-500 transition-colors"
                      >
                        Verwijder
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout Form */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-neutral-100 p-6 bg-neutral-50">
            <div className="space-y-4 mb-6">
              {/* Location Selection */}
              {locations.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                    Afhaallocatie
                  </label>
                  <div className="relative">
                    <select
                      value={selectedLocation}
                      onChange={(e) => onLocationChange(e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-neutral-200 bg-white text-sm text-[#141c2e] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#f97015]/30 focus:border-[#f97015]"
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} {loc.address ? `- ${loc.address}` : ''}
                        </option>
                      ))}
                    </select>
                    <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  </div>
                </div>
              )}

              {/* Pickup Date */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5">
                  Ophaaldatum
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onPickupDateChange('today')}
                    className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                      pickupDate === 'today'
                        ? 'bg-[#f97015] text-white'
                        : 'bg-white border border-neutral-200 text-[#141c2e]/70 hover:border-[#f97015]/50'
                    }`}
                  >
                    Vandaag
                  </button>
                  <button
                    onClick={() => onPickupDateChange('tomorrow')}
                    className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                      pickupDate === 'tomorrow'
                        ? 'bg-[#f97015] text-white'
                        : 'bg-white border border-neutral-200 text-[#141c2e]/70 hover:border-[#f97015]/50'
                    }`}
                  >
                    Morgen
                  </button>
                  <button
                    onClick={() => onPickupDateChange('custom')}
                    className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                      pickupDate === 'custom'
                        ? 'bg-[#f97015] text-white'
                        : 'bg-white border border-neutral-200 text-[#141c2e]/70 hover:border-[#f97015]/50'
                    }`}
                  >
                    Anders
                  </button>
                </div>
                {pickupDate === 'custom' && (
                  <input
                    type="date"
                    value={customPickupDate}
                    onChange={(e) => onCustomPickupDateChange(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-white text-sm text-[#141c2e] mt-2 focus:outline-none focus:ring-2 focus:ring-[#f97015]/30 focus:border-[#f97015]"
                  />
                )}
              </div>

              {/* Customer Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#141c2e]/60 mb-1.5">
                    Naam
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => onCustomerNameChange(e.target.value)}
                    placeholder="Je naam"
                    className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-white text-sm text-[#141c2e] placeholder:text-[#141c2e]/40 focus:outline-none focus:ring-2 focus:ring-[#f97015]/30 focus:border-[#f97015]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#141c2e]/60 mb-1.5">
                    Telefoon
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => onCustomerPhoneChange(e.target.value)}
                    placeholder="Telefoonnummer"
                    className="w-full h-11 px-4 rounded-xl border border-neutral-200 bg-white text-sm text-[#141c2e] placeholder:text-[#141c2e]/40 focus:outline-none focus:ring-2 focus:ring-[#f97015]/30 focus:border-[#f97015]"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-[#141c2e]/60 mb-1.5">
                  Opmerkingen (optioneel)
                </label>
                <textarea
                  value={customerNotes}
                  onChange={(e) => onCustomerNotesChange(e.target.value)}
                  placeholder="Bijv. specifieke wensen of ophaaltijd"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-sm text-[#141c2e] placeholder:text-[#141c2e]/40 resize-none focus:outline-none focus:ring-2 focus:ring-[#f97015]/30 focus:border-[#f97015]"
                />
              </div>
            </div>

            {/* Total & Submit */}
            <div className="flex items-center justify-between py-4 border-t border-neutral-200 mb-4">
              <span className="text-[#141c2e]/70">Totaal</span>
              <span className="text-xl font-bold text-[#141c2e]">
                {formatCurrency(totalPrice, currency)}
              </span>
            </div>

            <button
              onClick={onSubmitOrder}
              className="w-full h-14 rounded-2xl bg-[#25D366] text-white font-semibold flex items-center justify-center gap-3 hover:bg-[#22c55e] transition-colors shadow-lg shadow-green-500/20"
            >
              <MessageCircle size={20} />
              Bestelling Plaatsen via WhatsApp
            </button>
            
            <p className="text-xs text-[#141c2e]/50 text-center mt-4">
              Je wordt doorgestuurd naar WhatsApp om je bestelling te bevestigen
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
