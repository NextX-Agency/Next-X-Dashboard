'use client'

import { memo } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/AuthContext'
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  BarChart3,
  Settings
} from 'lucide-react'

// Define nav items outside component to prevent recreation
const DEFAULT_NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Sales', icon: ShoppingCart, path: '/sales' },
  { name: 'Stock', icon: Package, path: '/stock' },
  { name: 'Reports', icon: BarChart3, path: '/reports' },
  { name: 'Settings', icon: Settings, path: '/settings' },
]

function BottomNavComponent() {
  const pathname = usePathname()
  const { isAdmin } = useAuth()
  
  // Don't render bottom nav for non-admin users
  // (LayoutWrapper should handle this, but this is a safety check)
  if (!isAdmin) {
    return null
  }

  return (
    <nav className="lg:hidden fixed inset-x-3 bottom-3 z-50">
      <div className="relative overflow-hidden rounded-[28px] border border-gray-800/80 bg-gray-950/95 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="absolute inset-0 bg-linear-to-r from-orange-500/6 via-transparent to-white/5" />
        <div className="relative flex items-center justify-around gap-1 px-2 py-2 pb-safe">
        {DEFAULT_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.path || 
            (item.path !== '/dashboard' && pathname.startsWith(item.path))
          const isActiveState = isActive
          
          return (
            <Link
              key={item.path}
              href={item.path}
              aria-current={isActiveState ? 'page' : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 transition-all duration-200 active:scale-95 ${
                isActiveState ? 'bg-white/6 text-white shadow-inner shadow-white/5' : 'text-gray-500 active:bg-white/5 active:text-gray-200'
              }`}
            >
              {isActiveState && (
                <div className="absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-orange-400 to-transparent" />
              )}
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200 ${
                isActiveState 
                  ? 'bg-orange-500/15 text-orange-300 scale-110' 
                  : 'text-gray-400 active:bg-gray-800/80'
              }`}>
                <Icon size={22} strokeWidth={isActiveState ? 2.5 : 2} />
              </div>
              <span className={`truncate text-[10px] font-semibold transition-colors ${
                isActiveState ? 'text-white' : 'text-gray-400'
              }`}>
                {item.name}
              </span>
            </Link>
          )
        })}
        </div>
      </div>
    </nav>
  )
}

const BottomNav = memo(BottomNavComponent)
export default BottomNav

