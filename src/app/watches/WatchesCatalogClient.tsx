'use client'

import { useState, useMemo, useCallback, useEffect, useDeferredValue } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { useCurrency } from '@/lib/CurrencyContext'
import {
  WatchesHeader,
  WatchesHero,
  WatchProductCard,
  WatchQuickViewModal,
  WatchCartDrawer,
  WatchesFooter,
} from '@/components/watches'
import { WatchesBrandNav, type WatchBrandOption } from '@/components/watches/WatchesBrandNav'
import { WatchesFeaturedSection } from '@/components/watches/WatchesFeaturedSection'

interface Item {
  id: string
  name: string
  brand?: string | null
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

interface Banner {
  id: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  mobileImage?: string | null
  linkUrl?: string | null
  linkText?: string | null
  buttonText?: string | null
}

interface CollectionItem {
  id: string
  itemId: string
  items?: Item | null
}

interface Collection {
  id: string
  name: string
  slug: string
  description?: string | null
  imageUrl?: string | null
  collection_items?: CollectionItem[]
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
  items: Item[]
  stock: StockEntry[]
  banners: Banner[]
  collections: Collection[]
  settings: Record<string, string>
}

const WATCH_BRAND_FALLBACKS = [
  'Rolex',
  'Omega',
  'Tudor',
  'Cartier',
  'Tag Heuer',
  'Breitling',
  'Longines',
  'Tissot',
  'Seiko',
  'Citizen',
  'Bulova',
  'Invicta',
  'Michael Kors',
  'Fossil',
  'Casio',
]

function resolveWatchBrand(item: Pick<Item, 'brand' | 'name'>) {
  const explicitBrand = item.brand?.trim()
  if (explicitBrand) return explicitBrand

  const normalizedName = item.name.trim().toLowerCase()
  return WATCH_BRAND_FALLBACKS.find((brand) => {
    const normalizedBrand = brand.toLowerCase()
    return normalizedName === normalizedBrand || normalizedName.startsWith(`${normalizedBrand} `)
  }) ?? null
}

export default function WatchesCatalogClient({
  items,
  stock,
  banners,
  collections,
  settings,
}: WatchesCatalogClientProps) {
  const { displayCurrency } = useCurrency()
  const [activeBrand, setActiveBrand] = useState<string | null>(null)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cartItems, setCartItems] = useState<CartEntry[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [quickViewItem, setQuickViewItem] = useState<Item | null>(null)
  const [liveStock, setLiveStock] = useState(stock)

  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase())

  const whatsappNumber = settings.whatsapp_number ?? '5978555555'

  useEffect(() => {
    setLiveStock(stock)
  }, [stock])

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch('/api/watches?type=stock', { cache: 'no-store' })
        if (!response.ok) return

        const data = await response.json() as { stock?: StockEntry[] }
        if (Array.isArray(data.stock)) {
          setLiveStock(data.stock)
        }
      } catch (error) {
        console.error('Failed to refresh watch stock:', error)
      }
    }, 60000)

    return () => window.clearInterval(intervalId)
  }, [])

  const stockMap = useMemo(() => {
    const map: Record<string, number> = {}
    liveStock.forEach(s => { map[s.itemId] = (map[s.itemId] ?? 0) + s.quantity })
    return map
  }, [liveStock])

  const brandByItemId = useMemo(() => {
    const map: Record<string, string> = {}
    items.forEach((item) => {
      const brand = resolveWatchBrand(item)
      if (brand) {
        map[item.id] = brand
      }
    })
    return map
  }, [items])

  const normalizedCollections = useMemo(() => {
    return collections
      .map(collection => {
        const resolvedItems = (collection.collection_items ?? []).reduce<Item[]>((resolved, collectionItem) => {
          if (collectionItem.items) {
            resolved.push(collectionItem.items)
          }
          return resolved
        }, [])

        return {
          ...collection,
          resolvedItems,
          itemIds: new Set(resolvedItems.map(item => item.id)),
        }
      })
      .filter(collection => collection.resolvedItems.length > 0)
  }, [collections])

  const activeCollection = useMemo(
    () => normalizedCollections.find(collection => collection.id === activeCollectionId) ?? null,
    [normalizedCollections, activeCollectionId]
  )

  const heroBanner = banners[0]

  const brandOptions = useMemo<WatchBrandOption[]>(() => {
    const brandMap = new Map<string, WatchBrandOption>()

    items.forEach((item) => {
      const trimmedBrand = brandByItemId[item.id]
      if (!trimmedBrand) return

      const key = trimmedBrand.toLowerCase()
      if (!brandMap.has(key)) {
        brandMap.set(key, { name: trimmedBrand, count: 0, inStockCount: 0 })
      }

      const brand = brandMap.get(key)
      if (!brand) return

      brand.count += 1
      if ((stockMap[item.id] ?? 0) > 0) {
        brand.inStockCount += 1
      }
    })

    return Array.from(brandMap.values()).sort((left, right) => left.name.localeCompare(right.name))
  }, [brandByItemId, items, stockMap])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const displayBrand = brandByItemId[item.id]
      const matchesBrand = !activeBrand || displayBrand?.toLowerCase() === activeBrand.toLowerCase()
      const matchesCollection = !activeCollection || activeCollection.itemIds.has(item.id)
      const matchesSearch = !deferredSearchQuery || [item.name, displayBrand ?? item.brand ?? '']
        .join(' ')
        .toLowerCase()
        .includes(deferredSearchQuery)

      return matchesBrand && matchesCollection && matchesSearch
    })
  }, [items, activeBrand, activeCollection, brandByItemId, deferredSearchQuery])

  const featuredItems = useMemo(() => {
    if (activeCollection) return activeCollection.resolvedItems.slice(0, 6)
    return normalizedCollections[0]?.resolvedItems.slice(0, 6) ?? items.slice(0, 6)
  }, [activeCollection, normalizedCollections, items])

  const handleAddToCart = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const displayBrand = brandByItemId[item.id] ?? item.brand ?? undefined
    setCartItems(prev => {
      const existing = prev.find(c => c.id === itemId)
      if (existing) return prev.map(c => c.id === itemId ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, {
        id: item.id, name: item.name, brand: displayBrand, imageUrl: item.imageUrl,
        sellingPriceUsd: item.sellingPriceUsd, sellingPriceSrd: item.sellingPriceSrd, quantity: 1,
      }]
    })
    setCartOpen(true)
  }, [brandByItemId, items])

  const handleUpdateQty = useCallback((id: string, qty: number) => {
    setCartItems(prev => prev.map(c => c.id === id ? { ...c, quantity: qty } : c))
  }, [])

  const handleRemove = useCallback((id: string) => {
    setCartItems(prev => prev.filter(c => c.id !== id))
  }, [])

  const hasActiveFilters = Boolean(activeBrand || activeCollectionId || searchQuery.trim())

  const handleClearFilters = useCallback(() => {
    setActiveBrand(null)
    setActiveCollectionId(null)
    setSearchQuery('')
  }, [])

  const cartCount = cartItems.reduce((sum, c) => sum + c.quantity, 0)

  return (
    <>
      <WatchesHeader cartCount={cartCount} onCartClick={() => setCartOpen(true)} />

      <main style={{ background: 'var(--w-bg)', minHeight: '100svh' }}>
        {/* ── Hero ────────────────────────────────────── */}
        <WatchesHero
          title={heroBanner?.title ?? undefined}
          subtitle={heroBanner?.subtitle ?? undefined}
          ctaLabel={heroBanner?.buttonText ?? heroBanner?.linkText ?? undefined}
          ctaHref={heroBanner?.linkUrl ?? '/watches#featured'}
        />

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

        {banners.length > 1 && (
          <section className="px-6 py-6 lg:px-12">
            <div className="mx-auto grid max-w-screen-2xl gap-4 lg:grid-cols-3">
              {banners.slice(0, 3).map((banner) => (
                <Link
                  key={banner.id}
                  href={banner.linkUrl || '/watches#featured'}
                  className="group relative overflow-hidden border p-5 lg:p-6"
                  style={{ borderColor: 'var(--w-border)', background: 'linear-gradient(135deg, rgba(22,24,30,0.92), rgba(12,12,16,0.96))' }}
                >
                  {banner.imageUrl && (
                    <div className="absolute inset-0 opacity-35 transition-opacity duration-500 group-hover:opacity-50">
                      <Image
                        src={banner.imageUrl}
                        alt={banner.title}
                        fill
                        sizes="(max-width: 1024px) 100vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.15), rgba(9,9,11,0.88))' }} />
                  <div className="relative z-10 flex min-h-36 flex-col justify-end">
                    <p className="mb-2 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                      Editorial Drop
                    </p>
                    <h2
                      className="mb-2 text-2xl font-light"
                      style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
                    >
                      {banner.title}
                    </h2>
                    {banner.subtitle && (
                      <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                        {banner.subtitle}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section id="collections" className="px-6 py-10 lg:px-12 lg:py-14">
          <div
            className="mx-auto grid max-w-screen-2xl gap-10 border-y py-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-10"
            style={{ borderColor: 'var(--w-border)' }}
          >
            <div className="flex flex-col justify-between gap-8">
              <div>
                <p className="mb-3 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                  Refine The Collection
                </p>
                <h2
                  className="mb-4 text-3xl font-light lg:text-4xl"
                  style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
                >
                  Find the right house, model, or metal.
                </h2>
                <p
                  className="max-w-lg text-sm font-light leading-loose"
                  style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
                >
                  A restrained edit of available timepieces, sorted by maison and live availability.
                </p>
              </div>

              <div className="space-y-3">
                <label className="relative block w-full max-w-xl">
                  <Search size={16} className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2" style={{ color: 'var(--w-muted)' }} />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search model, brand, or reference"
                    className="w-full border-0 border-b bg-transparent py-3 pl-8 pr-4 text-sm outline-none transition-colors"
                    style={{ borderColor: 'var(--w-border-gold)', color: 'var(--w-cream)' }}
                  />
                </label>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="inline-flex items-center gap-2 text-[10px] font-light uppercase tracking-[0.22em] transition-opacity hover:opacity-100"
                    style={{ color: 'var(--w-cream-2)', opacity: 0.76 }}
                  >
                    <X size={13} strokeWidth={1.5} />
                    Clear selection
                  </button>
                )}
              </div>
            </div>

            <WatchesBrandNav
              brandOptions={brandOptions}
              totalCount={items.length}
              activeBrand={activeBrand}
              onChange={setActiveBrand}
            />
          </div>
        </section>

        {normalizedCollections.length > 0 && (
          <section id="featured-collections" className="px-6 py-10 lg:px-12 lg:py-14">
            <div className="mx-auto max-w-screen-2xl">
              <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="mb-2 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                    Featured Collections
                  </p>
                  <h2
                    className="text-3xl font-light"
                    style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
                  >
                    Curated by mood, metal, and presence
                  </h2>
                </div>
                {activeCollection && (
                  <button
                    type="button"
                    onClick={() => setActiveCollectionId(null)}
                    className="self-start border px-4 py-2 text-[10px] uppercase tracking-[0.24em]"
                    style={{ borderColor: 'var(--w-border-gold)', color: 'var(--w-cream-2)' }}
                  >
                    Clear collection filter
                  </button>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {normalizedCollections.slice(0, 3).map((collection) => {
                  const previewItem = collection.resolvedItems[0]
                  const isActive = collection.id === activeCollectionId

                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => setActiveCollectionId(isActive ? null : collection.id)}
                      className="group overflow-hidden border text-left transition-colors"
                      style={{
                        borderColor: isActive ? 'rgba(201,168,76,0.55)' : 'var(--w-border)',
                        background: 'rgba(18, 20, 24, 0.9)',
                      }}
                    >
                      <div className="relative h-60 overflow-hidden">
                        {collection.imageUrl || previewItem?.imageUrl ? (
                          <Image
                            src={collection.imageUrl || previewItem?.imageUrl || '/hero_section-watches.png'}
                            alt={collection.name}
                            fill
                            sizes="(max-width: 1024px) 100vw, 33vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        ) : null}
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.08), rgba(9,9,11,0.9))' }} />
                        <div className="absolute bottom-0 left-0 right-0 p-6">
                          <p className="mb-2 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                            {collection.resolvedItems.length} pieces
                          </p>
                          <h3
                            className="text-3xl font-light"
                            style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
                          >
                            {collection.name}
                          </h3>
                        </div>
                      </div>
                      <div className="space-y-4 p-6">
                        {collection.description && (
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--w-cream-2)' }}>
                            {collection.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {collection.resolvedItems.slice(0, 3).map((item) => (
                            <span
                              key={item.id}
                              className="border px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
                              style={{ borderColor: 'var(--w-border)', color: 'var(--w-muted)' }}
                            >
                              {resolveWatchBrand(item) || item.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        <WatchesFeaturedSection
          items={featuredItems}
          stockMap={stockMap}
          displayCurrency={displayCurrency}
          onAddToCart={handleAddToCart}
          onQuickView={id => setQuickViewItem(items.find(i => i.id === id) ?? null)}
        />

        {/* ══ Browse Collection ════════════════════════ */}
        <section>
          <div id="new" className="px-6 pb-20 pt-8 lg:px-12 lg:pt-12 max-w-screen-2xl mx-auto">
            <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                  Live Catalog
                </p>
                <h2
                  className="text-3xl font-light"
                  style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
                >
                  {activeCollection ? activeCollection.name : activeBrand ? `${activeBrand} watches` : 'Every timepiece currently available'}
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--w-muted)' }}>
                {filteredItems.length} {filteredItems.length === 1 ? 'watch' : 'watches'} shown. Live availability refreshes each minute.
              </p>
            </div>

            {filteredItems.length === 0 ? (
              <EmptyState whatsappNumber={whatsappNumber} searchQuery={searchQuery} />
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {filteredItems.map(item => (
                  <WatchProductCard
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    brand={brandByItemId[item.id] ?? item.brand ?? undefined}
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
          brand: brandByItemId[quickViewItem.id] ?? quickViewItem.brand ?? undefined,
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
function EmptyState({ whatsappNumber, searchQuery }: { whatsappNumber: string; searchQuery: string }) {
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
        Coming Soon
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
        The Collection<br />
        <em style={{ color: 'var(--w-cream-2)' }}>is Arriving</em>
      </h2>

      <div className="mb-6 w-10 h-px" style={{ background: 'var(--w-gold-muted)' }} />

      <p
        className="mb-10 text-sm font-light text-center max-w-sm leading-loose"
        style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
      >
        {searchQuery
          ? 'No watches matched your current search or collection filter. Contact us on WhatsApp and we can source a specific piece for you.'
          : 'Our curated selection of luxury timepieces is being prepared. Contact us on WhatsApp to be notified first.'}
      </p>

      <Link
        href={`https://wa.me/${whatsappNumber}?text=Hello NextX, I would like to know more about your watch collection.`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-btn-gold inline-flex items-center gap-3"
      >
        Get Notified
        <span className="text-xs opacity-70">→</span>
      </Link>
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
