'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'

import { useAuth } from '@/lib/AuthContext'
import { OperatorProvider } from '@/lib/OperatorContext'
import { isAdminRoute } from '@/lib/routes'

import { AuthGuard } from './AuthGuard'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { WorkspaceLoadingScreen } from './UI'

export function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading, isAdmin, isAuthenticated } = useAuth()
  const requiresAdmin = useMemo(() => isAdminRoute(pathname), [pathname])

  if (loading) {
    return <WorkspaceLoadingScreen />
  }

  if (requiresAdmin && (!isAuthenticated || !isAdmin)) {
    return <AuthGuard>{children}</AuthGuard>
  }

  if (isAuthenticated && isAdmin) {
    return (
      <AuthGuard>
        <OperatorProvider>
          <div className="flex h-dvh overflow-hidden bg-gray-900">
            <Sidebar />

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <TopBar />

              <main className="flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:pb-[calc(env(safe-area-inset-bottom)+6.5rem)] lg:pb-8">
                <div className="h-full">{children}</div>
              </main>
            </div>
          </div>

          <BottomNav />
        </OperatorProvider>
      </AuthGuard>
    )
  }

  return <AuthGuard>{children}</AuthGuard>
}
