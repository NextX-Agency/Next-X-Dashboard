'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { formatCurrency, type Currency } from '@/lib/currency'
import { NewHeader, NewFooter, NewCartDrawer } from '@/components/catalog'
import { 
  getItemStockStatus, 
  getItemStockLevel, 
  getStockStatusText,
  getComboStockStatus,
  type StockStatus 
} from '@/lib/stockUtils'
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
  Plus,
  AlertCircle,
  Bell
} from 'lucide-react'

type Item = Database['public']['Tables']['items']['Row']
type Category = Database['public']['Tables']['categories']['Row']
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
  item: Item | ItemWithCombo
  quantity: number
}

// Cart item format for drawer component
interface DrawerCartItem {
  id: string
  name: string
  imageUrl?: string | null
  price: number
  quantity: number
  isCombo?: boolean
  comboItems?: Array<{ child_item_id: string; quantity: number }>
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

  const [product, setProduct] = useState<ItemWithCombo | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
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
  
  // Cart drawer states
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState('')
  const [pickupDate, setPickupDate] = useState<'today' | 'tomorrow' | 'custom'>('today')
  const [customPickupDate, setCustomPickupDate] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

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
      
      const [productRes, rateRes, settingsRes, categoriesRes, locationsRes, stockRes] = await Promise.all([
        supabase.from('items').select('*').eq('id', productId).single(),
        supabase.from('exchange_rates').select('*').eq('is_active', true).single(),
        supabase.from('store_settings').select('*'),
        supabase.from('categories').select('*').eq('is_active', true).order('name'),
        supabase.from('locations').select('*').eq('is_active', true).order('name'),
        supabase.from('stock').select('item_id, quantity')
      ])

      if (productRes.data) {
        let productWithCombo: ItemWithCombo = productRes.data
        
        // If this is a combo product, load combo_items with child items
        if (productRes.data.is_combo) {
          const comboItemsRes = await supabase
            .from('combo_items')
            .select('*')
            .eq('combo_id', productId)
          
          if (comboItemsRes.data && comboItemsRes.data.length > 0) {
            // Load all child items
            const childItemIds = comboItemsRes.data.map(ci => ci.child_item_id)
            const childItemsRes = await supabase
              .from('items')
              .select('*')
              .in('id', childItemIds)
            
            // Map child items to combo_items
            productWithCombo = {
              ...productRes.data,
              combo_items: comboItemsRes.data.map(ci => ({
                ...ci,
                child_item: childItemsRes.data?.find(item => item.id === ci.child_item_id),
                child_item_id: ci.child_item_id
              }))
            }
          }
        }
        
        setProduct(productWithCombo)
        
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

      // Build stock map
      if (stockRes.data) {
        const map = new Map<string, number>()
        stockRes.data.forEach((stock: { item_id: string; quantity: number }) => {
          const current = map.get(stock.item_id) || 0
          map.set(stock.item_id, current + stock.quantity)
        })
        setStockMap(map)
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
      
      if (locationsRes.data && locationsRes.data.length > 0) {
        setLocations(locationsRes.data)
        setSelectedLocation(locationsRes.data[0].id)
      }

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

  // Stock status helpers - handles both regular items and combos
  const getProductStockInfo = useCallback((): { status: StockStatus; level: number } => {
    if (!product) return { status: 'out-of-stock', level: 0 }
    
    // For combo products, calculate based on component availability
    if (product.is_combo && product.combo_items && product.combo_items.length > 0) {
      const comboStock = getComboStockStatus(
        product.combo_items.map(ci => ({ child_item_id: ci.child_item_id, quantity: ci.quantity })),
        stockMap
      )
      return { status: comboStock.status, level: comboStock.limitingFactor }
    }
    
    // For regular items, use direct stock lookup
    return {
      status: getItemStockStatus(product.id, stockMap),
      level: getItemStockLevel(product.id, stockMap)
    }
  }, [product, stockMap])
  
  const { status: stockStatus, level: stockLevel } = getProductStockInfo()
  const isOutOfStock = stockStatus === 'out-of-stock'
  const isLowStock = stockStatus === 'low-stock'
  const isCombo = product?.is_combo && product?.combo_items && product.combo_items.length > 0

  // Get current cart quantity for this product
  const getCartQuantityForProduct = useCallback((): number => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY)
      if (savedCart) {
        const cart: CartItem[] = JSON.parse(savedCart)
        const item = cart.find(c => c.item.id === productId)
        return item?.quantity || 0
      }
    } catch (e) {
      console.error('Failed to get cart quantity:', e)
    }
    return 0
  }, [productId])

  // Max quantity available (stock - already in cart)
  const maxAvailable = Math.max(0, stockLevel - getCartQuantityForProduct())

  // Quantity handlers with stock validation
  const incrementQuantity = useCallback(() => {
    setQuantity(q => Math.min(q + 1, maxAvailable))
  }, [maxAvailable])

  const decrementQuantity = useCallback(() => {
    setQuantity(q => Math.max(1, q - 1))
  }, [])

  // Reset quantity if it exceeds available stock
  useEffect(() => {
    if (quantity > maxAvailable && maxAvailable > 0) {
      setQuantity(maxAvailable)
    } else if (maxAvailable === 0 && !isOutOfStock) {
      setQuantity(1)
    }
  }, [quantity, maxAvailable, isOutOfStock])

  // Add to cart handler with stock validation
  const handleAddToCart = useCallback(() => {
    if (!product || isOutOfStock || quantity > maxAvailable) return

    try {
      // Get existing cart
      const savedCart = localStorage.getItem(CART_STORAGE_KEY)
      let cart: CartItem[] = savedCart ? JSON.parse(savedCart) : []

      // Check if product already exists in cart
      const existingIndex = cart.findIndex(item => item.item.id === product.id)

      // Calculate total quantity after adding
      const currentInCart = existingIndex >= 0 ? cart[existingIndex].quantity : 0
      const newTotal = currentInCart + quantity
      
      // Validate against stock (for combos, stockLevel is the limiting factor)
      const effectiveStockLevel = stockLevel
      
      if (newTotal > effectiveStockLevel) {
        const canAdd = Math.max(0, effectiveStockLevel - currentInCart)
        if (canAdd <= 0) return
        // Only add what's available
        if (existingIndex >= 0) {
          cart[existingIndex].quantity = effectiveStockLevel
        } else {
          cart.push({ item: product, quantity: canAdd })
        }
      } else {
        if (existingIndex >= 0) {
          // Update quantity
          cart[existingIndex].quantity = newTotal
        } else {
          // Add new item
          cart.push({ item: product, quantity })
        }
      }      // Save to localStorage
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
  }, [product, quantity, isOutOfStock, maxAvailable, stockLevel])

  // Open cart drawer
  const handleCartClick = useCallback(() => {
    setIsCartOpen(true)
  }, [])

  // Load cart items from localStorage
  const loadCartItems = useCallback((): DrawerCartItem[] => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY)
      if (savedCart) {
        const cart: CartItem[] = JSON.parse(savedCart)
        return cart.map(cartItem => {
          const itemWithCombo = cartItem.item as ItemWithCombo
          const hasComboItems = itemWithCombo.is_combo && itemWithCombo.combo_items && itemWithCombo.combo_items.length > 0
          
          // If this is the current product and it's a combo, use its combo_items
          let comboItemsData: Array<{ child_item_id: string; quantity: number }> | undefined
          if (cartItem.item.id === productId && isCombo && product?.combo_items) {
            comboItemsData = product.combo_items.map(ci => ({
              child_item_id: ci.child_item_id,
              quantity: ci.quantity
            }))
          } else if (hasComboItems && itemWithCombo.combo_items) {
            comboItemsData = itemWithCombo.combo_items.map(ci => ({
              child_item_id: ci.child_item_id,
              quantity: ci.quantity
            }))
          }
          
          return {
            id: cartItem.item.id,
            name: cartItem.item.name,
            imageUrl: cartItem.item.image_url,
            price: currency === 'USD' 
              ? cartItem.item.selling_price_usd || (cartItem.item.selling_price_srd ? cartItem.item.selling_price_srd / exchangeRate : 0)
              : cartItem.item.selling_price_srd || (cartItem.item.selling_price_usd ? cartItem.item.selling_price_usd * exchangeRate : 0),
            quantity: cartItem.quantity,
            isCombo: cartItem.item.is_combo || (cartItem.item.id === productId && isCombo),
            comboItems: comboItemsData
          }
        })
      }
      return []
    } catch (e) {
      console.error('Failed to load cart items:', e)
      return []
    }
  }, [currency, exchangeRate, productId, isCombo, product])

  // Update cart quantity
  const handleUpdateQuantity = useCallback((itemId: string, quantity: number) => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY)
      if (savedCart) {
        let cart: CartItem[] = JSON.parse(savedCart)
        
        if (quantity === 0) {
          // Remove item
          cart = cart.filter(item => item.item.id !== itemId)
        } else {
          // Update quantity
          const itemIndex = cart.findIndex(item => item.item.id === itemId)
          if (itemIndex >= 0) {
            cart[itemIndex].quantity = quantity
          }
        }
        
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
        loadCartCount()
      }
    } catch (e) {
      console.error('Failed to update cart quantity:', e)
    }
  }, [loadCartCount])

  // Add one to cart
  const handleAddOne = useCallback((itemId: string) => {
    handleUpdateQuantity(itemId, loadCartItems().find(item => item.id === itemId)?.quantity + 1 || 1)
  }, [handleUpdateQuantity, loadCartItems])

  // Generate WhatsApp order message
  const generateOrderMessage = useCallback(() => {
    const cartItems = loadCartItems()
    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    const selectedLocationData = locations.find(l => l.id === selectedLocation)
    const pickupDateText = pickupDate === 'today' ? 'Vandaag' : pickupDate === 'tomorrow' ? 'Morgen' : customPickupDate
    
    let message = `Hallo ${settings.store_name}!\n\n`
    message += `Ik wil graag de volgende producten ophalen:\n\n`
    
    cartItems.forEach(item => {
      message += `• ${item.name} (${item.quantity}x) - ${formatCurrency(item.price * item.quantity, currency)}\n`
    })
    
    message += `\n━━━━━━━━━━━━━━━━━━\n`
    message += `💵 Totaal: ${formatCurrency(total, currency)}\n`
    message += `━━━━━━━━━━━━━━━━━━\n\n`
    message += `📍 Ophaallocatie: ${selectedLocationData?.name || 'Hoofdvestiging'}\n`
    message += `📅 Gewenste ophaaldatum: ${pickupDateText}\n`
    message += `👤 Naam: ${customerName}\n`
    message += `📱 Telefoon: ${customerPhone}\n`
    
    if (customerNotes.trim()) {
      message += `📝 Opmerkingen: ${customerNotes}\n`
    }
    
    message += `\nBedankt!`
    return message
  }, [loadCartItems, locations, selectedLocation, pickupDate, customPickupDate, settings.store_name, currency, customerName, customerPhone, customerNotes])

  // Submit WhatsApp order
  const handleSubmitOrder = useCallback(() => {
    const message = generateOrderMessage()
    const whatsappNumber = settings.whatsapp_number.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank')
  }, [generateOrderMessage, settings.whatsapp_number])

  // Computed values
  const unitPrice = getPrice()
  const totalPrice = unitPrice * quantity
  const images = product?.image_url ? [product.image_url] : []
  const cartItems = loadCartItems()

  // Generate product structured data for SEO
  const productSchema = product ? {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": product.description || `${product.name} - Available at ${settings.store_name} in Suriname`,
    "image": product.image_url || "",
    "sku": product.id,
    "brand": {
      "@type": "Brand",
      "name": settings.store_name
    },
    "offers": {
      "@type": "Offer",
      "url": typeof window !== 'undefined' ? window.location.href : '',
      "priceCurrency": currency,
      "price": unitPrice,
      "availability": stockStatus === 'out-of-stock' 
        ? "https://schema.org/OutOfStock" 
        : "https://schema.org/InStock",
      "seller": {
        "@type": "Organization",
        "name": settings.store_name
      },
      "areaServed": {
        "@type": "Country",
        "name": "Suriname"
      }
    },
    "category": category?.name || "Audio Accessories"
  } : null

  // Breadcrumb schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": typeof window !== 'undefined' ? `${window.location.origin}/` : '/'
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Catalog",
        "item": typeof window !== 'undefined' ? `${window.location.origin}/catalog` : '/catalog'
      },
      ...(category ? [{
        "@type": "ListItem",
        "position": 3,
        "name": category.name,
        "item": typeof window !== 'undefined' ? `${window.location.origin}/catalog?category=${category.id}` : `/catalog?category=${category.id}`
      }] : []),
      {
        "@type": "ListItem",
        "position": category ? 4 : 3,
        "name": product?.name || "Product"
      }
    ]
  }

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
      {/* Structured Data for SEO */}
      {productSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

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
      <main className="max-w-7xl mx-auto bg-white pt-6 lg:pt-8 pb-40 lg:pb-8" itemScope itemType="https://schema.org/Product">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="px-4 lg:px-8 mb-4">
          <ol className="flex items-center text-sm flex-wrap gap-1" itemScope itemType="https://schema.org/BreadcrumbList">
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <Link href="/" className="text-[#f97015] hover:underline" itemProp="item">
                <span itemProp="name">Home</span>
              </Link>
              <meta itemProp="position" content="1" />
            </li>
            <li className="mx-1.5 text-neutral-400">/</li>
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <Link href="/catalog" className="text-[#f97015] hover:underline" itemProp="item">
                <span itemProp="name">Catalog</span>
              </Link>
              <meta itemProp="position" content="2" />
            </li>
            {category && (
              <>
                <li className="mx-1.5 text-neutral-400">/</li>
                <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                  <Link href={`/catalog?category=${category.id}`} className="text-[#f97015] hover:underline" itemProp="item">
                    <span itemProp="name">{category.name}</span>
                  </Link>
                  <meta itemProp="position" content="3" />
                </li>
              </>
            )}
            <li className="mx-1.5 text-neutral-400">/</li>
            <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              <span className="text-neutral-600" itemProp="name">{product.name}</span>
              <meta itemProp="position" content={category ? "4" : "3"} />
            </li>
          </ol>
        </nav>

        <div className="lg:grid lg:grid-cols-2 lg:gap-12">
          {/* Image Gallery - Left Column */}
          <div className="relative">
            {/* Main Image */}
            <div className="aspect-square bg-white relative border border-neutral-200 rounded-2xl overflow-hidden shadow-sm lg:border-r-0 lg:rounded-r-none">
              {images.length > 0 ? (
                <>
                  <Image
                    src={images[currentImageIndex]}
                    alt={`${product.name}${category ? ` ${category.name.toLowerCase()}` : ''} - buy at NextX Suriname`}
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                    itemProp="image"
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
            {/* Product Title */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-neutral-900 tracking-tight mb-4" itemProp="name">
              {product.name}
            </h1>

            {/* Hidden SEO metadata */}
            {product.description && <meta itemProp="description" content={product.description} />}
            <span itemProp="offers" itemScope itemType="https://schema.org/Offer" className="hidden">
              <meta itemProp="priceCurrency" content={currency} />
              <meta itemProp="price" content={String(unitPrice)} />
              <link itemProp="availability" href={stockStatus === 'out-of-stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock'} />
            </span>

            {/* Unit Price */}
            <div className="mb-6">
              <div className="flex items-baseline gap-3">
                <span className={`text-3xl sm:text-4xl font-black ${isOutOfStock ? 'text-neutral-400' : 'text-[#f97015]'}`}>
                  {formatCurrency(unitPrice, currency)}
                </span>
                {currency === 'SRD' && product.selling_price_usd && (
                  <span className="text-sm text-neutral-500">
                    (≈ {formatCurrency(product.selling_price_usd, 'USD')})
                  </span>
                )}
              </div>
              
              {/* Stock Status Indicator */}
              <div className="mt-3">
                {isOutOfStock ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-700">
                    <AlertCircle size={16} />
                    <span className="text-sm font-semibold">Uitverkocht</span>
                  </div>
                ) : isLowStock ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 animate-pulse">
                    <AlertCircle size={16} />
                    <span className="text-sm font-semibold">Nog {stockLevel} beschikbaar</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 text-green-700">
                    <Check size={16} />
                    <span className="text-sm font-semibold">Op voorraad</span>
                  </div>
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

            {/* Combo Items - Show what's included if this is a combo */}
            {isCombo && product.combo_items && product.combo_items.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                  Inbegrepen in dit combo
                </h2>
                <div className="space-y-2">
                  {product.combo_items.map((ci) => {
                    const itemStock = stockMap.get(ci.child_item_id) || 0
                    const itemOutOfStock = itemStock <= 0
                    return (
                      <Link
                        key={ci.id}
                        href={`/catalog/${ci.child_item_id}`}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                          itemOutOfStock
                            ? 'bg-red-50 border-red-200 hover:bg-red-100'
                            : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {ci.child_item?.image_url ? (
                          <Image
                            src={ci.child_item.image_url}
                            alt={ci.child_item.name}
                            width={40}
                            height={40}
                            className={`rounded-lg object-cover ${itemOutOfStock ? 'opacity-50 grayscale' : ''}`}
                            unoptimized
                          />
                        ) : (
                          <div className="w-10 h-10 bg-neutral-200 rounded-lg flex items-center justify-center">
                            <Package size={16} className="text-neutral-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${itemOutOfStock ? 'text-red-700' : 'text-neutral-900'}`}>
                            {ci.child_item?.name || 'Onbekend product'}
                          </p>
                          <p className={`text-xs ${itemOutOfStock ? 'text-red-600' : 'text-neutral-500'}`}>
                            {itemOutOfStock ? 'Uitverkocht' : `${ci.quantity}x`}
                          </p>
                        </div>
                        {itemOutOfStock && (
                          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                        )}
                      </Link>
                    )
                  })}
                </div>
                {isOutOfStock && (
                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <AlertCircle size={12} />
                    Dit combo is niet beschikbaar omdat één of meer onderdelen uitverkocht zijn.
                  </p>
                )}
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
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                isOutOfStock 
                  ? 'bg-red-50 border-red-200' 
                  : isLowStock 
                    ? 'bg-amber-50 border-amber-200' 
                    : 'bg-green-50 border-green-200'
              }`}>
                {isOutOfStock ? (
                  <AlertCircle size={18} className="text-red-500" />
                ) : isLowStock ? (
                  <AlertCircle size={18} className="text-amber-500" />
                ) : (
                  <Check size={18} className="text-green-500" />
                )}
                <span className={`text-sm font-medium ${
                  isOutOfStock 
                    ? 'text-red-700' 
                    : isLowStock 
                      ? 'text-amber-700' 
                      : 'text-green-700'
                }`}>
                  {getStockStatusText(stockStatus)}
                </span>
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
                      disabled={quantity <= 1}
                      className={`w-12 h-12 flex items-center justify-center transition-colors ${
                        quantity <= 1
                          ? 'text-neutral-300 cursor-not-allowed'
                          : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200'
                      }`}
                      aria-label="Verminder aantal"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-14 text-center text-lg font-semibold text-neutral-900 select-none">
                      {quantity}
                    </span>
                    <button
                      onClick={incrementQuantity}
                      disabled={quantity >= maxAvailable || isOutOfStock}
                      className={`w-12 h-12 flex items-center justify-center transition-colors ${
                        quantity >= maxAvailable || isOutOfStock
                          ? 'text-neutral-300 cursor-not-allowed'
                          : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200'
                      }`}
                      aria-label="Verhoog aantal"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  {quantity >= maxAvailable && !isOutOfStock && (
                    <p className="text-xs text-amber-600 mt-1">Maximum bereikt</p>
                  )}
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
              {isOutOfStock ? (
                <button
                  className="w-full h-14 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all duration-200 bg-neutral-200 text-neutral-500 cursor-not-allowed mb-6"
                  disabled
                >
                  <AlertCircle size={22} strokeWidth={2} />
                  <span>Uitverkocht</span>
                </button>
              ) : (
                <button
                  onClick={handleAddToCart}
                  disabled={addedToCart}
                  className={`w-full h-14 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all duration-200 shadow-lg mb-6 ${
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
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Sticky Bottom CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] px-4 pt-4 pb-6 safe-area-bottom">
        {/* Quantity and Total Row */}
        <div className="flex items-center justify-between mb-4">
          {/* Quantity Selector */}
          <div>
            <div className="flex items-center rounded-xl bg-neutral-100 border border-neutral-200 overflow-hidden">
              <button
                onClick={decrementQuantity}
                disabled={quantity <= 1}
                className={`w-11 h-11 flex items-center justify-center transition-colors ${
                  quantity <= 1
                    ? 'text-neutral-300 cursor-not-allowed'
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300'
                }`}
                aria-label="Verminder aantal"
              >
                <Minus size={18} />
              </button>
              <span className="w-10 text-center text-base font-semibold text-neutral-900 select-none">
                {quantity}
              </span>
              <button
                onClick={incrementQuantity}
                disabled={quantity >= maxAvailable || isOutOfStock}
                className={`w-11 h-11 flex items-center justify-center transition-colors ${
                  quantity >= maxAvailable || isOutOfStock
                    ? 'text-neutral-300 cursor-not-allowed'
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300'
                }`}
                aria-label="Verhoog aantal"
              >
                <Plus size={18} />
              </button>
            </div>
            {quantity >= maxAvailable && !isOutOfStock && (
              <p className="text-xs text-amber-600 mt-1">Max</p>
            )}
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
        {isOutOfStock ? (
          <button
            className="w-full h-14 rounded-2xl font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 bg-neutral-200 text-neutral-500 cursor-not-allowed mb-4"
            disabled
          >
            <AlertCircle size={20} strokeWidth={2} />
            <span>Uitverkocht</span>
          </button>
        ) : (
          <button
            onClick={handleAddToCart}
            disabled={addedToCart}
            className={`w-full h-14 rounded-2xl font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 shadow-lg mb-4 ${
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
        )}
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
      
      {/* Cart Drawer */}
      <NewCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
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
        onUpdateQuantity={handleUpdateQuantity}
        onAddOne={handleAddOne}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        customerPhone={customerPhone}
        onCustomerPhoneChange={setCustomerPhone}
        customerNotes={customerNotes}
        onCustomerNotesChange={setCustomerNotes}
        onSubmitOrder={handleSubmitOrder}
        stockMap={Object.fromEntries(stockMap)}
      />
    </div>
  )
}
