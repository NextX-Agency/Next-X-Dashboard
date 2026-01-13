'use client'

import { X, ChevronDown, ChevronRight, Search } from 'lucide-react'
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
  Store,
  ExternalLink,
  FileText,
  Layers,
  Image as ImageIcon,
  MessageSquareText,
  HelpCircle,
  FileEdit,
  ClipboardList,
  Newspaper
} from 'lucide-react'
import { useState, useEffect } from 'react'

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
  const [searchQuery, setSearchQuery] = useState('')
  
  // Auto-expand current section based on path
  const getCurrentSection = () => {
    if (pathname.startsWith('/cms')) return 'Content'
    if (pathname.startsWith('/orders') || pathname.startsWith('/sales') || pathname.startsWith('/reservations')) return 'Operations'
    if (pathname.startsWith('/exchange') || pathname.startsWith('/wallets') || pathname.startsWith('/expenses') || pathname.startsWith('/commissions') || pathname.startsWith('/budgets')) return 'Finance'
    if (pathname.startsWith('/reports') || pathname.startsWith('/activity')) return 'Analytics'
    if (pathname.startsWith('/settings')) return 'System'
    return 'Store'
  }
  
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
  }, [pathname])

  const navSections: NavSection[] = [
    {
      title: 'Store',
      items: [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { name: 'View Catalog', icon: Store, path: '/catalog', external: true },
        { name: 'Products', icon: Package, path: '/items' },
        { name: 'Stock', icon: Layers, path: '/stock' },
        { name: 'Locations', icon: MapPin, path: '/locations' },
      ],
    },
    {
      title: 'Content',
      items: [
        { name: 'CMS Hub', icon: FileText, path: '/cms' },
        { name: 'Blog', icon: Newspaper, path: '/cms/blog' },
        { name: 'Banners', icon: ImageIcon, path: '/cms/banners' },
        { name: 'Collections', icon: Layers, path: '/cms/collections' },
        { name: 'Pages', icon: FileEdit, path: '/cms/pages' },
        { name: 'Testimonials', icon: MessageSquareText, path: '/cms/testimonials' },
        { name: 'FAQ', icon: HelpCircle, path: '/cms/faq' },
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
        { name: 'Activity Log', icon: Activity, path: '/activity' },
      ],
    },
    {
      title: 'System',
      items: [
        { name: 'Settings', icon: Settings, path: '/settings' },
      ],
    },
  ]

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }))
  }

  const handleNavigation = (path: string, external?: boolean) => {
    if (external) {
      window.open(path, '_blank')
    } else {
      router.push(path)
    }
    onClose()
  }

  // Filter items based on search
  const filteredSections = searchQuery
    ? navSections.map(section => ({
        ...section,
        items: section.items.filter(item => 
          item.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(section => section.items.length > 0)
    : navSections

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Menu Panel */}
      <div className="lg:hidden fixed top-0 left-0 h-full w-[85vw] max-w-[320px] bg-gray-900 text-white z-50 animate-in slide-in-from-left duration-300 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative h-9 w-28">
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
            onClick={onClose}
            className="p-2.5 hover:bg-gray-800 active:bg-gray-700 rounded-xl transition-colors"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-800/30 flex-shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 overscroll-contain">
          <div className="space-y-1">
            {filteredSections.map((section) => (
              <div key={section.title} className="mb-1">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.title)}
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
                      const isActive = pathname === item.path || (item.path !== '/dashboard' && item.path !== '/catalog' && pathname.startsWith(item.path))
                      
                      return (
                        <button
                          key={item.path}
                          onClick={() => handleNavigation(item.path, item.external)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 active:scale-[0.98] ${
                            isActive 
                              ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25' 
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
        <div className="p-4 border-t border-gray-800/50 bg-gray-900/80 flex-shrink-0">
          <div className="text-center text-xs text-gray-500">
            <p className="font-semibold">NextX Dashboard v1.0</p>
            <p className="mt-0.5">© 2025 All rights reserved</p>
          </div>
        </div>
      </div>
    </>
  )
}

