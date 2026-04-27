'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, ShoppingCart, Menu, X, ChevronDown } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'

interface Category {
  id: string
  name: string
}

interface NewHeaderProps {
  storeName: string
  logoUrl?: string
  whatsappNumber: string
  categories: Category[]
  currency: 'SRD' | 'USD'
  onCurrencyChange: (currency: 'SRD' | 'USD') => void
  cartCount: number
  onCartClick: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedCategory: string
  onCategoryChange: (categoryId: string) => void
  onLogoClick?: () => void
}

export function NewHeader({
  storeName,
  logoUrl,
  whatsappNumber,
  categories,
  currency,
  onCurrencyChange,
  cartCount,
  onCartClick,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onLogoClick
}: NewHeaderProps) {
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const whatsappClean = whatsappNumber.replace(/[^0-9]/g, '')
  const actionButtonClassName = 'relative flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[#141c2e] shadow-[0_10px_24px_rgba(20,28,46,0.06)] [transition:all_0.3s_cubic-bezier(0.4,0,0.2,1)] hover:border-[#f97015]/40 hover:bg-[#fff7f2] active:scale-[0.96]'
  const utilityLinkClassName = 'inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-[#141c2e] shadow-[0_10px_24px_rgba(20,28,46,0.06)] [transition:all_0.3s_cubic-bezier(0.4,0,0.2,1)] hover:border-[#f97015]/40 hover:bg-[#fff7f2] active:scale-[0.98]'

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
        {/* Top bar */}
        <div className="border-b border-neutral-100">
          <div className={catalogShellClassName}>
            <div className="flex items-center justify-between h-10 text-xs">
              <div className="hidden sm:flex items-center gap-4 text-neutral-500">
                <span>Alleen afhalen • Geen bezorging</span>
              </div>
              <div className="flex items-center gap-4 ml-auto">
                {/* Currency Selector */}
                <div className="flex items-center gap-1 text-neutral-600">
                  <button
                    onClick={() => onCurrencyChange('SRD')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      currency === 'SRD' 
                        ? 'bg-[#f97015] text-white' 
                        : 'hover:bg-neutral-100'
                    }`}
                  >
                    SRD
                  </button>
                  <span className="text-neutral-300">/</span>
                  <button
                    onClick={() => onCurrencyChange('USD')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      currency === 'USD' 
                        ? 'bg-[#f97015] text-white' 
                        : 'hover:bg-neutral-100'
                    }`}
                  >
                    USD
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main header */}
        <div className={catalogShellClassName}>
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3 sm:gap-4">
            {/* Logo */}
            <Link 
              href="/catalog" 
              className="shrink-0 cursor-pointer transition-all duration-200 hover:opacity-80 active:scale-[0.98]"
              aria-label="Ga naar homepagina"
              onClick={(e) => {
                if (onLogoClick) {
                  e.preventDefault()
                  onLogoClick()
                }
              }}
            >
              {logoUrl ? (
                <Image 
                  src={logoUrl} 
                  alt={storeName} 
                  width={160} 
                  height={56} 
                  className="h-9 sm:h-10 lg:h-12 w-auto object-contain transition-all"
                  priority
                />
              ) : (
                <span className="text-lg sm:text-xl font-bold tracking-tight inline-block">
                  <span className="text-[#141c2e]">Next</span>
                  <span className="text-[#f97015]">X</span>
                </span>
              )}
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-6">
              <button
                onClick={() => onCategoryChange('')}
                className={`text-sm font-medium transition-colors ${
                  !selectedCategory 
                    ? 'text-[#f97015]' 
                    : 'text-[#141c2e]/70 hover:text-[#141c2e]'
                }`}
              >
                Producten
              </button>
              <Link
                href="/blog"
                className="text-sm font-medium text-[#141c2e]/70 hover:text-[#141c2e] transition-colors"
              >
                Blog
              </Link>
              <Link
                href="/faq"
                className="text-sm font-medium text-[#141c2e]/70 hover:text-[#141c2e] transition-colors"
              >
                FAQ
              </Link>
              <Link
                href="/testimonials"
                className="text-sm font-medium text-[#141c2e]/70 hover:text-[#141c2e] transition-colors"
              >
                Reviews
              </Link>
              {categories.length > 0 && (
                <div className="relative group">
                  <button className="flex items-center gap-1 text-sm font-medium text-[#141c2e]/70 hover:text-[#141c2e] transition-colors">
                    Categorieën
                    <ChevronDown size={14} />
                  </button>
                  <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    <div className="bg-white rounded-xl shadow-xl border border-neutral-200 py-2 min-w-[180px]">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => onCategoryChange(cat.id)}
                          className={`w-full px-4 py-2 text-sm text-left transition-colors ${
                            selectedCategory === cat.id
                              ? 'bg-[#f97015]/10 text-[#f97015]'
                              : 'text-[#141c2e]/70 hover:bg-[#f97015]/5 hover:text-[#141c2e]'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <a
                href={`https://wa.me/${whatsappClean}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${utilityLinkClassName} hidden sm:inline-flex`}
                aria-label="Chat met ons op WhatsApp"
              >
                <Image
                  src="/whatsapp.png"
                  alt="WhatsApp"
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px]"
                />
                <span>WhatsApp</span>
              </a>

              {/* Search Toggle */}
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={actionButtonClassName}
                aria-label={showSearch ? 'Sluit zoeken' : 'Open zoeken'}
              >
                <Search size={20} />
              </button>

              {/* Cart */}
              <button
                onClick={onCartClick}
                className={actionButtonClassName}
                aria-label="Open winkelwagen"
              >
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#f97015] text-white text-[10px] font-bold flex items-center justify-center">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className={`lg:hidden ${actionButtonClassName}`}
                aria-label={showMobileMenu ? 'Sluit menu' : 'Open menu'}
              >
                {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar (Expandable) */}
        {showSearch && (
          <div className="border-t border-neutral-100 bg-neutral-50">
            <div className={`${catalogShellClassName} py-4`}>
              <div className="relative max-w-lg mx-auto">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Zoek producten..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  autoFocus
                  className="w-full h-11 sm:h-12 pl-11 pr-10 rounded-xl bg-white border border-neutral-200 text-[#141c2e] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#f97015] focus:border-transparent transition-all text-sm sm:text-base"
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-neutral-100 bg-white">
            <div className={`${catalogShellClassName} py-4 space-y-1`}>
              <a
                href={`https://wa.me/${whatsappClean}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${utilityLinkClassName} mb-3 w-full justify-center`}
              >
                <Image
                  src="/whatsapp.png"
                  alt="WhatsApp"
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px]"
                />
                <span>Chat via WhatsApp</span>
              </a>

              {/* Main Pages */}
              <div className="pb-3 mb-3 border-b border-neutral-100">
                <button
                  onClick={() => {
                    onCategoryChange('')
                    setShowMobileMenu(false)
                  }}
                  className={`w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors ${
                    !selectedCategory 
                      ? 'bg-[#f97015]/10 text-[#f97015]' 
                      : 'text-[#141c2e]/70 hover:bg-neutral-50'
                  }`}
                >
                  Alle Producten
                </button>
                <Link
                  href="/blog"
                  onClick={() => setShowMobileMenu(false)}
                  className="w-full px-4 py-3 rounded-xl text-left text-sm font-medium text-[#141c2e]/70 hover:bg-neutral-50 transition-colors block"
                >
                  Blog
                </Link>
                <Link
                  href="/faq"
                  onClick={() => setShowMobileMenu(false)}
                  className="w-full px-4 py-3 rounded-xl text-left text-sm font-medium text-[#141c2e]/70 hover:bg-neutral-50 transition-colors block"
                >
                  FAQ
                </Link>
                <Link
                  href="/testimonials"
                  onClick={() => setShowMobileMenu(false)}
                  className="w-full px-4 py-3 rounded-xl text-left text-sm font-medium text-[#141c2e]/70 hover:bg-neutral-50 transition-colors block"
                >
                  Reviews
                </Link>
              </div>
              
              {/* Categories */}
              <p className="px-4 py-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Categorieën</p>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    onCategoryChange(cat.id)
                    setShowMobileMenu(false)
                  }}
                  className={`w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors ${
                    selectedCategory === cat.id 
                      ? 'bg-[#f97015]/10 text-[#f97015]' 
                      : 'text-[#141c2e]/70 hover:bg-neutral-50'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
    </>
  )
}
