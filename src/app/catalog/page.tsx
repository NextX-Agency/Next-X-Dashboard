'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { MessageCircle } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

import {
  Header,
  HeroSection,
  FeatureIconsRow,
  SearchBar,
  FilterBar,
  ProductCard,
  ProductGrid,
  ProductGridHeader,
  CartDrawer,
  ProductDetailModal,
  FooterSection
} from '@/components/catalog'

type Category = Database['public']['Tables']['categories']['Row']
type Item = Database['public']['Tables']['items']['Row']

interface CartItem {
  item: Item
  quantity: number
}

interface StoreSettings {
  whatsapp_number: string
  store_name: string
  store_description: string
  store_address: string
  store_logo_url: string
  hero_title: string
  hero_subtitle: string
}

export default function CatalogPage() {
  // Data state
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [settings, setSettings] = useState<StoreSettings>({
    whatsapp_number: '+5978318508',
    store_name: 'NextX',
    store_description: '',
    store_address: 'Commewijne, Noord',
    store_logo_url: '',
    hero_title: 'Welkom',
    hero_subtitle: ''
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [loading, setLoading] = useState(true)

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<string>('name')
  const [gridView, setGridView] = useState<'comfortable' | 'compact'>('comfortable')
  const [currency, setCurrency] = useState<Currency>('SRD')

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  // Modal state
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  // Load data
  const loadData = async () => {
    setLoading(true)
    const [categoriesRes, itemsRes, rateRes, settingsRes] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('items').select('*').eq('is_public', true).order('name'),
      supabase.from('exchange_rates').select('*').eq('is_active', true).single(),
      supabase.from('store_settings').select('*')
    ])
    
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (itemsRes.data) setItems(itemsRes.data)
    if (rateRes.data) setExchangeRate(rateRes.data.usd_to_srd)
    if (settingsRes.data) {
      const settingsMap: Record<string, string> = {}
      settingsRes.data.forEach((s: { key: string; value: string }) => {
        settingsMap[s.key] = s.value
      })
      setSettings({
        whatsapp_number: settingsMap.whatsapp_number || '+5978318508',
        store_name: settingsMap.store_name || 'NextX',
        store_description: settingsMap.store_description || '',
        store_address: settingsMap.store_address || 'Commewijne, Noord',
        store_logo_url: settingsMap.store_logo_url || '',
        hero_title: settingsMap.hero_title || 'Welkom',
        hero_subtitle: settingsMap.hero_subtitle || ''
      })
    }
    setLoading(false)
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
  const addToCart = (item: Item) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id)
      if (existing) {
        return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, { item, quantity: 1 }]
    })
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
    
    const whatsappNumber = settings.whatsapp_number.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank')
  }

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    let result = items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description?.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesCategory = !selectedCategory || item.category_id === selectedCategory
      return matchesSearch && matchesCategory
    })

    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => getPrice(a) - getPrice(b))
        break
      case 'price-desc':
        result.sort((a, b) => getPrice(b) - getPrice(a))
        break
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      default:
        result.sort((a, b) => a.name.localeCompare(b.name))
    }

    return result
  }, [items, searchQuery, selectedCategory, sortBy, currency, exchangeRate])

  // Helper functions
  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null
    const cat = categories.find(c => c.id === categoryId)
    return cat?.name || null
  }

  const getCartItemQuantity = (itemId: string) => {
    const cartItem = cart.find(c => c.item.id === itemId)
    return cartItem?.quantity || 0
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-neutral-500">Laden...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white antialiased">
      {/* Header */}
      <Header
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        whatsappNumber={settings.whatsapp_number}
        currency={currency}
        onCurrencyChange={setCurrency}
        cartCount={getCartCount()}
        onCartClick={() => setShowCart(true)}
      />

      {/* Hero Section */}
      <HeroSection
        storeName={settings.store_name}
        heroTitle={settings.hero_title}
        heroSubtitle={settings.hero_subtitle}
        storeAddress={settings.store_address}
        whatsappNumber={settings.whatsapp_number}
      />

      {/* Features Row */}
      <FeatureIconsRow />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-10 lg:py-12">
        {/* Search Bar */}
        <div className="mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        {/* Filter Bar */}
        <div className="mb-8">
          <FilterBar
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            sortBy={sortBy}
            onSortChange={setSortBy}
            gridView={gridView}
            onGridViewChange={setGridView}
            currency={currency}
            onCurrencyChange={setCurrency}
          />
        </div>

        {/* Products Header */}
        <ProductGridHeader 
          count={filteredItems.length}
          categoryName={getCategoryName(selectedCategory)}
        />

        {/* Products Grid */}
        <ProductGrid 
          isEmpty={filteredItems.length === 0}
          onClearFilters={() => {
            setSearchQuery('')
            setSelectedCategory('')
          }}
        >
          {filteredItems.map((item) => (
            <ProductCard
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
              onUpdateQuantity={(qty) => updateCartQuantity(item.id, qty)}
              onViewDetail={() => setSelectedItem(item)}
            />
          ))}
        </ProductGrid>
      </main>

      {/* Footer */}
      <FooterSection
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        storeDescription={settings.store_description}
        storeAddress={settings.store_address}
        whatsappNumber={settings.whatsapp_number}
      />

      {/* Mobile WhatsApp FAB */}
      <a
        href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, '')}`}
        target="_blank"
        rel="noopener noreferrer"
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg shadow-[#25D366]/30 hover:scale-105 transition-transform"
      >
        <MessageCircle size={24} className="text-white" strokeWidth={2} />
      </a>

      {/* Cart Drawer */}
      <CartDrawer
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

      {/* Product Detail Modal */}
      {selectedItem && (
        <ProductDetailModal
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          name={selectedItem.name}
          description={selectedItem.description}
          imageUrl={selectedItem.image_url}
          price={getPrice(selectedItem)}
          currency={currency}
          categoryName={getCategoryName(selectedItem.category_id)}
          onAddToCart={() => addToCart(selectedItem)}
        />
      )}
    </div>
  )
}
