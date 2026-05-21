'use client'

import { memo, useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { 
  Package, 
  MapPin, 
  ShoppingCart, 
  Wallet, 
  Receipt, 
  DollarSign, 
  Users, 
  Calendar, 
  Target,
  BarChart3,
  LayoutDashboard,
  Menu,
  X,
  Activity,
  ClipboardList,
  Settings,
  Store,
  ExternalLink,
  Layers,
  ChevronDown,
  ChevronRight,
  Headphones,
  Watch
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  name: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  path: string
  external?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Store': true,
    'Operations': true,
    'Finance': true,
    'Analytics': true,
    'System': true,
  })

  const storefrontItems: NavItem[] = useMemo(() => [
    { name: 'Audio Catalog', icon: Headphones, path: '/audio', external: true },
    { name: 'Watches Catalog', icon: Watch, path: '/watches', external: true },
  ], [])

  // Memoize navigation sections to prevent recreation on each render
  const navSections: NavSection[] = useMemo(() => [
    {
      title: 'Store',
      items: [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { name: 'Products', icon: Package, path: '/items' },
        { name: 'Stock', icon: Layers, path: '/stock' },
        { name: 'Locations', icon: MapPin, path: '/locations' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { name: 'Orders', icon: ClipboardList, path: '/orders' },
        { name: 'Sales', icon: ShoppingCart, path: '/sales' },
        { name: 'Reservations', icon: Calendar, path: '/reservations' },
        { name: 'Invoices', icon: Receipt, path: '/invoices' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { name: 'Exchange', icon: DollarSign, path: '/exchange' },
        { name: 'Wallets', icon: Wallet, path: '/wallets' },
        { name: 'Expenses', icon: Receipt, path: '/expenses' },
        { name: 'Commissions', icon: Users, path: '/commissions' },
        { name: 'Budgets', icon: Target, path: '/budgets' },
      ],
    },
    {
      title: 'Analytics',
      items: [
        { name: 'Reports', icon: BarChart3, path: '/reports' },
        { name: 'Activity Log', icon: Activity, path: '/activity' },
      ],
    },
    {
      title: 'System',
      items: [
        { name: 'Settings', icon: Settings, path: '/settings' },
      ],
    },
  ], [])

  const toggleSection = useCallback((title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }))
  }, [])

  const handleNavigation = useCallback((path: string, isExternal?: boolean) => {
    if (isExternal) {
      window.open(path, '_blank', 'noopener,noreferrer')
    } else {
      router.push(path)
    }
  }, [router])

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [])

  return (
    <aside 
      className={`hidden lg:flex flex-col bg-linear-to-b from-gray-900 via-gray-900 to-black text-white transition-all duration-300 h-screen sticky top-0 border-r border-gray-800/50 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Premium Logo Section */}
      <div className="p-6 border-b border-gray-800/50 flex items-center justify-between backdrop-blur-sm">
        {!isCollapsed && (
          <div className="flex items-center gap-3 w-full">
            <div className="relative w-full h-12">
              <Image
                src="/nextx-logo-dark.png"
                alt="NextX Logo"
                width={200}
                height={48}
                className="object-contain"
                priority
              />
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="relative mx-auto w-12 h-12">
            <Image
              src="/nextx-logo-light.png"
              alt="NextX"
              width={48}
              height={48}
              className="object-contain"
              priority
            />
          </div>
        )}
      </div>

      <div className="border-b border-gray-800/40 px-3 py-4">
        {!isCollapsed ? (
          <div className="rounded-2xl border border-white/8 bg-white/4 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
            <div className="mb-3 flex items-center gap-3 px-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-orange-200">
                <Store size={17} strokeWidth={2.1} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Open Storefronts
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Open the live customer-facing sites in a new tab.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {storefrontItems.map((item) => {
                const Icon = item.icon
                const isAudio = item.path === '/audio'

                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavigation(item.path, item.external)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-gray-950/45 px-3 py-3 text-left transition-all duration-200 hover:bg-white/6"
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                      isAudio
                        ? 'border-orange-400/20 bg-orange-500/10 text-orange-200'
                        : 'border-amber-400/20 bg-amber-500/10 text-amber-100'
                    }`}>
                      <Icon size={18} strokeWidth={2.1} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {isAudio ? 'Public audio storefront' : 'Public watches storefront'}
                      </p>
                    </div>

                    <ExternalLink size={14} className="shrink-0 text-gray-500 transition-colors group-hover:text-gray-300" />
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {storefrontItems.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigation(item.path, item.external)}
                  className="flex h-12 w-full items-center justify-center rounded-2xl border border-white/8 bg-white/4 text-gray-400 transition-all duration-200 hover:bg-white/8 hover:text-white"
                  title={item.name}
                >
                  <Icon size={18} strokeWidth={2.1} />
                  <span className="sr-only">{item.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Premium Navigation with Sections */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <div className="space-y-2">
          {navSections.map((section) => (
            <div key={section.title} className="mb-2">
              {/* Section Header */}
              {!isCollapsed && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors"
                >
                  <span>{section.title}</span>
                  {expandedSections[section.title] ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              )}

              {/* Section Items */}
              {(isCollapsed || expandedSections[section.title]) && (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.path || (item.path !== '/dashboard' && item.path !== '/catalog' && pathname.startsWith(item.path))
                    const isExternal = item.external
                    
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNavigation(item.path, isExternal)}
                        className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group overflow-hidden ${
                          isActive 
                            ? 'bg-linear-to-br from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg shadow-orange-500/25' 
                            : 'text-gray-400 hover:bg-gray-800/60 hover:text-white'
                        }`}
                        title={isCollapsed ? item.name : undefined}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full shadow-lg" />
                        )}
                        
                        {/* Icon */}
                        <div className={`flex items-center justify-center transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`}>
                          <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'} />
                        </div>
                        
                        {/* Text */}
                        {!isCollapsed && (
                          <span className={`font-medium text-sm tracking-tight flex-1 text-left ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                            {item.name}
                          </span>
                        )}
                        
                        {/* External link indicator */}
                        {!isCollapsed && isExternal && (
                          <ExternalLink size={12} className="text-gray-500 group-hover:text-gray-300" />
                        )}
                        
                        {/* Hover shine effect */}
                        {!isActive && (
                          <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-500" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* Collapse Toggle */}
      <div className="p-3 border-t border-gray-800/50">
        <button
          onClick={toggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-800/60 hover:text-white transition-all"
        >
          {isCollapsed ? <Menu size={18} /> : <X size={18} />}
          {!isCollapsed && <span className="text-sm font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

export const MemoizedSidebar = memo(Sidebar)

