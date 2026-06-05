'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { type Currency } from '@/lib/currency'
import { DEFAULT_EXCHANGE_RATE, normalizeExchangeRate } from '@/lib/pricing'

interface CurrencyContextType {
  displayCurrency: Currency
  setDisplayCurrency: (currency: Currency) => void
  exchangeRate: number
  isLoading: boolean
  refreshExchangeRate: () => Promise<void>
  convertToDisplay: (amount: number, fromCurrency: Currency) => number
  convertToUSD: (amount: number, fromCurrency: Currency) => number
  convertToSRD: (amount: number, fromCurrency: Currency) => number
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('USD')
  const [exchangeRate, setExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATE)
  const [isLoading, setIsLoading] = useState(true)

  const refreshExchangeRate = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('is_active', true)
        .single()

      if (data) {
        setExchangeRate(normalizeExchangeRate(data.usd_to_srd))
      }
    } catch (error) {
      console.error('Error loading exchange rate:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshExchangeRate()

    // Load saved preference from localStorage
    const saved = localStorage.getItem('displayCurrency')
    if (saved === 'SRD' || saved === 'USD') {
      setDisplayCurrency(saved)
    }
  }, [refreshExchangeRate])

  useEffect(() => {
    const handleExchangeRateUpdated = (event: Event) => {
      const nextRate = (event as CustomEvent<{ usdToSrd?: number }>).detail?.usdToSrd
      if (typeof nextRate === 'number' && Number.isFinite(nextRate) && nextRate > 0) {
        setExchangeRate(normalizeExchangeRate(nextRate))
        return
      }

      refreshExchangeRate()
    }

    window.addEventListener('exchange-rate-updated', handleExchangeRateUpdated)
    return () => window.removeEventListener('exchange-rate-updated', handleExchangeRateUpdated)
  }, [refreshExchangeRate])

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
      return amount / normalizeExchangeRate(exchangeRate)
    } else {
      // Convert USD to SRD
      return amount * normalizeExchangeRate(exchangeRate)
    }
  }, [displayCurrency, exchangeRate])

  /**
   * Convert any amount to USD
   */
  const convertToUSD = useCallback((amount: number, fromCurrency: Currency): number => {
    if (fromCurrency === 'USD') {
      return amount
    }
    return amount / normalizeExchangeRate(exchangeRate)
  }, [exchangeRate])

  /**
   * Convert any amount to SRD
   */
  const convertToSRD = useCallback((amount: number, fromCurrency: Currency): number => {
    if (fromCurrency === 'SRD') {
      return amount
    }
    return amount * normalizeExchangeRate(exchangeRate)
  }, [exchangeRate])

  const contextValue = useMemo(() => ({
    displayCurrency,
    setDisplayCurrency,
    exchangeRate,
    isLoading,
    refreshExchangeRate,
    convertToDisplay,
    convertToUSD,
    convertToSRD,
  }), [displayCurrency, exchangeRate, isLoading, refreshExchangeRate, convertToDisplay, convertToUSD, convertToSRD])

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
