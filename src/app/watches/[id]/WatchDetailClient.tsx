'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ShoppingBag } from 'lucide-react'
import { useCurrency } from '@/lib/CurrencyContext'
import { formatCurrency } from '@/lib/currency'
import {
  WatchesHeader,
  WatchProductCard,
  WatchCartDrawer,
  WatchesFooter,
} from '@/components/watches'

interface ItemDetail {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  categoryName?: string
  stockCount: number
}

interface RelatedItem {
  id: string
  name: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  stockCount: number
}

interface CartEntry {
  id: string
  name: string
  brand?: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  quantity: number
}

interface WatchDetailClientProps {
  item: ItemDetail
  relatedItems: RelatedItem[]
}

export default function WatchDetailClient({ item, relatedItems }: WatchDetailClientProps) {
  const { displayCurrency } = useCurrency()
  const [qty, setQty] = useState(1)
  const [cartItems, setCartItems] = useState<CartEntry[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  const price = displayCurrency === 'SRD' ? item.sellingPriceSrd : item.sellingPriceUsd
  const inStock = item.stockCount > 0

  const handleAddToCart = useCallback(() => {
    setCartItems(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + qty } : c)
      }
      return [...prev, {
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        sellingPriceUsd: item.sellingPriceUsd,
        sellingPriceSrd: item.sellingPriceSrd,
        quantity: qty,
      }]
    })
    setCartOpen(true)
  }, [item, qty])

  const handleRelatedAddToCart = useCallback((itemId: string) => {
    const rel = relatedItems.find(r => r.id === itemId)
    if (!rel) return
    setCartItems(prev => {
      const existing = prev.find(c => c.id === itemId)
      if (existing) return prev.map(c => c.id === itemId ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, {
        id: rel.id,
        name: rel.name,
        imageUrl: rel.imageUrl,
        sellingPriceUsd: rel.sellingPriceUsd,
        sellingPriceSrd: rel.sellingPriceSrd,
        quantity: 1,
      }]
    })
    setCartOpen(true)
  }, [relatedItems])

  const cartCount = cartItems.reduce((s, c) => s + c.quantity, 0)

  return (
    <>
      <WatchesHeader cartCount={cartCount} onCartClick={() => setCartOpen(true)} />

      <main style={{ background: 'var(--w-bg)', minHeight: '100svh', color: 'var(--w-cream)', paddingTop: '80px' }}>
        {/* Breadcrumb */}
        <div
          className="px-6 lg:px-12 py-4 max-w-screen-2xl mx-auto"
          style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
        >
          <Link
            href="/watches"
            className="inline-flex items-center gap-1.5 text-[11px] font-light tracking-[0.15em] uppercase transition-opacity hover:opacity-70"
            style={{ color: 'var(--w-muted)' }}
          >
            <ChevronLeft size={12} strokeWidth={1.5} />
            Watches
          </Link>
        </div>

        {/* Product detail — 2 columns on desktop */}
        <div className="px-6 lg:px-12 pb-16 max-w-screen-2xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
            {/* Image */}
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '5/6', background: 'var(--w-surface)' }}>
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-border)', fontSize: '5rem' }}
                >
                  W
                </div>
              )}
            </div>

            {/* Details */}
            <div
              className="flex flex-col justify-center"
              style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
            >
              {item.categoryName && (
                <p
                  className="mb-2 text-[10px] font-light tracking-[0.3em] uppercase"
                  style={{ color: 'var(--w-gold)' }}
                >
                  {item.categoryName}
                </p>
              )}

              <h1
                className="mb-4 font-light leading-tight"
                style={{
                  fontFamily: 'var(--font-cormorant, Georgia, serif)',
                  color: 'var(--w-cream)',
                  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                }}
              >
                {item.name}
              </h1>

              {/* Price */}
              <p
                className="mb-2 text-2xl font-light"
                style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
              >
                {price != null ? formatCurrency(price, displayCurrency) : 'Price on request'}
              </p>

              {/* Stock status */}
              <p
                className="mb-6 text-xs font-light tracking-wide"
                style={{ color: inStock ? 'var(--w-gold)' : 'var(--w-muted)' }}
              >
                {inStock ? `In Stock (${item.stockCount} available)` : 'Currently Unavailable'}
              </p>

              {/* Description */}
              {item.description && (
                <p className="mb-8 text-sm font-light leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                  {item.description}
                </p>
              )}

              {/* Quantity + Add to cart */}
              {inStock && (
                <div className="flex flex-col gap-4 max-w-xs">
                  {/* Qty selector */}
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-light tracking-[0.1em] uppercase" style={{ color: 'var(--w-muted)' }}>
                      Qty
                    </span>
                    <div className="flex items-center gap-4" style={{ borderBottom: '1px solid var(--w-border)', paddingBottom: '4px' }}>
                      <button
                        onClick={() => setQty(q => Math.max(1, q - 1))}
                        className="text-lg font-light transition-opacity hover:opacity-60 w-6 text-center"
                        style={{ color: 'var(--w-muted)' }}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="text-base font-light w-4 text-center" style={{ color: 'var(--w-cream)' }}>
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty(q => Math.min(item.stockCount, q + 1))}
                        className="text-lg font-light transition-opacity hover:opacity-60 w-6 text-center"
                        style={{ color: 'var(--w-muted)' }}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleAddToCart}
                    className="w-btn-gold flex items-center justify-center gap-2"
                  >
                    <ShoppingBag size={16} strokeWidth={1.5} />
                    Add to Selection
                  </button>
                </div>
              )}

              {/* Divider + Specs table */}
              <div className="mt-10 pt-10" style={{ borderTop: '1px solid var(--w-border)' }}>
                <h2
                  className="text-[10px] font-light tracking-[0.3em] uppercase mb-4"
                  style={{ color: 'var(--w-gold)' }}
                >
                  Details
                </h2>
                <table className="w-full text-xs font-light" style={{ color: 'var(--w-cream-2)', borderCollapse: 'collapse' }}>
                  <tbody>
                    {item.categoryName && (
                      <tr style={{ borderBottom: '1px solid var(--w-border)' }}>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--w-muted)', width: '40%' }}>Category</td>
                        <td className="py-2.5">{item.categoryName}</td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: '1px solid var(--w-border)' }}>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--w-muted)' }}>Availability</td>
                      <td className="py-2.5" style={{ color: inStock ? 'var(--w-gold)' : 'var(--w-muted)' }}>
                        {inStock ? 'In Stock' : 'Sold Out'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--w-muted)' }}>Delivery</td>
                      <td className="py-2.5">Suriname — WhatsApp order</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Related watches */}
          {relatedItems.length > 0 && (
            <section className="mt-20">
              <h2
                className="mb-8 text-xl font-light"
                style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
              >
                Related Timepieces
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-10">
                {relatedItems.map(rel => (
                  <WatchProductCard
                    key={rel.id}
                    id={rel.id}
                    name={rel.name}
                    imageUrl={rel.imageUrl}
                    sellingPriceUsd={rel.sellingPriceUsd}
                    sellingPriceSrd={rel.sellingPriceSrd}
                    displayCurrency={displayCurrency}
                    stockCount={rel.stockCount}
                    onAddToCart={handleRelatedAddToCart}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <WatchesFooter />

      <WatchCartDrawer
        open={cartOpen}
        items={cartItems}
        displayCurrency={displayCurrency}
        onClose={() => setCartOpen(false)}
        onUpdateQty={(id, qty) => setCartItems(prev => prev.map(c => c.id === id ? { ...c, quantity: qty } : c))}
        onRemove={id => setCartItems(prev => prev.filter(c => c.id !== id))}
      />
    </>
  )
}
