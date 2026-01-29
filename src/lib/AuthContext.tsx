'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getDefaultRedirect, getAccessDeniedRedirect } from './routes'

// User roles enum for type safety
export type UserRole = 'admin' | 'user' | 'staff'

interface User {
  id: string
  email: string
  name: string | null
  role: UserRole
}

interface LoginResult {
  success: boolean
  error?: string
  redirectTo?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  isAuthenticated: boolean
  isAdmin: boolean
  hasRole: (role: UserRole | UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check for existing session using API route (bypasses RLS)
    const checkSession = async () => {
      const sessionData = localStorage.getItem('auth_session')
      if (sessionData) {
        try {
          const session = JSON.parse(sessionData)
          // Verify session via API route
          const response = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.userId })
          })
          
          const result = await response.json()
          
          if (result.success && result.user) {
            setUser({
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              role: result.user.role as UserRole
            })
          } else {
            localStorage.removeItem('auth_session')
          }
        } catch {
          localStorage.removeItem('auth_session')
        }
      }
      setLoading(false)
    }
    
    checkSession()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      // Use API route for login (bypasses RLS)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        return { success: false, error: result.error || 'Login failed' }
      }

      const userData = result.user

      // Set user state
      const userInfo: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role as UserRole
      }
      setUser(userInfo)

      // Store session in localStorage
      localStorage.setItem('auth_session', JSON.stringify({
        userId: userData.id,
        role: userData.role,
        loginAt: new Date().toISOString()
      }))

      // Also store in cookie for middleware access
      document.cookie = `auth_session=${JSON.stringify({
        userId: userData.id,
        role: userData.role
      })}; path=/; max-age=604800; SameSite=Lax`

      // Determine redirect based on role
      const isAdmin = userData.role === 'admin'
      const redirectTo = getDefaultRedirect(isAdmin)

      return { success: true, redirectTo }
    } catch (err) {
      console.error('Login error:', err)
      return { success: false, error: 'An error occurred during login' }
    }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    localStorage.removeItem('auth_session')
    // Clear the auth cookie
    document.cookie = 'auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    // Redirect to home/catalog after logout
    router.push(getAccessDeniedRedirect())
  }, [router])

  // Check if user has admin role
  const isAdmin = useMemo(() => user?.role === 'admin', [user])

  // Check if user has a specific role or one of multiple roles
  const hasRole = useCallback((role: UserRole | UserRole[]) => {
    if (!user) return false
    if (Array.isArray(role)) {
      return role.includes(user.role)
    }
    return user.role === role
  }, [user])

  const contextValue = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    isAdmin,
    hasRole
  }), [user, loading, login, logout, isAdmin, hasRole])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
