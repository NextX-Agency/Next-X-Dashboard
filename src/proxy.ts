import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy for server-side route protection
 *
 * Note: This proxy provides an additional layer of security by checking
 * cookies for session data. The primary authentication is handled client-side
 * by AuthGuard, but this prevents unnecessary server-side rendering of protected pages.
 */

// Public routes that don't require any authentication
const PUBLIC_ROUTES = ['/', '/catalog', '/audio', '/watches', '/login', '/blog', '/faq', '/testimonials']
const PUBLIC_PREFIXES = ['/blog/', '/p/', '/catalog/', '/audio/', '/watches/']

// Admin routes that require admin role
const ADMIN_ROUTES = [
  '/dashboard', '/items', '/stock', '/orders', '/sales', '/expenses',
  '/budgets', '/wallets', '/commissions', '/exchange', '/locations',
  '/reports', '/performance', '/settings', '/activity', '/reservations', '/invoices',
  '/upload-example', '/migrate', '/recalculate-commissions'
]
const ADMIN_PREFIXES = ['/api/']

// Protected API routes
const PROTECTED_API_PREFIXES = [
  '/api/commissions',
  '/api/dashboard',
  '/api/invoices',
  '/api/reports', '/api/reports/export',
  '/api/sales',
  '/api/stock',
  '/api/orders',
  '/api/wallets',
  '/api/budgets',
  '/api/expenses',
  '/api/reservations',
  '/api/upload', '/api/delete', '/api/migrate', '/api/create-commission',
  '/api/delete-commissions', '/api/recalculate-commissions', '/api/fix-combo-price',
  '/api/check-commission', '/api/get-sale-info', '/api/debug-reservations', '/api/debug-profit',
  '/api/create-missing-commissions',
  '/api/backup/export', '/api/backup/save', '/api/backup/list',
  '/api/backup/delete', '/api/backup/restore', '/api/backup/validate', '/api/backup/self-check',
  '/api/backup/download',
  '/api/activity',
  '/api/dev/terminal-history'
]

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function isAdminRoute(pathname: string): boolean {
  if (ADMIN_ROUTES.includes(pathname)) return true
  return ADMIN_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function isProtectedApiRoute(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip proxy for static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Public routes - allow all access
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // Get session data from cookie (set by client-side auth)
  const sessionCookie = request.cookies.get('auth_session')

  // For API routes
  if (pathname.startsWith('/api/')) {
    // Check if it's a protected API route
    if (isProtectedApiRoute(pathname)) {
      // For API routes, we'll let the API handler do the full validation
      // The proxy just checks for basic auth presence
      if (!sessionCookie) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        )
      }

      try {
        const session = JSON.parse(sessionCookie.value)
        if (session.role !== 'admin') {
          return NextResponse.json(
            { error: 'Forbidden', message: 'Admin access required' },
            { status: 403 }
          )
        }
      } catch {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid session' },
          { status: 401 }
        )
      }
    }
    return NextResponse.next()
  }

  // For admin routes, check session
  if (isAdminRoute(pathname)) {
    if (!sessionCookie) {
      // No session, redirect to login
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    try {
      const session = JSON.parse(sessionCookie.value)
      // Check if user is admin
      if (session.role !== 'admin') {
        // Not admin, redirect to home/catalog
        return NextResponse.redirect(new URL('/', request.url))
      }
    } catch {
      // Invalid session, redirect to login
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/items/:path*',
    '/stock/:path*',
    '/orders/:path*',
    '/sales/:path*',
    '/expenses/:path*',
    '/budgets/:path*',
    '/wallets/:path*',
    '/commissions/:path*',
    '/exchange/:path*',
    '/locations/:path*',
    '/reports/:path*',
    '/performance/:path*',
    '/settings/:path*',
    '/activity/:path*',
    '/reservations/:path*',
    '/invoices/:path*',
    '/upload-example/:path*',
    '/migrate/:path*',
    '/recalculate-commissions/:path*',
    '/api/commissions/:path*',
    '/api/dashboard/:path*',
    '/api/invoices/:path*',
    '/api/reports/:path*',
    '/api/sales/:path*',
    '/api/stock/:path*',
    '/api/orders/:path*',
    '/api/wallets/:path*',
    '/api/budgets/:path*',
    '/api/expenses/:path*',
    '/api/reservations/:path*',
    '/api/upload/:path*',
    '/api/delete/:path*',
    '/api/migrate/:path*',
    '/api/create-commission/:path*',
    '/api/delete-commissions/:path*',
    '/api/recalculate-commissions/:path*',
    '/api/create-missing-commissions/:path*',
    '/api/fix-combo-price/:path*',
    '/api/check-commission/:path*',
    '/api/get-sale-info/:path*',
    '/api/debug-reservations/:path*',
    '/api/debug-profit/:path*',
    '/api/backup/export/:path*',
    '/api/backup/save/:path*',
    '/api/backup/list/:path*',
    '/api/backup/delete/:path*',
    '/api/backup/restore/:path*',
    '/api/backup/validate/:path*',
    '/api/backup/self-check/:path*',
    '/api/backup/download/:path*',
    '/api/activity/:path*',
    '/api/dev/terminal-history/:path*',
  ],
}
