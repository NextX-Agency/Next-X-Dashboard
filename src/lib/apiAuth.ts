import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from './supabase'

export type UserRole = 'admin' | 'user' | 'staff'

interface AuthUser {
  id: string
  email: string
  name: string | null
  role: UserRole
}

interface AuthResult {
  authenticated: boolean
  user: AuthUser | null
  error?: string
}

/**
 * Verify authentication from API routes
 * Checks both cookie and validates against database
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    // Get session from cookie
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('auth_session')
    
    if (!sessionCookie) {
      return { authenticated: false, user: null, error: 'No session found' }
    }

    let session: { userId: string; role: string }
    try {
      session = JSON.parse(sessionCookie.value)
    } catch {
      return { authenticated: false, user: null, error: 'Invalid session format' }
    }

    if (!session.userId) {
      return { authenticated: false, user: null, error: 'Invalid session data' }
    }

    // Verify user exists and is active in database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, is_active')
      .eq('id', session.userId)
      .eq('is_active', true)
      .single()

    if (error || !user) {
      return { authenticated: false, user: null, error: 'User not found or inactive' }
    }

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserRole
      }
    }
  } catch (err) {
    console.error('Auth verification error:', err)
    return { authenticated: false, user: null, error: 'Authentication failed' }
  }
}

/**
 * Require authentication for API route
 * Returns error response if not authenticated
 */
export async function requireAuth(request: NextRequest): Promise<AuthUser | NextResponse> {
  const result = await verifyAuth(request)
  
  if (!result.authenticated || !result.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: result.error || 'Authentication required' },
      { status: 401 }
    )
  }
  
  return result.user
}

/**
 * Require admin role for API route
 * Returns error response if not authenticated or not admin
 */
export async function requireAdmin(request: NextRequest): Promise<AuthUser | NextResponse> {
  const result = await verifyAuth(request)
  
  if (!result.authenticated || !result.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: result.error || 'Authentication required' },
      { status: 401 }
    )
  }
  
  if (result.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Admin access required' },
      { status: 403 }
    )
  }
  
  return result.user
}

/**
 * Require specific role(s) for API route
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole | UserRole[]
): Promise<AuthUser | NextResponse> {
  const result = await verifyAuth(request)
  
  if (!result.authenticated || !result.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: result.error || 'Authentication required' },
      { status: 401 }
    )
  }
  
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  
  if (!roles.includes(result.user.role)) {
    return NextResponse.json(
      { error: 'Forbidden', message: `One of these roles required: ${roles.join(', ')}` },
      { status: 403 }
    )
  }
  
  return result.user
}

/**
 * Helper to check if result is an error response
 */
export function isAuthError(result: AuthUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
