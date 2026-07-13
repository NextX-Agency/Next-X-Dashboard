'use client'

import dynamic from 'next/dynamic'
import { memo } from 'react'
import { usePathname } from 'next/navigation'

import { isPublicRoute } from '@/lib/routes'

const AdminLayoutWrapper = dynamic(
  () => import('./AdminLayoutWrapper').then(module => module.AdminLayoutWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-sm text-gray-400">
        Werkruimte laden…
      </div>
    ),
  }
)

function LayoutWrapperComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isPublicRoute(pathname)) {
    return <>{children}</>
  }

  return <AdminLayoutWrapper>{children}</AdminLayoutWrapper>
}

export const LayoutWrapper = memo(LayoutWrapperComponent)
