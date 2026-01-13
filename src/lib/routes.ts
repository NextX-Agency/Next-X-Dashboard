/**
 * Route Configuration for Role-Based Access Control
 * 
 * This file centralizes all route definitions to ensure consistent
 * protection across the application (middleware, AuthGuard, navigation, etc.)
 */

// Public routes accessible by everyone (no login required)
export const PUBLIC_ROUTES = [
  '/',           // Catalog (landing page)
  '/catalog',    // Catalog direct access
  '/login',      // Login page
  '/blog',       // Public blog
  '/faq',        // Public FAQ
  '/testimonials', // Public testimonials
  '/p/',         // Public pages (dynamic)
] as const

// Public route prefixes (for startsWith matching)
export const PUBLIC_ROUTE_PREFIXES = [
  '/blog/',      // Blog posts
  '/p/',         // Dynamic pages
  '/catalog/',   // Catalog sub-pages
] as const

// Admin-only routes (require authentication + admin role)
export const ADMIN_ROUTES = [
  '/dashboard',
  '/items',
  '/stock',
  '/orders',
  '/sales',
  '/expenses',
  '/budgets',
  '/wallets',
  '/commissions',
  '/exchange',
  '/locations',
  '/reports',
  '/settings',
  '/activity',
  '/reservations',
  '/invoices',
  '/cms',
  '/upload-example',
  '/migrate',
  '/recalculate-commissions',
] as const

// Admin route prefixes (for startsWith matching)
export const ADMIN_ROUTE_PREFIXES = [
  '/cms/',       // All CMS sub-pages
  '/api/',       // API routes (handled separately)
] as const

// API routes that require admin authentication
export const PROTECTED_API_ROUTES = [
  '/api/upload',
  '/api/delete',
  '/api/migrate',
  '/api/create-commission',
  '/api/delete-commissions',
  '/api/recalculate-commissions',
  '/api/create-missing-commissions',
  '/api/fix-combo-price',
  '/api/check-commission',
  '/api/get-sale-info',
  '/api/debug-reservations',
] as const

// Helper function to check if a path is a public route
export function isPublicRoute(pathname: string): boolean {
  // Exact matches
  if (PUBLIC_ROUTES.includes(pathname as typeof PUBLIC_ROUTES[number])) {
    return true
  }
  
  // Prefix matches
  return PUBLIC_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

// Helper function to check if a path is an admin route
export function isAdminRoute(pathname: string): boolean {
  // Exact matches
  if (ADMIN_ROUTES.includes(pathname as typeof ADMIN_ROUTES[number])) {
    return true
  }
  
  // Prefix matches
  return ADMIN_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

// Helper function to check if a path is a protected API route
export function isProtectedApiRoute(pathname: string): boolean {
  return PROTECTED_API_ROUTES.some(route => pathname.startsWith(route))
}

// Get the appropriate redirect for a user based on role
export function getDefaultRedirect(isAdmin: boolean): string {
  return isAdmin ? '/dashboard' : '/'
}

// Get the login redirect URL
export function getLoginRedirect(): string {
  return '/login'
}

// Get the access denied redirect URL for non-admins
export function getAccessDeniedRedirect(): string {
  return '/'
}
