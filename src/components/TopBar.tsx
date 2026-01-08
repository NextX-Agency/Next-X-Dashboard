'use client'

import { Bell, Search, Menu, DollarSign, LogOut, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import MobileMenu from './MobileMenu'
import { useCurrency } from '@/lib/CurrencyContext'
import { useAuth } from '@/lib/AuthContext'
import { useRouter, usePathname } from 'next/navigation'

export default function TopBar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const { displayCurrency, setDisplayCurrency, exchangeRate } = useCurrency()
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close mobile search when navigating
  useEffect(() => {
    setShowMobileSearch(false)
  }, [pathname])

  // Focus search input when opened
  useEffect(() => {
    if (showMobileSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showMobileSearch])

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  // Get page title from pathname
  const getPageTitle = () => {
    const path = pathname.split('/').filter(Boolean)
    if (path.length === 0) return 'Dashboard'
    if (path[0] === 'cms') {
      if (path.length === 1) return 'CMS Hub'
      return path[1].charAt(0).toUpperCase() + path[1].slice(1)
    }
    return path[0].charAt(0).toUpperCase() + path[0].slice(1)
  }

  return (
    <>
      <header className="bg-gray-900/98 border-b border-gray-800/80 sticky top-0 z-40 backdrop-blur-xl">
        <div className="flex items-center justify-between px-3 lg:px-6 py-2.5 lg:py-3">
          {/* Left Section - Mobile Menu & Logo/Title */}
          <div className="flex items-center gap-2 lg:gap-3 flex-1 min-w-0">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} className="text-gray-300" />
            </button>
          
            {/* Mobile: Logo + Page Title */}
            <div className="lg:hidden flex items-center gap-2 min-w-0">
              <div className="relative h-7 w-16 flex-shrink-0">
                <Image
                  src="/nextx-logo-dark.png"
                  alt="NextX"
                  width={64}
                  height={28}
                  className="object-contain"
                  priority
                />
              </div>
              <div className="w-px h-5 bg-gray-700" />
              <span className="text-sm font-semibold text-gray-300 truncate">{getPageTitle()}</span>
            </div>

            {/* Search Bar - Desktop */}
            <div className="hidden lg:flex items-center gap-3 bg-gray-800/50 rounded-xl px-4 py-2.5 w-full max-w-md border border-gray-700/50 focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:bg-gray-800/70 transition-all">
              <Search size={18} className="text-gray-500" />
              <input
                type="text"
                placeholder="Search anything..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm text-white placeholder-gray-500 w-full font-medium"
              />
            </div>
          </div>

          {/* Right Section - Currency Toggle, Actions & Profile */}
          <div className="flex items-center gap-1.5 lg:gap-2">
            {/* Currency Toggle */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
              <button
                onClick={() => setDisplayCurrency('USD')}
                className={`flex items-center gap-1 px-2 py-1.5 lg:px-3 lg:py-1.5 rounded-md text-xs lg:text-sm font-semibold transition-all ${
                  displayCurrency === 'USD'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white active:bg-gray-700'
                }`}
              >
                <DollarSign size={14} />
                <span className="hidden sm:inline">USD</span>
              </button>
              <button
                onClick={() => setDisplayCurrency('SRD')}
                className={`flex items-center gap-1 px-2 py-1.5 lg:px-3 lg:py-1.5 rounded-md text-xs lg:text-sm font-semibold transition-all ${
                  displayCurrency === 'SRD'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white active:bg-gray-700'
                }`}
              >
                <span className="hidden sm:inline">SRD</span>
                <span className="sm:hidden">S</span>
              </button>
            </div>

            {/* Exchange Rate Display - Desktop only */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800/30 rounded-lg border border-gray-700/50 text-xs text-gray-400">
              <span>1 USD = {exchangeRate} SRD</span>
            </div>

            {/* Search Icon - Mobile */}
            <button 
              onClick={() => setShowMobileSearch(!showMobileSearch)}
              className="lg:hidden p-2 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
              aria-label="Search"
            >
              {showMobileSearch ? (
                <X size={20} className="text-gray-400" />
              ) : (
                <Search size={20} className="text-gray-400" />
              )}
            </button>

            {/* Notifications */}
            <button className="relative p-2 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors">
              <Bell size={20} className="text-gray-400" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-gray-900"></span>
            </button>

            {/* User Profile */}
            <div className="relative">
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1 lg:px-2 lg:py-1.5 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
              >
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-semibold text-white">{user?.name || user?.email || 'User'}</span>
                  <span className="text-xs text-gray-400 capitalize">{user?.role || 'Admin'}</span>
                </div>
                <div className="w-8 h-8 lg:w-9 lg:h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center text-white font-bold text-xs lg:text-sm shadow-lg shadow-orange-500/25">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              </button>
              
              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-xl shadow-xl border border-gray-700 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-3 border-b border-gray-700">
                      <p className="text-sm font-semibold text-white truncate">{user?.email}</p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">{user?.role}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
                    >
                      <LogOut size={18} />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Search Bar - Expandable */}
        {showMobileSearch && (
          <div className="lg:hidden px-3 pb-3 animate-in slide-in-from-top duration-200">
            <div className="relative flex items-center gap-2 bg-gray-800/70 rounded-xl px-4 py-2.5 border border-gray-700/50 focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/20">
              <Search size={18} className="text-gray-500 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm text-white placeholder-gray-500 w-full font-medium"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="p-1 hover:bg-gray-700 rounded-lg"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Mobile Menu Drawer */}
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </>
  )
}

