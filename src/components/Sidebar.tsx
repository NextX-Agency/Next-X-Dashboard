'use client'

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
  FileText,
  Layers,
  Image as ImageIcon,
  MessageSquareText,
  HelpCircle,
  FileEdit,
  ChevronDown,
  ChevronRight,
  Newspaper
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
    'Content': true,
    'Operations': true,
    'Finance': true,
    'Analytics': true,
    'System': true,
  })

  const navSections: NavSection[] = [
    {
      title: 'Store',
      items: [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
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

  return (
    <aside 
      className={`hidden lg:flex flex-col bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white transition-all duration-300 h-screen sticky top-0 border-r border-gray-800/50 ${
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
                    const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))
                    const isExternal = item.external
                    
                    return (
                      <button
                        key={item.path}
                        onClick={() => {
                          if (isExternal) {
                            window.open(item.path, '_blank')
                          } else {
                            router.push(item.path)
                          }
                        }}
                        className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group overflow-hidden ${
                          isActive 
                            ? 'bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg shadow-orange-500/25' 
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
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-500" />
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
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-800/60 hover:text-white transition-all"
        >
          {isCollapsed ? <Menu size={18} /> : <X size={18} />}
          {!isCollapsed && <span className="text-sm font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

