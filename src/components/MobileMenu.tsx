'use client'

import { X, ChevronDown, Headphones, Watch } from 'lucide-react'
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
  Activity,
  Settings,
  ExternalLink,
  Layers,
  ClipboardList,
  Gauge,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdminCatalog } from '@/lib/adminCatalog'

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
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
  defaultExpanded?: boolean
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { catalog, setCatalog } = useAdminCatalog()
  
  // Auto-expand current section based on path
  const getCurrentSection = useCallback(() => {
    if (pathname.startsWith('/audio') || pathname.startsWith('/watches')) return 'Storefronts'
    if (pathname.startsWith('/orders') || pathname.startsWith('/sales') || pathname.startsWith('/reservations')) return 'Operations'
    if (pathname.startsWith('/exchange') || pathname.startsWith('/wallets') || pathname.startsWith('/expenses') || pathname.startsWith('/commissions') || pathname.startsWith('/budgets')) return 'Finance'
    if (pathname.startsWith('/reports') || pathname.startsWith('/performance') || pathname.startsWith('/activity')) return 'Analytics'
    if (pathname.startsWith('/settings')) return 'System'
    return 'Store'
  }, [pathname])
  
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    [getCurrentSection()]: true,
  })

  // Update expanded section when path changes
  useEffect(() => {
    const currentSection = getCurrentSection()
    setExpandedSections(prev => ({
      ...prev,
      [currentSection]: true,
    }))
  }, [getCurrentSection])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [isOpen])

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
        { name: 'Performance', icon: Gauge, path: '/performance' },
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

  const isItemActive = useMemo(() => (path: string) => {
    return pathname === path || (path !== '/dashboard' && path !== '/catalog' && pathname.startsWith(path))
  }, [pathname])

  const currentNavItem = useMemo(() => {
    return navSections.flatMap((section) => section.items).find((item) => isItemActive(item.path))
  }, [isItemActive, navSections])

  const currentSection = useMemo(() => getCurrentSection(), [getCurrentSection])

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }))
  }

  const handleNavigation = (path: string, external?: boolean) => {
    if (external) {
      window.open(path, '_blank', 'noopener,noreferrer')
    } else {
      router.push(path)
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-70 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Menu Panel */}
      <div className="lg:hidden fixed inset-y-0 left-0 h-dvh max-h-dvh w-[88vw] max-w-[360px] bg-gray-950/98 text-white z-80 animate-in slide-in-from-left duration-300 flex flex-col border-r border-gray-800/60 shadow-[0_18px_48px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Header */}
        <div className="relative overflow-hidden p-3 sm:p-4 border-b border-gray-800/50 shrink-0">
          <div className="absolute inset-0 bg-linear-to-br from-orange-500/10 via-transparent to-white/5" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative h-9 w-28 shrink-0">
                <Image
                  src="/nextx-logo-dark.png"
                  alt="NextX Logo"
                  width={112}
                  height={36}
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <button 
              type="button"
              onClick={onClose}
              className="p-2 sm:p-2.5 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors shrink-0"
              aria-label="Close menu"
            >
              <X size={22} />
            </button>
          </div>

          <div className="relative mt-3 sm:mt-4 rounded-xl sm:rounded-2xl border border-gray-800/70 bg-gray-900/80 p-2.5 sm:p-3">
            <div className="hidden sm:block text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">Current Workspace</div>
            <div className="flex items-center justify-between gap-3 sm:mt-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{currentNavItem?.name || 'Dashboard'}</div>
                <div className="text-[11px] sm:text-xs text-gray-400">{currentSection} section</div>
              </div>
              <div className="rounded-lg sm:rounded-xl border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-[11px] sm:text-xs font-semibold text-orange-300 shrink-0">
                {currentSection}
              </div>
            </div>

            <div className="mt-2.5 border-t border-gray-800/70 pt-2.5 sm:mt-3 sm:pt-3">
              <div className="hidden sm:block text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">Catalog Focus</div>
              <div className="grid grid-cols-2 gap-2 sm:mt-2">
                <button
                  type="button"
                  onClick={() => setCatalog('audio')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2 text-[13px] sm:text-sm font-semibold transition-colors ${
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
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2 text-[13px] sm:text-sm font-semibold transition-colors ${
                    catalog === 'watches'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-gray-800/70 text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Watch size={14} />
                  Watches
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Navigation */}
          <nav className="py-3 px-2">
            <div className="space-y-1">
              {navSections.map((section) => (
                <div key={section.title} className="mb-1">
                  {/* Section Header */}
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={expandedSections[section.title]}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider hover:text-gray-300 active:text-white transition-colors rounded-lg active:bg-gray-800/50"
                  >
                    <span>{section.title}</span>
                    <div className={`transition-transform duration-200 ${expandedSections[section.title] ? 'rotate-0' : '-rotate-90'}`}>
                      <ChevronDown size={16} />
                    </div>
                  </button>

                  {/* Section Items */}
                  <div className={`overflow-hidden transition-all duration-200 ${expandedSections[section.title] ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="space-y-0.5 py-1">
                      {section.items.map((item) => {
                        const Icon = item.icon
                        const isActive = isItemActive(item.path)
                        
                        return (
                          <button
                            type="button"
                            key={item.path}
                            onClick={() => handleNavigation(item.path, item.external)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 active:scale-[0.98] ${
                              isActive 
                                ? 'bg-linear-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25' 
                                : 'text-gray-400 hover:bg-gray-800/60 hover:text-white active:bg-gray-700/80'
                            }`}
                          >
                            <div className={`p-1.5 rounded-lg ${isActive ? 'bg-white/20' : 'bg-gray-800/50'}`}>
                              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                            </div>
                            <span className="font-medium text-sm flex-1 text-left">{item.name}</span>
                            {item.external && (
                              <ExternalLink size={14} className={isActive ? 'text-white/70' : 'text-gray-600'} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-gray-800/50 bg-gray-950/90 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="mb-3 rounded-2xl border border-gray-800 bg-gray-900/80 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Shared Admin Focus</div>
              <div className="mt-1 text-sm font-semibold text-white">{catalog === 'watches' ? 'Watches' : 'Audio'}</div>
              <div className="mt-1 text-xs text-gray-400">Stock, sales, reservations and shared reports follow this focus.</div>
            </div>
            <div className="text-center text-xs text-gray-500">
              <p className="font-semibold">NextX Dashboard v1.0</p>
              <p className="mt-0.5">© 2025 All rights reserved</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

