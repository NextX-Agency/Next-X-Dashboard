'use client'

import Image from 'next/image'
import { X, Plus, Minus, Package, MessageCircle, ArrowRight, ShoppingBag, MapPin } from 'lucide-react'
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

interface CartDrawerProps {
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

export function CartDrawer({
  isOpen,
  onClose,
  items,
  currency,
  storeName,
  storeAddress = 'Commewijne, Noord',
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
}: CartDrawerProps) {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-neutral-950 border-l border-white/4 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-6 border-b border-white/4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[#f97015]/10 flex items-center justify-center">
              <ShoppingBag size={20} className="text-[#f97015]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Winkelwagen</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/3 border border-white/6 flex items-center justify-center hover:bg-white/6 transition-colors"
          >
            <X size={18} className="text-neutral-400" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="w-20 h-20 rounded-3xl bg-white/2 border border-white/4 flex items-center justify-center mb-6">
                <ShoppingBag size={32} className="text-neutral-700" strokeWidth={1} />
              </div>
              <h3 className="text-base font-medium text-white mb-2">
                Je winkelwagen is leeg
              </h3>
              <p className="text-sm text-neutral-500 mb-8 text-center max-w-xs">
                Voeg producten toe om je bestelling te plaatsen
              </p>
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-xl bg-white/4 border border-white/6 text-sm font-medium text-white hover:bg-white/6 transition-colors"
              >
                Verder winkelen
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li 
                  key={item.id}
                  className="flex gap-4 p-4 rounded-2xl bg-white/2 border border-white/4"
                >
                  {/* Image */}
                  <div className="w-20 h-20 rounded-xl bg-neutral-900 overflow-hidden shrink-0">
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
                        <Package size={24} className="text-neutral-700" strokeWidth={1} />
                      </div>
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <h4 className="text-sm font-medium text-white line-clamp-1 mb-1">
                      {item.name}
                    </h4>
                    <p className="text-sm font-semibold text-[#f97015] mb-3">
                      {formatCurrency(item.price, currency)}
                    </p>
                    
                    {/* Quantity controls */}
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-0.5 p-1 rounded-lg bg-white/3 border border-white/6">
                        <button
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                        >
                          <Minus size={12} strokeWidth={2} />
                        </button>
                        <span className="w-7 text-center text-xs font-medium text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onAddOne(item.id)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                        >
                          <Plus size={12} strokeWidth={2} />
                        </button>
                      </div>
                      <span className="text-xs text-neutral-500">
                        = {formatCurrency(item.price * item.quantity, currency)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Remove button */}
                  <button
                    onClick={() => onUpdateQuantity(item.id, 0)}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Checkout form */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-white/4 p-6 space-y-4 bg-neutral-950/80">
            {/* Pickup location selector */}
            {locations.length > 0 ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-neutral-400 font-medium">
                  <MapPin size={14} className="text-green-500" />
                  Ophaallocatie
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => onLocationChange(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:outline-none focus:border-green-500/50 transition-colors appearance-none cursor-pointer hover:bg-white/[0.05]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center'
                  }}
                >
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id} className="bg-neutral-900 text-white">
                      {loc.name} {loc.address && `- ${loc.address}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <MapPin size={18} className="text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-green-400 font-medium">Ophaallocatie</p>
                  <p className="text-sm text-white truncate">{storeAddress}</p>
                </div>
              </div>
            )}

            {/* Pickup Date Selector */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-neutral-400 font-medium">
                📅 Gewenste ophaaldatum
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onPickupDateChange('today')}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    pickupDate === 'today'
                      ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30'
                      : 'bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:bg-white/[0.06]'
                  }`}
                >
                  Vandaag
                </button>
                <button
                  onClick={() => onPickupDateChange('tomorrow')}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    pickupDate === 'tomorrow'
                      ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30'
                      : 'bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:bg-white/[0.06]'
                  }`}
                >
                  Morgen
                </button>
                <button
                  onClick={() => onPickupDateChange('custom')}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                    pickupDate === 'custom'
                      ? 'bg-[#f97015] text-white shadow-lg shadow-[#f97015]/30'
                      : 'bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:bg-white/[0.06]'
                  }`}
                >
                  Anders
                </button>
              </div>
              
              {/* Custom Date Picker - Only shown when "Anders" is selected */}
              {pickupDate === 'custom' && (
                <div className="pt-2">
                  <input
                    type="date"
                    value={customPickupDate}
                    onChange={(e) => onCustomPickupDateChange(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:outline-none focus:border-[#f97015]/50 transition-colors cursor-pointer"
                    style={{
                      colorScheme: 'dark'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Customer inputs */}
            <input
              type="text"
              value={customerName}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder="Naam"
              className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#f97015]/30 transition-colors"
            />
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => onCustomerPhoneChange(e.target.value)}
              placeholder="Telefoonnummer"
              className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#f97015]/30 transition-colors"
            />
            <textarea
              value={customerNotes}
              onChange={(e) => onCustomerNotesChange(e.target.value)}
              placeholder="Opmerkingen (optioneel)"
              rows={2}
              className="w-full px-4 py-3 rounded-xl bg-white/3 border border-white/6 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#f97015]/30 resize-none transition-colors"
            />
            
            {/* Total */}
            <div className="flex items-center justify-between py-4 border-t border-white/4">
              <span className="text-sm text-neutral-400">Totaal</span>
              <span className="text-xl font-semibold text-white">
                {formatCurrency(totalPrice, currency)}
              </span>
            </div>

            {/* Submit button */}
            <button
              onClick={onSubmitOrder}
              className="w-full h-14 rounded-2xl bg-[#25D366] hover:bg-[#22c55e] text-white font-semibold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg shadow-[#25D366]/20 hover:shadow-[#25D366]/30"
            >
              <MessageCircle size={18} strokeWidth={2} />
              <span>Bestel via WhatsApp</span>
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
