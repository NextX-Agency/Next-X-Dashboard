'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, ShoppingCart, Menu, X, ChevronDown, ExternalLink } from 'lucide-react'
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
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white">
        <div className="border-b border-neutral-100">
          <div className={catalogShellClassName}>
            <div className="flex h-10 items-center justify-between text-xs">
              <div className="hidden items-center gap-4 text-neutral-500 sm:flex">
                <span>Alleen afhalen • Geen bezorging</span>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="flex items-center gap-1 text-neutral-600">
                  <button
                    onClick={() => onCurrencyChange('SRD')}
                    className={`rounded px-2 py-0.5 transition-colors ${
                      currency === 'SRD' ? 'bg-[#f97015] text-white' : 'hover:bg-neutral-100'
                    }`}
                  >
                    SRD
                  </button>
                  <span className="text-neutral-300">/</span>
                  <button
                    onClick={() => onCurrencyChange('USD')}
                    className={`rounded px-2 py-0.5 transition-colors ${
                      currency === 'USD' ? 'bg-[#f97015] text-white' : 'hover:bg-neutral-100'
                    }`}
                  >
                    USD
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={catalogShellClassName}>
          <div className="flex h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4">
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
                  className="h-9 w-auto object-contain transition-all sm:h-10 lg:h-12"
                  priority
                />
              ) : (
                <span className="inline-block text-lg font-bold tracking-tight sm:text-xl">
                  <span className="text-[#141c2e]">Next</span>
                  <span className="text-[#f97015]">X</span>
                </span>
              )}
            </Link>

            <nav className="hidden items-center gap-6 lg:flex">
              <button
                onClick={() => onCategoryChange('')}
                className={`text-sm font-medium transition-colors ${
                  !selectedCategory ? 'text-[#f97015]' : 'text-[#141c2e]/70 hover:text-[#141c2e]'
                }`}
              >
                Producten
              </button>
              {categories.length > 0 && (
                <div className="relative group">
                  <button className="flex items-center gap-1 text-sm font-medium text-[#141c2e]/70 transition-colors hover:text-[#141c2e]">
                    Categorieën
                    <ChevronDown size={14} />
                  </button>
                  <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
                    <div className="min-w-[180px] rounded-xl border border-neutral-200 bg-white py-2 shadow-xl">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => onCategoryChange(cat.id)}
                          className={`w-full px-4 py-2 text-left text-sm transition-colors ${
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
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-2 rounded-lg border border-[#f97015]/50 bg-linear-to-r from-[#f97015]/90 to-[#f97015] px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:scale-[1.02] hover:from-[#f97015] hover:to-[#e5640d] hover:shadow-lg hover:shadow-[#f97015]/40 active:scale-95 xl:inline-flex"
              >
                NextX Agency
                <ExternalLink size={14} />
              </a>
            </nav>

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

              <button
                onClick={() => setShowSearch(!showSearch)}
                className={actionButtonClassName}
                aria-label={showSearch ? 'Sluit zoeken' : 'Open zoeken'}
              >
                <Search size={20} />
              </button>

              <button
                onClick={onCartClick}
                className={actionButtonClassName}
                aria-label="Open winkelwagen"
              >
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#f97015] px-1 text-[10px] font-bold text-white">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>

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

        {showSearch && (
          <div className="border-t border-neutral-100 bg-neutral-50">
            <div className={`${catalogShellClassName} py-4`}>
              <div className="relative mx-auto max-w-lg">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Zoek producten..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  autoFocus
                  className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-11 pr-10 text-sm text-[#141c2e] placeholder:text-neutral-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#f97015] sm:h-12 sm:text-base"
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

        {showMobileMenu && (
          <div className="border-t border-neutral-100 bg-white lg:hidden">
            <div className={`${catalogShellClassName} space-y-1 py-4`}>
              <a
                href="https://www.nextxagency.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 flex w-full items-center gap-2.5 rounded-lg border border-[#f97015]/50 bg-linear-to-r from-[#f97015]/90 to-[#f97015] px-4 py-3 text-sm font-bold text-white transition-all duration-200 hover:from-[#f97015] hover:to-[#e5640d] hover:shadow-lg hover:shadow-[#f97015]/30 active:scale-95"
              >
                <ExternalLink size={16} />
                <span>Bekijk NextX Agency</span>
              </a>
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

              <div className="mb-3 border-b border-neutral-100 pb-3">
                <button
                  onClick={() => {
                    onCategoryChange('')
                    setShowMobileMenu(false)
                  }}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${
                    !selectedCategory ? 'bg-[#f97015]/10 text-[#f97015]' : 'text-[#141c2e]/70 hover:bg-neutral-50'
                  }`}
                >
                  Alle Producten
                </button>
              </div>

              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Categorieën</p>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    onCategoryChange(cat.id)
                    setShowMobileMenu(false)
                  }}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${
                    selectedCategory === cat.id ? 'bg-[#f97015]/10 text-[#f97015]' : 'text-[#141c2e]/70 hover:bg-neutral-50'
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
