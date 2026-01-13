'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'
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
    // Check for existing session
    const checkSession = async () => {
      const sessionData = localStorage.getItem('auth_session')
      if (sessionData) {
        try {
          const session = JSON.parse(sessionData)
          // Verify session is still valid
          const { data } = await supabase
            .from('users')
            .select('id, email, name, role, is_active')
            .eq('id', session.userId)
            .eq('is_active', true)
            .single()
          
          if (data) {
            setUser({
              id: data.id,
              email: data.email,
              name: data.name,
              role: data.role as UserRole
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
      // Fetch user by email
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, email, name, role, password_hash, is_active')
        .eq('email', email.toLowerCase())
        .single()
      
      if (error || !userData) {
        return { success: false, error: 'Invalid email or password' }
      }

      if (!userData.is_active) {
        return { success: false, error: 'Account is disabled' }
      }

      // Simple password check (in production, use proper hashing like bcrypt)
      // For now, we'll store passwords as plain text but you should implement proper hashing
      if (userData.password_hash !== password) {
        return { success: false, error: 'Invalid email or password' }
      }

      // Update last login
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userData.id)

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
