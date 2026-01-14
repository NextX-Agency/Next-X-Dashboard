'use client'

import Link from 'next/link'
import { ChevronRight, MapPin, MessageCircle, Truck, Shield } from 'lucide-react'

// ===========================================
// BREADCRUMBS COMPONENT
// ===========================================
interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-sm ${className}`}>
      <ol className="flex items-center flex-wrap gap-1" itemScope itemType="https://schema.org/BreadcrumbList">
        {items.map((item, index) => (
          <li 
            key={index} 
            className="flex items-center"
            itemProp="itemListElement" 
            itemScope 
            itemType="https://schema.org/ListItem"
          >
            {index > 0 && (
              <ChevronRight size={14} className="mx-1.5 text-neutral-400" aria-hidden="true" />
            )}
            {item.href ? (
              <Link 
                href={item.href}
                className="text-[#f97015] hover:text-[#e5640d] hover:underline transition-colors"
                itemProp="item"
              >
                <span itemProp="name">{item.label}</span>
              </Link>
            ) : (
              <span className="text-neutral-600" itemProp="name">{item.label}</span>
            )}
            <meta itemProp="position" content={String(index + 1)} />
          </li>
        ))}
      </ol>
    </nav>
  )
}

// ===========================================
// SEO INTRO SECTION
// ===========================================
interface SEOIntroProps {
  title: string
  description: string
  showFeatures?: boolean
  className?: string
}

export function SEOIntro({ 
  title, 
  description, 
  showFeatures = true,
  className = '' 
}: SEOIntroProps) {
  return (
    <section className={`bg-gradient-to-b from-[#141c2e] to-[#1a2438] ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Main Heading - H1 for SEO */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
          {title}
        </h1>
        
        {/* SEO Description Paragraph */}
        <p className="text-white/70 text-sm sm:text-base max-w-3xl leading-relaxed mb-6">
          {description}
        </p>

        {/* Feature Pills */}
        {showFeatures && (
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 text-sm">
              <MapPin size={16} className="text-[#f97015]" />
              <span>Available in Suriname</span>
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 text-sm">
              <Truck size={16} className="text-[#f97015]" />
              <span>Local Pickup</span>
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 text-sm">
              <MessageCircle size={16} className="text-[#f97015]" />
              <span>Order via WhatsApp</span>
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/90 text-sm">
              <Shield size={16} className="text-[#f97015]" />
              <span>Trusted Quality</span>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

// ===========================================
// CATEGORY SEO HEADER
// ===========================================
interface CategorySEOHeaderProps {
  categoryName: string
  productCount: number
  description?: string
  className?: string
}

export function CategorySEOHeader({ 
  categoryName, 
  productCount, 
  description,
  className = '' 
}: CategorySEOHeaderProps) {
  return (
    <header className={`mb-6 ${className}`}>
      <h2 className="text-xl sm:text-2xl font-bold text-[#141c2e] mb-2">
        {categoryName}
      </h2>
      {description && (
        <p className="text-neutral-600 text-sm max-w-2xl mb-2">
          {description}
        </p>
      )}
      <p className="text-neutral-500 text-sm">
        {productCount} {productCount === 1 ? 'product' : 'producten'} beschikbaar in Suriname
      </p>
    </header>
  )
}

// ===========================================
// STRUCTURED DATA COMPONENTS
// ===========================================

interface ProductSchemaProps {
  products: Array<{
    id: string
    name: string
    description?: string | null
    image_url?: string | null
    selling_price_srd?: number | null
    selling_price_usd?: number | null
    stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock'
  }>
  storeName: string
  storeUrl: string
}

export function ProductListSchema({ products, storeName, storeUrl }: ProductSchemaProps) {
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${storeName} - Product Catalog`,
    "description": "Premium in-ear monitors and audio accessories available in Suriname",
    "numberOfItems": products.length,
    "itemListElement": products.slice(0, 20).map((product, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Product",
        "@id": `${storeUrl}/catalog/${product.id}`,
        "name": product.name,
        "description": product.description || `${product.name} - Available at ${storeName} in Suriname`,
        "image": product.image_url || `${storeUrl}/placeholder-product.jpg`,
        "url": `${storeUrl}/catalog/${product.id}`,
        "offers": {
          "@type": "Offer",
          "url": `${storeUrl}/catalog/${product.id}`,
          "priceCurrency": "SRD",
          "price": product.selling_price_srd || 0,
          "availability": product.stockStatus === 'out-of-stock' 
            ? "https://schema.org/OutOfStock" 
            : "https://schema.org/InStock",
          "seller": {
            "@type": "Organization",
            "name": storeName
          }
        }
      }
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
    />
  )
}

interface LocalBusinessSchemaProps {
  storeName: string
  storeDescription: string
  storeAddress: string
  whatsappNumber: string
  storeEmail?: string
  storeUrl: string
  logoUrl?: string
}

export function LocalBusinessSchema({
  storeName,
  storeDescription,
  storeAddress,
  whatsappNumber,
  storeEmail,
  storeUrl,
  logoUrl
}: LocalBusinessSchemaProps) {
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${storeUrl}/#localbusiness`,
    "name": storeName,
    "description": storeDescription || "Premium in-ear monitors and audio accessories store in Suriname",
    "url": storeUrl,
    "logo": logoUrl || `${storeUrl}/nextx-logo-light.png`,
    "image": logoUrl || `${storeUrl}/nextx-logo-light.png`,
    "telephone": whatsappNumber,
    "email": storeEmail,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": storeAddress,
      "addressRegion": "Commewijne",
      "addressCountry": "SR"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": "5.8664",
      "longitude": "-55.1668"
    },
    "priceRange": "$$",
    "currenciesAccepted": "SRD, USD",
    "paymentAccepted": "Cash, WhatsApp Order",
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      "opens": "09:00",
      "closes": "18:00"
    },
    "sameAs": [
      `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
    ],
    "areaServed": {
      "@type": "Country",
      "name": "Suriname"
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Audio Accessories Catalog",
      "itemListElement": [
        {
          "@type": "OfferCatalog",
          "name": "In-Ear Monitors",
          "description": "Premium IEM headphones and earphones"
        },
        {
          "@type": "OfferCatalog",
          "name": "Audio Accessories",
          "description": "Cables, cases, and audio gear"
        },
        {
          "@type": "OfferCatalog",
          "name": "Combo Deals",
          "description": "Special bundle offers"
        }
      ]
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
    />
  )
}

interface BreadcrumbSchemaProps {
  items: Array<{
    name: string
    url: string
  }>
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
    />
  )
}

interface WebsiteSchemaProps {
  storeName: string
  storeUrl: string
  storeDescription: string
}

export function WebsiteSchema({ storeName, storeUrl, storeDescription }: WebsiteSchemaProps) {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": storeName,
    "url": storeUrl,
    "description": storeDescription,
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${storeUrl}/catalog?search={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
    />
  )
}

// ===========================================
// SEO DEFAULT CONTENT
// ===========================================
export const SEO_CONTENT = {
  defaultTitle: "In-Ear Monitors & Audio Accessories in Suriname",
  defaultDescription: `Discover premium quality in-ear monitors and audio accessories at NextX Suriname. 
We offer a curated selection of KZ earphones, IEM headphones, audio cables, and exclusive combo deals. 
All products are available for local pickup in Commewijne with easy WhatsApp ordering. 
Whether you're an audiophile or just looking for reliable earbuds, find the perfect audio gear at competitive prices in Suriname.`,
  
  categoryDescriptions: {
    'in-ear-monitors': 'Browse our collection of premium in-ear monitors (IEMs) from top brands like KZ. Professional audio quality, comfortable fit, and exceptional value for audiophiles in Suriname.',
    'accessories': 'Essential audio accessories including cables, ear tips, cases, and more. Enhance your listening experience with quality add-ons available in Suriname.',
    'combos': 'Save more with our exclusive combo deals. Get complete audio setups at discounted prices, perfect for beginners and enthusiasts alike.'
  },

  keywords: [
    'in-ear monitors Suriname',
    'IEM headphones',
    'KZ earphones',
    'audio accessories Suriname',
    'buy earphones Suriname',
    'KZ ZSN Pro',
    'audiophile Suriname',
    'earbuds Suriname',
    'headphones Commewijne'
  ]
} as const
