'use client'

import { useState, useEffect } from 'react'
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
  MessageCircle,
  Store
} from 'lucide-react'

type Item = Database['public']['Tables']['items']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface StoreSettings {
  whatsapp_number: string
  store_name: string
  store_address: string
  store_logo_url: string
  store_description?: string
  store_email?: string
}

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
  const [pickupDate, setPickupDate] = useState<'today' | 'tomorrow' | 'other'>('today')
  const [quantity, setQuantity] = useState(1)

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
        // Filter out invalid logo URLs (like /logo.png which doesn't exist)
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
  }, [productId])

  // Price calculation
  const getPrice = (): number => {
    if (!product) return 0
    if (currency === 'USD') {
      return product.selling_price_usd || (product.selling_price_srd ? product.selling_price_srd / exchangeRate : 0)
    }
    return product.selling_price_srd || (product.selling_price_usd ? product.selling_price_usd * exchangeRate : 0)
  }

  // Generate WhatsApp message
  const generateWhatsAppMessage = () => {
    if (!product) return ''
    
    const price = getPrice()
    const total = price * quantity
    const pickupDateText = pickupDate === 'today' ? 'Vandaag' : pickupDate === 'tomorrow' ? 'Morgen' : 'Anders (neem contact op)'
    
    let message = `Hallo ${settings.store_name}!\n\n`
    message += `Ik wil graag het volgende product ophalen:\n\n`
    message += `━━━━━━━━━━━━━━━━━━\n`
    message += `📦 Product: ${product.name}\n`
    message += `💰 Prijs: ${formatCurrency(price, currency)}\n`
    message += `🔢 Aantal: ${quantity}\n`
    message += `💵 Totaal: ${formatCurrency(total, currency)}\n`
    message += `━━━━━━━━━━━━━━━━━━\n\n`
    message += `📍 Ophaallocatie: ${settings.store_address}\n`
    message += `📅 Gewenste ophaaldatum: ${pickupDateText}\n\n`
    message += `Bedankt!`
    
    return message
  }

  // Open WhatsApp
  const handleOrderForPickup = () => {
    const message = generateWhatsAppMessage()
    const whatsappNumber = settings.whatsapp_number.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank')
  }

  // For demo: simulate multiple images from single image
  const images = product?.image_url ? [product.image_url] : []

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-medium transition-colors"
          >
            <ArrowLeft size={18} />
            Terug naar catalogus
          </Link>
        </div>
      </div>
    )
  }

  const price = getPrice()
  const total = price * quantity

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <NewHeader
        storeName={settings.store_name}
        logoUrl={settings.store_logo_url}
        categories={categories}
        currency={currency}
        onCurrencyChange={setCurrency}
        cartCount={0}
        onCartClick={() => {}}
        searchQuery=""
        onSearchChange={() => {}}
        selectedCategory=""
        onCategoryChange={() => {}}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto bg-white">
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
                  
                  {/* Image navigation arrows (for future multiple images) */}
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
                        idx === currentImageIndex ? 'bg-orange-500' : 'bg-neutral-400/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnail strip (for desktop, when multiple images) */}
            {images.length > 1 && (
              <div className="hidden lg:flex gap-3 p-4 bg-white">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                      idx === currentImageIndex 
                        ? 'border-orange-500' 
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

            {/* Price */}
            <div className="mb-6">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 bg-clip-text text-transparent">
                  {formatCurrency(price, currency)}
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
                <MapPin size={18} className="text-orange-500" />
                <span className="text-sm text-neutral-700">Ophalen in winkel</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                <Clock size={18} className="text-orange-500" />
                <span className="text-sm text-neutral-700">Snel beschikbaar</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                <Shield size={18} className="text-orange-500" />
                <span className="text-sm text-neutral-700">Kwaliteit gegarandeerd</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                <Check size={18} className="text-orange-500" />
                <span className="text-sm text-neutral-700">Op voorraad</span>
              </div>
            </div>

            {/* Order Section - Desktop */}
            <div className="hidden lg:block border-t border-neutral-200 pt-6">
              {/* Quantity Selector */}
              <div className="mb-4">
                <label className="text-sm font-medium text-neutral-500 mb-2 block">Aantal</label>
                <div className="flex items-center gap-1 w-fit p-1 rounded-xl bg-neutral-100 border border-neutral-200">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-11 h-11 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white transition-colors"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-lg font-semibold text-neutral-900">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(q => q + 1)}
                    className="w-11 h-11 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Pickup Date Selection */}
              <div className="mb-6">
                <label className="text-sm font-medium text-neutral-500 mb-2 block">Gewenste ophaaldatum</label>
                <div className="flex gap-2">
                  {[
                    { value: 'today', label: 'Vandaag' },
                    { value: 'tomorrow', label: 'Morgen' },
                    { value: 'other', label: 'Anders' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPickupDate(option.value as typeof pickupDate)}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                        pickupDate === option.value
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-neutral-100 border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total */}
              {quantity > 1 && (
                <div className="flex items-center justify-between py-4 border-t border-neutral-200 mb-4">
                  <span className="text-neutral-500">Totaal ({quantity} stuks)</span>
                  <span className="text-2xl font-bold text-neutral-900">{formatCurrency(total, currency)}</span>
                </div>
              )}

              {/* Order Button */}
              <button
                onClick={handleOrderForPickup}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:from-[#22c55e] hover:to-[#10b981] text-white font-semibold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg shadow-green-500/20 hover:shadow-green-500/30"
              >
                <MessageCircle size={22} strokeWidth={2} />
                <span>Bestellen voor ophalen via WhatsApp</span>
              </button>

              <p className="text-xs text-neutral-500 text-center mt-3">
                Na het klikken wordt WhatsApp geopend met uw bestelling
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Sticky Bottom CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-neutral-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] p-4 pb-safe">
        {/* Quantity & Date Row */}
        <div className="flex items-center gap-3 mb-3">
          {/* Quantity */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 border border-neutral-200">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white transition-colors"
            >
              -
            </button>
            <span className="w-8 text-center text-base font-semibold text-neutral-900">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white transition-colors"
            >
              +
            </button>
          </div>

          {/* Pickup Date Pills */}
          <div className="flex gap-2 flex-1 overflow-x-auto">
            {[
              { value: 'today', label: 'Vandaag' },
              { value: 'tomorrow', label: 'Morgen' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setPickupDate(option.value as typeof pickupDate)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  pickupDate === option.value
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-neutral-100 border border-neutral-200 text-neutral-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price & Order Button */}
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <p className="text-xs text-neutral-500">Totaal</p>
            <p className="text-xl font-bold text-neutral-900">{formatCurrency(total, currency)}</p>
          </div>
          <button
            onClick={handleOrderForPickup}
            className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:from-[#22c55e] hover:to-[#10b981] text-white font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 shadow-lg shadow-green-500/20 min-h-[56px]"
          >
            <MessageCircle size={20} strokeWidth={2} />
            <span>Bestel via WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Bottom padding for mobile sticky CTA */}
      <div className="lg:hidden h-40" />

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
