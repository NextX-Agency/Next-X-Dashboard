'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { formatCurrency, type Currency } from '@/lib/currency'
import { NewHeader, NewFooter } from '@/components/catalog'
import { 
  ArrowLeft, 
  Package, 
  MapPin, 
  Clock, 
  Shield, 
  ChevronLeft,
  ChevronRight,
  Check,
  ShoppingCart,
  Store,
  Minus,
  Plus
} from 'lucide-react'

type Item = Database['public']['Tables']['items']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface CartItem {
  item: Item
  quantity: number
}

interface StoreSettings {
  whatsapp_number: string
  store_name: string
  store_address: string
  store_logo_url: string
  store_description?: string
  store_email?: string
}

// Cart storage key - same as catalog page for consistency
const CART_STORAGE_KEY = 'nextx-cart'

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.id as string

  const [product, setProduct] = useState<Item | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<StoreSettings>({
    whatsapp_number: '+5978318508',
    store_name: 'NextX',
    store_address: 'Commewijne, Noord',
    store_logo_url: ''
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [currency, setCurrency] = useState<Currency>('SRD')
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [cartCount, setCartCount] = useState(0)
  const [addedToCart, setAddedToCart] = useState(false)

  // Load cart count from localStorage
  const loadCartCount = useCallback(() => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY)
      if (savedCart) {
        const cart: CartItem[] = JSON.parse(savedCart)
        const count = cart.reduce((sum, item) => sum + item.quantity, 0)
        setCartCount(count)
      }
    } catch (e) {
      console.error('Failed to load cart:', e)
    }
  }, [])

  // Load product data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      
      const [productRes, rateRes, settingsRes, categoriesRes] = await Promise.all([
        supabase.from('items').select('*').eq('id', productId).single(),
        supabase.from('exchange_rates').select('*').eq('is_active', true).single(),
        supabase.from('store_settings').select('*'),
        supabase.from('categories').select('*').eq('is_active', true).order('name')
      ])

      if (productRes.data) {
        setProduct(productRes.data)
        
        // Load category if exists
        if (productRes.data.category_id) {
          const categoryRes = await supabase
            .from('categories')
            .select('*')
            .eq('id', productRes.data.category_id)
            .single()
          if (categoryRes.data) setCategory(categoryRes.data)
        }
      }

      if (rateRes.data) setExchangeRate(rateRes.data.usd_to_srd)
      
      if (settingsRes.data) {
        const settingsMap: Record<string, string> = {}
        settingsRes.data.forEach((s: { key: string; value: string }) => {
          settingsMap[s.key] = s.value
        })
        const logoUrl = settingsMap.store_logo_url || ''
        const validLogoUrl = logoUrl && logoUrl !== '/logo.png' ? logoUrl : ''
        
        setSettings({
          whatsapp_number: settingsMap.whatsapp_number || '+5978318508',
          store_name: settingsMap.store_name || 'NextX',
          store_address: settingsMap.store_address || 'Commewijne, Noord',
          store_logo_url: validLogoUrl,
          store_description: settingsMap.store_description || '',
          store_email: settingsMap.store_email || ''
        })
      }

      if (categoriesRes.data) setCategories(categoriesRes.data)

      setLoading(false)
    }

    loadData()
    loadCartCount()
  }, [productId, loadCartCount])

  // Price calculation
  const getPrice = useCallback((): number => {
    if (!product) return 0
    if (currency === 'USD') {
      return product.selling_price_usd || (product.selling_price_srd ? product.selling_price_srd / exchangeRate : 0)
    }
    return product.selling_price_srd || (product.selling_price_usd ? product.selling_price_usd * exchangeRate : 0)
  }, [product, currency, exchangeRate])

  // Quantity handlers
  const incrementQuantity = useCallback(() => {
    setQuantity(q => q + 1)
  }, [])

  const decrementQuantity = useCallback(() => {
    setQuantity(q => Math.max(1, q - 1))
  }, [])

  // Add to cart handler
  const handleAddToCart = useCallback(() => {
    if (!product) return

    try {
      // Get existing cart
      const savedCart = localStorage.getItem(CART_STORAGE_KEY)
      let cart: CartItem[] = savedCart ? JSON.parse(savedCart) : []

      // Check if product already exists in cart
      const existingIndex = cart.findIndex(item => item.item.id === product.id)

      if (existingIndex >= 0) {
        // Update quantity
        cart[existingIndex].quantity += quantity
      } else {
        // Add new item
        cart.push({ item: product, quantity })
      }

      // Save to localStorage
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))

      // Update cart count
      const newCount = cart.reduce((sum, item) => sum + item.quantity, 0)
      setCartCount(newCount)

      // Show success feedback
      setAddedToCart(true)
      setTimeout(() => setAddedToCart(false), 2000)

    } catch (e) {
      console.error('Failed to add to cart:', e)
    }
  }, [product, quantity])

  // Navigate to cart (catalog page with cart open)
  const handleCartClick = useCallback(() => {
    router.push('/catalog')
  }, [router])

  // Computed values
  const unitPrice = getPrice()
  const totalPrice = unitPrice * quantity
  const images = product?.image_url ? [product.image_url] : []

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-neutral-500">Product laden...</p>
        </div>
      </div>
    )
  }

  // Product not found
  if (!product) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-6">
        <div className="text-center">
          <Package size={64} className="text-neutral-300 mx-auto mb-4" strokeWidth={1} />
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Product niet gevonden</h1>
          <p className="text-sm text-neutral-500 mb-6">Dit product bestaat niet of is niet meer beschikbaar.</p>
          <Link
            href="/catalog"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#f97015] hover:bg-[#e5640d] text-white font-medium transition-colors"
          >
            <ArrowLeft size={18} />
            Terug naar catalogus
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <NewHeader
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        categories={categories}
        currency={currency}
        onCurrencyChange={setCurrency}
        cartCount={cartCount}
        onCartClick={handleCartClick}
        searchQuery=""
        onSearchChange={() => {}}
        selectedCategory=""
        onCategoryChange={() => {}}
        onLogoClick={() => router.push('/catalog')}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto bg-white pt-6 lg:pt-8 pb-40 lg:pb-8">
        <div className="lg:grid lg:grid-cols-2 lg:gap-12">
          {/* Image Gallery - Left Column */}
          <div className="relative">
            {/* Main Image */}
            <div className="aspect-square bg-white relative border border-neutral-200 rounded-2xl overflow-hidden shadow-sm lg:border-r-0 lg:rounded-r-none">
              {images.length > 0 ? (
                <>
                  <Image
                    src={images[currentImageIndex]}
                    alt={product.name}
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                  />
                  
                  {/* Image navigation arrows */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentImageIndex(i => Math.max(0, i - 1))}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/90 backdrop-blur-md shadow-lg flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                        disabled={currentImageIndex === 0}
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        onClick={() => setCurrentImageIndex(i => Math.min(images.length - 1, i + 1))}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/90 backdrop-blur-md shadow-lg flex items-center justify-center text-neutral-700 hover:bg-white transition-colors"
                        disabled={currentImageIndex === images.length - 1}
                      >
                        <ChevronRight size={24} />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
                  <Package size={120} className="text-neutral-300" strokeWidth={1} />
                </div>
              )}

              {/* Category badge */}
              {category && (
                <div className="absolute top-4 left-4">
                  <span className="px-4 py-2 rounded-xl bg-white/95 backdrop-blur-xl border border-neutral-200 shadow-sm text-sm font-medium text-neutral-700">
                    {category.name}
                  </span>
                </div>
              )}

              {/* Image indicators */}
              {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        idx === currentImageIndex ? 'bg-[#f97015]' : 'bg-neutral-400/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="hidden lg:flex gap-3 p-4 bg-white">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                      idx === currentImageIndex 
                        ? 'border-[#f97015]' 
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <Image
                      src={img}
                      alt={`${product.name} ${idx + 1}`}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info - Right Column */}
          <div className="px-4 sm:px-6 lg:px-0 lg:pr-8 py-6 lg:py-8 bg-white lg:bg-transparent">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-neutral-500 mb-4">
              <Link href="/catalog" className="hover:text-neutral-900 transition-colors">
                Catalogus
              </Link>
              {category && (
                <>
                  <span>/</span>
                  <span className="text-neutral-700">{category.name}</span>
                </>
              )}
            </nav>

            {/* Product Title */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-neutral-900 tracking-tight mb-4">
              {product.name}
            </h1>

            {/* Unit Price */}
            <div className="mb-6">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black text-[#f97015]">
                  {formatCurrency(unitPrice, currency)}
                </span>
                {currency === 'SRD' && product.selling_price_usd && (
                  <span className="text-sm text-neutral-500">
                    (≈ {formatCurrency(product.selling_price_usd, 'USD')})
                  </span>
                )}
              </div>
            </div>

            {/* Pickup Info Banner */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Store size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-neutral-900 mb-1">Alleen ophalen</p>
                  <p className="text-sm text-neutral-600">
                    Dit product is beschikbaar voor ophalen bij onze winkel in {settings.store_address}
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                  Beschrijving
                </h2>
                <p className="text-neutral-700 leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}

            {/* Features */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                <MapPin size={18} className="text-[#f97015]" />
                <span className="text-sm text-neutral-700">Ophalen in winkel</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                <Clock size={18} className="text-[#f97015]" />
                <span className="text-sm text-neutral-700">Snel beschikbaar</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                <Shield size={18} className="text-[#f97015]" />
                <span className="text-sm text-neutral-700">Kwaliteit gegarandeerd</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                <Check size={18} className="text-[#f97015]" />
                <span className="text-sm text-neutral-700">Op voorraad</span>
              </div>
            </div>

            {/* Order Section - Desktop */}
            <div className="hidden lg:block border-t border-neutral-200 pt-6">
              {/* Quantity and Total Row */}
              <div className="flex items-center justify-between mb-6">
                {/* Quantity Selector */}
                <div>
                  <label className="text-sm font-medium text-neutral-500 mb-2 block">Aantal</label>
                  <div className="flex items-center rounded-xl bg-neutral-100 border border-neutral-200 overflow-hidden">
                    <button
                      onClick={decrementQuantity}
                      className="w-12 h-12 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 transition-colors"
                      aria-label="Verminder aantal"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-14 text-center text-lg font-semibold text-neutral-900 select-none">
                      {quantity}
                    </span>
                    <button
                      onClick={incrementQuantity}
                      className="w-12 h-12 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 transition-colors"
                      aria-label="Verhoog aantal"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* Total Price */}
                <div className="text-right">
                  <p className="text-sm font-medium text-neutral-500 mb-1">Totaal</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {formatCurrency(totalPrice, currency)}
                  </p>
                </div>
              </div>

              {/* Add to Cart Button */}
              <button
                onClick={handleAddToCart}
                disabled={addedToCart}
                className={`w-full h-14 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg ${
                  addedToCart
                    ? 'bg-green-500 text-white shadow-green-500/20'
                    : 'bg-[#f97015] hover:bg-[#e5640d] text-white shadow-[#f97015]/20 hover:shadow-[#f97015]/30 active:scale-[0.98]'
                }`}
              >
                {addedToCart ? (
                  <>
                    <Check size={22} strokeWidth={2.5} />
                    <span>Toegevoegd aan winkelwagen!</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart size={22} strokeWidth={2} />
                    <span>Plaats in winkelwagen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Sticky Bottom CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] px-4 pt-4 pb-6 safe-area-bottom">
        {/* Quantity and Total Row */}
        <div className="flex items-center justify-between mb-4">
          {/* Quantity Selector */}
          <div className="flex items-center rounded-xl bg-neutral-100 border border-neutral-200 overflow-hidden">
            <button
              onClick={decrementQuantity}
              className="w-11 h-11 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300 transition-colors"
              aria-label="Verminder aantal"
            >
              <Minus size={18} />
            </button>
            <span className="w-10 text-center text-base font-semibold text-neutral-900 select-none">
              {quantity}
            </span>
            <button
              onClick={incrementQuantity}
              className="w-11 h-11 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300 transition-colors"
              aria-label="Verhoog aantal"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Total Price */}
          <div className="text-right">
            <p className="text-xs text-neutral-500">Totaal</p>
            <p className="text-xl font-bold text-neutral-900">
              {formatCurrency(totalPrice, currency)}
            </p>
          </div>
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          disabled={addedToCart}
          className={`w-full h-14 rounded-2xl font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 shadow-lg ${
            addedToCart
              ? 'bg-green-500 text-white shadow-green-500/20'
              : 'bg-[#f97015] hover:bg-[#e5640d] text-white shadow-[#f97015]/20 active:scale-[0.98]'
          }`}
        >
          {addedToCart ? (
            <>
              <Check size={20} strokeWidth={2.5} />
              <span>Toegevoegd!</span>
            </>
          ) : (
            <>
              <ShoppingCart size={20} strokeWidth={2} />
              <span>Plaats in winkelwagen</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <NewFooter
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        storeDescription={settings.store_description || ''}
        storeAddress={settings.store_address}
        whatsappNumber={settings.whatsapp_number}
        storeEmail={settings.store_email || ''}
        categories={categories}
        onCategoryClick={() => {}}
      />
    </div>
  )
}
