'use client'

import { useState, useMemo, useCallback, useEffect, useDeferredValue, useRef, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowDownUp, ArrowRight, Boxes, ChevronLeft, ChevronRight, CircleDollarSign, PackageCheck, Search, SlidersHorizontal, X } from 'lucide-react'
import { useCurrency } from '@/lib/CurrencyContext'
import { formatCurrency, type Currency } from '@/lib/currency'
import { shouldBypassNextImageOptimization } from '@/lib/imageOptimization'
import { normalizeExchangeRate } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { getWatchSellingPrice } from '@/lib/watchPricing'
import {
  buildWatchesCartWhatsAppMessage,
  clearWatchesCart,
  getWatchesCartCount,
  getWatchesCartQuantity,
  removeWatchesCartItem,
  setWatchesCartItemQuantity,
  subscribeWatchesCart,
  type WatchesCartEntry,
  upsertWatchesCartItem,
} from '@/lib/watchesCart'
import {
  WatchesHeader,
  WatchesHero,
  WatchProductCard,
  WatchesFooter,
  WatchesAgencySection,
} from '@/components/watches'
import { WatchesBrandNav, type WatchBrandOption } from '@/components/watches/WatchesBrandNav'

const WatchesFeaturedSection = dynamic(
  () => import('@/components/watches/WatchesFeaturedSection').then(mod => mod.WatchesFeaturedSection),
  { ssr: false }
)
const WatchQuickViewModal = dynamic(
  () => import('@/components/watches/WatchQuickViewModal').then(mod => mod.WatchQuickViewModal),
  { ssr: false }
)
const WatchCartDrawer = dynamic(
  () => import('@/components/watches/WatchCartDrawer').then(mod => mod.WatchCartDrawer),
  { ssr: false }
)

interface Item {
  id: string
  name: string
  brand?: string | null
  categoryId?: string | null
  category?: {
    id: string
    name: string
  } | null
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

interface WatchesCatalogClientProps {
  items: Item[]
  stock: StockEntry[]
  banners: Banner[]
  collections: Collection[]
  settings: Record<string, string>
  initialExchangeRate?: number | null
}

type AvailabilityFilter = 'all' | 'available' | 'low-stock' | 'sold-out'
type PriceBand = 'all' | 'under-50' | '50-100' | '100-plus'
type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'brand-asc' | 'stock-desc'

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

const PRICE_BANDS: Array<{
  value: Exclude<PriceBand, 'all'>
  min?: number
  max?: number
}> = [
  { value: 'under-50', max: 50 },
  { value: '50-100', min: 50, max: 100 },
  { value: '100-plus', min: 100 },
]

const AVAILABILITY_OPTIONS: Array<{ value: AvailabilityFilter; label: string }> = [
  { value: 'all', label: 'All stock' },
  { value: 'available', label: 'Available' },
  { value: 'low-stock', label: 'Low stock' },
  { value: 'sold-out', label: 'Sold out' },
]

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'brand-asc', label: 'Brand A-Z' },
  { value: 'stock-desc', label: 'Most available' },
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

function getBalancedGridClass(count: number, options?: { singleMaxWidth?: string; pairMaxWidth?: string; tripleMaxWidth?: string }) {
  const singleMaxWidth = options?.singleMaxWidth ?? 'max-w-xl'
  const pairMaxWidth = options?.pairMaxWidth ?? 'max-w-5xl'
  const tripleMaxWidth = options?.tripleMaxWidth ?? 'max-w-7xl'

  if (count <= 1) {
    return `mx-auto ${singleMaxWidth} grid-cols-1`
  }

  if (count === 2) {
    return `mx-auto ${pairMaxWidth} grid-cols-1 md:grid-cols-2`
  }

  if (count === 3) {
    return `mx-auto ${tripleMaxWidth} grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
  }

  return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
}

function getItemPrice(item: Item, currency: Currency, exchangeRate: number) {
  return getWatchSellingPrice({
    sellingPriceUsd: item.sellingPriceUsd ? Number(item.sellingPriceUsd) : null,
    sellingPriceSrd: item.sellingPriceSrd ? Number(item.sellingPriceSrd) : null,
  }, currency, exchangeRate)
}

function getPriceBandLabel(priceBand: PriceBand, currency: Currency, exchangeRate: number) {
  const convertUsd = (amount: number) => currency === 'USD' ? amount : amount * exchangeRate

  if (priceBand === 'under-50') {
    return `Under ${formatCurrency(convertUsd(50), currency)}`
  }

  if (priceBand === '50-100') {
    return `${formatCurrency(convertUsd(50), currency)} - ${formatCurrency(convertUsd(100), currency)}`
  }

  if (priceBand === '100-plus') {
    return `${formatCurrency(convertUsd(100), currency)}+`
  }

  return 'All prices'
}

function matchesPriceBand(priceUsd: number | null, priceBand: PriceBand) {
  if (priceBand === 'all') return true
  if (priceUsd == null) return false

  const band = PRICE_BANDS.find(option => option.value === priceBand)
  if (!band) return true

  const aboveMin = band.min == null || priceUsd >= band.min
  const belowMax = band.max == null || priceUsd < band.max

  return aboveMin && belowMax
}

function getBalancedImageSizes(count: number) {
  if (count <= 1) {
    return '(max-width: 768px) 100vw, 42rem'
  }

  if (count === 2) {
    return '(max-width: 768px) 100vw, 50vw'
  }

  if (count === 3) {
    return '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'
  }

  return '(max-width: 640px) 48vw, (max-width: 1024px) 32vw, (max-width: 1536px) 24vw, 19vw'
}

export default function WatchesCatalogClient({
  items,
  stock,
  banners,
  collections,
  settings,
  initialExchangeRate,
}: WatchesCatalogClientProps) {
  const {
    displayCurrency,
    exchangeRate: liveExchangeRate,
    isLoading: isCurrencyLoading,
  } = useCurrency()
  const [activeBrand, setActiveBrand] = useState<string | null>(null)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all')
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all')
  const [priceBand, setPriceBand] = useState<PriceBand>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [searchQuery, setSearchQuery] = useState('')
  const [cartItems, setCartItems] = useState<WatchesCartEntry[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [quickViewItem, setQuickViewItem] = useState<Item | null>(null)
  const [liveStock, setLiveStock] = useState(stock)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase())

  const whatsappNumber = settings.whatsapp_number ?? '5978555555'
  const serverExchangeRate = useMemo(() => normalizeExchangeRate(initialExchangeRate), [initialExchangeRate])
  const activeExchangeRate = useMemo(() => (
    isCurrencyLoading
      ? serverExchangeRate
      : normalizeExchangeRate(liveExchangeRate)
  ), [isCurrencyLoading, liveExchangeRate, serverExchangeRate])

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

  useEffect(() => {
    return subscribeWatchesCart(setCartItems)
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

  const categoryOptions = useMemo(() => {
    const categoryMap = new Map<string, { id: string; name: string; count: number; inStockCount: number }>()

    items.forEach((item) => {
      const categoryId = item.categoryId ?? item.category?.id
      const categoryName = item.category?.name?.trim()
      if (!categoryId || !categoryName) return

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, { id: categoryId, name: categoryName, count: 0, inStockCount: 0 })
      }

      const category = categoryMap.get(categoryId)
      if (!category) return

      category.count += 1
      if ((stockMap[item.id] ?? 0) > 0) {
        category.inStockCount += 1
      }
    })

    return Array.from(categoryMap.values()).sort((left, right) => left.name.localeCompare(right.name))
  }, [items, stockMap])

  const cartQuantityByItemId = useMemo(() => {
    const map: Record<string, number> = {}
    cartItems.forEach((item) => {
      map[item.id] = item.quantity
    })
    return map
  }, [cartItems])

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
  const watchesHeroTitle = settings.watches_hero_title?.trim() || heroBanner?.title || undefined
  const watchesHeroSubtitle = settings.watches_hero_subtitle?.trim() || heroBanner?.subtitle || undefined
  const watchesHeroImage = settings.watches_hero_image_url?.trim() || heroBanner?.imageUrl || undefined
  const watchesHeroMobileImage = settings.watches_hero_mobile_image_url?.trim() || heroBanner?.mobileImage || undefined
  const watchesLogoUrl = settings.watches_store_logo_url?.trim() || settings.store_logo_url?.trim() || undefined
  const watchesStoreDescription = settings.watches_store_description?.trim() || settings.store_description?.trim() || undefined
  const watchesStoreAddress = settings.store_address?.trim() || undefined

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
    const matches = items.filter((item) => {
      const displayBrand = brandByItemId[item.id]
      const matchesBrand = !activeBrand || displayBrand?.toLowerCase() === activeBrand.toLowerCase()
      const matchesCollection = !activeCollection || activeCollection.itemIds.has(item.id)
      const matchesCategory = activeCategoryId === 'all' || item.categoryId === activeCategoryId || item.category?.id === activeCategoryId
      const stockCount = stockMap[item.id] ?? 0
      const matchesAvailability = availabilityFilter === 'all'
        || (availabilityFilter === 'available' && stockCount > 0)
        || (availabilityFilter === 'low-stock' && stockCount > 0 && stockCount <= 3)
        || (availabilityFilter === 'sold-out' && stockCount <= 0)
      const priceUsd = getItemPrice(item, 'USD', activeExchangeRate)
      const matchesPrice = matchesPriceBand(priceUsd, priceBand)
      const matchesSearch = !deferredSearchQuery || [item.name, displayBrand ?? item.brand ?? '', item.category?.name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(deferredSearchQuery)

      return matchesBrand && matchesCollection && matchesCategory && matchesAvailability && matchesPrice && matchesSearch
    })

    return matches.sort((left, right) => {
      if (sortBy === 'newest') return 0

      const leftStock = stockMap[left.id] ?? 0
      const rightStock = stockMap[right.id] ?? 0

      if (sortBy === 'stock-desc') {
        return rightStock - leftStock || left.name.localeCompare(right.name)
      }

      if (sortBy === 'brand-asc') {
        const leftBrand = brandByItemId[left.id] ?? left.brand ?? ''
        const rightBrand = brandByItemId[right.id] ?? right.brand ?? ''
        return leftBrand.localeCompare(rightBrand) || left.name.localeCompare(right.name)
      }

      const leftPrice = getItemPrice(left, displayCurrency, activeExchangeRate)
      const rightPrice = getItemPrice(right, displayCurrency, activeExchangeRate)

      if (leftPrice == null && rightPrice == null) return left.name.localeCompare(right.name)
      if (leftPrice == null) return 1
      if (rightPrice == null) return -1

      return sortBy === 'price-asc'
        ? leftPrice - rightPrice || left.name.localeCompare(right.name)
        : rightPrice - leftPrice || left.name.localeCompare(right.name)
    })
  }, [
    items,
    activeBrand,
    activeCategoryId,
    activeCollection,
    activeExchangeRate,
    availabilityFilter,
    brandByItemId,
    deferredSearchQuery,
    displayCurrency,
    priceBand,
    sortBy,
    stockMap,
  ])

  const brandSections = useMemo(() => {
    const sectionsByBrand = new Map<string, { brand: WatchBrandOption; items: Item[] }>()
    const brandOptionByKey = new Map(brandOptions.map(brand => [brand.name.toLowerCase(), brand]))

    filteredItems.forEach((item) => {
      const brandName = brandByItemId[item.id]
      if (!brandName) return

      const key = brandName.toLowerCase()
      if (!sectionsByBrand.has(key)) {
        sectionsByBrand.set(key, {
          brand: brandOptionByKey.get(key) ?? { name: brandName, count: 0, inStockCount: 0 },
          items: [],
        })
      }

      sectionsByBrand.get(key)?.items.push(item)
    })

    return Array.from(sectionsByBrand.values()).filter(section => section.items.length > 0)
  }, [brandByItemId, brandOptions, filteredItems])

  const activeFilterCount = [
    activeBrand,
    activeCollectionId,
    activeCategoryId !== 'all' ? activeCategoryId : null,
    availabilityFilter !== 'all' ? availabilityFilter : null,
    priceBand !== 'all' ? priceBand : null,
    searchQuery.trim() ? 'search' : null,
  ].filter(Boolean).length

  const hasActiveFilters = activeFilterCount > 0

  const featuredItems = useMemo(() => {
    if (activeCollection) return activeCollection.resolvedItems.slice(0, 6)
    return normalizedCollections[0]?.resolvedItems.slice(0, 6) ?? items.slice(0, 6)
  }, [activeCollection, normalizedCollections, items])

  const shouldShowFeaturedSection = useMemo(() => {
    if (hasActiveFilters) return false
    if (normalizedCollections.length === 0) return false
    if (featuredItems.length < 3) return false

    return items.length >= Math.max(featuredItems.length + 3, 6)
  }, [featuredItems.length, hasActiveFilters, items.length, normalizedCollections.length])

  const collectionGridClassName = useMemo(
    () => getBalancedGridClass(Math.min(normalizedCollections.length, 3), { singleMaxWidth: 'max-w-2xl', pairMaxWidth: 'max-w-6xl' }),
    [normalizedCollections.length]
  )

  const collectionImageSizes = useMemo(
    () => getBalancedImageSizes(Math.min(normalizedCollections.length, 3)),
    [normalizedCollections.length]
  )

  const catalogGridClassName = useMemo(
    () => getBalancedGridClass(filteredItems.length, { singleMaxWidth: 'max-w-sm', pairMaxWidth: 'max-w-[54rem]', tripleMaxWidth: 'max-w-5xl' }),
    [filteredItems.length]
  )

  const catalogImageSizes = useMemo(
    () => getBalancedImageSizes(filteredItems.length),
    [filteredItems.length]
  )

  const activeCategory = useMemo(
    () => categoryOptions.find(category => category.id === activeCategoryId) ?? null,
    [activeCategoryId, categoryOptions]
  )

  const activeAvailabilityLabel = useMemo(
    () => AVAILABILITY_OPTIONS.find(option => option.value === availabilityFilter)?.label ?? 'All stock',
    [availabilityFilter]
  )

  const activePriceBandLabel = useMemo(
    () => getPriceBandLabel(priceBand, displayCurrency, activeExchangeRate),
    [activeExchangeRate, displayCurrency, priceBand]
  )

  const primaryCtaHref = heroBanner?.linkUrl ?? (shouldShowFeaturedSection ? '/watches#featured' : '/watches#new')

  const handleAddToCart = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const available = stockMap[itemId] ?? 0
    if (available <= 0) return

    const displayBrand = brandByItemId[item.id] ?? item.brand ?? undefined
    const currentQuantity = getWatchesCartQuantity(cartItems, itemId)
    const nextQuantity = Math.min(currentQuantity + 1, available)
    if (nextQuantity <= currentQuantity) return

    upsertWatchesCartItem({
      id: item.id,
      name: item.name,
      brand: displayBrand,
      imageUrl: item.imageUrl,
      sellingPriceUsd: item.sellingPriceUsd,
      sellingPriceSrd: item.sellingPriceSrd,
      quantity: nextQuantity,
    }, nextQuantity)
  }, [brandByItemId, cartItems, items, stockMap])

  const handleQuickView = useCallback((id: string) => {
    setQuickViewItem(items.find(item => item.id === id) ?? null)
  }, [items])

  const handleViewBrand = useCallback((brandName: string) => {
    setActiveBrand(brandName)
    window.setTimeout(() => {
      document.getElementById('new')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  const handleUpdateQty = useCallback((id: string, qty: number) => {
    const available = stockMap[id] ?? Number.POSITIVE_INFINITY
    const nextQuantity = Math.max(0, Math.min(qty, available))

    if (nextQuantity <= 0) {
      removeWatchesCartItem(id)
      return
    }

    setWatchesCartItemQuantity(id, nextQuantity)
  }, [stockMap])

  const handleRemove = useCallback((id: string) => {
    removeWatchesCartItem(id)
  }, [])

  const handleSubmitOrder = useCallback(() => {
    if (cartItems.length === 0) return

    const message = buildWatchesCartWhatsAppMessage({
      items: cartItems,
      currency: displayCurrency,
      exchangeRate: activeExchangeRate,
      customerName,
      customerPhone,
      customerNotes,
    })

    const sanitizedNumber = whatsappNumber.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${sanitizedNumber}?text=${encodeURIComponent(message)}`, '_blank')

    clearWatchesCart()
    setCustomerName('')
    setCustomerPhone('')
    setCustomerNotes('')
    setCartOpen(false)
  }, [activeExchangeRate, cartItems, customerName, customerNotes, customerPhone, displayCurrency, whatsappNumber])

  const handleClearFilters = useCallback(() => {
    setActiveBrand(null)
    setActiveCollectionId(null)
    setActiveCategoryId('all')
    setAvailabilityFilter('all')
    setPriceBand('all')
    setSearchQuery('')
  }, [])

  const cartCount = getWatchesCartCount(cartItems)
  const showBrandSections = !hasActiveFilters && brandSections.length > 0

  return (
    <>
      <WatchesHeader cartCount={cartCount} logoUrl={watchesLogoUrl} onCartClick={() => setCartOpen(true)} />

      <main style={{ background: 'var(--w-bg)', minHeight: '100svh' }}>
        {/* ── Hero ────────────────────────────────────── */}
        <WatchesHero
          title={watchesHeroTitle}
          subtitle={watchesHeroSubtitle}
          imageUrl={watchesHeroImage}
          mobileImageUrl={watchesHeroMobileImage}
          ctaLabel={heroBanner?.buttonText ?? heroBanner?.linkText ?? undefined}
          ctaHref={primaryCtaHref}
        />

        {/* ── Philosophy strip ────────────────────────── */}
        <div
          className="flex items-center justify-center gap-4 px-6 py-6 sm:gap-6 sm:py-8"
          style={{ borderBottom: '1px solid var(--w-border)' }}
        >
          <div className="hidden sm:block h-px flex-1 max-w-24" style={{ background: 'var(--w-border-gold)' }} />
          <p
            className="text-center text-[9px] tracking-[0.28em] uppercase font-light sm:text-[10px] sm:tracking-[0.3em]"
            style={{
              fontFamily: 'var(--font-jost, system-ui, sans-serif)',
              color: 'var(--w-muted)',
              maxWidth: '48ch',
            }}
          >
            Chosen for collectors who buy fewer pieces, but better ones
          </p>
          <div className="hidden sm:block h-px flex-1 max-w-24" style={{ background: 'var(--w-border-gold)' }} />
        </div>

        {banners.length > 1 && (
          <section className="px-6 py-5 lg:px-12 lg:py-6">
            <div className="mx-auto grid max-w-screen-2xl gap-4 md:grid-cols-2 xl:grid-cols-3">
              {banners.slice(0, 3).map((banner) => (
                <Link
                  key={banner.id}
                  href={banner.linkUrl || primaryCtaHref}
                  className="group relative overflow-hidden border p-4 sm:p-5 lg:p-6"
                  style={{ borderColor: 'var(--w-border)', background: 'linear-gradient(135deg, rgba(22,24,30,0.92), rgba(12,12,16,0.96))' }}
                >
                  {banner.imageUrl && (
                    <div className="absolute inset-0 opacity-35 transition-opacity duration-500 group-hover:opacity-50">
                      <Image
                        src={banner.imageUrl}
                        alt={banner.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        quality={75}
                        loading="lazy"
                        decoding="async"
                        unoptimized={shouldBypassNextImageOptimization(banner.imageUrl)}
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.15), rgba(9,9,11,0.88))' }} />
                  <div className="relative z-10 flex min-h-32 flex-col justify-end sm:min-h-36">
                    <p className="mb-2 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                      Editorial Drop
                    </p>
                    <h2
                      className="mb-2 text-xl font-light sm:text-2xl"
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

        <section id="collections" className="px-5 py-6 sm:px-6 sm:py-8 lg:px-12 lg:py-10">
          <div
            className="mx-auto max-w-screen-2xl border-y py-6 sm:py-8"
            style={{ borderColor: 'var(--w-border)' }}
          >
            <div className="mb-6 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                  Live Vault
                </p>
                <h2
                  className="text-2xl font-light sm:text-3xl"
                  style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
                >
                  Explore the current watch edit
                </h2>
              </div>
              <div
                className="flex items-baseline gap-2.5"
                style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                <span className="text-xl font-light tabular-nums" style={{ color: 'var(--w-cream)' }}>
                  {filteredItems.length.toString().padStart(2, '0')}
                </span>
                <span className="text-[10px] font-light uppercase tracking-[0.2em]" style={{ color: 'var(--w-muted)' }}>
                  of {items.length} {items.length === 1 ? 'watch' : 'watches'} - {brandOptions.length} {brandOptions.length === 1 ? 'brand' : 'brands'}
                </span>
              </div>
            </div>

            <div className="mb-5 h-px" style={{ background: 'var(--w-border)' }} />

            <div
              className="grid gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)] lg:items-start"
              style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
            >
              <div className="relative">
                <label
                  className="relative block w-full border px-4"
                  style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.58)' }}
                >
                  <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--w-muted)' }} />
                  <input
                    id="watches-search-input"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search model, brand, or reference"
                    className="h-12 w-full border-0 bg-transparent pl-7 pr-10 text-sm outline-none"
                    style={{ color: 'var(--w-cream)' }}
                  />
                </label>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center transition-opacity hover:opacity-100"
                    style={{ color: 'var(--w-muted)', opacity: 0.65 }}
                    aria-label="Clear all filters"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>

              <WatchesBrandNav
                brandOptions={brandOptions}
                totalCount={items.length}
                activeBrand={activeBrand}
                onChange={setActiveBrand}
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
              <FilterControl icon={<Boxes size={14} />} label="Category">
                <select
                  value={activeCategoryId}
                  onChange={(event) => setActiveCategoryId(event.target.value)}
                  className="h-11 w-full rounded-[4px] border bg-transparent px-3 text-xs uppercase tracking-[0.12em] outline-none"
                  style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream)' }}
                >
                  <option value="all" style={{ background: '#101114', color: '#f0ebe1' }}>All categories</option>
                  {categoryOptions.map(category => (
                    <option key={category.id} value={category.id} style={{ background: '#101114', color: '#f0ebe1' }}>
                      {category.name} ({category.count})
                    </option>
                  ))}
                </select>
              </FilterControl>

              <FilterControl icon={<CircleDollarSign size={14} />} label="Price">
                <select
                  value={priceBand}
                  onChange={(event) => setPriceBand(event.target.value as PriceBand)}
                  className="h-11 w-full rounded-[4px] border bg-transparent px-3 text-xs uppercase tracking-[0.12em] outline-none"
                  style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream)' }}
                >
                  <option value="all" style={{ background: '#101114', color: '#f0ebe1' }}>All prices</option>
                  {PRICE_BANDS.map(option => (
                    <option key={option.value} value={option.value} style={{ background: '#101114', color: '#f0ebe1' }}>
                      {getPriceBandLabel(option.value, displayCurrency, activeExchangeRate)}
                    </option>
                  ))}
                </select>
              </FilterControl>

              <FilterControl icon={<PackageCheck size={14} />} label="Availability">
                <select
                  value={availabilityFilter}
                  onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)}
                  className="h-11 w-full rounded-[4px] border bg-transparent px-3 text-xs uppercase tracking-[0.12em] outline-none"
                  style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream)' }}
                >
                  {AVAILABILITY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value} style={{ background: '#101114', color: '#f0ebe1' }}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FilterControl>

              <FilterControl icon={<ArrowDownUp size={14} />} label="Sort">
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  className="h-11 w-full rounded-[4px] border bg-transparent px-3 text-xs uppercase tracking-[0.12em] outline-none"
                  style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream)' }}
                >
                  {SORT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value} style={{ background: '#101114', color: '#f0ebe1' }}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FilterControl>
            </div>

            {hasActiveFilters && (
              <div
                className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4"
                style={{ borderColor: 'var(--w-border)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
              >
                <span className="mr-1 inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--w-muted)' }}>
                  <SlidersHorizontal size={13} />
                  {activeFilterCount} active
                </span>
                {searchQuery.trim() && (
                  <ActiveFilterChip label={`Search: ${searchQuery.trim()}`} onRemove={() => setSearchQuery('')} />
                )}
                {activeBrand && (
                  <ActiveFilterChip label={activeBrand} onRemove={() => setActiveBrand(null)} />
                )}
                {activeCollection && (
                  <ActiveFilterChip label={activeCollection.name} onRemove={() => setActiveCollectionId(null)} />
                )}
                {activeCategory && (
                  <ActiveFilterChip label={activeCategory.name} onRemove={() => setActiveCategoryId('all')} />
                )}
                {priceBand !== 'all' && (
                  <ActiveFilterChip label={activePriceBandLabel} onRemove={() => setPriceBand('all')} />
                )}
                {availabilityFilter !== 'all' && (
                  <ActiveFilterChip label={activeAvailabilityLabel} onRemove={() => setAvailabilityFilter('all')} />
                )}
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="ml-auto inline-flex h-9 items-center justify-center rounded-[4px] border px-3 text-[9px] uppercase tracking-[0.18em] transition-opacity hover:opacity-80"
                  style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream-2)' }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </section>

        {normalizedCollections.length > 0 && (
          <section id="featured-collections" className="px-5 py-8 sm:px-6 sm:py-10 lg:px-12 lg:py-14">
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
                    Composed by mood, metal, and occasion
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

              <div className={cn('grid gap-4', collectionGridClassName)}>
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
                            sizes={collectionImageSizes}
                            quality={75}
                            loading="lazy"
                            decoding="async"
                            unoptimized={shouldBypassNextImageOptimization(collection.imageUrl || previewItem?.imageUrl)}
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

        {shouldShowFeaturedSection && (
          <WatchesFeaturedSection
            items={featuredItems}
            stockMap={stockMap}
            brandByItemId={brandByItemId}
            cartQuantityByItemId={cartQuantityByItemId}
            displayCurrency={displayCurrency}
            exchangeRate={activeExchangeRate}
            onAddToCart={handleAddToCart}
            onQuickView={handleQuickView}
          />
        )}

        {/* ══ Browse Collection ════════════════════════ */}
        <section>
          <div
            id="new"
            className={cn(
              'scroll-mt-28 px-4 pt-4 sm:scroll-mt-32 sm:px-6 sm:pt-6 lg:px-12 lg:pt-8 max-w-screen-2xl mx-auto',
              showBrandSections ? 'pb-4 sm:pb-6 lg:pb-8' : 'pb-10 sm:pb-14 lg:pb-16'
            )}
          >
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-[9px] uppercase tracking-[0.35em]" style={{ color: 'var(--w-gold)' }}>
                  {showBrandSections ? 'Brand Edit' : 'Results'}
                </p>
                <h2
                  className="text-2xl font-light sm:text-3xl"
                  style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
                >
                  {showBrandSections
                    ? 'Browse by brand'
                    : activeCollection
                      ? activeCollection.name
                      : activeBrand
                        ? `${activeBrand} watches`
                        : 'Filtered watch edit'}
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--w-muted)' }}>
                {showBrandSections
                  ? `${brandSections.length} ${brandSections.length === 1 ? 'brand' : 'brands'} organized into clean rows. Use filters above when someone needs a tighter selection.`
                  : `${filteredItems.length} ${filteredItems.length === 1 ? 'piece' : 'pieces'} in the current edit. Availability refreshes every minute.`}
              </p>
            </div>

            {filteredItems.length === 0 ? (
              <EmptyState whatsappNumber={whatsappNumber} searchQuery={searchQuery} />
            ) : showBrandSections ? (
              <div className="space-y-0">
                {brandSections.map((section, index) => (
                  <WatchBrandSection
                    key={section.brand.name}
                    brand={section.brand}
                    items={section.items}
                    index={index}
                    stockMap={stockMap}
                    brandByItemId={brandByItemId}
                    cartQuantityByItemId={cartQuantityByItemId}
                    displayCurrency={displayCurrency}
                    exchangeRate={activeExchangeRate}
                    onAddToCart={handleAddToCart}
                    onQuickView={handleQuickView}
                    onViewBrand={handleViewBrand}
                  />
                ))}
              </div>
            ) : (
              <div className={cn('grid gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-7 lg:gap-x-5 lg:gap-y-8', catalogGridClassName)}>
                {filteredItems.map((item, index) => (
                  <WatchProductCard
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    brand={brandByItemId[item.id] ?? item.brand ?? undefined}
                    categoryName={item.category?.name ?? undefined}
                    imageUrl={item.imageUrl}
                    sellingPriceUsd={item.sellingPriceUsd ? Number(item.sellingPriceUsd) : null}
                    sellingPriceSrd={item.sellingPriceSrd ? Number(item.sellingPriceSrd) : null}
                    imageSizes={catalogImageSizes}
                    imagePriority={index < 6}
                    cartQuantity={getWatchesCartQuantity(cartItems, item.id)}
                    displayCurrency={displayCurrency}
                    exchangeRate={activeExchangeRate}
                    stockCount={stockMap[item.id] ?? 0}
                    compact
                    onAddToCart={handleAddToCart}
                    onQuickView={handleQuickView}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Atelier statement ────────────────────────── */}
        <AtelierSection />
        <WatchesAgencySection />

        <div id="about" />
      </main>

      <WatchesFooter
        whatsappNumber={whatsappNumber}
        logoUrl={watchesLogoUrl}
        storeAddress={watchesStoreAddress}
        storeDescription={watchesStoreDescription}
      />

      {quickViewItem && (
        <WatchQuickViewModal
          item={{
            id: quickViewItem.id,
            name: quickViewItem.name,
            brand: brandByItemId[quickViewItem.id] ?? quickViewItem.brand ?? undefined,
            imageUrl: quickViewItem.imageUrl,
            sellingPriceUsd: quickViewItem.sellingPriceUsd ? Number(quickViewItem.sellingPriceUsd) : null,
            sellingPriceSrd: quickViewItem.sellingPriceSrd ? Number(quickViewItem.sellingPriceSrd) : null,
            stockCount: stockMap[quickViewItem.id] ?? 0,
          }}
          displayCurrency={displayCurrency}
          exchangeRate={activeExchangeRate}
          onClose={() => setQuickViewItem(null)}
          onAddToCart={handleAddToCart}
        />
      )}

      {cartOpen && (
        <WatchCartDrawer
          open={cartOpen}
          items={cartItems}
          displayCurrency={displayCurrency}
          exchangeRate={activeExchangeRate}
          onClose={() => setCartOpen(false)}
          onUpdateQty={handleUpdateQty}
          onRemove={handleRemove}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          customerPhone={customerPhone}
          onCustomerPhoneChange={setCustomerPhone}
          customerNotes={customerNotes}
          onCustomerNotesChange={setCustomerNotes}
          onSubmitOrder={handleSubmitOrder}
        />
      )}
    </>
  )
}

interface WatchBrandSectionProps {
  brand: WatchBrandOption
  items: Item[]
  index: number
  stockMap: Record<string, number>
  brandByItemId: Record<string, string>
  cartQuantityByItemId: Record<string, number>
  displayCurrency: Currency
  exchangeRate: number
  onAddToCart: (id: string) => void
  onQuickView: (id: string) => void
  onViewBrand: (brandName: string) => void
}

function WatchBrandSection({
  brand,
  items,
  index,
  stockMap,
  brandByItemId,
  cartQuantityByItemId,
  displayCurrency,
  exchangeRate,
  onAddToCart,
  onQuickView,
  onViewBrand,
}: WatchBrandSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleItems = items.slice(0, 8)
  const shouldShowScrollControls = visibleItems.length > 3

  const scroll = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth',
    })
  }

  return (
    <section
      className="border-t py-8 sm:py-10 lg:py-12"
      style={{
        borderColor: 'var(--w-border)',
        background: index % 2 === 1 ? 'rgba(255,255,255,0.014)' : 'transparent',
      }}
    >
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className="mb-2 text-[9px] uppercase tracking-[0.35em]"
            style={{ color: 'var(--w-gold)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            Brand
          </p>
          <h3
            className="text-2xl font-light sm:text-3xl"
            style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            {brand.name}
          </h3>
          <p className="mt-2 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}>
            {brand.count} {brand.count === 1 ? 'piece' : 'pieces'} / {brand.inStockCount} available
          </p>
        </div>

        <div className="flex items-center gap-3">
          {shouldShowScrollControls && (
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => scroll('left')}
                className="flex h-9 w-9 items-center justify-center rounded-[4px] border transition-colors hover:border-[rgba(201,168,76,0.55)]"
                style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream-2)' }}
                aria-label={`Scroll ${brand.name} left`}
              >
                <ChevronLeft size={17} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                onClick={() => scroll('right')}
                className="flex h-9 w-9 items-center justify-center rounded-[4px] border transition-colors hover:border-[rgba(201,168,76,0.55)]"
                style={{ borderColor: 'var(--w-border)', color: 'var(--w-cream-2)' }}
                aria-label={`Scroll ${brand.name} right`}
              >
                <ChevronRight size={17} strokeWidth={1.7} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onViewBrand(brand.name)}
            className="inline-flex items-center gap-2 border-b pb-1 text-[10px] uppercase tracking-[0.2em] transition-opacity hover:opacity-80"
            style={{ borderColor: 'rgba(201,168,76,0.32)', color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            View brand
            <ArrowRight size={13} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-3 sm:gap-4 sm:px-0 lg:gap-5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {visibleItems.map((item, itemIndex) => (
            <div key={item.id} className="w-[min(72vw,18rem)] shrink-0 snap-start sm:w-[17rem] lg:w-[18rem]">
              <WatchProductCard
                id={item.id}
                name={item.name}
                brand={brandByItemId[item.id] ?? item.brand ?? undefined}
                categoryName={item.category?.name ?? undefined}
                imageUrl={item.imageUrl}
                sellingPriceUsd={item.sellingPriceUsd ? Number(item.sellingPriceUsd) : null}
                sellingPriceSrd={item.sellingPriceSrd ? Number(item.sellingPriceSrd) : null}
                imageSizes="(max-width: 640px) 72vw, (max-width: 1024px) 17rem, 18rem"
                imagePriority={index === 0 && itemIndex < 3}
                cartQuantity={cartQuantityByItemId[item.id] ?? 0}
                displayCurrency={displayCurrency}
                exchangeRate={exchangeRate}
                stockCount={stockMap[item.id] ?? 0}
                compact
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FilterControl({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label
      className="block rounded-[6px] border p-3"
      style={{ borderColor: 'var(--w-border)', background: 'rgba(17,17,19,0.5)' }}
    >
      <span className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--w-muted)' }}>
        {icon}
        {label}
      </span>
      {children}
    </label>
  )
}

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex h-9 max-w-full items-center gap-2 rounded-[4px] border px-3 text-[10px] uppercase tracking-[0.14em]"
      style={{
        borderColor: 'rgba(201,168,76,0.36)',
        background: 'rgba(201,168,76,0.08)',
        color: 'var(--w-cream)',
      }}
    >
      <span className="truncate">{label}</span>
      <X size={12} strokeWidth={1.7} />
    </button>
  )
}

function EmptyState({ whatsappNumber, searchQuery }: { whatsappNumber: string; searchQuery: string }) {
  const sanitizedNumber = whatsappNumber.replace(/[^0-9]/g, '')

  return (
    <div className="flex flex-col items-center py-28 lg:py-40">
      <div
        className="mb-10 flex h-24 w-24 items-center justify-center border"
        style={{ borderColor: 'rgba(201,168,76,0.24)', background: 'rgba(201,168,76,0.04)' }}
        aria-hidden="true"
      >
        <div className="h-12 w-px" style={{ background: 'rgba(201,168,76,0.22)' }} />
        <div className="mx-3 h-px w-10" style={{ background: 'rgba(201,168,76,0.22)' }} />
        <div className="h-12 w-px" style={{ background: 'rgba(201,168,76,0.22)' }} />
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
          ? 'No piece matches this brief right now. Contact us on WhatsApp and we can help source the right reference.'
          : 'The next edit is being prepared. Contact us on WhatsApp for first access when new references arrive.'}
      </p>

      <Link
        href={`https://wa.me/${sanitizedNumber}?text=Hello NextX, I would like to know more about your watch collection.`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-btn-gold inline-flex items-center gap-3 [&>span]:hidden"
      >
        Get Notified
        <ArrowRight size={14} strokeWidth={1.6} />
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
            The NextX Standard
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
            Selected With<br />
            <em style={{ color: 'var(--w-cream-2)' }}>Collector Restraint</em>
          </h2>
        </div>

        {/* Right — text */}
        <div className="flex flex-col gap-6">
          <div className="w-8 h-px" style={{ background: 'var(--w-gold-muted)' }} />
          <p
            className="text-sm font-light leading-loose"
            style={{ color: 'var(--w-cream-2)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            We favor timepieces with strong proportion, material honesty, and lasting presence. The goal is not noise, but pieces that still feel right years after the first impression.
          </p>
          <p
            className="text-sm font-light leading-loose"
            style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
          >
            From Suriname, NextX Watches offers personal guidance, transparent availability, and sourcing support for clients who prefer a more considered way to buy.
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
