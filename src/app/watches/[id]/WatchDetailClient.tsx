'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, MessageCircle, PackageCheck, ShieldCheck, ShoppingBag } from 'lucide-react'
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
  brand?: string | null
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
  brand?: string | null
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
  const relatedImageSizes = relatedItems.length <= 2
    ? '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'
    : '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, (max-width: 1680px) 33vw, 25vw'
  const detailRows: Array<{ label: string; value: string; accent?: boolean }> = []

  if (item.brand) {
    detailRows.push({ label: 'Maison', value: item.brand })
  }

  if (item.categoryName) {
    detailRows.push({ label: 'Collection', value: item.categoryName })
  }

  detailRows.push({
    label: 'Availability',
    value: inStock ? `${item.stockCount} piece${item.stockCount === 1 ? '' : 's'} ready for confirmation` : 'Currently unavailable',
    accent: inStock,
  })
  detailRows.push({ label: 'Fulfillment', value: 'Suriname - concierge confirmation' })

  const description = item.description?.trim() || 'A considered reference selected for presence, proportion, and everyday confidence.'

  const handleAddToCart = useCallback(() => {
    setCartItems(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + qty } : c)
      }
      return [...prev, {
        id: item.id,
        name: item.name,
        brand: item.brand ?? undefined,
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
          brand: rel.brand ?? undefined,
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

      <main style={{ background: 'var(--w-bg)', minHeight: '100svh', color: 'var(--w-cream)', paddingTop: '88px' }}>
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
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)] lg:gap-16">
            {/* Image */}
            <div className="space-y-4 sm:space-y-5">
              <div
                className="relative w-full overflow-hidden border"
                style={{ aspectRatio: '5/6', background: 'var(--w-surface)', borderColor: 'var(--w-border)' }}
              >
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 56vw"
                    quality={95}
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

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border px-4 py-4" style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.72)' }}>
                  <ShieldCheck size={16} strokeWidth={1.5} style={{ color: 'var(--w-gold)' }} />
                  <p className="mt-3 text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                    Curated Stock
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                    Each reference is listed with live availability pulled from current stock.
                  </p>
                </div>
                <div className="border px-4 py-4" style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.72)' }}>
                  <PackageCheck size={16} strokeWidth={1.5} style={{ color: 'var(--w-gold)' }} />
                  <p className="mt-3 text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                    Local Guidance
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                    We help clients in Suriname choose the right piece with practical advice, not pressure.
                  </p>
                </div>
                <div className="border px-4 py-4" style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.72)' }}>
                  <MessageCircle size={16} strokeWidth={1.5} style={{ color: 'var(--w-gold)' }} />
                  <p className="mt-3 text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                    Fast Confirmation
                  </p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                    Orders are confirmed personally so availability and next steps stay clear.
                  </p>
                </div>
              </div>
            </div>

            {/* Details */}
            <div
              className="flex flex-col gap-8 lg:sticky lg:top-24"
              style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
            >
              <div>
                <p
                  className="mb-3 text-[9px] font-light uppercase tracking-[0.34em]"
                  style={{ color: 'var(--w-gold)' }}
                >
                  Private Viewing
                </p>

                {item.brand && (
                  <p
                    className="mb-2 text-[10px] font-light tracking-[0.3em] uppercase"
                    style={{ color: 'var(--w-gold)' }}
                  >
                    {item.brand}
                  </p>
                )}

                <h1
                  className="mb-4 font-light leading-tight"
                  style={{
                    fontFamily: 'var(--font-cormorant, Georgia, serif)',
                    color: 'var(--w-cream)',
                    fontSize: 'clamp(2.2rem, 7vw, 3.85rem)',
                  }}
                >
                  {item.name}
                </h1>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <p
                    className="text-2xl font-light sm:text-3xl"
                    style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
                  >
                    {price != null ? formatCurrency(price, displayCurrency) : 'Price on request'}
                  </p>
                  <p
                    className="text-[11px] font-light uppercase tracking-[0.18em]"
                    style={{ color: inStock ? 'var(--w-gold)' : 'var(--w-muted)' }}
                  >
                    {inStock ? `${item.stockCount} available now` : 'Currently unavailable'}
                  </p>
                </div>

                <p className="mt-6 max-w-2xl text-[15px] font-light leading-7" style={{ color: 'var(--w-cream-2)' }}>
                  {description}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {detailRows.map((row) => (
                  <div
                    key={row.label}
                    className="border px-4 py-4"
                    style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.72)' }}
                  >
                    <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-muted)' }}>
                      {row.label}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: row.accent ? 'var(--w-gold)' : 'var(--w-cream-2)' }}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border px-5 py-5 sm:px-6 sm:py-6" style={{ borderColor: 'var(--w-border)', background: 'linear-gradient(180deg, rgba(18,20,24,0.9), rgba(10,10,12,0.96))' }}>
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: 'var(--w-gold)' }}>
                      Selection
                    </p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                      Add this reference to your selection and confirm the final order with the NextX team.
                    </p>
                  </div>

                  {inStock ? (
                    <>
                      <div className="flex items-center justify-between gap-4 border px-4 py-3" style={{ borderColor: 'var(--w-border)' }}>
                        <span className="text-[11px] font-light uppercase tracking-[0.18em]" style={{ color: 'var(--w-muted)' }}>
                          Quantity
                        </span>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setQty(q => Math.max(1, q - 1))}
                            className="text-lg font-light transition-opacity hover:opacity-60 w-7 text-center"
                            style={{ color: 'var(--w-muted)' }}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="text-base font-light min-w-5 text-center" style={{ color: 'var(--w-cream)' }}>
                            {qty}
                          </span>
                          <button
                            onClick={() => setQty(q => Math.min(item.stockCount, q + 1))}
                            className="text-lg font-light transition-opacity hover:opacity-60 w-7 text-center"
                            style={{ color: 'var(--w-muted)' }}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleAddToCart}
                        className="w-btn-gold flex items-center justify-center gap-2 w-full"
                      >
                        <ShoppingBag size={16} strokeWidth={1.5} />
                        Add to Selection
                      </button>
                    </>
                  ) : (
                    <div className="border px-4 py-4" style={{ borderColor: 'var(--w-border)' }}>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                        This reference is currently spoken for. Browse the live catalog for available pieces while the next edit is being prepared.
                      </p>
                    </div>
                  )}

                  <Link
                    href="/watches#new"
                    className="w-btn-outline flex items-center justify-center gap-2 w-full"
                  >
                    Browse Available Watches
                  </Link>
                </div>
              </div>

              <div className="pt-2">
                <h2
                  className="text-[10px] font-light tracking-[0.3em] uppercase mb-4"
                  style={{ color: 'var(--w-gold)' }}
                >
                  Purchase Notes
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border px-4 py-4" style={{ borderColor: 'var(--w-border)' }}>
                    <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-muted)' }}>
                      Pricing
                    </p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                      Pricing follows your active currency setting so you can compare pieces in the format you prefer.
                    </p>
                  </div>
                  <div className="border px-4 py-4" style={{ borderColor: 'var(--w-border)' }}>
                    <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-muted)' }}>
                      Confirmation
                    </p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                      Every order is reviewed manually so stock, payment, and pickup or delivery details stay clear before anything is finalized.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Related watches */}
          {relatedItems.length > 0 && (
            <section className="mt-20 sm:mt-24">
              <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-2 text-[9px] uppercase tracking-[0.34em]" style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                    Continue Exploring
                  </p>
                  <h2
                    className="text-2xl font-light"
                    style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
                  >
                    Other references worth your time
                  </h2>
                </div>
                <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                  A few adjacent pieces from the current edit, selected to keep the same mood and profile in view.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
                {relatedItems.map(rel => (
                  <WatchProductCard
                    key={rel.id}
                    id={rel.id}
                    name={rel.name}
                    brand={rel.brand ?? undefined}
                    imageUrl={rel.imageUrl}
                    imageSizes={relatedImageSizes}
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
