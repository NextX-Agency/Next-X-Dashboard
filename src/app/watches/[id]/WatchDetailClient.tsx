'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, ChevronLeft, MessageCircle, PackageCheck, ShieldCheck, ShoppingBag } from 'lucide-react'
import { useCurrency } from '@/lib/CurrencyContext'
import { formatCurrency } from '@/lib/currency'
import {
  buildWatchesCartWhatsAppMessage,
  clearWatchesCart,
  getWatchesCartCount,
  getWatchesCartQuantity,
  removeWatchesCartItem,
  setWatchesCartItemQuantity,
  subscribeWatchesCart,
  type WatchesCartEntry,
  upsertWatchesCartItem,
} from '@/lib/watchesCart'
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

interface WatchDetailClientProps {
  item: ItemDetail
  relatedItems: RelatedItem[]
}

export default function WatchDetailClient({ item, relatedItems }: WatchDetailClientProps) {
  const { displayCurrency } = useCurrency()
  const [qty, setQty] = useState(1)
  const [cartItems, setCartItems] = useState<WatchesCartEntry[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [addedToCart, setAddedToCart] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  const price = displayCurrency === 'SRD' ? item.sellingPriceSrd : item.sellingPriceUsd
  const inStock = item.stockCount > 0
  const currentCartQuantity = getWatchesCartQuantity(cartItems, item.id)
  const maxAvailable = Math.max(0, item.stockCount - currentCartQuantity)
  const relatedImageSizes = relatedItems.length <= 2
    ? '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'
    : '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, (max-width: 1680px) 33vw, 25vw'
  const availabilitySummary = inStock
    ? `${item.stockCount} ${item.stockCount === 1 ? 'piece' : 'pieces'} available now`
    : 'Currently unavailable'
  const detailRows: Array<{ label: string; value: string; accent?: boolean }> = []
  const trustHighlights = [
    {
      label: 'Curated Stock',
      description: 'Live availability stays tied to current inventory.',
      icon: ShieldCheck,
    },
    {
      label: 'Local Guidance',
      description: 'Concierge help for fit, style, and practical next steps.',
      icon: PackageCheck,
    },
    {
      label: 'Clear Confirmation',
      description: 'Every order is reviewed personally before anything is finalized.',
      icon: MessageCircle,
    },
  ]
  const purchaseNotes = [
    {
      label: 'Pricing',
      description: 'Prices follow your active currency setting so comparisons stay easy.',
    },
    {
      label: 'Confirmation',
      description: 'Stock, payment, and pickup or delivery details are confirmed manually with you.',
    },
  ]
  const relatedGridClassName = relatedItems.length <= 1
    ? 'mx-auto max-w-sm grid-cols-1'
    : relatedItems.length === 2
      ? 'mx-auto max-w-4xl grid-cols-1 sm:grid-cols-2'
      : relatedItems.length === 3
        ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'

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

  useEffect(() => {
    return subscribeWatchesCart(setCartItems)
  }, [])

  useEffect(() => {
    if (maxAvailable > 0) {
      setQty((currentQty) => Math.min(currentQty, maxAvailable))
      return
    }

    setQty(1)
  }, [maxAvailable])

  const incrementQuantity = useCallback(() => {
    setQty((currentQty) => Math.min(currentQty + 1, Math.max(maxAvailable, 1)))
  }, [maxAvailable])

  const decrementQuantity = useCallback(() => {
    setQty((currentQty) => Math.max(1, currentQty - 1))
  }, [])

  const handleAddToCart = useCallback(() => {
    if (!inStock || maxAvailable <= 0) return

    const nextQuantity = Math.min(currentCartQuantity + qty, item.stockCount)
    if (nextQuantity <= currentCartQuantity) return

    upsertWatchesCartItem({
      id: item.id,
      name: item.name,
      brand: item.brand ?? undefined,
      imageUrl: item.imageUrl,
      sellingPriceUsd: item.sellingPriceUsd,
      sellingPriceSrd: item.sellingPriceSrd,
      quantity: nextQuantity,
    }, nextQuantity)

    setAddedToCart(true)
    window.setTimeout(() => setAddedToCart(false), 1800)
  }, [currentCartQuantity, inStock, item, maxAvailable, qty])

  const handleRelatedAddToCart = useCallback((itemId: string) => {
    const rel = relatedItems.find(r => r.id === itemId)
    if (!rel) return
    const currentQuantity = getWatchesCartQuantity(cartItems, itemId)
    const nextQuantity = Math.min(currentQuantity + 1, rel.stockCount)
    if (nextQuantity <= currentQuantity) return

    upsertWatchesCartItem({
      id: rel.id,
      name: rel.name,
      brand: rel.brand ?? undefined,
      imageUrl: rel.imageUrl,
      sellingPriceUsd: rel.sellingPriceUsd,
      sellingPriceSrd: rel.sellingPriceSrd,
      quantity: nextQuantity,
    }, nextQuantity)
  }, [cartItems, relatedItems])

  const getCartStockLimit = useCallback((itemId: string) => {
    if (itemId === item.id) return item.stockCount
    return relatedItems.find((relatedItem) => relatedItem.id === itemId)?.stockCount ?? Number.POSITIVE_INFINITY
  }, [item.id, item.stockCount, relatedItems])

  const handleUpdateQty = useCallback((itemId: string, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(quantity, getCartStockLimit(itemId)))
    if (nextQuantity <= 0) {
      removeWatchesCartItem(itemId)
      return
    }

    setWatchesCartItemQuantity(itemId, nextQuantity)
  }, [getCartStockLimit])

  const handleSubmitOrder = useCallback(() => {
    if (cartItems.length === 0) return

    const message = buildWatchesCartWhatsAppMessage({
      items: cartItems,
      currency: displayCurrency,
      customerName,
      customerPhone,
      customerNotes,
    })

    window.open(`https://wa.me/5978555555?text=${encodeURIComponent(message)}`, '_blank')

    clearWatchesCart()
    setCustomerName('')
    setCustomerPhone('')
    setCustomerNotes('')
    setCartOpen(false)
  }, [cartItems, customerName, customerNotes, customerPhone, displayCurrency])

  const cartCount = getWatchesCartCount(cartItems)

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
        <div className="px-6 lg:px-12 pb-28 lg:pb-16 max-w-screen-2xl mx-auto">
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

              <div className="border px-4 py-4 sm:px-5" style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.72)' }}>
                <div className="grid gap-4 sm:grid-cols-3">
                  {trustHighlights.map((highlight, index) => {
                    const Icon = highlight.icon

                    return (
                      <div
                        key={highlight.label}
                        className={index === 0 ? '' : 'sm:border-l sm:pl-4'}
                        style={{ borderColor: 'var(--w-border)' }}
                      >
                        <Icon size={16} strokeWidth={1.5} style={{ color: 'var(--w-gold)' }} />
                        <p className="mt-3 text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                          {highlight.label}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                          {highlight.description}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Details */}
            <div
              className="flex flex-col gap-8 lg:sticky lg:top-24"
              style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
            >
              <div>
                <p className="mb-3 text-[9px] font-light uppercase tracking-[0.34em]" style={{ color: 'var(--w-gold)' }}>
                  Watch Reference
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
                    {availabilitySummary}
                  </p>
                </div>

                <p className="mt-6 max-w-2xl text-[15px] font-light leading-7" style={{ color: 'var(--w-cream-2)' }}>
                  {description}
                </p>

                {currentCartQuantity > 0 && (
                  <p className="mt-4 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--w-gold)' }}>
                    {currentCartQuantity} {currentCartQuantity === 1 ? 'piece is' : 'pieces are'} already in your cart
                  </p>
                )}
              </div>

              <div className="border px-5 py-5 sm:px-6" style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.72)' }}>
                <div className={`grid gap-4 ${detailRows.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  {detailRows.map((row, index) => (
                    <div
                      key={row.label}
                      className={index === 0 ? '' : 'sm:border-l sm:pl-4'}
                      style={{ borderColor: 'var(--w-border)' }}
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
              </div>

              <div className="border px-5 py-5 sm:px-6 sm:py-6" style={{ borderColor: 'var(--w-border)', background: 'linear-gradient(180deg, rgba(18,20,24,0.9), rgba(10,10,12,0.96))' }}>
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: 'var(--w-gold)' }}>
                      Purchase Panel
                    </p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                      Add this reference to your cart and confirm the final order with the NextX team.
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
                            onClick={decrementQuantity}
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
                            onClick={incrementQuantity}
                            disabled={qty >= maxAvailable}
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
                        disabled={addedToCart}
                      >
                        {addedToCart ? <Check size={16} strokeWidth={1.5} /> : <ShoppingBag size={16} strokeWidth={1.5} />}
                        {addedToCart ? 'Added to cart' : 'Place in cart'}
                      </button>

                      <Link
                        href="/watches#new"
                        className="inline-flex w-fit items-center gap-2 text-[11px] uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
                        style={{ color: 'var(--w-muted)' }}
                      >
                        Continue browsing the catalog
                      </Link>
                    </>
                  ) : (
                    <div className="border px-4 py-4" style={{ borderColor: 'var(--w-border)' }}>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                        This reference is currently spoken for. Browse the live catalog for available pieces while the next edit is being prepared.
                      </p>
                    </div>
                  )}

                  {!inStock && (
                    <Link
                      href="/watches#new"
                      className="w-btn-outline flex items-center justify-center gap-2 w-full"
                    >
                      Browse Available Watches
                    </Link>
                  )}
                </div>
              </div>

              <div className="border px-5 py-5 sm:px-6" style={{ borderColor: 'var(--w-border)' }}>
                <p className="text-[10px] font-light uppercase tracking-[0.3em]" style={{ color: 'var(--w-gold)' }}>
                  Purchase Notes
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {purchaseNotes.map((note, index) => (
                    <div
                      key={note.label}
                      className={index === 0 ? '' : 'sm:border-l sm:pl-4'}
                      style={{ borderColor: 'var(--w-border)' }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-muted)' }}>
                        {note.label}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                        {note.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Related watches */}
          {relatedItems.length > 0 && (
            <section className="mt-16 sm:mt-20">
              <div className="mb-8">
                <p className="mb-2 text-[9px] uppercase tracking-[0.34em]" style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
                  Continue Exploring
                </p>
                <h2
                  className="text-2xl font-light"
                  style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-cream)' }}
                >
                  More from this edit
                </h2>
              </div>
              <div className={`grid gap-x-6 gap-y-10 ${relatedGridClassName}`}>
                {relatedItems.map(rel => (
                  <WatchProductCard
                    key={rel.id}
                    id={rel.id}
                    name={rel.name}
                    brand={rel.brand ?? undefined}
                    imageUrl={rel.imageUrl}
                    imageSizes={relatedImageSizes}
                    cartQuantity={getWatchesCartQuantity(cartItems, rel.id)}
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

        {inStock && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t px-4 pb-4 pt-3 lg:hidden" style={{ background: 'rgba(9,9,11,0.96)', borderColor: 'var(--w-border)', backdropFilter: 'blur(14px)' }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--w-border)', background: 'var(--w-surface)' }}>
                <button
                  onClick={decrementQuantity}
                  className="h-10 w-10 text-base"
                  style={{ color: 'var(--w-muted)' }}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="min-w-10 text-center text-sm font-medium" style={{ color: 'var(--w-cream)' }}>
                  {qty}
                </span>
                <button
                  onClick={incrementQuantity}
                  disabled={qty >= maxAvailable}
                  className="h-10 w-10 text-base"
                  style={{ color: 'var(--w-muted)' }}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--w-muted)' }}>
                  Total
                </p>
                <p className="text-lg font-light" style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}>
                  {formatCurrency((price ?? 0) * qty, displayCurrency)}
                </p>
              </div>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={addedToCart}
              className="w-btn-gold flex h-12 w-full items-center justify-center gap-2"
            >
              {addedToCart ? <Check size={16} strokeWidth={1.5} /> : <ShoppingBag size={16} strokeWidth={1.5} />}
              {addedToCart ? 'Added to cart' : 'Place in cart'}
            </button>
          </div>
        )}
      </main>

      <WatchesFooter />

      <WatchCartDrawer
        open={cartOpen}
        items={cartItems}
        displayCurrency={displayCurrency}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemove={removeWatchesCartItem}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        customerPhone={customerPhone}
        onCustomerPhoneChange={setCustomerPhone}
        customerNotes={customerNotes}
        onCustomerNotesChange={setCustomerNotes}
        onSubmitOrder={handleSubmitOrder}
      />
    </>
  )
}
