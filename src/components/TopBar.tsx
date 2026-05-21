'use client'

import { Bell, Menu, DollarSign, LogOut } from 'lucide-react'
import { useState, useCallback, useMemo, memo } from 'react'
import Image from 'next/image'
import MobileMenu from './MobileMenu'
import { useCurrency } from '@/lib/CurrencyContext'
import { useAuth } from '@/lib/AuthContext'
import { usePathname, useRouter } from 'next/navigation'

type RouteMeta = {
  title: string
  subtitle: string
  section: string
}

function TopBarComponent() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { displayCurrency, setDisplayCurrency, exchangeRate } = useCurrency()
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = useCallback(async () => {
    await logout()
    router.push('/login')
  }, [logout, router])

  // Memoize page title computation
  const routeMeta = useMemo<RouteMeta>(() => {
    const routeEntries: Array<{ match: (path: string) => boolean; meta: RouteMeta }> = [
      {
        match: (path) => path === '/dashboard',
        meta: {
          title: 'Dashboard',
          subtitle: 'Track sales momentum, inventory pressure, and the live exchange rate in one place.',
          section: 'Store',
        },
      },
      {
        match: (path) => path.startsWith('/items'),
        meta: {
          title: 'Products',
          subtitle: 'Manage active inventory, pricing, and product readiness across the storefront.',
          section: 'Store',
        },
      },
      {
        match: (path) => path.startsWith('/stock'),
        meta: {
          title: 'Stock Management',
          subtitle: 'Review stock health, transfers, and quantity changes across every location.',
          section: 'Store',
        },
      },
      {
        match: (path) => path.startsWith('/locations'),
        meta: {
          title: 'Locations',
          subtitle: 'Compare store performance and operational setup by location.',
          section: 'Store',
        },
      },
      {
        match: (path) => path.startsWith('/orders'),
        meta: {
          title: 'Orders',
          subtitle: 'Monitor order flow, fulfillment state, and operational handoff.',
          section: 'Operations',
        },
      },
      {
        match: (path) => path.startsWith('/sales'),
        meta: {
          title: 'Sales',
          subtitle: 'Record new transactions quickly and keep recent sales accessible.',
          section: 'Operations',
        },
      },
      {
        match: (path) => path.startsWith('/reservations'),
        meta: {
          title: 'Reservations',
          subtitle: 'Track pending reservations and their revenue impact before conversion.',
          section: 'Operations',
        },
      },
      {
        match: (path) => path.startsWith('/invoices'),
        meta: {
          title: 'Invoices',
          subtitle: 'Keep issued invoices organized and ready for follow-up.',
          section: 'Operations',
        },
      },
      {
        match: (path) => path.startsWith('/exchange'),
        meta: {
          title: 'Exchange Rates',
          subtitle: 'Set the active conversion rate used across reporting and checkout.',
          section: 'Finance',
        },
      },
      {
        match: (path) => path.startsWith('/wallets'),
        meta: {
          title: 'Wallets',
          subtitle: 'See the cash position behind every location and payment channel.',
          section: 'Finance',
        },
      },
      {
        match: (path) => path.startsWith('/expenses'),
        meta: {
          title: 'Expenses',
          subtitle: 'Review outgoing cash and keep operating costs visible.',
          section: 'Finance',
        },
      },
      {
        match: (path) => path.startsWith('/commissions'),
        meta: {
          title: 'Commissions',
          subtitle: 'Follow seller payouts and margin impact without leaving the dashboard shell.',
          section: 'Finance',
        },
      },
      {
        match: (path) => path.startsWith('/budgets'),
        meta: {
          title: 'Budgets',
          subtitle: 'Compare spending plans to actual outflow before the month gets away from you.',
          section: 'Finance',
        },
      },
      {
        match: (path) => path.startsWith('/reports'),
        meta: {
          title: 'Reports & Insights',
          subtitle: 'Analyze profitability, costs, reservations, and performance trends from one report surface.',
          section: 'Analytics',
        },
      },
      {
        match: (path) => path.startsWith('/activity'),
        meta: {
          title: 'Activity Log',
          subtitle: 'Audit changes and recent admin actions across the business.',
          section: 'Analytics',
        },
      },
      {
        match: (path) => path.startsWith('/settings'),
        meta: {
          title: 'Settings',
          subtitle: 'Adjust system defaults, storefront configuration, and admin behavior.',
          section: 'System',
        },
      },
      {
        match: (path) => path === '/cms' || path.startsWith('/cms/'),
        meta: {
          title: pathname === '/cms' ? 'CMS Hub' : 'Content Management',
          subtitle: 'Manage public content, campaigns, and store presentation without leaving the admin shell.',
          section: 'System',
        },
      },
    ]

    const matchedRoute = routeEntries.find((entry) => entry.match(pathname))
    if (matchedRoute) return matchedRoute.meta

    const pathSegments = pathname.split('/').filter(Boolean)
    const fallbackTitle = pathSegments[0]
      ? pathSegments[0].charAt(0).toUpperCase() + pathSegments[0].slice(1).replace(/-/g, ' ')
      : 'Dashboard'

    return {
      title: fallbackTitle,
      subtitle: 'Manage the admin workspace with faster navigation and clearer context.',
      section: 'Workspace',
    }
  }, [pathname])

  // Memoize handlers
  const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), [])
  const toggleUserMenu = useCallback(() => setShowUserMenu(prev => !prev), [])
  const closeUserMenu = useCallback(() => setShowUserMenu(false), [])
  const setUSD = useCallback(() => setDisplayCurrency('USD'), [setDisplayCurrency])
  const setSRD = useCallback(() => setDisplayCurrency('SRD'), [setDisplayCurrency])

  // Memoize user initial
  const userInitial = useMemo(() => 
    user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U',
    [user?.name, user?.email]
  )

  const userName = user?.name || user?.email || 'User'

  return (
    <>
      <header className="bg-gray-900/98 border-b border-gray-800/80 sticky top-0 z-40 backdrop-blur-xl">
        <div className="flex items-center justify-between px-3 lg:px-6 py-3 lg:py-4">
          {/* Left Section - Mobile Menu & Logo/Title */}
          <div className="flex items-center gap-2 lg:gap-3 flex-1 min-w-0">
            <button 
              onClick={openMobileMenu}
              className="lg:hidden p-2 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} className="text-gray-300" />
            </button>
          
            {/* Mobile: Logo + Page Title */}
            <div className="lg:hidden flex items-center gap-2 min-w-0">
              <div className="relative h-7 w-16 shrink-0">
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
              <span className="text-sm font-semibold text-gray-300 truncate">{routeMeta.title}</span>
            </div>

            {/* Context Panel - Desktop */}
            <div className="hidden lg:flex min-w-0 flex-col">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="rounded-full border border-gray-700/70 bg-gray-800/70 px-2.5 py-1 font-semibold uppercase tracking-[0.18em] text-gray-300">
                  {routeMeta.section}
                </span>
                <span>Admin workspace</span>
              </div>
              <div className="mt-2 min-w-0">
                <h1 className="text-xl font-semibold text-white truncate">{routeMeta.title}</h1>
                <p className="text-sm text-gray-400 truncate">{routeMeta.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Right Section - Currency Toggle, Actions & Profile */}
          <div className="flex items-center gap-1.5 lg:gap-2">
            {/* Currency Toggle */}
            <div className="flex items-center gap-0.5 bg-gray-800/50 rounded-lg p-0.5 border border-gray-700/50">
              <button
                onClick={setUSD}
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
                onClick={setSRD}
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

            <div className="hidden md:flex items-center rounded-lg border border-gray-700/60 bg-gray-800/40 px-3 py-1.5 text-xs font-medium text-gray-300">
              {routeMeta.section}
            </div>

            {/* Notifications */}
            <button className="relative p-2 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors">
              <Bell size={20} className="text-gray-400" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-gray-900"></span>
            </button>

            {/* User Profile */}
            <div className="relative">
              <button 
                onClick={toggleUserMenu}
                className="flex items-center gap-2 p-1 lg:px-2 lg:py-1.5 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
              >
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-semibold text-white">{userName}</span>
                  <span className="text-xs text-gray-400 capitalize">{user?.role || 'Admin'}</span>
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

