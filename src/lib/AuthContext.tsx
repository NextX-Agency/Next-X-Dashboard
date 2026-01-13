'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react'
import { supabase } from './supabase'

interface User {
  id: string
  email: string
  name: string | null
  role: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

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
              role: data.role
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

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
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
        role: userData.role
      }
      setUser(userInfo)

      // Store session
      localStorage.setItem('auth_session', JSON.stringify({
        userId: userData.id,
        loginAt: new Date().toISOString()
      }))

      return { success: true }
    } catch (err) {
      console.error('Login error:', err)
      return { success: false, error: 'An error occurred during login' }
    }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    localStorage.removeItem('auth_session')
  }, [])

  const contextValue = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user
  }), [user, loading, login, logout])

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
