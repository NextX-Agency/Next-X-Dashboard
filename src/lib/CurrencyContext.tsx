'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { type Currency } from '@/lib/currency'

interface ExchangeRate {
  id: string
  usd_to_srd: number
  is_active: boolean
  set_at: string
}

interface CurrencyContextType {
  displayCurrency: Currency
  setDisplayCurrency: (currency: Currency) => void
  exchangeRate: number
  isLoading: boolean
  convertToDisplay: (amount: number, fromCurrency: Currency) => number
  convertToUSD: (amount: number, fromCurrency: Currency) => number
  convertToSRD: (amount: number, fromCurrency: Currency) => number
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('USD')
  const [exchangeRate, setExchangeRate] = useState<number>(40) // Default rate
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadExchangeRate = async () => {
      try {
        const { data } = await supabase
          .from('exchange_rates')
          .select('*')
          .eq('is_active', true)
          .single()
        
        if (data) {
          setExchangeRate(data.usd_to_srd)
        }
      } catch (error) {
        console.error('Error loading exchange rate:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadExchangeRate()

    // Load saved preference from localStorage
    const saved = localStorage.getItem('displayCurrency')
    if (saved === 'SRD' || saved === 'USD') {
      setDisplayCurrency(saved)
    }
  }, [])

  // Save preference to localStorage
  useEffect(() => {
    localStorage.setItem('displayCurrency', displayCurrency)
  }, [displayCurrency])

  /**
   * Convert an amount from its original currency to the display currency
   */
  const convertToDisplay = useCallback((amount: number, fromCurrency: Currency): number => {
    if (fromCurrency === displayCurrency) {
      return amount
    }
    
    if (displayCurrency === 'USD') {
      // Convert SRD to USD
      return amount / exchangeRate
    } else {
      // Convert USD to SRD
      return amount * exchangeRate
    }
  }, [displayCurrency, exchangeRate])

  /**
   * Convert any amount to USD
   */
  const convertToUSD = useCallback((amount: number, fromCurrency: Currency): number => {
    if (fromCurrency === 'USD') {
      return amount
    }
    return amount / exchangeRate
  }, [exchangeRate])

  /**
   * Convert any amount to SRD
   */
  const convertToSRD = useCallback((amount: number, fromCurrency: Currency): number => {
    if (fromCurrency === 'SRD') {
      return amount
    }
    return amount * exchangeRate
  }, [exchangeRate])

  const contextValue = useMemo(() => ({
    displayCurrency,
    setDisplayCurrency,
    exchangeRate,
    isLoading,
    convertToDisplay,
    convertToUSD,
    convertToSRD,
  }), [displayCurrency, exchangeRate, isLoading, convertToDisplay, convertToUSD, convertToSRD])

  return (
    <CurrencyContext.Provider value={contextValue}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}
