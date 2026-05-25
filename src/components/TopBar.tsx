'use client'

import { Bell, Menu, DollarSign, LogOut, Headphones, Watch } from 'lucide-react'
import { useState, useCallback, useMemo, memo } from 'react'
import Image from 'next/image'
import MobileMenu from './MobileMenu'
import { useCurrency } from '@/lib/CurrencyContext'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useAdminCatalog } from '@/lib/adminCatalog'

function TopBarComponent() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { displayCurrency, setDisplayCurrency, exchangeRate } = useCurrency()
  const { user, logout } = useAuth()
  const { catalog, setCatalog } = useAdminCatalog()
  const router = useRouter()

  const handleLogout = useCallback(async () => {
    await logout()
    router.push('/login')
  }, [logout, router])

  // Memoize handlers
  const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), [])
  const toggleUserMenu = useCallback(() => setShowUserMenu(prev => !prev), [])
  const closeUserMenu = useCallback(() => setShowUserMenu(false), [])
  const setUSD = useCallback(() => setDisplayCurrency('USD'), [setDisplayCurrency])
  const setSRD = useCallback(() => setDisplayCurrency('SRD'), [setDisplayCurrency])
  const setAudioCatalog = useCallback(() => setCatalog('audio'), [setCatalog])
  const setWatchesCatalog = useCallback(() => setCatalog('watches'), [setCatalog])

  // Memoize user initial
  const userInitial = useMemo(() => 
    user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U',
    [user?.name, user?.email]
  )

  const userName = user?.name || user?.email || 'User'

  return (
    <>
      <header className="bg-gray-900/98 border-b border-gray-800/80 sticky top-0 z-40 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 px-3 lg:px-5 py-2 lg:py-2.5">
          <div className="flex items-center gap-2 lg:gap-3 flex-1 min-w-0">
            <button 
              onClick={openMobileMenu}
              className="lg:hidden p-2 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} className="text-gray-300" />
            </button>

            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <div className="relative h-7 w-16 lg:h-8 lg:w-20 shrink-0">
                <Image
                  src="/nextx-logo-dark.png"
                  alt="NextX"
                  width={80}
                  height={32}
                  className="object-contain"
                  priority
                />
              </div>
              <span className="hidden md:inline rounded-full border border-gray-700/70 bg-gray-800/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">
                Admin
              </span>
            </div>
            <div className="hidden lg:block h-7 w-px bg-gray-800/80" />
            <div className="hidden lg:block text-sm text-gray-400 truncate">
              Shared admin
            </div>
          </div>

          <div className="flex items-center gap-1.5 lg:gap-2">
            <div className="hidden xl:flex items-center gap-2 rounded-xl border border-gray-700/50 bg-gray-800/30 px-2 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Catalog</span>
              <div className="flex items-center gap-0.5 rounded-lg bg-gray-800/70 p-0.5">
                <button
                  onClick={setAudioCatalog}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    catalog === 'audio'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white active:bg-gray-700'
                  }`}
                >
                  <Headphones size={14} />
                  Audio
                </button>
                <button
                  onClick={setWatchesCatalog}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    catalog === 'watches'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white active:bg-gray-700'
                  }`}
                >
                  <Watch size={14} />
                  Watches
                </button>
              </div>
            </div>

            <div className="flex items-center gap-0.5 bg-gray-800/50 rounded-xl p-0.5 border border-gray-700/50">
              <button
                onClick={setUSD}
                className={`flex items-center gap-1 px-2 py-1.5 lg:px-3 lg:py-1.5 rounded-lg text-xs lg:text-sm font-semibold transition-all ${
                  displayCurrency === 'USD'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white active:bg-gray-700'
                }`}
              >
                <DollarSign size={14} />
                <span className="hidden sm:inline">USD</span>
              </button>
              <button
                onClick={setSRD}
                className={`flex items-center gap-1 px-2 py-1.5 lg:px-3 lg:py-1.5 rounded-lg text-xs lg:text-sm font-semibold transition-all ${
                  displayCurrency === 'SRD'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white active:bg-gray-700'
                }`}
              >
                <span className="hidden sm:inline">SRD</span>
                <span className="sm:hidden">S</span>
              </button>
            </div>

            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800/30 rounded-xl border border-gray-700/50 text-xs text-gray-400">
              <span>1 USD = {exchangeRate} SRD</span>
            </div>

            <button className="relative p-2 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors">
              <Bell size={18} className="text-gray-400" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-gray-900"></span>
            </button>

            <div className="relative">
              <button 
                onClick={toggleUserMenu}
                className="flex items-center gap-2 p-1 lg:px-2 lg:py-1.5 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
              >
                <div className="hidden xl:flex items-center">
                  <span className="text-sm font-semibold text-white truncate max-w-[140px]">{userName}</span>
                </div>
                <div className="w-8 h-8 lg:w-9 lg:h-9 bg-linear-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center text-white font-bold text-xs lg:text-sm shadow-lg shadow-orange-500/25">
                  {userInitial}
                </div>
              </button>
              
              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={closeUserMenu}
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
      </header>

      {/* Mobile Menu Drawer */}
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </>
  )
}

const TopBar = memo(TopBarComponent)
export default TopBar

