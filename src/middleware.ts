import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for server-side route protection
 * 
 * Note: This middleware provides an additional layer of security by checking
 * cookies for session data. The primary authentication is handled client-side
 * by AuthGuard, but this prevents unnecessary server-side rendering of protected pages.
 */

// Public routes that don't require any authentication
const PUBLIC_ROUTES = ['/', '/catalog', '/login', '/blog', '/faq', '/testimonials']
const PUBLIC_PREFIXES = ['/blog/', '/p/', '/catalog/']

// Admin routes that require admin role
const ADMIN_ROUTES = [
  '/dashboard', '/items', '/stock', '/orders', '/sales', '/expenses',
  '/budgets', '/wallets', '/commissions', '/exchange', '/locations',
  '/reports', '/settings', '/activity', '/reservations', '/invoices',
  '/cms', '/upload-example', '/migrate', '/recalculate-commissions'
]
const ADMIN_PREFIXES = ['/cms/', '/api/']

// Protected API routes
const PROTECTED_API_PREFIXES = [
  '/api/upload', '/api/delete', '/api/migrate', '/api/create-commission',
  '/api/delete-commissions', '/api/recalculate-commissions', '/api/fix-combo-price',
  '/api/check-commission', '/api/get-sale-info', '/api/debug-reservations',
  '/api/create-missing-commissions',
  '/api/backup/export', '/api/backup/save', '/api/backup/list',
  '/api/backup/delete', '/api/backup/restore'
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // Static files
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
      // The middleware just checks for basic auth presence
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
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
