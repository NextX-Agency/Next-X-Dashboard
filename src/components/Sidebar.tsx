'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
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
  ExternalLink,
  Layers,
  ChevronDown,
  ChevronRight,
  Headphones,
  Watch
} from 'lucide-react'
import { useAdminCatalog } from '@/lib/adminCatalog'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'nextx:sidebar-collapsed'
const SIDEBAR_EXPANDED_STORAGE_KEY = 'nextx:sidebar-expanded-sections'

const DEFAULT_EXPANDED_SECTIONS: Record<string, boolean> = {
  Store: true,
  Storefronts: true,
  Operations: true,
  Finance: true,
  Analytics: true,
  System: true,
}

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
  const { catalog, setCatalog } = useAdminCatalog()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(DEFAULT_EXPANDED_SECTIONS)

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
      title: 'Storefronts',
      items: [
        { name: 'Audio Catalog', icon: Headphones, path: '/audio', external: true },
        { name: 'Watches Catalog', icon: Watch, path: '/watches', external: true },
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

  const isItemActive = useCallback((path: string) => {
    const routePath = path.split('?')[0]
    return pathname === routePath || (routePath !== '/dashboard' && routePath !== '/catalog' && pathname.startsWith(routePath))
  }, [pathname])

  const currentNavSection = useMemo(() => (
    navSections.find((section) => section.items.some((item) => isItemActive(item.path)))
  ), [navSections, isItemActive])

  const currentNavItem = useMemo(() => (
    currentNavSection?.items.find((item) => isItemActive(item.path))
  ), [currentNavSection, isItemActive])

  useEffect(() => {
    try {
      const storedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
      const storedSections = localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY)

      if (storedCollapsed !== null) {
        setIsCollapsed(storedCollapsed === 'true')
      }

      if (storedSections) {
        setExpandedSections({
          ...DEFAULT_EXPANDED_SECTIONS,
          ...JSON.parse(storedSections) as Record<string, boolean>,
        })
      }
    } catch (error) {
      console.error('Unable to restore sidebar state:', error)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed))
    } catch {
      // Ignore persistence failures for local navigation preferences.
    }
  }, [isCollapsed])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, JSON.stringify(expandedSections))
    } catch {
      // Ignore persistence failures for local navigation preferences.
    }
  }, [expandedSections])

  const toggleSection = useCallback((title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }))
  }, [])

  const handleNavigation = useCallback((path: string, isExternal?: boolean) => {
    if (isExternal) {
      window.open(path, '_blank')
    } else {
      router.push(path)
    }
  }, [router])

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [])

  return (
    <aside 
      className={`hidden lg:flex flex-col bg-linear-to-b from-slate-950 via-gray-950 to-black text-white transition-all duration-300 h-screen sticky top-0 border-r border-gray-800/50 ${
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

      {/* Premium Navigation with Sections */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        {!isCollapsed && (
          <div className="mb-4 rounded-2xl border border-gray-800/60 bg-gray-900/70 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">Catalog Focus</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setCatalog('audio')}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  catalog === 'audio'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-800/70 text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Headphones size={14} />
                Audio
              </button>
              <button
                type="button"
                onClick={() => setCatalog('watches')}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  catalog === 'watches'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-800/70 text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Watch size={14} />
                Watches
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Shared pages stay the same. Their data focus follows this selection.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {navSections.map((section) => (
            <div key={section.title} className="mb-2">
              {/* Section Header */}
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={expandedSections[section.title]}
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
                    const isActive = isItemActive(item.path)
                    const isExternal = item.external
                    
                    return (
                      <button
                        type="button"
                        key={item.path}
                        onClick={() => handleNavigation(item.path, isExternal)}
                        aria-current={isActive ? 'page' : undefined}
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
          type="button"
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

