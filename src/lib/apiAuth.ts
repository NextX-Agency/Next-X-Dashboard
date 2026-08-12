import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/sessions'

export type UserRole = 'admin' | 'seller' | 'staff' | 'user'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: UserRole
}

interface AuthResult {
  authenticated: boolean
  user: AuthUser | null
  sessionId: string | null
  error?: string
}

/**
 * Authentication is based on an opaque, server-issued session cookie. The
 * browser never provides a user id or a role, so changing local storage or a
 * cookie value cannot grant access to another account.
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    const session = await getSessionUser(request)
    if (!session) {
      return { authenticated: false, user: null, sessionId: null, error: 'Session is missing, expired, or revoked' }
    }

    return {
      authenticated: true,
      sessionId: session.sessionId,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role as UserRole,
      },
    }
  } catch (error) {
    console.error('Auth verification error:', error)
    return { authenticated: false, user: null, sessionId: null, error: 'Authentication failed' }
  }
}

export async function requireAuth(request: NextRequest): Promise<AuthUser | NextResponse> {
  const result = await verifyAuth(request)
  if (!result.authenticated || !result.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: result.error || 'Authentication required' },
      { status: 401 },
    )
  }
  return result.user
}

export async function requireAdmin(request: NextRequest): Promise<AuthUser | NextResponse> {
  const user = await requireAuth(request)
  if (user instanceof NextResponse) return user
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden', message: 'Admin access required' }, { status: 403 })
  }
  return user
}

export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole | UserRole[],
): Promise<AuthUser | NextResponse> {
  const user = await requireAuth(request)
  if (user instanceof NextResponse) return user

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  if (!roles.includes(user.role)) {
    return NextResponse.json(
      { error: 'Forbidden', message: `One of these roles required: ${roles.join(', ')}` },
      { status: 403 },
    )
  }
  return user
}

export function isAuthError(result: AuthUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
