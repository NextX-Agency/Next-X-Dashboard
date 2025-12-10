'use client'

import { useRouter } from 'next/navigation'
import { 
  Package, 
  MapPin, 
  ShoppingCart, 
  Wallet, 
  Receipt, 
  DollarSign, 
  Users, 
  Calendar, 
  TrendingUp, 
  Target,
  BarChart3
} from 'lucide-react'

export default function Home() {
  const router = useRouter()

  const features = [
    { name: 'Items', icon: Package, path: '/items', color: 'bg-blue-500' },
    { name: 'Locations', icon: MapPin, path: '/locations', color: 'bg-green-500' },
    { name: 'Stock', icon: Package, path: '/stock', color: 'bg-purple-500' },
    { name: 'Exchange', icon: DollarSign, path: '/exchange', color: 'bg-yellow-500' },
    { name: 'Sales', icon: ShoppingCart, path: '/sales', color: 'bg-red-500' },
    { name: 'Reservations', icon: Calendar, path: '/reservations', color: 'bg-indigo-500' },
    { name: 'Wallets', icon: Wallet, path: '/wallets', color: 'bg-teal-500' },
    { name: 'Expenses', icon: Receipt, path: '/expenses', color: 'bg-orange-500' },
    { name: 'Commissions', icon: Users, path: '/commissions', color: 'bg-pink-500' },
    { name: 'Budgets', icon: Target, path: '/budgets', color: 'bg-cyan-500' },
    { name: 'Reports', icon: BarChart3, path: '/reports', color: 'bg-emerald-500' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
        <h1 className="text-3xl font-bold mb-2">Next-X Dashboard</h1>
        <p className="text-blue-100">Inventory & Sales Management</p>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <button
                key={feature.name}
                onClick={() => router.push(feature.path)}
                className={`${feature.color} text-white p-6 rounded-xl shadow-lg active:scale-95 transition-transform`}
              >
                <Icon size={32} className="mb-2" />
                <div className="font-semibold text-lg">{feature.name}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Bottom Navigation Component
export function BottomNav() {
  const router = useRouter()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
      <div className="flex justify-around items-center h-16">
        <button
          onClick={() => router.push('/')}
          className="flex flex-col items-center justify-center flex-1 active:bg-gray-100 h-full"
        >
          <TrendingUp size={24} />
          <span className="text-xs mt-1">Home</span>
        </button>
        <button
          onClick={() => router.push('/sales')}
          className="flex flex-col items-center justify-center flex-1 active:bg-gray-100 h-full"
        >
          <ShoppingCart size={24} />
          <span className="text-xs mt-1">Sales</span>
        </button>
        <button
          onClick={() => router.push('/stock')}
          className="flex flex-col items-center justify-center flex-1 active:bg-gray-100 h-full"
        >
          <Package size={24} />
          <span className="text-xs mt-1">Stock</span>
        </button>
        <button
          onClick={() => router.push('/reports')}
          className="flex flex-col items-center justify-center flex-1 active:bg-gray-100 h-full"
        >
          <BarChart3 size={24} />
          <span className="text-xs mt-1">Reports</span>
        </button>
        <button
          onClick={() => router.push('/wallets')}
          className="flex flex-col items-center justify-center flex-1 active:bg-gray-100 h-full"
        >
          <Wallet size={24} />
          <span className="text-xs mt-1">Wallets</span>
        </button>
      </div>
    </nav>
  )
}
