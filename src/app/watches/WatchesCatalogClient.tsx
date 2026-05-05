'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useCurrency } from '@/lib/CurrencyContext'
import {
  WatchesHeader,
  WatchesHero,
  WatchProductCard,
  WatchQuickViewModal,
  WatchCartDrawer,
  WatchesFooter,
} from '@/components/watches'
import { WatchesFeaturedSection } from '@/components/watches/WatchesFeaturedSection'
import { WatchesBrandNav } from '@/components/watches/WatchesBrandNav'
import { WatchesPriceTiers } from '@/components/watches/WatchesPriceTiers'
import type { PriceTier } from '@/components/watches/WatchesPriceTiers'
import { WatchStoriesSection } from '@/components/watches/WatchStoriesSection'
import { WatchNewArrivalsSection } from '@/components/watches/WatchNewArrivalsSection'

interface Category {
  id: string
  name: string
  catalogType: string
}

interface Item {
  id: string
  name: string
  categoryId?: string | null
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  catalogType: string
  isPublic?: boolean | null
}

interface StockEntry {
  itemId: string
  quantity: number
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

interface WatchesCatalogClientProps {
  categories: Category[]
  items: Item[]
  stock: StockEntry[]
  settings: Record<string, string>
}

export default function WatchesCatalogClient({
  categories,
  items,
  stock,
  settings,
}: WatchesCatalogClientProps) {
  const { displayCurrency } = useCurrency()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activePriceTier, setActivePriceTier] = useState<PriceTier>('all')
  const [cartItems, setCartItems] = useState<CartEntry[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [quickViewItem, setQuickViewItem] = useState<Item | null>(null)

  const whatsappNumber = settings.whatsapp_number ?? '5978555555'

  const stockMap = useMemo(() => {
    const map: Record<string, number> = {}
    stock.forEach(s => { map[s.itemId] = (map[s.itemId] ?? 0) + s.quantity })
    return map
  }, [stock])

  // Items for the filtered browse grid
  const filteredItems = useMemo(() => {
    let result = items
    if (activeCategory) result = result.filter(i => i.categoryId === activeCategory)
    if (activePriceTier !== 'all') {
      result = result.filter(i => {
        const price = i.sellingPriceUsd ? Number(i.sellingPriceUsd) : 0
        if (activePriceTier === 'low') return price < 200
        if (activePriceTier === 'mid') return price >= 200 && price < 500
        if (activePriceTier === 'high') return price >= 500
        return true
      })
    }
    return result
  }, [items, activeCategory, activePriceTier])

  // Curated sets (not affected by filters)
  const featuredItems = useMemo(() => items.slice(0, 6), [items])
  const newArrivals    = useMemo(() => items.slice(0, 8), [items])

  const handleAddToCart = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    setCartItems(prev => {
      const existing = prev.find(c => c.id === itemId)
      if (existing) return prev.map(c => c.id === itemId ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, {
        id: item.id, name: item.name, imageUrl: item.imageUrl,
        sellingPriceUsd: item.sellingPriceUsd, sellingPriceSrd: item.sellingPriceSrd, quantity: 1,
      }]
    })
    setCartOpen(true)
  }, [items])

  const handleUpdateQty = useCallback((id: string, qty: number) => {
    setCartItems(prev => prev.map(c => c.id === id ? { ...c, quantity: qty } : c))
  }, [])

  const handleRemove = useCallback((id: string) => {
    setCartItems(prev => prev.filter(c => c.id !== id))
  }, [])

  const handleQuickView = useCallback((id: string) => {
    setQuickViewItem(items.find(i => i.id === id) ?? null)
  }, [items])

  const cartCount = cartItems.reduce((sum, c) => sum + c.quantity, 0)
  const isFiltered = activeCategory !== null || activePriceTier !== 'all'
  const clearFilters = () => { setActiveCategory(null); setActivePriceTier('all') }

  return (
    <>
      <WatchesHeader cartCount={cartCount} onCartClick={() => setCartOpen(true)} />

      <main style={{ background: 'var(--w-bg)', minHeight: '100svh' }}>
        {/* ── Hero ────────────────────────────────────── */}
        <WatchesHero />

        {/* ── Philosophy strip ────────────────────────── */}
        <div
          className="flex items-center justify-center gap-6 px-6 py-8"
          style={{ borderBottom: '1px solid var(--w-border)' }}
        >
          <div className="hidden sm:block h-px flex-1 max-w-24" style={{ background: 'var(--w-border-gold)' }} />
          <p
            className="text-center text-[10px] tracking-[0.3em] uppercase font-light"
            style={{
              fontFamily: 'var(--font-jost, system-ui, sans-serif)',
              color: 'var(--w-muted)',
              maxWidth: '48ch',
            }}
          >
            Curated for those who measure time in moments, not minutes
          </p>
          <div className="hidden sm:block h-px flex-1 max-w-24" style={{ background: 'var(--w-border-gold)' }} />
        </div>

        {/* ── Featured Collection ──────────────────────── */}
        <WatchesFeaturedSection
          items={featuredItems}
          stockMap={stockMap}
          displayCurrency={displayCurrency}
          onAddToCart={handleAddToCart}
          onQuickView={handleQuickView}
        />

        {/* ── Watch Stories / Heritage ─────────────────── */}
        <WatchStoriesSection />

        {/* ── New Arrivals Carousel ────────────────────── */}
        <WatchNewArrivalsSection
          items={newArrivals}
          stockMap={stockMap}
          displayCurrency={displayCurrency}
          onAddToCart={handleAddToCart}
          onQuickView={handleQuickView}
        />

        {/* ══ Browse Collection ════════════════════════ */}
        <section id="collections">
          {/* Sticky brand-filter nav */}
          <div
            className="sticky top-16 lg:top-20 z-50"
            style={{ background: 'var(--w-bg)' }}
          >
            <WatchesBrandNav
              categories={categories}
              activeCategory={activeCategory}
              onChange={setActiveCategory}
            />
          </div>

          {/* Price-tier selector */}
          <WatchesPriceTiers
            items={items}
            activeTier={activePriceTier}
            onChange={setActivePriceTier}
          />

          {/* Filter summary strip */}
          {isFiltered && (
            <div className="px-6 lg:px-12 pt-5 pb-1 max-w-screen-2xl mx-auto flex items-center gap-4">
              <span
                className="text-[9px] tracking-[0.22em] uppercase"
                style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                {filteredItems.length} {filteredItems.length === 1 ? 'watch' : 'watches'} found
              </span>
              <button
                onClick={clearFilters}
                className="text-[9px] tracking-[0.22em] uppercase underline transition-opacity hover:opacity-100 opacity-80"
                style={{ color: 'var(--w-orange)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Product grid */}
          <div id="all" className="px-6 lg:px-12 pt-10 pb-20 max-w-screen-2xl mx-auto">
            {filteredItems.length === 0 ? (
              <EmptyState
                whatsappNumber={whatsappNumber}
                isFiltered={isFiltered}
                onClear={clearFilters}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-14">
                {filteredItems.map(item => (
                  <WatchProductCard
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    imageUrl={item.imageUrl}
                    sellingPriceUsd={item.sellingPriceUsd ? Number(item.sellingPriceUsd) : null}
                    sellingPriceSrd={item.sellingPriceSrd ? Number(item.sellingPriceSrd) : null}
                    displayCurrency={displayCurrency}
                    stockCount={stockMap[item.id] ?? 0}
                    onAddToCart={handleAddToCart}
                    onQuickView={id => setQuickViewItem(items.find(i => i.id === id) ?? null)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Atelier statement ────────────────────────── */}
        <AtelierSection />

        <div id="about" />
      </main>

      <WatchesFooter whatsappNumber={whatsappNumber} />

      <WatchQuickViewModal
        item={quickViewItem ? {
          id: quickViewItem.id,
          name: quickViewItem.name,
          imageUrl: quickViewItem.imageUrl,
          sellingPriceUsd: quickViewItem.sellingPriceUsd ? Number(quickViewItem.sellingPriceUsd) : null,
          sellingPriceSrd: quickViewItem.sellingPriceSrd ? Number(quickViewItem.sellingPriceSrd) : null,
          stockCount: stockMap[quickViewItem.id] ?? 0,
        } : null}
        displayCurrency={displayCurrency}
        onClose={() => setQuickViewItem(null)}
        onAddToCart={handleAddToCart}
      />

      <WatchCartDrawer
        open={cartOpen}
        items={cartItems}
        displayCurrency={displayCurrency}
        whatsappNumber={whatsappNumber}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemove}
      />
    </>
  )
}
function EmptyState({
  whatsappNumber,
  isFiltered,
  onClear,
}: {
  whatsappNumber: string
  isFiltered?: boolean
  onClear?: () => void
}) {
  return (
    <div className="flex flex-col items-center py-28 lg:py-40">
      {/* Decorative ring */}
      <div style={{ position: 'relative', width: 96, height: 96, marginBottom: '2.5rem' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.2)' }} />
        <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.1)' }} />
        <div style={{ position: 'absolute', inset: 20, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(201,168,76,0.3)' }} />
        </div>
      </div>

      <p
        className="mb-3 text-[9px] tracking-[0.4em] uppercase text-center"
        style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
      >
        {isFiltered ? 'No Results' : 'Coming Soon'}
      </p>

      <h2
        className="mb-5 font-light text-center leading-tight"
        style={{
          fontFamily: 'var(--font-cormorant, Georgia, serif)',
          color: 'var(--w-cream)',
          fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
          letterSpacing: '0.01em',
        }}
      >
        {isFiltered ? (
          <>No Watches<br /><em style={{ color: 'var(--w-cream-2)' }}>Match This Filter</em></>
        ) : (
          <>The Collection<br /><em style={{ color: 'var(--w-cream-2)' }}>is Arriving</em></>
        )}
      </h2>

      <div className="mb-6 w-10 h-px" style={{ background: 'var(--w-gold-muted)' }} />

      <p
        className="mb-10 text-sm font-light text-center max-w-sm leading-loose"
        style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
      >
        {isFiltered
          ? 'Try adjusting your filters to discover more timepieces in our collection.'
          : 'Our curated selection of luxury timepieces is being prepared. Contact us on WhatsApp to be notified first.'}
      </p>

      {isFiltered && onClear ? (
        <button
          onClick={onClear}
          className="w-btn-orange inline-flex items-center gap-3"
        >
          Clear Filters
          <span className="text-xs opacity-80">×</span>
        </button>
      ) : (
        <Link
          href={`https://wa.me/${whatsappNumber}?text=Hello NextX, I would like to know more about your watch collection.`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-btn-gold inline-flex items-center gap-3"
        >
          Get Notified
          <span className="text-xs opacity-70">→</span>
        </Link>
      )}
    </div>
  )
}

function AtelierSection() {
  return (
    <section
      className="px-6 lg:px-12 py-20 lg:py-28 max-w-screen-2xl mx-auto"
      style={{ borderTop: '1px solid var(--w-border)' }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
        {/* Left — headline */}
        <div>
          <p
            className="mb-5 text-[9px] tracking-[0.4em] uppercase"
            style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            Our Promise
          </p>
          <h2
            className="font-light leading-tight"
            style={{
              fontFamily: 'var(--font-cormorant, Georgia, serif)',
              color: 'var(--w-cream)',
              fontSize: 'clamp(2rem, 4vw, 3.25rem)',
              letterSpacing: '0.01em',
            }}
          >
            The Art of<br />
            <em style={{ color: 'var(--w-cream-2)' }}>Timekeeping</em>
          </h2>
        </div>

        {/* Right — text */}
        <div className="flex flex-col gap-6">
          <div className="w-8 h-px" style={{ background: 'var(--w-gold-muted)' }} />
          <p
            className="text-sm font-light leading-loose"
            style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            We source and curate exceptional timepieces for the discerning collector. Every piece in our selection is chosen for its craftsmanship, heritage, and precision — watches that transcend trends and become part of your story.
          </p>
          <p
            className="text-sm font-light leading-loose"
            style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            Based in Suriname, NextX Watches brings luxury horology within reach — with personal service and expert guidance at every step.
          </p>
          <Link
            href="/"
            className="mt-2 self-start text-[10px] tracking-[0.2em] uppercase font-light transition-opacity hover:opacity-100 opacity-60 inline-flex items-center gap-2"
            style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-jost, system-ui, sans-serif)', borderBottom: '1px solid rgba(240,235,225,0.2)', paddingBottom: '2px' }}
          >
            Back to NextX Portal
          </Link>
        </div>
      </div>
    </section>
  )
}
