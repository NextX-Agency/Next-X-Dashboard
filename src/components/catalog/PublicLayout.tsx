'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCurrency } from '@/lib/CurrencyContext'

interface Category {
  id: string
  name: string
}

interface StoreSettings {
  store_name: string
  store_logo_url: string
  store_description: string
  store_address: string
  whatsapp_number: string
  store_email: string
}

interface PublicLayoutProps {
  children: React.ReactNode
  pageTitle?: string
  activeRoute?: string
}

export function PublicLayout({
  children,
  pageTitle,
  activeRoute
}: PublicLayoutProps) {
  const [settings, setSettings] = useState<StoreSettings>({
    store_name: 'NextX',
    store_logo_url: '',
    store_description: '',
    store_address: '',
    whatsapp_number: '',
    store_email: ''
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [loading, setLoading] = useState(true)
  const { displayCurrency, setDisplayCurrency } = useCurrency()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [settingsRes, categoriesRes] = await Promise.all([
        supabase.from('store_settings').select('*'),
        supabase.from('categories').select('id, name').order('name')
      ])

      if (settingsRes.data) {
        const settingsMap: Record<string, string> = {}
        settingsRes.data.forEach((s: { key: string; value: string }) => {
          settingsMap[s.key] = s.value
        })
        setSettings({
          store_name: settingsMap.store_name || 'NextX',
          store_logo_url: settingsMap.store_logo_url || '',
          store_description: settingsMap.store_description || '',
          store_address: settingsMap.store_address || '',
          whatsapp_number: settingsMap.whatsapp_number || '',
          store_email: settingsMap.store_email || ''
        })
      }

      if (categoriesRes.data) {
        setCategories(categoriesRes.data)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
    setLoading(false)
  }

  const whatsappClean = settings.whatsapp_number.replace(/[^0-9]/g, '')
  const currentYear = new Date().getFullYear()

  // Determine active route for highlighting
  const isActive = (route: string) => {
    if (activeRoute) return activeRoute === route
    if (route === '/blog') return pageTitle === 'Blog'
    if (route === '/faq') return pageTitle === 'FAQ'
    if (route === '/testimonials') return pageTitle === 'Reviews'
    return false
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header - Matches catalog NewHeader design exactly */}
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
        {/* Top bar - Same as catalog */}
        <div className="border-b border-neutral-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-10 text-xs">
              <div className="hidden sm:flex items-center gap-4 text-neutral-500">
                <span>Alleen afhalen • Geen bezorging</span>
              </div>
              <div className="flex items-center gap-4 ml-auto">
                {/* Currency Selector - Same as catalog */}
                <div className="flex items-center gap-1 text-neutral-600">
                  <button
                    onClick={() => setDisplayCurrency('SRD')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      displayCurrency === 'SRD' 
                        ? 'bg-[#f97015] text-white' 
                        : 'hover:bg-neutral-100'
                    }`}
                  >
                    SRD
                  </button>
                  <span className="text-neutral-300">/</span>
                  <button
                    onClick={() => setDisplayCurrency('USD')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      displayCurrency === 'USD' 
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

        {/* Main header - Same structure as catalog */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <Link
              href="/catalog"
              className="shrink-0 cursor-pointer transition-all duration-200 hover:opacity-80 active:scale-[0.98]"
              aria-label="Ga naar homepagina"
            >
              {settings.store_logo_url ? (
                <Image
                  src={settings.store_logo_url}
                  alt={settings.store_name}
                  width={160}
                  height={56}
                  className="h-12 w-auto object-contain"
                  priority
                />
              ) : (
                <span className="text-xl font-bold tracking-tight inline-block">
                  <span className="text-[#141c2e]">Next</span>
                  <span className="text-[#f97015]">X</span>
                </span>
              )}
            </Link>

            {/* Desktop Navigation - Centered */}
            <nav className="hidden lg:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
              <Link
                href="/catalog"
                className="text-sm font-medium text-[#141c2e]/70 hover:text-[#141c2e] transition-colors whitespace-nowrap"
              >
                Producten
              </Link>
              <Link
                href="/blog"
                className={`text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive('/blog') 
                    ? 'text-[#f97015]' 
                    : 'text-[#141c2e]/70 hover:text-[#141c2e]'
                }`}
              >
                Blog
              </Link>
              <Link
                href="/faq"
                className={`text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive('/faq') 
                    ? 'text-[#f97015]' 
                    : 'text-[#141c2e]/70 hover:text-[#141c2e]'
                }`}
              >
                FAQ
              </Link>
              <Link
                href="/testimonials"
                className={`text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive('/testimonials') 
                    ? 'text-[#f97015]' 
                    : 'text-[#141c2e]/70 hover:text-[#141c2e]'
                }`}
              >
                Reviews
              </Link>
              {categories.length > 0 && (
                <div className="relative group">
                  <button className="flex items-center gap-1 text-sm font-medium text-[#141c2e]/70 hover:text-[#141c2e] transition-colors whitespace-nowrap">
                    Categorieën
                    <ChevronDown size={14} />
                  </button>
                  <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    <div className="bg-white rounded-xl shadow-xl border border-neutral-200 py-2 min-w-[180px]">
                      {categories.map((cat) => (
                        <Link
                          key={cat.id}
                          href={`/catalog?category=${cat.id}`}
                          className="w-full px-4 py-2 text-sm text-left text-[#141c2e]/70 hover:bg-[#f97015]/5 hover:text-[#141c2e] transition-colors block"
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </nav>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden w-10 h-10 rounded-full flex items-center justify-center text-[#141c2e] hover:bg-[#f97015]/10 transition-colors"
            >
              {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
            
            {/* Spacer for desktop to balance layout */}
            <div className="hidden lg:block w-10"></div>
          </div>
        </div>

        {/* Mobile Menu - Same structure as catalog */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-neutral-100 bg-white">
            <div className="px-4 py-4 space-y-1">
              {/* Main Pages */}
              <div className="pb-3 mb-3 border-b border-neutral-100">
                <Link
                  href="/catalog"
                  onClick={() => setShowMobileMenu(false)}
                  className="w-full px-4 py-3 rounded-xl text-left text-sm font-medium text-[#141c2e]/70 hover:bg-neutral-50 transition-colors block"
                >
                  Alle Producten
                </Link>
                <Link
                  href="/blog"
                  onClick={() => setShowMobileMenu(false)}
                  className={`w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors block ${
                    isActive('/blog') 
                      ? 'bg-[#f97015]/10 text-[#f97015]' 
                      : 'text-[#141c2e]/70 hover:bg-neutral-50'
                  }`}
                >
                  Blog
                </Link>
                <Link
                  href="/faq"
                  onClick={() => setShowMobileMenu(false)}
                  className={`w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors block ${
                    isActive('/faq') 
                      ? 'bg-[#f97015]/10 text-[#f97015]' 
                      : 'text-[#141c2e]/70 hover:bg-neutral-50'
                  }`}
                >
                  FAQ
                </Link>
                <Link
                  href="/testimonials"
                  onClick={() => setShowMobileMenu(false)}
                  className={`w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors block ${
                    isActive('/testimonials') 
                      ? 'bg-[#f97015]/10 text-[#f97015]' 
                      : 'text-[#141c2e]/70 hover:bg-neutral-50'
                  }`}
                >
                  Reviews
                </Link>
              </div>
              
              {/* Categories */}
              {categories.length > 0 && (
                <>
                  <p className="px-4 py-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Categorieën</p>
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      href={`/catalog?category=${cat.id}`}
                      onClick={() => setShowMobileMenu(false)}
                      className="w-full px-4 py-3 rounded-xl text-left text-sm font-medium text-[#141c2e]/70 hover:bg-neutral-50 transition-colors block"
                    >
                      {cat.name}
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-neutral-50 text-[#141c2e] border-t border-neutral-200">
        {/* Main Footer */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="lg:col-span-1">
              {settings.store_logo_url ? (
                <Image
                  src={settings.store_logo_url}
                  alt={settings.store_name}
                  width={120}
                  height={40}
                  className="h-8 w-auto object-contain mb-4"
                />
              ) : (
                <span className="text-xl font-bold block mb-4">
                  <span className="text-[#141c2e]">Next</span>
                  <span className="text-[#f97015]">X</span>
                </span>
              )}
              {settings.store_description && (
                <p className="text-sm text-[#141c2e]/60 mb-6 leading-relaxed">
                  {settings.store_description}
                </p>
              )}
              {settings.whatsapp_number && (
                <a
                  href={`https://wa.me/${whatsappClean}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#f97015] text-white text-sm font-medium hover:bg-[#e5640d] transition-colors"
                >
                  WhatsApp
                </a>
              )}
            </div>

            {/* Categories Column */}
            <div>
              <h4 className="font-semibold text-[#f97015] mb-4">
                Categorieën
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/catalog"
                    className="text-sm text-[#f97015] hover:text-[#e5640d] hover:underline transition-all duration-300 font-medium"
                  >
                    Alle Producten
                  </Link>
                </li>
                {categories.slice(0, 5).map((cat) => (
                  <li key={cat.id}>
                    <Link
                      href={`/catalog?category=${cat.id}`}
                      className="text-sm text-[#f97015] hover:text-[#e5640d] hover:underline transition-all duration-300 font-medium"
                    >
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Info Column */}
            <div>
              <h4 className="font-semibold text-[#f97015] mb-4">
                Informatie
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/blog" className="text-sm text-[#f97015] hover:text-[#e5640d] hover:underline transition-all duration-300 font-medium">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="text-sm text-[#f97015] hover:text-[#e5640d] hover:underline transition-all duration-300 font-medium">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link href="/testimonials" className="text-sm text-[#f97015] hover:text-[#e5640d] hover:underline transition-all duration-300 font-medium">
                    Reviews
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact Column */}
            <div>
              <h4 className="font-semibold text-[#f97015] mb-4">
                Contact
              </h4>
              <ul className="space-y-4">
                {settings.store_address && (
                  <li className="text-sm text-[#141c2e]/60">
                    <p className="text-xs text-[#141c2e]/40 mb-0.5">Afhaallocatie</p>
                    <p>{settings.store_address}</p>
                  </li>
                )}
                {settings.whatsapp_number && (
                  <li>
                    <a
                      href={`https://wa.me/${whatsappClean}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#f97015] hover:text-[#e5640d] font-medium transition-colors"
                    >
                      {settings.whatsapp_number}
                    </a>
                  </li>
                )}
                {settings.store_email && (
                  <li>
                    <a
                      href={`mailto:${settings.store_email}`}
                      className="text-sm text-[#f97015] hover:text-[#e5640d] font-medium transition-colors"
                    >
                      {settings.store_email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-neutral-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-[#141c2e]/50">
                © {currentYear} {settings.store_name}. Alle rechten voorbehouden.
              </p>
              <p className="text-sm text-[#141c2e]/30">
                Powered by <span className="text-[#f97015]">NextX</span>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
