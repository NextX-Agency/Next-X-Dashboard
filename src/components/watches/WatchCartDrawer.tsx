'use client'

import { memo, useEffect } from 'react'
import Image from 'next/image'
import { X, Plus, Minus, Trash2, MessageCircle, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import type { Currency } from '@/lib/currency'

interface CartItem {
  id: string
  name: string
  brand?: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  quantity: number
}

interface WatchCartDrawerProps {
  open: boolean
  items: CartItem[]
  displayCurrency?: Currency
  onClose: () => void
  onUpdateQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
  customerName: string
  onCustomerNameChange: (name: string) => void
  customerPhone: string
  onCustomerPhoneChange: (phone: string) => void
  customerNotes: string
  onCustomerNotesChange: (notes: string) => void
  onSubmitOrder: () => void
}

function WatchCartDrawerComponent({
  open,
  items,
  displayCurrency = 'USD',
  onClose,
  onUpdateQty,
  onRemove,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  customerNotes,
  onCustomerNotesChange,
  onSubmitOrder,
}: WatchCartDrawerProps) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  const getPrice = (item: CartItem) =>
    displayCurrency === 'SRD' ? item.sellingPriceSrd : item.sellingPriceUsd

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

  const subtotal = items.reduce((sum, item) => {
    const p = getPrice(item) ?? 0
    return sum + p * item.quantity
  }, 0)

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-150"
          style={{ background: 'rgba(9,9,11,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-160 flex flex-col w-full max-w-md transition-transform duration-500"
        style={{
          background: 'var(--w-surface)',
          borderLeft: '1px solid var(--w-border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--w-border)' }}
        >
          <div className="flex items-center gap-3" style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: 'rgba(201,168,76,0.1)', color: 'var(--w-gold)' }}>
              <ShoppingBag size={18} strokeWidth={1.7} />
            </div>
            <div>
              <p
                className="text-[10px] font-light tracking-[0.3em] uppercase"
                style={{ color: 'var(--w-muted)' }}
              >
                Your Selection
              </p>
              <p className="text-base font-light" style={{ color: 'var(--w-cream)' }}>
                {totalItems} {totalItems === 1 ? 'piece' : 'pieces'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--w-muted)' }} aria-label="Close cart">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full gap-4"
              style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
            >
              <p
                className="text-4xl font-light"
                style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-border)' }}
              >
                —
              </p>
              <p className="text-sm font-light" style={{ color: 'var(--w-muted)' }}>
                Your selection is empty
              </p>
              <button
                onClick={onClose}
                className="text-[10px] font-light tracking-[0.2em] uppercase mt-2"
                style={{ color: 'var(--w-gold)' }}
              >
                Continue browsing
              </button>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--w-border)' }}>
              {items.map(item => {
                const price = getPrice(item)
                return (
                  <li key={item.id} className="flex gap-4 p-4">
                    {/* Image */}
                    <div
                      className="relative shrink-0 w-20 h-24 overflow-hidden rounded-2xl border"
                      style={{ background: 'var(--w-bg)', borderColor: 'var(--w-border)' }}
                    >
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} fill sizes="80px" quality={88} className="object-cover" />
                      ) : (
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-border)', fontSize: '2rem' }}
                        >
                          W
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div
                      className="flex-1 flex flex-col justify-between"
                      style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
                    >
                      <div>
                        {item.brand && (
                          <p className="text-[9px] font-light tracking-[0.2em] uppercase mb-0.5" style={{ color: 'var(--w-gold)' }}>
                            {item.brand}
                          </p>
                        )}
                        <p className="text-sm font-light" style={{ color: 'var(--w-cream)' }}>{item.name}</p>
                        {price != null && (
                          <p className="text-xs font-light mt-0.5" style={{ color: 'var(--w-cream-2)' }}>
                            {formatCurrency(price, displayCurrency)}
                          </p>
                        )}
                      </div>

                      {/* Qty + remove */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => item.quantity > 1 ? onUpdateQty(item.id, item.quantity - 1) : onRemove(item.id)}
                            className="p-1 transition-opacity hover:opacity-60"
                            style={{ color: 'var(--w-muted)' }}
                            aria-label="Decrease quantity"
                          >
                            <Minus size={12} strokeWidth={1.5} />
                          </button>
                          <span className="text-sm font-light w-4 text-center" style={{ color: 'var(--w-cream)' }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                            className="p-1 transition-opacity hover:opacity-60"
                            style={{ color: 'var(--w-muted)' }}
                            aria-label="Increase quantity"
                          >
                            <Plus size={12} strokeWidth={1.5} />
                          </button>
                        </div>
                        <button
                          onClick={() => onRemove(item.id)}
                          className="p-1 transition-opacity hover:opacity-60"
                          style={{ color: 'var(--w-muted)' }}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div
            className="shrink-0 px-6 py-6"
            style={{ borderTop: '1px solid var(--w-border)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            <div className="space-y-4">
              <div className="rounded-3xl border px-4 py-4" style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.8)' }}>
                <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: 'var(--w-gold)' }}>
                  Order Details
                </p>
                <div className="mt-4 grid gap-3">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(event) => onCustomerNameChange(event.target.value)}
                    placeholder="Your name"
                    className="h-11 rounded-2xl border px-4 text-sm outline-none"
                    style={{ borderColor: 'var(--w-border)', background: 'var(--w-bg)', color: 'var(--w-cream)' }}
                  />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(event) => onCustomerPhoneChange(event.target.value)}
                    placeholder="Phone number"
                    className="h-11 rounded-2xl border px-4 text-sm outline-none"
                    style={{ borderColor: 'var(--w-border)', background: 'var(--w-bg)', color: 'var(--w-cream)' }}
                  />
                  <textarea
                    value={customerNotes}
                    onChange={(event) => onCustomerNotesChange(event.target.value)}
                    placeholder="Notes or preferred contact details"
                    rows={3}
                    className="rounded-2xl border px-4 py-3 text-sm outline-none resize-none"
                    style={{ borderColor: 'var(--w-border)', background: 'var(--w-bg)', color: 'var(--w-cream)' }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-light" style={{ color: 'var(--w-muted)' }}>Total ({totalItems} items)</p>
                <p
                  className="text-xl font-light"
                  style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-gold)' }}
                >
                  {formatCurrency(subtotal, displayCurrency)}
                </p>
              </div>

              <button
                type="button"
                onClick={onSubmitOrder}
                className="w-btn-gold flex items-center justify-center gap-2 w-full"
              >
                <MessageCircle size={15} strokeWidth={1.5} />
                Order via WhatsApp
              </button>

              <p
                className="text-center text-[10px] font-light"
                style={{ color: 'var(--w-muted)' }}
              >
                Your selection and details will be prepared in WhatsApp before sending.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export const WatchCartDrawer = memo(WatchCartDrawerComponent)
