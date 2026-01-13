'use client'

import { memo, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { AuthGuard } from './AuthGuard'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { Loader2 } from 'lucide-react'
import { isPublicRoute, isAdminRoute } from '@/lib/routes'

function LayoutWrapperComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading, isAdmin, isAuthenticated } = useAuth()

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

  // Check if this is a public route
  const isPublic = useMemo(() => isPublicRoute(pathname), [pathname])
  
  // Check if this is an admin route
  const requiresAdmin = useMemo(() => isAdminRoute(pathname), [pathname])
  
  // Public routes: render without any admin layout
  if (isPublic) {
    return <>{children}</>
  }

  // Non-admin users trying to access admin routes: let AuthGuard handle it
  // But don't show admin navigation
  if (requiresAdmin && (!isAuthenticated || !isAdmin)) {
    return (
      <AuthGuard>
        {children}
      </AuthGuard>
    )
  }

  // Authenticated admin users: show full admin layout
  if (isAuthenticated && isAdmin) {
    return (
      <AuthGuard>
        <div className="flex h-screen overflow-hidden bg-gray-900">
          {/* Desktop Sidebar - only shown to admins */}
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
        
        {/* Mobile Bottom Navigation - only shown to admins */}
        <BottomNav />
      </AuthGuard>
    )
  }

  // Default: require auth with AuthGuard
  return (
    <AuthGuard>
      {children}
    </AuthGuard>
  )
}

export const LayoutWrapper = memo(LayoutWrapperComponent)
