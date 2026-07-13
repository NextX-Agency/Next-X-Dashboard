'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { NormalizedCatalogData } from '@/lib/catalogData'
import { Database } from '@/types/database.types'
import { formatCurrency, type Currency } from '@/lib/currency'
import { getSellingPrice, normalizeExchangeRate } from '@/lib/pricing'
import { 
  getItemStockStatus, 
  getItemStockLevel, 
  canAddToCart, 
  getComboStockStatus,
  type StockStatus 
} from '@/lib/stockUtils'

import { NewHeader } from '@/components/catalog/NewHeader'
import { NewHero } from '@/components/catalog/NewHero'
import { NewCategoryNav } from '@/components/catalog/NewCategoryNav'
import {
  NewProductCard,
  NewProductGrid,
} from '@/components/catalog/NewProductCard'
import { NewProductCarousel } from '@/components/catalog/NewProductCarousel'
import { NewFooter } from '@/components/catalog/NewFooter'
import { BannerSlider } from '@/components/catalog/BannerSlider'
import { SectionContainer } from '@/components/catalog/SectionContainer'
import { CatalogEmptyState } from '@/components/catalog/CatalogEmptyState'
import {
  ProductListSchema,
  LocalBusinessSchema,
  WebsiteSchema,
  SEO_CONTENT,
} from '@/components/catalog/SEOComponents'

// Lazy load heavy below-the-fold sections
const NewValueSection_Lazy = dynamic(
  () => import('@/components/catalog/NewValueSection').then(m => m.NewValueSection),
  { ssr: false }
)

const NewCartDrawer = dynamic(
  () => import('@/components/catalog/NewCartDrawer').then(m => m.NewCartDrawer),
  { ssr: false }
)

const NewQuickViewModal = dynamic(
  () => import('@/components/catalog/NewQuickViewModal').then(m => m.NewQuickViewModal),
  { ssr: false }
)

interface CatalogPageClientProps {
  initialData: NormalizedCatalogData
}

// CMS Types
interface Banner {
  id: string
  title: string
  subtitle: string | null
  image_url: string
  mobile_image: string | null
  link_url: string | null
  link_text: string | null
  button_text: string | null
  is_active: boolean
  position: number
  start_date: string | null
  end_date: string | null
}

interface Collection {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  is_featured: boolean
  is_active: boolean
  collection_items?: CollectionItem[]
}

interface CollectionItem {
  id: string
  collection_id: string
  item_id: string
  sort_order: number
  items?: Item
}

type Category = Database['public']['Tables']['categories']['Row']
type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']

interface ComboItem {
  id: string
  combo_id: string
  item_id: string
  child_item_id?: string  // For compatibility
  quantity: number
  child_item?: Item
}

interface ItemWithCombo extends Item {
  combo_items?: ComboItem[]
}

interface CartItem {
  item: Item
  quantity: number
}

interface StoreSettings {
  whatsapp_number: string
  store_name: string
  store_description: string
  store_address: string
  store_email: string
  store_logo_url: string
  hero_title: string
  hero_subtitle: string
}

const DEFAULT_SETTINGS: StoreSettings = {
  whatsapp_number: '+5978318508',
  store_name: 'NextX',
  store_description: '',
  store_address: 'Commewijne, Noord',
  store_email: '',
  store_logo_url: '',
  hero_title: 'Welkom',
  hero_subtitle: ''
}

const STORE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://shop-nextx.com'

function createStockMap(stockData: unknown[]): Map<string, number> {
  const map = new Map<string, number>()

  stockData.forEach(stock => {
    const stockItem = stock as { item_id?: string; quantity: number }
    if (!stockItem.item_id) {
      return
    }

    const current = map.get(stockItem.item_id) || 0
    map.set(stockItem.item_id, current + stockItem.quantity)
  })

  return map
}

function createStoreSettings(settingsMap: Record<string, string>): StoreSettings {
  const logoUrl = settingsMap.audio_store_logo_url || settingsMap.store_logo_url || ''
  const validLogoUrl = logoUrl && logoUrl !== '/logo.png' ? logoUrl : ''

  return {
    whatsapp_number: settingsMap.whatsapp_number || DEFAULT_SETTINGS.whatsapp_number,
    store_name: settingsMap.store_name || DEFAULT_SETTINGS.store_name,
    store_description: settingsMap.audio_store_description || settingsMap.store_description || DEFAULT_SETTINGS.store_description,
    store_address: settingsMap.store_address || DEFAULT_SETTINGS.store_address,
    store_email: settingsMap.store_email || DEFAULT_SETTINGS.store_email,
    store_logo_url: validLogoUrl,
    hero_title: settingsMap.audio_hero_title || settingsMap.hero_title || DEFAULT_SETTINGS.hero_title,
    hero_subtitle: settingsMap.audio_hero_subtitle || settingsMap.hero_subtitle || DEFAULT_SETTINGS.hero_subtitle,
  }
}

export function CatalogPageClient({ initialData }: CatalogPageClientProps) {
  // Data state
  const categories = initialData.categories as Category[]
  const items = initialData.items as ItemWithCombo[]
  const comboItems = initialData.combos as ItemWithCombo[]
  const locations = initialData.locations as Location[]
  const banners = initialData.banners as Banner[]
  const collections = initialData.collections as Collection[]
  const [stockMap, setStockMap] = useState<Map<string, number>>(() => createStockMap(initialData.stock))
  const settings = createStoreSettings(initialData.settings)
  const exchangeRate = (() => {
    const rate = initialData.exchangeRate as { usd_to_srd?: number } | null
    return normalizeExchangeRate(rate?.usd_to_srd)
  })()

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currency, setCurrency] = useState<Currency>('SRD')

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<string>(() => {
    const firstLocation = initialData.locations[0] as Location | undefined
    return firstLocation?.id || ''
  })
  const [pickupDate, setPickupDate] = useState<'today' | 'tomorrow' | 'custom'>('today')
  const [customPickupDate, setCustomPickupDate] = useState<string>('')

  // Modal state
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  // Refs
  const productsRef = useRef<HTMLDivElement>(null)

  // Load cart from localStorage
  useEffect(() => {
    const savedCart = localStorage.getItem('nextx-cart')
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart))
      } catch (e) {
        console.error('Failed to parse saved cart:', e)
      }
    }
    const savedName = localStorage.getItem('nextx-customer-name')
    const savedPhone = localStorage.getItem('nextx-customer-phone')
    if (savedName) setCustomerName(savedName)
    if (savedPhone) setCustomerPhone(savedPhone)
  }, [])

  // Save cart to localStorage
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('nextx-cart', JSON.stringify(cart))
    } else {
      localStorage.removeItem('nextx-cart')
    }
  }, [cart])

  // Save customer info
  useEffect(() => {
    if (customerName) localStorage.setItem('nextx-customer-name', customerName)
    if (customerPhone) localStorage.setItem('nextx-customer-phone', customerPhone)
  }, [customerName, customerPhone])

  // Sync cart with items
  useEffect(() => {
    if ((items.length > 0 || comboItems.length > 0) && cart.length > 0) {
      const allItems = [...items, ...comboItems]
      const validCart = cart.filter(c => allItems.some(i => i.id === c.item.id))
      const syncedCart = validCart.map(c => {
        const updatedItem = allItems.find(i => i.id === c.item.id)
        if (updatedItem) {
          // Ensure cart item has correct Item structure
          const cartItem: Item = {
            id: updatedItem.id,
            name: updatedItem.name,
            brand: updatedItem.brand,
            description: updatedItem.description,
            image_url: updatedItem.image_url,
            category_id: updatedItem.category_id,
            purchase_price_usd: updatedItem.purchase_price_usd,
            selling_price_srd: updatedItem.selling_price_srd,
            selling_price_usd: updatedItem.selling_price_usd,
            is_public: updatedItem.is_public,
            is_combo: updatedItem.is_combo,
            allow_custom_price: updatedItem.allow_custom_price,
            catalog_type: updatedItem.catalog_type,
            deleted_at: updatedItem.deleted_at ?? null,
            created_at: updatedItem.created_at,
            updated_at: updatedItem.updated_at
          }
          return { ...c, item: cartItem }
        }
        return c
      }).filter(c => c.item !== undefined)
      
      if (syncedCart.length !== cart.length || 
          syncedCart.some((sc, idx) => sc.item.id !== cart[idx]?.item.id)) {
        setCart(syncedCart)
      }
    }
  }, [items, comboItems, cart])

  // Refresh stock data periodically (every 30 seconds) for real-time accuracy
  const refreshStock = useCallback(async () => {
    try {
      // Try API first
      const response = await fetch('/api/catalog?type=stock')
      if (response.ok) {
        const data = await response.json()
        if (data.stock && data.stock.length > 0) {
          const map = new Map<string, number>()
          data.stock.forEach((stock: { itemId: string; quantity: number }) => {
            const current = map.get(stock.itemId) || 0
            map.set(stock.itemId, current + stock.quantity)
          })
          setStockMap(map)
          return
        }
      }
    } catch (err) {
      console.error('Error refreshing stock:', err)
    }
  }, [])

  // Periodic stock refresh for real-time accuracy (60s instead of 30s to reduce load)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) void refreshStock()
    }, 60000)
    return () => clearInterval(interval)
  }, [refreshStock])

  // Price calculation
  const getPrice = useCallback((item: Item): number => {
    return getSellingPrice(item, currency, exchangeRate)
  }, [currency, exchangeRate])

  // Stock status helper - uses centralized utility for consistency
  const getStockStatus = useCallback((itemId: string): StockStatus => {
    return getItemStockStatus(itemId, stockMap)
  }, [stockMap])

  // Get stock level for user display
  const getStockLevel = useCallback((itemId: string): number => {
    return getItemStockLevel(itemId, stockMap)
  }, [stockMap])

  // Check if item can be added to cart (stock validation)
  const canAddItemToCart = useCallback((itemId: string, additionalQuantity: number = 1): boolean => {
    const currentCartQuantity = cart.find(c => c.item.id === itemId)?.quantity || 0
    return canAddToCart(itemId, stockMap, currentCartQuantity + additionalQuantity)
  }, [cart, stockMap])

  // Get combo stock status - combo is only available if all components are in stock
  const getComboStockInfo = useCallback((combo: ItemWithCombo): { status: StockStatus; available: number } => {
    if (!combo.combo_items || combo.combo_items.length === 0) {
      return { status: 'in-stock', available: 999 }
    }
    const result = getComboStockStatus(
      combo.combo_items.map(ci => ({ child_item_id: ci.child_item_id, quantity: ci.quantity })),
      stockMap
    )
    return { status: result.status, available: result.limitingFactor }
  }, [stockMap])

  // Cart functions with stock validation
  const addToCart = useCallback((item: Item | ItemWithCombo) => {
    // Check stock before adding
    const itemWithCombo = item as ItemWithCombo
    
    // For combo items, check component stock
    if (itemWithCombo.is_combo && itemWithCombo.combo_items && itemWithCombo.combo_items.length > 0) {
      const comboStock = getComboStockInfo(itemWithCombo)
      const currentCartQuantity = cart.find(c => c.item.id === item.id)?.quantity || 0
      if (comboStock.available <= currentCartQuantity) {
        return // Don't add if not enough combo components available
      }
    } else {
      // For regular items, check direct stock
      if (!canAddItemToCart(item.id, 1)) {
        return // Don't add if out of stock
      }
    }

    // Convert ItemWithCombo to Item format for cart storage
    const cartItem: Item = {
      id: item.id,
      name: item.name,
      brand: item.brand,
      description: item.description,
      image_url: item.image_url,
      category_id: item.category_id,
      purchase_price_usd: item.purchase_price_usd,
      selling_price_srd: item.selling_price_srd,
      selling_price_usd: item.selling_price_usd,
      is_public: item.is_public,
      is_combo: item.is_combo,
      allow_custom_price: item.allow_custom_price,
      catalog_type: item.catalog_type,
      deleted_at: item.deleted_at ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at
    }
    
    setCart(prev => {
      const existing = prev.find(c => c.item.id === cartItem.id)
      if (existing) {
        return prev.map(c => c.item.id === cartItem.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { item: cartItem, quantity: 1 }]
    })
  }, [cart, canAddItemToCart, getComboStockInfo])

  const addToCartWithQuantity = useCallback((item: Item, quantity: number) => {
    // Check stock before adding
    if (!canAddItemToCart(item.id, quantity)) {
      // Only add what's available
      const available = getStockLevel(item.id)
      const currentInCart = cart.find(c => c.item.id === item.id)?.quantity || 0
      const canAdd = Math.max(0, available - currentInCart)
      if (canAdd <= 0) return
      quantity = canAdd
    }

    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      if (existing) {
        return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + quantity } : c)
      }
      return [...prev, { item, quantity }]
    })
  }, [cart, canAddItemToCart, getStockLevel])

  const addToCartById = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId) || comboItems.find(i => i.id === itemId)
    if (item) addToCart(item)
  }, [items, comboItems, addToCart])

  const updateCartQuantity = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(c => c.item.id !== itemId))
    } else {
      // Validate against stock before increasing
      const available = getStockLevel(itemId)
      const newQuantity = Math.min(quantity, available)
      setCart(prev => prev.map(c => c.item.id === itemId ? { ...c, quantity: newQuantity } : c))
    }
  }, [getStockLevel])

  const getCartCount = () => cart.reduce((sum, c) => sum + c.quantity, 0)
  const getCartTotal = () => cart.reduce((sum, c) => sum + (getPrice(c.item) * c.quantity), 0)
  const getCartItemQuantity = (itemId: string) => {
    const cartItem = cart.find(c => c.item.id === itemId)
    return cartItem?.quantity || 0
  }

  // WhatsApp order
  const sendWhatsAppOrder = () => {
    if (cart.length === 0) return
    
    let message = `Hallo ${settings.store_name}!\n\n`
    message += `Ik wil graag bestellen:\n\n`
    
    cart.forEach((c, idx) => {
      const price = getPrice(c.item)
      message += `${idx + 1}. ${c.item.name}\n`
      message += `   ${c.quantity}× ${formatCurrency(price, currency)} = ${formatCurrency(price * c.quantity, currency)}\n\n`
    })
    
    message += `━━━━━━━━━━━━━━━━━━\n`
    message += `Totaal: ${formatCurrency(getCartTotal(), currency)}\n\n`
    
    if (customerName) message += `Naam: ${customerName}\n`
    if (customerPhone) message += `Tel: ${customerPhone}\n`
    if (customerNotes) message += `Opmerking: ${customerNotes}\n`
    
    const pickupLocation = locations.find(l => l.id === selectedLocation)
    message += `\n📍 Ophaallocatie: ${pickupLocation?.name || settings.store_address}\n`
    if (pickupLocation?.address) {
      message += `   ${pickupLocation.address}\n`
    }
    
    let pickupDateText = ''
    if (pickupDate === 'today') {
      pickupDateText = 'Vandaag'
    } else if (pickupDate === 'tomorrow') {
      pickupDateText = 'Morgen'
    } else if (customPickupDate) {
      const date = new Date(customPickupDate)
      pickupDateText = date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    }
    if (pickupDateText) {
      message += `📅 Ophaaldatum: ${pickupDateText}\n`
    }
    
    const whatsappNumber = settings.whatsapp_number.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank')
    
    setCart([])
    setCustomerNotes('')
    setShowCart(false)
    localStorage.removeItem('nextx-cart')
  }

  // Helper functions
  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null
    const cat = categories.find(c => c.id === categoryId)
    return cat?.name || null
  }

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Get newest products (limit to 8 for cleaner carousel)
  const newestProducts = useMemo(() => {
    return items.slice(0, 8).map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      image_url: item.image_url,
      price: getPrice(item)
    }))
  }, [items, getPrice])

  // Get products by category for homepage
  const productsByCategory = useMemo(() => {
    const grouped: { category: Category; products: Item[] }[] = []
    
    categories.forEach(cat => {
      const categoryProducts = items.filter(item => item.category_id === cat.id)
      if (categoryProducts.length > 0) {
        grouped.push({ category: cat, products: categoryProducts })
      }
    })

    return grouped
  }, [items, categories])

  // Product counts per category (includes combos)
  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    categories.forEach(cat => {
      const regularCount = items.filter(item => item.category_id === cat.id).length
      const comboCount = comboItems.filter(combo => combo.category_id === cat.id).length
      counts[cat.id] = regularCount + comboCount
    })
    return counts
  }, [items, comboItems, categories])

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    return items.filter(item => {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    })
  }, [items, searchQuery])

  // Filtered items when category is selected (includes combos from same category)
  const filteredItems = useMemo(() => {
    if (!selectedCategory) return []
    const regularItems = items.filter(item => item.category_id === selectedCategory)
    const combosInCategory = comboItems.filter(combo => combo.category_id === selectedCategory)
    // Sort: in-stock items first, then low-stock, then out-of-stock
    const allItems = [...regularItems, ...combosInCategory]
    return allItems.sort((a, b) => {
      const stockA = stockMap.get(a.id) || 0
      const stockB = stockMap.get(b.id) || 0
      if (stockA === 0 && stockB > 0) return 1
      if (stockB === 0 && stockA > 0) return -1
      return 0
    })
  }, [items, comboItems, selectedCategory, stockMap])

  // Determine view
  const showSearchResults = searchQuery.trim().length > 0
  const showCategoryProducts = selectedCategory !== '' && !showSearchResults
  const showHomepage = !showSearchResults && !showCategoryProducts

  // Prepare products for structured data
  const productsForSchema = items.slice(0, 20).map(item => ({
    id: item.id,
    name: item.name,
    description: item.description,
    image_url: item.image_url,
    selling_price_srd: item.selling_price_srd,
    selling_price_usd: item.selling_price_usd,
    stockStatus: getStockStatus(item.id)
  }))

  return (
    <div className="min-h-screen bg-white">
      {/* Structured Data for SEO */}
      <LocalBusinessSchema
        storeName={settings.store_name}
        storeDescription={settings.store_description || SEO_CONTENT.defaultDescription}
        storeAddress={settings.store_address}
        whatsappNumber={settings.whatsapp_number}
        storeEmail={settings.store_email}
        storeUrl={STORE_URL}
        logoUrl={settings.store_logo_url}
      />
      <WebsiteSchema
        storeName={settings.store_name}
        storeUrl={STORE_URL}
        storeDescription={settings.store_description || SEO_CONTENT.defaultDescription}
        catalogBasePath="/audio"
      />
      {items.length > 0 && (
        <ProductListSchema
          products={productsForSchema}
          storeName={settings.store_name}
          storeUrl={STORE_URL}
          catalogBasePath="/audio"
        />
      )}

      {/* Header */}
      <NewHeader
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        whatsappNumber={settings.whatsapp_number}
        categories={categories}
        currency={currency}
        onCurrencyChange={setCurrency}
        cartCount={getCartCount()}
        onCartClick={() => setShowCart(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        catalogBasePath="/audio"
        brandLinks={[
          { href: '/watches', label: 'Watches' },
          { href: '/', label: 'Portal' },
        ]}
        onCategoryChange={(catId) => {
          setSelectedCategory(catId)
          setSearchQuery('')
          if (catId) {
            // Ensure smooth scroll to top for mobile
            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' })
              // Fallback for older mobile browsers
              if (window.scrollY > 0) {
                window.scrollTo(0, 0)
              }
            }, 50)
          }
        }}
        onLogoClick={() => {
          setSelectedCategory('')
          setSearchQuery('')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {/* Hidden H1 for SEO */}
      <h1 className="sr-only">{SEO_CONTENT.defaultTitle}</h1>

      {/* Hero - Only on homepage */}
      {showHomepage && (
        <>
          {/* Show Banner Slider if banners exist, otherwise show default hero */}
          {banners.length > 0 ? (
            <BannerSlider 
              banners={banners.map(b => ({
                id: b.id,
                title: b.title,
                subtitle: b.subtitle,
                image_url: b.image_url,
                mobile_image: b.mobile_image,
                link_url: b.link_url,
                link_text: b.link_text || b.button_text
              }))}
              autoPlayInterval={5000}
            />
          ) : (
            <NewHero
              storeName={settings.store_name}
              heroTitle={settings.hero_title}
              heroSubtitle={settings.hero_subtitle}
              storeAddress={settings.store_address}
              logoUrl={settings.store_logo_url}
              featuredImageUrl={items[0]?.image_url || undefined}
              onExploreClick={scrollToProducts}
              accentVariant="audio"
            />
          )}
        </>
      )}

      {/* Category Navigation */}
      <NewCategoryNav
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={(catId) => {
          setSelectedCategory(catId)
          setSearchQuery('')
        }}
        productCounts={productCounts}
      />

      {/* Main Content Area */}
      <div ref={productsRef}>
        {/* Search Results */}
        {showSearchResults && (
          <SectionContainer
            bg="muted"
            title={`Zoekresultaten voor "${searchQuery}"`}
            subtitle={`${searchResults.length} producten gevonden in Suriname`}
            id="search-results"
            ariaLabel="Zoekresultaten"
          >
            {searchResults.length === 0 ? (
              <CatalogEmptyState
                type="search"
                action={{ label: 'Bekijk alle producten', onClick: () => setSearchQuery('') }}
              />
            ) : (
              <NewProductGrid>
                {searchResults.map((item) => {
                  const itemWithCombo = item as ItemWithCombo
                  const isCombo = itemWithCombo.is_combo && itemWithCombo.combo_items && itemWithCombo.combo_items.length > 0
                  const stockInfo = isCombo ? getComboStockInfo(itemWithCombo) : { status: getStockStatus(item.id), available: getStockLevel(item.id) }
                  
                  return (
                    <NewProductCard
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      description={item.description}
                      imageUrl={item.image_url}
                      price={getPrice(item)}
                      currency={currency}
                      categoryName={getCategoryName(item.category_id)}
                      quantity={getCartItemQuantity(item.id)}
                      onAddToCart={() => addToCart(item)}
                      onQuickView={() => setSelectedItem(item)}
                      stockStatus={stockInfo.status}
                      stockLevel={stockInfo.available}
                      catalogBasePath="/audio"
                    />
                  )
                })}
              </NewProductGrid>
            )}
          </SectionContainer>
        )}

        {/* Category Products */}
        {showCategoryProducts && (
          <SectionContainer
            bg="muted"
            title={getCategoryName(selectedCategory) || 'Producten'}
            subtitle={`${filteredItems.length} producten`}
            id="category-products"
            ariaLabel={getCategoryName(selectedCategory) || 'Producten'}
          >
            {/* Hidden category description for SEO */}
            <p className="sr-only">
              Shop {getCategoryName(selectedCategory)?.toLowerCase() || 'products'} at NextX Suriname. Quality audio gear with local pickup available.
            </p>
            
            {filteredItems.length === 0 ? (
              <CatalogEmptyState
                type="category"
                action={{ label: 'Bekijk alle producten', onClick: () => setSelectedCategory('') }}
              />
            ) : (
              <NewProductGrid>
                {filteredItems.map((item) => {
                  const isCombo = item.is_combo || false
                  const comboPrice = getPrice(item)
                  const originalPrice = isCombo && item.combo_items ? item.combo_items.reduce((sum, ci) => {
                    if (ci.child_item) {
                      const itemPrice = getPrice(ci.child_item)
                      return sum + (itemPrice * ci.quantity)
                    }
                    return sum
                  }, 0) : undefined
                  
                  const stockInfo = isCombo && item.combo_items && item.combo_items.length > 0
                    ? getComboStockInfo(item)
                    : { status: getStockStatus(item.id), available: getStockLevel(item.id) }

                  return (
                    <NewProductCard
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      description={item.description}
                      imageUrl={item.image_url}
                      price={comboPrice}
                      currency={currency}
                      categoryName={getCategoryName(item.category_id)}
                      quantity={getCartItemQuantity(item.id)}
                      onAddToCart={() => addToCart(item)}
                      onQuickView={() => setSelectedItem(item)}
                      isCombo={isCombo}
                      originalPrice={originalPrice && originalPrice > comboPrice ? originalPrice : undefined}
                      comboItems={isCombo ? item.combo_items?.map(ci => ({
                        quantity: ci.quantity,
                        child_item: ci.child_item!
                      })) : undefined}
                      stockStatus={stockInfo.status}
                      stockLevel={stockInfo.available}
                      catalogBasePath="/audio"
                    />
                  )
                })}
              </NewProductGrid>
            )}
          </SectionContainer>
        )}

        {/* Homepage Content */}
        {showHomepage && (
          <>
            {/* Section 1: Combo Deals (revenue driver — always prominent) */}
            {comboItems.length > 0 && (
              <NewProductCarousel
                title="Combo Deals"
                subtitle="Bespaar meer met onze speciale combinaties"
                products={comboItems.slice(0, 8).map((combo) => {
                  const comboPrice = getPrice(combo)
                  const comboStock = getComboStockInfo(combo)
                  return {
                    id: combo.id,
                    name: combo.name,
                    description: combo.description,
                    image_url: combo.image_url,
                    price: comboPrice,
                    isCombo: true,
                    stockStatus: comboStock.status,
                    stockLevel: comboStock.available
                  }
                })}
                currency={currency}
                onAddToCart={addToCartById}
                bgColor="neutral-50"
                isComboCarousel={true}
                catalogBasePath="/audio"
              />
            )}

            {/* Section 2: New Arrivals */}
            {newestProducts.length > 0 && (
              <NewProductCarousel
                title="Nieuwste Producten"
                subtitle="Recent toegevoegd aan onze collectie"
                products={newestProducts.map(p => ({ 
                  ...p, 
                  stockStatus: getStockStatus(p.id),
                  stockLevel: getStockLevel(p.id) 
                }))}
                currency={currency}
                onAddToCart={addToCartById}
                catalogBasePath="/audio"
              />
            )}

            {/* Section 3: Featured Collections (max 3) */}
            {collections.length > 0 && collections.slice(0, 3).map((collection) => {
              const collectionProducts = collection.collection_items
                ?.sort((a, b) => a.sort_order - b.sort_order)
                .filter(ci => ci.items)
                .slice(0, 8)
                .map(ci => {
                  const item = ci.items as ItemWithCombo
                  const isCombo = item.is_combo && item.combo_items && item.combo_items.length > 0
                  const stockInfo = isCombo 
                    ? getComboStockInfo(item) 
                    : { status: getStockStatus(item.id), available: getStockLevel(item.id) }
                  return {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    image_url: item.image_url,
                    price: getPrice(item),
                    stockStatus: stockInfo.status,
                    stockLevel: stockInfo.available
                  }
                }) || []

              if (collectionProducts.length === 0) return null

              return (
                <NewProductCarousel
                  key={collection.id}
                  title={collection.name}
                  subtitle={collection.description || undefined}
                  products={collectionProducts}
                  currency={currency}
                  onAddToCart={addToCartById}
                  catalogBasePath="/audio"
                />
              )
            })}

            {/* Section 4: Shop by Category (each capped at 8 items) */}
            {productsByCategory.map(({ category, products }, index) => (
              <NewProductCarousel
                key={category.id}
                title={category.name}
                products={products.slice(0, 8).map(item => {
                  const itemWithCombo = item as ItemWithCombo
                  const isCombo = itemWithCombo.is_combo && itemWithCombo.combo_items && itemWithCombo.combo_items.length > 0
                  const stockInfo = isCombo 
                    ? getComboStockInfo(itemWithCombo) 
                    : { status: getStockStatus(item.id), available: getStockLevel(item.id) }
                  return {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    image_url: item.image_url,
                    price: getPrice(item),
                    stockStatus: stockInfo.status,
                    stockLevel: stockInfo.available
                  }
                })}
                currency={currency}
                onAddToCart={addToCartById}
                viewAllClick={() => {
                  setSelectedCategory(category.id)
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }, 50)
                }}
                bgColor={index % 2 === 1 ? 'neutral-50' : 'white'}
                catalogBasePath="/audio"
              />
            ))}

            {/* Section 5: Value Proposition & CTA */}
            <NewValueSection_Lazy />

          </>
        )}
      </div>

      {/* Footer */}
      <NewFooter
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        storeDescription={settings.store_description}
        storeAddress={settings.store_address}
        whatsappNumber={settings.whatsapp_number}
        storeEmail={settings.store_email}
        categories={categories}
        brandLinks={[
          { href: '/watches', label: 'Watches' },
          { href: '/', label: 'Portal' },
        ]}
        onCategoryClick={(catId) => {
          setSelectedCategory(catId)
          setSearchQuery('')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {/* Cart Drawer */}
      {showCart && <NewCartDrawer
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        items={cart.map(c => {
          // Check if this is a combo item
          const comboItem = comboItems.find(ci => ci.id === c.item.id)
          const isCombo = comboItem && comboItem.combo_items && comboItem.combo_items.length > 0
          
          return {
            id: c.item.id,
            name: c.item.name,
            imageUrl: c.item.image_url,
            price: getPrice(c.item),
            quantity: c.quantity,
            isCombo: isCombo || c.item.is_combo,
            comboItems: isCombo 
              ? comboItem!.combo_items!.map(ci => ({ 
                  child_item_id: ci.child_item_id, 
                  quantity: ci.quantity 
                }))
              : undefined
          }
        })}
        currency={currency}
        storeName={settings.store_name}
        whatsappNumber={settings.whatsapp_number}
        storeAddress={settings.store_address}
        locations={locations}
        selectedLocation={selectedLocation}
        onLocationChange={setSelectedLocation}
        pickupDate={pickupDate}
        onPickupDateChange={setPickupDate}
        customPickupDate={customPickupDate}
        onCustomPickupDateChange={setCustomPickupDate}
        onUpdateQuantity={updateCartQuantity}
        onAddOne={(itemId) => {
          const cartItem = cart.find(c => c.item.id === itemId)
          if (cartItem) addToCart(cartItem.item)
        }}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        customerPhone={customerPhone}
        onCustomerPhoneChange={setCustomerPhone}
        customerNotes={customerNotes}
        onCustomerNotesChange={setCustomerNotes}
        onSubmitOrder={sendWhatsAppOrder}
        stockMap={Object.fromEntries(stockMap)}
      />}

      {/* Quick View Modal */}
      {selectedItem && (
        <NewQuickViewModal
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          id={selectedItem.id}
          name={selectedItem.name}
          description={selectedItem.description}
          imageUrl={selectedItem.image_url}
          price={getPrice(selectedItem)}
          currency={currency}
          categoryName={getCategoryName(selectedItem.category_id)}
          storeAddress={settings.store_address}
          whatsappNumber={settings.whatsapp_number}
          storeName={settings.store_name}
          catalogBasePath="/audio"
          onAddToCart={(quantity) => {
            addToCartWithQuantity(selectedItem, quantity)
          }}
          stockLevel={getStockLevel(selectedItem.id)}
          stockStatus={getStockStatus(selectedItem.id)}
        />
      )}
    </div>
  )
}
