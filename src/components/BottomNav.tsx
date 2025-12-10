'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { 
  TrendingUp, 
  ShoppingCart, 
  Package, 
  BarChart3, 
  Wallet 
} from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { name: 'Home', icon: TrendingUp, path: '/' },
    { name: 'Sales', icon: ShoppingCart, path: '/sales' },
    { name: 'Stock', icon: Package, path: '/stock' },
    { name: 'Reports', icon: BarChart3, path: '/reports' },
    { name: 'Wallets', icon: Wallet, path: '/wallets' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.path
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full active:bg-gray-100 transition ${
                isActive ? 'text-blue-600' : 'text-gray-600'
              }`}
            >
              <Icon size={24} />
              <span className="text-xs mt-1">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
