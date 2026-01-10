'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X, Plus, Minus, Package, MessageCircle, ShoppingBag, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
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
  // Toggle state for checkout form visibility
  const [isCheckoutExpanded, setIsCheckoutExpanded] = useState(false)

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
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
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

        {/* Items - Scrollable area with better mobile height */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 px-6">
              <div className="w-16 h-16 rounded-2xl bg-[#f97015]/10 flex items-center justify-center mb-4">
                <ShoppingBag size={28} className="text-[#f97015]/40" />
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
            <div className="p-4 space-y-3">
              {/* Items count indicator */}
              <div className="text-xs text-[#141c2e]/50 font-medium px-1">
                {totalItems} {totalItems === 1 ? 'item' : 'items'} in je winkelwagen
              </div>
              
              {items.map((item) => (
                <div 
                  key={item.id}
                  className="flex gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100"
                >
                  {/* Image - Smaller on mobile */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-white overflow-hidden flex-shrink-0 border border-neutral-100">
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
                        <Package size={20} className="text-neutral-300" />
                      </div>
                    )}
                  </div>
                  
                  {/* Info - Compact layout */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h4 className="font-medium text-[#141c2e] text-sm leading-tight line-clamp-2">
                        {item.name}
                      </h4>
                      <p className="text-sm font-bold text-[#f97015] mt-0.5">
                        {formatCurrency(item.price, currency)}
                      </p>
                    </div>
                    
                    {/* Quantity controls - Compact */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center rounded-lg border border-neutral-200 bg-white">
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center text-[#141c2e]/50 hover:text-[#141c2e] active:bg-neutral-100 transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-7 text-center text-xs font-semibold text-[#141c2e]">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onAddOne(item.id)}
                          className="w-7 h-7 flex items-center justify-center text-[#141c2e]/50 hover:text-[#141c2e] active:bg-neutral-100 transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <button
                        onClick={() => onUpdateQuantity(item.id, 0)}
                        className="text-[11px] text-[#141c2e]/40 hover:text-red-500 active:text-red-600 transition-colors px-2 py-1"
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

        {/* Checkout Form - Collapsible on mobile for more item visibility */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-neutral-200 bg-white">
            {/* Collapsible Toggle Header */}
            <button
              onClick={() => setIsCheckoutExpanded(!isCheckoutExpanded)}
              className="w-full flex items-center justify-between px-4 sm:px-6 py-4 bg-gradient-to-r from-[#f97015]/5 to-[#f97015]/10 hover:from-[#f97015]/10 hover:to-[#f97015]/15 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#f97015] flex items-center justify-center">
                  <MapPin size={16} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#141c2e]">
                    {isCheckoutExpanded ? 'Verberg bestelgegevens' : 'Vul bestelgegevens in'}
                  </p>
                  <p className="text-xs text-[#141c2e]/60">
                    Naam, telefoon, ophaaldatum
                  </p>
                </div>
              </div>
              <div className={`w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center transition-transform duration-200 ${isCheckoutExpanded ? 'rotate-180' : ''}`}>
                <ChevronDown size={18} className="text-[#141c2e]/60" />
              </div>
            </button>

            {/* Collapsible Form Content */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isCheckoutExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
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
            </div>

            {/* Total & Submit - Always visible */}
            <div className="px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="flex items-center justify-between py-3 border-t border-neutral-200 mb-3">
                <span className="text-sm text-[#141c2e]/70">Totaal ({totalItems} items)</span>
                <span className="text-lg sm:text-xl font-bold text-[#141c2e]">
                  {formatCurrency(totalPrice, currency)}
                </span>
              </div>

              <button
                onClick={onSubmitOrder}
                className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-[#25D366] text-white font-semibold flex items-center justify-center gap-2 sm:gap-3 hover:bg-[#22c55e] active:scale-[0.98] transition-all shadow-lg shadow-green-500/20"
              >
                <MessageCircle size={18} />
                <span className="text-sm sm:text-base">Bestellen via WhatsApp</span>
              </button>
              
              <p className="text-[10px] sm:text-xs text-[#141c2e]/50 text-center mt-3">
                Je wordt doorgestuurd naar WhatsApp
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
