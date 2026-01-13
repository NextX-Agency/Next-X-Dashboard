'use client'

import { memo, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { AuthGuard } from './AuthGuard'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { Loader2 } from 'lucide-react'

// Public routes - defined outside component to prevent re-creation
const PUBLIC_ROUTES = ['/login', '/catalog', '/blog', '/p/', '/faq', '/testimonials']

function LayoutWrapperComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading } = useAuth()

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Memoize the public route check
  const isPublicRoute = useMemo(() => 
    PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route)),
    [pathname]
  )
  
  if (isPublicRoute) {
    return <>{children}</>
  }

  // For admin routes, show full layout with auth guard
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-900">
        {/* Desktop Sidebar */}
        <Sidebar />
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top Bar */}
          <TopBar />
          
          {/* Page Content - Extra padding on mobile for bottom nav */}
          <main className="flex-1 overflow-y-auto pb-24 lg:pb-8 overscroll-contain">
            <div className="h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </AuthGuard>
  )
}

export const LayoutWrapper = memo(LayoutWrapperComponent)
