'use client'

import { memo, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { X, ShoppingBag, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import type { Currency } from '@/lib/currency'

interface WatchItem {
  id: string
  name: string
  brand?: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  stockCount?: number
}

interface WatchQuickViewModalProps {
  item: WatchItem | null
  displayCurrency?: Currency
  onClose: () => void
  onAddToCart?: (id: string) => void
}

function WatchQuickViewModalComponent({
  item,
  displayCurrency = 'USD',
  onClose,
  onAddToCart,
}: WatchQuickViewModalProps) {
  useEffect(() => {
    if (!item) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [item, onClose])

  if (!item) return null

  const price = displayCurrency === 'SRD' ? item.sellingPriceSrd : item.sellingPriceUsd
  const inStock = (item.stockCount ?? 0) > 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150]"
        style={{ background: 'rgba(9,9,11,0.7)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel from right */}
      <div
        className="fixed right-0 top-0 bottom-0 z-[160] flex flex-col w-full max-w-md"
        style={{ background: 'var(--w-surface)', borderLeft: '1px solid var(--w-border)' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick view: ${item.name}`}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--w-border)' }}
        >
          <p
            className="text-[10px] font-light tracking-[0.3em] uppercase"
            style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)', color: 'var(--w-muted)' }}
          >
            Quick View
          </p>
          <button onClick={onClose} style={{ color: 'var(--w-muted)' }} aria-label="Close">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Image */}
          <div className="relative w-full" style={{ aspectRatio: '5/6' }}>
            {item.imageUrl ? (
              <Image src={item.imageUrl} alt={item.name} fill sizes="448px" className="object-cover" />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: 'var(--w-bg)' }}
              >
                <span
                  className="text-6xl font-light"
                  style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-border)' }}
                >
                  W
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="px-6 pt-6 pb-8" style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
            {item.brand && (
              <p
                className="mb-1 text-[10px] font-light tracking-[0.25em] uppercase"
                style={{ color: 'var(--w-gold)' }}
              >
                {item.brand}
              </p>
            )}

            <h2
              className="text-2xl font-light mb-4"
              style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
            >
              {item.name}
            </h2>

            <p className="text-xl font-light mb-2" style={{ color: 'var(--w-cream)' }}>
              {price != null ? formatCurrency(price, displayCurrency) : 'Price on request'}
            </p>

            <p
              className="text-xs font-light tracking-wide mb-6"
              style={{ color: inStock ? 'var(--w-gold)' : 'var(--w-muted)' }}
            >
              {inStock ? 'In Stock' : 'Out of Stock'}
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {onAddToCart && inStock && (
                <button
                  onClick={() => { onAddToCart(item.id); onClose() }}
                  className="w-btn-gold flex items-center justify-center gap-2"
                >
                  <ShoppingBag size={15} strokeWidth={1.5} />
                  Add to Cart
                </button>
              )}

              <Link
                href={`/watches/${item.id}`}
                onClick={onClose}
                className="w-btn-outline flex items-center justify-center gap-2"
              >
                View Full Details
                <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export const WatchQuickViewModal = memo(WatchQuickViewModalComponent)
