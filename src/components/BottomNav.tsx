'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  BarChart3, 
  FileText,
  Layers,
  Plus
} from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()
  const isCMSSection = pathname.startsWith('/cms')

  // Context-aware navigation - show CMS nav when in CMS section
  const defaultNavItems = [
    { name: 'Home', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Sales', icon: ShoppingCart, path: '/sales' },
    { name: 'Stock', icon: Package, path: '/stock' },
    { name: 'Reports', icon: BarChart3, path: '/reports' },
    { name: 'CMS', icon: FileText, path: '/cms' },
  ]

  const cmsNavItems = [
    { name: 'CMS Hub', icon: FileText, path: '/cms' },
    { name: 'Blog', icon: FileText, path: '/cms/blog' },
    { name: 'Banners', icon: Layers, path: '/cms/banners' },
    { name: 'Pages', icon: FileText, path: '/cms/pages' },
    { name: 'Home', icon: LayoutDashboard, path: '/dashboard' },
  ]

  const navItems = isCMSSection ? cmsNavItems : defaultNavItems

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900/98 backdrop-blur-xl border-t border-gray-800/80 z-50">
      {/* Safe area padding for devices with home indicators */}
      <div className="flex justify-around items-center h-16 px-1 pb-safe">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.path || 
            (item.path !== '/dashboard' && item.path !== '/cms' && pathname.startsWith(item.path))
          const isExactCMS = item.path === '/cms' && pathname === '/cms'
          const isActiveState = isActive || isExactCMS
          
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full relative transition-all duration-200 active:scale-95 ${
                isActiveState ? 'text-orange-500' : 'text-gray-500 active:text-gray-300'
              }`}
            >
              {isActiveState && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-orange-500 to-orange-400 rounded-b-full" />
              )}
              <div className={`p-2 rounded-2xl transition-all duration-200 ${
                isActiveState 
                  ? 'bg-orange-500/15 scale-110' 
                  : 'active:bg-gray-800'
              }`}>
                <Icon size={22} strokeWidth={isActiveState ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] mt-0.5 font-semibold transition-colors ${
                isActiveState ? 'text-orange-500' : 'text-gray-500'
              }`}>
                {item.name}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

