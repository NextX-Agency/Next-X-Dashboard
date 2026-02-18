'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { fetchCatalogData } from '@/lib/catalogApi'
import { Database } from '@/types/database.types'
import { formatCurrency, type Currency } from '@/lib/currency'
import FloatingWhatsApp from '@/components/FloatingWhatsApp'
import { 
  getItemStockStatus, 
  getItemStockLevel, 
  canAddToCart, 
  validateCartItem,
  getComboStockStatus,
  type StockStatus 
} from '@/lib/stockUtils'

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
  BannerSlider,
  Breadcrumbs,
  SEOIntro,
  CategorySEOHeader,
  ProductListSchema,
  LocalBusinessSchema,
  WebsiteSchema,
  SEO_CONTENT
} from '@/components/catalog'
import { PageSkeleton, CarouselSkeleton } from '@/components/catalog/SkeletonLoader'

// Lazy load heavy below-the-fold sections
const NewValueSection_Lazy = dynamic(
  () => import('@/components/catalog').then(m => ({ default: m.NewValueSection })),
  { ssr: false }
)
const NewCtaSection_Lazy = dynamic(
  () => import('@/components/catalog').then(m => ({ default: m.NewCtaSection })),
  { ssr: false }
)

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

// Stock update timestamp for displaying freshness
interface StockMetadata {
  lastUpdated: Date
}

export default function NewCatalogPage() {
  // Data state
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<ItemWithCombo[]>([])
  const [comboItems, setComboItems] = useState<ItemWithCombo[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [banners, setBanners] = useState<Banner[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [stockMetadata, setStockMetadata] = useState<StockMetadata>({ lastUpdated: new Date() })
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
            description: updatedItem.description,
            image_url: updatedItem.image_url,
            category_id: updatedItem.category_id,
            purchase_price_usd: updatedItem.purchase_price_usd,
            selling_price_srd: updatedItem.selling_price_srd,
            selling_price_usd: updatedItem.selling_price_usd,
            is_public: updatedItem.is_public,
            is_combo: updatedItem.is_combo,
            allow_custom_price: updatedItem.allow_custom_price,
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

  // Load data - Use API route that bypasses RLS, with Supabase fallback
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Try API route first (uses Prisma, bypasses RLS)
      const apiData = await fetchCatalogData()
      
      // Check if we got data from the API
      if (apiData.categories.length > 0 || apiData.items.length > 0) {
        console.log('Using API data (Prisma)')
        
        // Set categories
        if (apiData.categories.length > 0) {
          setCategories(apiData.categories as Category[])
        }
        
        // Set items
        if (apiData.items.length > 0) {
          setItems(apiData.items as ItemWithCombo[])
        }
        
        // Set combos
        if (apiData.combos.length > 0) {
          setComboItems(apiData.combos as ItemWithCombo[])
        }
        
        // Set locations
        if (apiData.locations.length > 0) {
          setLocations(apiData.locations as Location[])
          if (!selectedLocation && apiData.locations.length > 0) {
            setSelectedLocation((apiData.locations[0] as Location).id)
          }
        }
        
        // Set exchange rate
        if (apiData.exchangeRate) {
          setExchangeRate((apiData.exchangeRate as { usd_to_srd: number }).usd_to_srd)
        }
        
        // Set banners
        if (apiData.banners.length > 0) {
          setBanners(apiData.banners as Banner[])
        }
        
        // Set collections
        if (apiData.collections.length > 0) {
          setCollections(apiData.collections as Collection[])
        }
        
        // Set settings
        if (Object.keys(apiData.settings).length > 0) {
          const settingsMap = apiData.settings
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
        
        // Set stock
        if (apiData.stock.length > 0) {
          const map = new Map<string, number>()
          apiData.stock.forEach((stock: unknown) => {
            const s = stock as { item_id: string; quantity: number }
            const current = map.get(s.item_id) || 0
            map.set(s.item_id, current + s.quantity)
          })
          setStockMap(map)
          setStockMetadata({ lastUpdated: new Date() })
        }
      } else {
        // Fallback to Supabase (in case API fails)
        console.log('Falling back to Supabase')
        const [categoriesRes, itemsRes, rateRes, settingsRes, locationsRes, bannersRes, collectionsRes] = await Promise.all([
          supabase.from('categories').select('*').order('name'),
          supabase.from('items').select('*').eq('is_public', true).eq('is_combo', false).order('created_at', { ascending: false }),
          supabase.from('exchange_rates').select('*').eq('is_active', true).single(),
          supabase.from('store_settings').select('*'),
          supabase.from('locations').select('*').eq('is_active', true).order('name'),
          supabase.from('banners').select('*').eq('is_active', true).order('position'),
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
          const comboItemsRes = await supabase
            .from('combo_items')
            .select('*')
            .in('combo_id', combosRes.data.map(c => c.id))
          
          const childItemIds = comboItemsRes.data?.map(ci => ci.item_id) || []
          const childItemsRes = await supabase
            .from('items')
            .select('*')
            .in('id', childItemIds)
          
          const comboItemsWithChildren = comboItemsRes.data?.map(ci => ({
            ...ci,
            child_item: childItemsRes.data?.find(item => item.id === ci.item_id),
            child_item_id: ci.item_id
          })) || []
          
          const combosWithItems: ItemWithCombo[] = combosRes.data.map(combo => ({
            ...combo,
            combo_items: comboItemsWithChildren.filter(ci => ci.combo_id === combo.id)
          }))
          
          setComboItems(combosWithItems)
        }
        
        if (locationsRes.data) {
          setLocations(locationsRes.data)
          if (!selectedLocation && locationsRes.data.length > 0) {
            setSelectedLocation(locationsRes.data[0].id)
          }
        }
        if (bannersRes.data) setBanners(bannersRes.data as Banner[])
        if (collectionsRes.data) setCollections(collectionsRes.data as Collection[])
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
            store_description: settingsMap.store_description || '',
            store_address: settingsMap.store_address || 'Commewijne, Noord',
            store_email: settingsMap.store_email || '',
            store_logo_url: validLogoUrl,
            hero_title: settingsMap.hero_title || 'Welkom',
            hero_subtitle: settingsMap.hero_subtitle || ''
          })
        }

        const { data: stockData } = await supabase
          .from('stock')
          .select('item_id, quantity')
        
        if (stockData) {
          const map = new Map<string, number>()
          stockData.forEach((stock: { item_id: string; quantity: number }) => {
            const current = map.get(stock.item_id) || 0
            map.set(stock.item_id, current + stock.quantity)
          })
          setStockMap(map)
          setStockMetadata({ lastUpdated: new Date() })
        }
      }
    } catch (err) {
      console.error('Error loading catalog data:', err)
      setError('Er is een fout opgetreden bij het laden van de producten.')
    } finally {
      setLoading(false)
    }
  }

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
          setStockMetadata({ lastUpdated: new Date() })
          return
        }
      }
      
      // Fallback to Supabase
      const { data: stockData } = await supabase
        .from('stock')
        .select('item_id, quantity')
      
      if (stockData) {
        const map = new Map<string, number>()
        stockData.forEach((stock: { item_id: string; quantity: number }) => {
          const current = map.get(stock.item_id) || 0
          map.set(stock.item_id, current + stock.quantity)
        })
        setStockMap(map)
        setStockMetadata({ lastUpdated: new Date() })
      }
    } catch (err) {
      console.error('Error refreshing stock:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  // Periodic stock refresh for real-time accuracy
  useEffect(() => {
    const interval = setInterval(refreshStock, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [refreshStock])

  // Price calculation
  const getPrice = (item: Item): number => {
    if (currency === 'USD') {
      return item.selling_price_usd || (item.selling_price_srd ? item.selling_price_srd / exchangeRate : 0)
    }
    return item.selling_price_srd || (item.selling_price_usd ? item.selling_price_usd * exchangeRate : 0)
  }

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
      description: item.description,
      image_url: item.image_url,
      category_id: item.category_id,
      purchase_price_usd: item.purchase_price_usd,
      selling_price_srd: item.selling_price_srd,
      selling_price_usd: item.selling_price_usd,
      is_public: item.is_public,
      is_combo: item.is_combo,
      allow_custom_price: item.allow_custom_price,
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

  // Loading state
  if (loading) {
    return <PageSkeleton />
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Er ging iets mis</h2>
          <p className="text-neutral-600 mb-6">{error}</p>
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

  // Build store URL for structured data
  const storeUrl = typeof window !== 'undefined' ? window.location.origin : 'https://nextx.sr'

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

  // Get breadcrumb items based on current view
  const getBreadcrumbItems = (): Array<{ label: string; href?: string }> => {
    const base: Array<{ label: string; href?: string }> = [
      { label: 'Home', href: '/' }, 
      { label: 'Catalog', href: '/catalog' }
    ]
    if (selectedCategory) {
      const categoryName = getCategoryName(selectedCategory)
      if (categoryName) {
        base.push({ label: categoryName })
      }
    }
    return base
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Structured Data for SEO */}
      <LocalBusinessSchema
        storeName={settings.store_name}
        storeDescription={settings.store_description || SEO_CONTENT.defaultDescription}
        storeAddress={settings.store_address}
        whatsappNumber={settings.whatsapp_number}
        storeEmail={settings.store_email}
        storeUrl={storeUrl}
        logoUrl={settings.store_logo_url}
      />
      <WebsiteSchema
        storeName={settings.store_name}
        storeUrl={storeUrl}
        storeDescription={settings.store_description || SEO_CONTENT.defaultDescription}
      />
      {items.length > 0 && (
        <ProductListSchema
          products={productsForSchema}
          storeName={settings.store_name}
          storeUrl={storeUrl}
        />
      )}

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
          <section className="py-10 bg-[#f8f7f4]" aria-labelledby="search-results-heading">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 id="search-results-heading" className="text-2xl font-bold text-[#141c2e] mb-2">
                Zoekresultaten voor &ldquo;{searchQuery}&rdquo;
              </h2>
              <p className="text-neutral-600 mb-6">{searchResults.length} producten gevonden in Suriname</p>
              <NewProductGrid 
                isEmpty={searchResults.length === 0}
                onClearFilters={() => setSearchQuery('')}
                emptyMessage="Geen producten gevonden voor deze zoekopdracht"
                variant="dark"
              >
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
                    />
                  )
                })}
              </NewProductGrid>
            </div>
          </section>
        )}

        {/* Category Products */}
        {showCategoryProducts && (
          <section className="py-10 bg-[#f8f7f4]" aria-labelledby="category-heading">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <ProductSectionHeader
                title={getCategoryName(selectedCategory) || 'Producten'}
                count={filteredItems.length}
                variant="dark"
              />
              {/* Hidden category description for SEO */}
              <p className="sr-only">
                Shop {getCategoryName(selectedCategory)?.toLowerCase() || 'products'} at NextX Suriname. Quality audio gear with local pickup available.
              </p>
              
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
              />
            )}

            {/* New Products Carousel */}
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
              />
            )}

            {/* Featured Collections */}
            {collections.length > 0 && collections.map((collection) => {
              const collectionProducts = collection.collection_items
                ?.sort((a, b) => a.sort_order - b.sort_order)
                .filter(ci => ci.items)
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
                products={products.slice(0, 10).map(item => {
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
                  // Force scroll to top with multiple strategies for mobile compatibility
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                    // Fallback for older mobile browsers
                    if (window.scrollY > 0) {
                      window.scrollTo(0, 0)
                    }
                  }, 50)
                }}
                bgColor={category.name === 'In-Ear Accessories' ? 'neutral-50' : 'white'}
              />
            ))}

            {/* Value Section */}
            <NewValueSection_Lazy
              storeAddress={settings.store_address}
              whatsappNumber={settings.whatsapp_number}
              storeDescription={settings.store_description}
            />

            {/* CTA Section */}
            <NewCtaSection_Lazy
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
          stockLevel={getStockLevel(selectedItem.id)}
          stockStatus={getStockStatus(selectedItem.id)}
        />
      )}
    </div>
  )
}
