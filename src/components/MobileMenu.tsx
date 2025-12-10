'use client'

import { X } from 'lucide-react'
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
  Activity
} from 'lucide-react'

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const pathname = usePathname()
  const router = useRouter()

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

  const handleNavigation = (path: string) => {
    router.push(path)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Menu Panel */}
      <div className="lg:hidden fixed top-0 left-0 h-full w-[280px] bg-gray-900 text-white z-50 transform transition-transform duration-300 overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-gray-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg">
              NX
            </div>
            <div>
              <h1 className="font-bold text-base">NextX</h1>
              <p className="text-xs text-gray-400">Dashboard</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="py-4 px-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.path
              
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigation(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive 
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20' 
                      : 'text-gray-400 hover:bg-gray-800/60 hover:text-white active:bg-gray-700'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="font-medium text-sm">{item.name}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800/50 bg-gray-900">
          <div className="text-center text-xs text-gray-500">
            <p className="font-medium">NextX Dashboard v1.0</p>
            <p className="mt-1">© 2025 All rights reserved</p>
          </div>
        </div>
      </div>
    </>
  )
}

