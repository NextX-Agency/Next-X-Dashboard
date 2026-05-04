'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCurrency } from '@/lib/CurrencyContext'
import {
  WatchesHeader,
  WatchesHero,
  WatchesCategoryNav,
  WatchProductCard,
  WatchQuickViewModal,
  WatchCartDrawer,
  WatchesFooter,
} from '@/components/watches'

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
  const [cartItems, setCartItems] = useState<CartEntry[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [quickViewItem, setQuickViewItem] = useState<Item | null>(null)

  const whatsappNumber = settings.whatsapp_number ?? '5978555555'

  // Stock map: itemId → total quantity
  const stockMap = useMemo(() => {
    const map: Record<string, number> = {}
    stock.forEach(s => {
      map[s.itemId] = (map[s.itemId] ?? 0) + s.quantity
    })
    return map
  }, [stock])

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!activeCategory) return items
    return items.filter(i => i.categoryId === activeCategory)
  }, [items, activeCategory])

  // Cart operations
  const handleAddToCart = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    setCartItems(prev => {
      const existing = prev.find(c => c.id === itemId)
      if (existing) {
        return prev.map(c => c.id === itemId ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, {
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        sellingPriceUsd: item.sellingPriceUsd,
        sellingPriceSrd: item.sellingPriceSrd,
        quantity: 1,
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

  const cartCount = cartItems.reduce((sum, c) => sum + c.quantity, 0)

  return (
    <>
      <WatchesHeader cartCount={cartCount} onCartClick={() => setCartOpen(true)} />

      <main style={{ background: 'var(--w-bg)', minHeight: '100svh', color: 'var(--w-cream)' }}>
        {/* Hero */}
        <WatchesHero />

        {/* Category filter */}
        <section id="collections">
          <WatchesCategoryNav
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </section>

        {/* Product grid */}
        <section id="new" className="px-6 lg:px-12 py-12 max-w-screen-2xl mx-auto">
          {filteredItems.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-32 gap-4"
              style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
            >
              <p
                className="text-4xl font-light"
                style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: 'var(--w-border)' }}
              >
                —
              </p>
              <p className="text-sm font-light" style={{ color: 'var(--w-muted)' }}>
                No watches found in this category
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
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
                  onQuickView={id => {
                    const found = items.find(i => i.id === id)
                    setQuickViewItem(found ?? null)
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* About anchor */}
        <section id="about" aria-hidden="true" />
      </main>

      <WatchesFooter whatsappNumber={whatsappNumber} />

      {/* Quick view */}
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

      {/* Cart drawer */}
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
