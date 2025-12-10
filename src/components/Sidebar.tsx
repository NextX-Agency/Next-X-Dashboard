'use client'

import { usePathname, useRouter } from 'next/navigation'
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
  Activity
} from 'lucide-react'
import { useState } from 'react'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Items', icon: Package, path: '/items' },
    { name: 'Locations', icon: MapPin, path: '/locations' },
    { name: 'Stock', icon: Package, path: '/stock' },
    { name: 'Exchange', icon: DollarSign, path: '/exchange' },
    { name: 'Sales', icon: ShoppingCart, path: '/sales' },
    { name: 'Reservations', icon: Calendar, path: '/reservations' },
    { name: 'Wallets', icon: Wallet, path: '/wallets' },
    { name: 'Expenses', icon: Receipt, path: '/expenses' },
    { name: 'Commissions', icon: Users, path: '/commissions' },
    { name: 'Budgets', icon: Target, path: '/budgets' },
    { name: 'Reports', icon: BarChart3, path: '/reports' },
    { name: 'Activity Log', icon: Activity, path: '/activity' },
  ]

  return (
    <aside 
      className={`hidden lg:flex flex-col bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white transition-all duration-300 h-screen sticky top-0 border-r border-gray-800/50 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Premium Logo Section */}
      <div className="p-6 border-b border-gray-800/50 flex items-center justify-between backdrop-blur-sm">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl blur-md opacity-50" />
              <div className="relative w-12 h-12 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg border border-orange-400/20">
                NX
              </div>
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">NextX</h1>
              <p className="text-xs text-gray-400 font-medium">Business Dashboard</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="relative mx-auto">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl blur-md opacity-50" />
            <div className="relative w-12 h-12 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg border border-orange-400/20">
              NX
            </div>
          </div>
        )}
      </div>

      {/* Premium Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.path
            
            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group overflow-hidden ${
                  isActive 
                    ? 'bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg shadow-orange-500/25' 
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-white'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full shadow-lg" />
                )}
                
                {/* Icon with subtle animation */}
                <div className={`flex items-center justify-center transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'} />
                </div>
                
                {/* Text with proper spacing */}
                {!isCollapsed && (
                  <span className={`font-medium text-sm tracking-tight ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                    {item.name}
                  </span>
                )}
                
                {/* Hover shine effect */}
                {!isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-500" />
                )}
              </button>
            )
          })}
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

