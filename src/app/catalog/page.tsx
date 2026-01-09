'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { formatCurrency, type Currency } from '@/lib/currency'
import FloatingWhatsApp from '@/components/FloatingWhatsApp'

import {
  NewHeader,
  NewHero,
  NewCategoryNav,
  NewProductCard,
  NewProductGrid,
  ProductSectionHeader,
  NewProductCarousel,
  NewValueSection,
  NewCtaSection,
  NewFooter,
  NewCartDrawer,
  NewQuickViewModal,
  BannerSlider
} from '@/components/catalog'

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
  parent_item_id: string
  child_item_id: string
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

export default function NewCatalogPage() {
  // Data state
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<ItemWithCombo[]>([])
  const [comboItems, setComboItems] = useState<ItemWithCombo[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [banners, setBanners] = useState<Banner[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [settings, setSettings] = useState<StoreSettings>({
    whatsapp_number: '+5978318508',
    store_name: 'NextX',
    store_description: '',
    store_address: 'Commewijne, Noord',
    store_email: '',
    store_logo_url: '',
    hero_title: 'Welkom',
    hero_subtitle: ''
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  const [selectedLocation, setSelectedLocation] = useState<string>('')
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
    if (items.length > 0 && cart.length > 0) {
      const validCart = cart.filter(c => items.some(i => i.id === c.item.id))
      const syncedCart = validCart.map(c => {
        const updatedItem = items.find(i => i.id === c.item.id)
        return updatedItem ? { ...c, item: updatedItem } : c
      }).filter(c => c.item !== undefined)
      
      if (syncedCart.length !== cart.length) {
        setCart(syncedCart)
      }
    }
  }, [items, cart])

  // Load data
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [categoriesRes, itemsRes, rateRes, settingsRes, locationsRes, bannersRes, collectionsRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('items').select('*').eq('is_public', true).eq('is_combo', false).order('created_at', { ascending: false }),
        supabase.from('exchange_rates').select('*').eq('is_active', true).single(),
        supabase.from('store_settings').select('*'),
        supabase.from('locations').select('*').eq('is_active', true).order('name'),
        // Load active banners sorted by order
        supabase.from('banners').select('*').eq('is_active', true).order('position'),
        // Load featured collections with their items
        supabase.from('collections')
          .select(`
            *,
            collection_items (
              id,
              collection_id,
              item_id,
              sort_order,
              items (*)
            )
          `)
          .eq('is_active', true)
          .eq('is_featured', true)
          .order('created_at', { ascending: false })
      ])
      
      if (categoriesRes.error) throw categoriesRes.error
      if (itemsRes.error) throw itemsRes.error
      
      if (categoriesRes.data) setCategories(categoriesRes.data)
      if (itemsRes.data) {
        setItems(itemsRes.data)
      }
      
      // Load combos separately
      const combosRes = await supabase
        .from('items')
        .select('*')
        .eq('is_public', true)
        .eq('is_combo', true)
      
      if (combosRes.data && combosRes.data.length > 0) {
        // Load combo_items for each combo
        const comboItemsRes = await supabase
          .from('combo_items')
          .select('*')
          .in('parent_item_id', combosRes.data.map(c => c.id))
        
        // Load all child items
        const childItemIds = comboItemsRes.data?.map(ci => ci.child_item_id) || []
        const childItemsRes = await supabase
          .from('items')
          .select('*')
          .in('id', childItemIds)
        
        // Map child items to combo_items
        const comboItemsWithChildren = comboItemsRes.data?.map(ci => ({
          ...ci,
          child_item: childItemsRes.data?.find(item => item.id === ci.child_item_id)
        })) || []
        
        // Merge combo_items into combos
        const combosWithItems: ItemWithCombo[] = combosRes.data.map(combo => ({
          ...combo,
          combo_items: comboItemsWithChildren.filter(ci => ci.parent_item_id === combo.id)
        }))
        
        console.log('Combo Items loaded:', combosWithItems.length, combosWithItems)
        setComboItems(combosWithItems)
      } else {
        console.log('No combos found')
      }
      
      if (locationsRes.data) {
        setLocations(locationsRes.data)
        if (!selectedLocation && locationsRes.data.length > 0) {
          setSelectedLocation(locationsRes.data[0].id)
        }
      }
      // Set banners
      if (bannersRes.data) {
        setBanners(bannersRes.data as Banner[])
      }
      // Set collections
      if (collectionsRes.data) {
        setCollections(collectionsRes.data as Collection[])
      }
      if (rateRes.data) setExchangeRate(rateRes.data.usd_to_srd)
      if (settingsRes.data) {
        const settingsMap: Record<string, string> = {}
        settingsRes.data.forEach((s: { key: string; value: string }) => {
          settingsMap[s.key] = s.value
        })
        // Filter out invalid logo URLs (like /logo.png which doesn't exist)
        const logoUrl = settingsMap.store_logo_url || ''
        const validLogoUrl = logoUrl && logoUrl !== '/logo.png' ? logoUrl : ''
        
        setSettings({
          whatsapp_number: settingsMap.whatsapp_number || '+5978318508',
          store_name: settingsMap.store_name || 'NextX',
          store_description: settingsMap.store_description || '',
          store_address: settingsMap.store_address || 'Commewijne, Noord',
          store_email: settingsMap.store_email || '',
          store_logo_url: validLogoUrl,
          hero_title: settingsMap.hero_title || 'Welkom',
          hero_subtitle: settingsMap.hero_subtitle || ''
        })
      }
    } catch (err) {
      console.error('Error loading catalog data:', err)
      setError('Er is een fout opgetreden bij het laden van de producten.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Price calculation
  const getPrice = (item: Item): number => {
    if (currency === 'USD') {
      return item.selling_price_usd || (item.selling_price_srd ? item.selling_price_srd / exchangeRate : 0)
    }
    return item.selling_price_srd || (item.selling_price_usd ? item.selling_price_usd * exchangeRate : 0)
  }

  // Cart functions
  const addToCart = (item: Item | ItemWithCombo) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      if (existing) {
        return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { item: item as Item, quantity: 1 }]
    })
  }

  const addToCartWithQuantity = (item: Item, quantity: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      if (existing) {
        return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + quantity } : c)
      }
      return [...prev, { item, quantity }]
    })
  }

  const addToCartById = (itemId: string) => {
    const item = items.find(i => i.id === itemId) || comboItems.find(i => i.id === itemId)
    if (item) addToCart(item)
  }

  const updateCartQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(c => c.item.id !== itemId))
    } else {
      setCart(prev => prev.map(c => c.item.id === itemId ? { ...c, quantity } : c))
    }
  }

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

  // Get newest products
  const newestProducts = useMemo(() => {
    return items.slice(0, 10).map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      image_url: item.image_url,
      price: getPrice(item)
    }))
  }, [items, currency, exchangeRate])

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
    return [...regularItems, ...combosInCategory]
  }, [items, comboItems, selectedCategory])

  // Determine view
  const showSearchResults = searchQuery.trim().length > 0
  const showCategoryProducts = selectedCategory !== '' && !showSearchResults
  const showHomepage = !showSearchResults && !showCategoryProducts

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#141c2e] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-white/60">Laden...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#141c2e] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-white mb-2">Er ging iets mis</h2>
          <p className="text-white/60 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="px-6 py-3 rounded-full bg-[#f97015] text-white font-medium hover:bg-[#e5640d] transition-colors"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#141c2e]">
      {/* Header */}
      <NewHeader
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        categories={categories}
        currency={currency}
        onCurrencyChange={setCurrency}
        cartCount={getCartCount()}
        onCartClick={() => setShowCart(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={(catId) => {
          setSelectedCategory(catId)
          setSearchQuery('')
          if (catId) scrollToProducts()
        }}
      />

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
          <section className="py-10 bg-[#f8f7f4]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <ProductSectionHeader
                title={`Zoekresultaten voor "${searchQuery}"`}
                count={searchResults.length}
                variant="dark"
              />
              <NewProductGrid 
                isEmpty={searchResults.length === 0}
                onClearFilters={() => setSearchQuery('')}
                emptyMessage="Geen producten gevonden voor deze zoekopdracht"
                variant="dark"
              >
                {searchResults.map((item) => (
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
                  />
                ))}
              </NewProductGrid>
            </div>
          </section>
        )}

        {/* Category Products */}
        {showCategoryProducts && (
          <section className="py-10 bg-[#f8f7f4]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <ProductSectionHeader
                title={getCategoryName(selectedCategory) || 'Producten'}
                count={filteredItems.length}
                variant="dark"
              />
              <NewProductGrid 
                isEmpty={filteredItems.length === 0}
                onClearFilters={() => setSelectedCategory('')}
                variant="dark"
              >
                {filteredItems.map((item) => {
                  const isCombo = item.is_combo || false
                  const comboPrice = getPrice(item)
                  const originalPrice = isCombo && item.combo_items ? item.combo_items.reduce((sum, ci) => {
                    if (ci.child_item) {
                      const itemPrice = currency === 'USD' 
                        ? (ci.child_item.selling_price_usd || 0) 
                        : (ci.child_item.selling_price_srd || 0)
                      return sum + (itemPrice * ci.quantity)
                    }
                    return sum
                  }, 0) : undefined

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
                    />
                  )
                })}
              </NewProductGrid>
            </div>
          </section>
        )}

        {/* Homepage Content */}
        {showHomepage && (
          <>
            {/* Combo Deals */}
            {comboItems.length > 0 && (
              <NewProductCarousel
                title="Combo Deals"
                subtitle="Bespaar meer met onze speciale combinaties"
                products={comboItems.map((combo) => {
                  const comboPrice = getPrice(combo)
                  return {
                    id: combo.id,
                    name: combo.name,
                    description: combo.description,
                    image_url: combo.image_url,
                    price: comboPrice,
                    isCombo: true
                  }
                })}
                currency={currency}
                onAddToCart={addToCartById}
                bgColor="neutral-50"
                isComboCarousel={true}
              />
            )}

            {/* New Products Carousel */}
            {newestProducts.length > 0 && (
              <NewProductCarousel
                title="Nieuwste Producten"
                subtitle="Recent toegevoegd aan onze collectie"
                products={newestProducts}
                currency={currency}
                onAddToCart={addToCartById}
              />
            )}

            {/* Featured Collections */}
            {collections.length > 0 && collections.map((collection) => {
              const collectionProducts = collection.collection_items
                ?.sort((a, b) => a.sort_order - b.sort_order)
                .filter(ci => ci.items)
                .map(ci => ({
                  id: ci.items!.id,
                  name: ci.items!.name,
                  description: ci.items!.description,
                  image_url: ci.items!.image_url,
                  price: getPrice(ci.items!)
                })) || []

              if (collectionProducts.length === 0) return null

              return (
                <NewProductCarousel
                  key={collection.id}
                  title={`✨ ${collection.name}`}
                  subtitle={collection.description || undefined}
                  products={collectionProducts}
                  currency={currency}
                  onAddToCart={addToCartById}
                />
              )
            })}

            {/* Products by Category */}
            {productsByCategory.map(({ category, products }) => (
              <NewProductCarousel
                key={category.id}
                title={category.name}
                products={products.slice(0, 10).map(item => ({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  image_url: item.image_url,
                  price: getPrice(item)
                }))}
                currency={currency}
                onAddToCart={addToCartById}
                viewAllClick={() => setSelectedCategory(category.id)}
                bgColor={category.name === 'In-Ear Accessories' ? 'neutral-50' : 'white'}
              />
            ))}

            {/* Value Section */}
            <NewValueSection
              storeAddress={settings.store_address}
              whatsappNumber={settings.whatsapp_number}
              storeDescription={settings.store_description}
            />

            {/* CTA Section */}
            <NewCtaSection
              whatsappNumber={settings.whatsapp_number}
              storeName={settings.store_name}
            />
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
        onCategoryClick={(catId) => {
          setSelectedCategory(catId)
          setSearchQuery('')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {/* Floating WhatsApp Button */}
      <FloatingWhatsApp 
        whatsappNumber={settings.whatsapp_number}
      />

      {/* Cart Drawer */}
      <NewCartDrawer
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        items={cart.map(c => ({
          id: c.item.id,
          name: c.item.name,
          imageUrl: c.item.image_url,
          price: getPrice(c.item),
          quantity: c.quantity
        }))}
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
      />

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
          onAddToCart={(quantity) => {
            addToCartWithQuantity(selectedItem, quantity)
          }}
        />
      )}
    </div>
  )
}
