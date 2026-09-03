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
  FileCheck2,
  Settings,
  ExternalLink,
  Layers,
  ChevronDown,
  ChevronRight,
  Headphones,
  Watch,
  Gauge,
  ShoppingBag,
  Truck,
  BookOpen,
  Scale
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'nextx:sidebar-collapsed'
const SIDEBAR_EXPANDED_STORAGE_KEY = 'nextx:sidebar-expanded-sections'

/**
 * Navigation follows the work, not the feature list.
 *
 * The rail used to be twenty-two equal-weight destinations in loosely themed
 * buckets, which meant knowing where to click required knowing the codebase.
 * These groups are the actual business processes: sell to a customer, buy from
 * a supplier, keep the stock, move the money, close the books. The two open by
 * default are the two somebody uses every day.
 */
const DEFAULT_EXPANDED_SECTIONS: Record<string, boolean> = {
  Sell: true,
  Buy: false,
  Stock: true,
  Money: false,
  Books: false,
  Insights: false,
  Shops: false,
  Admin: false,
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
  const { user } = useAuth()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(DEFAULT_EXPANDED_SECTIONS)

  // Memoize navigation sections to prevent recreation on each render
  const navSections: NavSection[] = useMemo(() => user?.role === 'seller' ? [
    {
      title: 'Seller',
      items: [
        { name: 'My Workspace', icon: LayoutDashboard, path: '/seller' },
      ],
    },
  ] : [
    {
      title: 'Sell',
      items: [
        { name: 'Overview', icon: LayoutDashboard, path: '/dashboard' },
        { name: 'Order desk', icon: ShoppingBag, path: '/orders' },
        { name: 'Record a sale', icon: ShoppingCart, path: '/sales' },
        { name: 'Reservations', icon: Calendar, path: '/reservations' },
        { name: 'Invoices', icon: Receipt, path: '/invoices' },
      ],
    },
    {
      title: 'Buy',
      items: [
        { name: 'Purchase orders', icon: Truck, path: '/purchasing' },
        { name: 'Supplier bills', icon: FileCheck2, path: '/finance/review' },
      ],
    },
    {
      title: 'Stock',
      items: [
        { name: 'Products & pricing', icon: Package, path: '/items' },
        { name: 'Stock levels', icon: Layers, path: '/stock' },
        { name: 'Store locations', icon: MapPin, path: '/locations' },
      ],
    },
    {
      title: 'Money',
      items: [
        { name: 'Wallets & balances', icon: Wallet, path: '/wallets' },
        { name: 'Expenses', icon: Receipt, path: '/expenses' },
        { name: 'Commissions', icon: Users, path: '/commissions' },
        { name: 'Budgets', icon: Target, path: '/budgets' },
        { name: 'Exchange rate', icon: DollarSign, path: '/exchange' },
      ],
    },
    {
      title: 'Books',
      items: [
        { name: 'Finance overview', icon: Scale, path: '/finance' },
        { name: 'Review queue', icon: ClipboardList, path: '/finance/review' },
        { name: 'Month-end close', icon: BookOpen, path: '/finance/close' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { name: 'Reports', icon: BarChart3, path: '/reports' },
        { name: 'Performance', icon: Gauge, path: '/performance' },
        { name: 'Activity log', icon: Activity, path: '/activity' },
      ],
    },
    {
      title: 'Shops',
      items: [
        { name: 'Audio shop', icon: Headphones, path: '/audio', external: true },
        { name: 'Watch shop', icon: Watch, path: '/watches', external: true },
      ],
    },
    {
      title: 'Admin',
      items: [
        { name: 'Team access', icon: Users, path: '/team' },
        { name: 'Settings', icon: Settings, path: '/settings' },
      ],
    },
  ], [user?.role])

  const isItemActive = useCallback((path: string) => {
    const routePath = path.split('?')[0]
    return pathname === routePath || (routePath !== '/dashboard' && routePath !== '/catalog' && pathname.startsWith(routePath))
  }, [pathname])

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
      className={`hidden lg:flex flex-col bg-[#0b1017] text-white transition-all duration-300 h-dvh sticky top-0 border-r border-white/[0.08] ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Premium Logo Section */}
      <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
        {!isCollapsed && user?.role !== 'seller' && (
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
        <div className="space-y-2">
          {navSections.map((section) => (
            <div key={section.title} className="mb-2">
              {/* Section Header */}
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={expandedSections[section.title]}
                  className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.16em] hover:text-gray-300 transition-colors"
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
                            ? 'border border-orange-400/25 bg-orange-400/10 text-orange-100 shadow-[0_8px_22px_rgba(249,112,21,0.08)]'
                            : 'text-gray-400 hover:bg-white/[0.055] hover:text-white'
                        }`}
                        title={isCollapsed ? item.name : undefined}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-orange-300 rounded-r-full" />
                        )}
                        
                        {/* Icon */}
                        <div className={`flex items-center justify-center transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`}>
                          <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-orange-300' : 'text-gray-400 group-hover:text-white'} />
                        </div>
                        
                        {/* Text */}
                        {!isCollapsed && (
                          <span className={`font-medium text-sm tracking-tight flex-1 text-left ${isActive ? 'text-orange-100' : 'text-gray-300 group-hover:text-white'}`}>
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
      <div className="p-3 border-t border-white/[0.08]">
        <button
          type="button"
          onClick={toggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-white/[0.06] hover:text-white transition-all"
        >
          {isCollapsed ? <Menu size={18} /> : <X size={18} />}
          {!isCollapsed && <span className="text-sm font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

export const MemoizedSidebar = memo(Sidebar)

