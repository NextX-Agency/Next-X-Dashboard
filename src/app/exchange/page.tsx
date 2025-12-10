'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { DollarSign, TrendingUp } from 'lucide-react'

type ExchangeRate = Database['public']['Tables']['exchange_rates']['Row']

export default function ExchangeRatePage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null)
  const [newRate, setNewRate] = useState('')

  useEffect(() => {
    loadRates()
  }, [])

  const loadRates = async () => {
    const { data } = await supabase
      .from('exchange_rates')
      .select('*')
      .order('set_at', { ascending: false })
    
    if (data) {
      setRates(data)
      const active = data.find(r => r.is_active)
      setCurrentRate(active || null)
    }
  }

  const handleSetRate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    await supabase
      .from('exchange_rates')
      .update({ is_active: false })
      .eq('is_active', true)

    await supabase.from('exchange_rates').insert({
      usd_to_srd: parseFloat(newRate),
      is_active: true
    })

    setNewRate('')
    loadRates()
  }

  const convertUsdToSrd = (usd: number) => {
    if (!currentRate) return 0
    return usd * currentRate.usd_to_srd
  }

  const convertSrdToUsd = (srd: number) => {
    if (!currentRate) return 0
    return srd / currentRate.usd_to_srd
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Exchange Rate</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {currentRate && (
          <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={24} />
              <span className="text-lg">Current Rate</span>
            </div>
            <div className="text-4xl font-bold">
              1 USD = {currentRate.usd_to_srd} SRD
            </div>
            <div className="text-sm mt-2 opacity-90">
              Set on {new Date(currentRate.set_at).toLocaleString()}
            </div>
          </div>
        )}

        <form onSubmit={handleSetRate} className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp size={20} />
            Set New Rate
          </h3>
          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">1 USD equals</label>
            <input
              type="number"
              step="0.0001"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder="0.00"
              className="w-full p-3 border rounded-lg text-lg"
              required
            />
            <span className="text-sm text-gray-600">SRD</span>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium active:scale-95 transition"
          >
            Set Rate
          </button>
        </form>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3">Quick Converter</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">USD to SRD</label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter USD"
                className="w-full p-3 border rounded-lg text-lg"
                onChange={(e) => {
                  const result = convertUsdToSrd(parseFloat(e.target.value) || 0)
                  const srdInput = document.getElementById('srd-result') as HTMLInputElement
                  if (srdInput) srdInput.value = result.toFixed(2)
                }}
              />
              <div className="mt-2 p-3 bg-gray-100 rounded-lg">
                <span className="text-sm text-gray-600">Result: </span>
                <span id="srd-display" className="font-semibold">0.00 SRD</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">SRD to USD</label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter SRD"
                className="w-full p-3 border rounded-lg text-lg"
                onChange={(e) => {
                  const result = convertSrdToUsd(parseFloat(e.target.value) || 0)
                  const usdResult = document.getElementById('usd-display')
                  if (usdResult) usdResult.textContent = `${result.toFixed(2)} USD`
                }}
              />
              <div className="mt-2 p-3 bg-gray-100 rounded-lg">
                <span className="text-sm text-gray-600">Result: </span>
                <span id="usd-display" className="font-semibold">0.00 USD</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold mb-3">Rate History</h3>
          <div className="space-y-2">
            {rates.map((rate) => (
              <div
                key={rate.id}
                className={`p-3 rounded-lg border ${
                  rate.is_active ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">
                      1 USD = {rate.usd_to_srd} SRD
                    </div>
                    <div className="text-sm text-gray-600">
                      {new Date(rate.set_at).toLocaleString()}
                    </div>
                  </div>
                  {rate.is_active && (
                    <span className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
