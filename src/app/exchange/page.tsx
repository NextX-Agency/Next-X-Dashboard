'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { DollarSign, TrendingUp, ArrowRightLeft, History, RefreshCw } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, LoadingSpinner, Badge } from '@/components/UI'
import { formatCurrency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

type ExchangeRate = Database['public']['Tables']['exchange_rates']['Row']

export default function ExchangeRatePage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null)
  const [newRate, setNewRate] = useState('')
  const [usdAmount, setUsdAmount] = useState('')
  const [srdAmount, setSrdAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const loadRates = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('exchange_rates')
      .select('*')
      .order('set_at', { ascending: false })
    
    if (data) {
      setRates(data)
      const active = data.find(r => r.is_active)
      setCurrentRate(active || null)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadRates()
  }, [])

  const handleSetRate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    
    setSubmitting(true)
    try {
      await supabase
        .from('exchange_rates')
        .update({ is_active: false })
        .eq('is_active', true)

      const { data: newRateData } = await supabase.from('exchange_rates').insert({
        usd_to_srd: parseFloat(newRate),
        is_active: true
      }).select().single()

      // Log the rate change
      if (newRateData) {
        const oldRateText = currentRate ? `${currentRate.usd_to_srd} SRD` : 'none'
        await logActivity({
          action: 'update',
          entityType: 'exchange_rate',
          entityId: newRateData.id,
          entityName: `Exchange Rate: 1 USD = ${newRate} SRD`,
          details: JSON.stringify({ old_rate: currentRate?.usd_to_srd || null, new_rate: parseFloat(newRate), changed_from: oldRateText })
        })
      }

      setNewRate('')
      loadRates()
    } finally {
      setSubmitting(false)
    }
  }

  const convertUsdToSrd = (usd: number) => {
    if (!currentRate) return 0
    return usd * currentRate.usd_to_srd
  }

  const convertSrdToUsd = (srd: number) => {
    if (!currentRate) return 0
    return srd / currentRate.usd_to_srd
  }

  const handleUsdChange = (value: string) => {
    setUsdAmount(value)
    const result = convertUsdToSrd(parseFloat(value) || 0)
    setSrdAmount(result.toFixed(2))
  }

  const handleSrdChange = (value: string) => {
    setSrdAmount(value)
    const result = convertSrdToUsd(parseFloat(value) || 0)
    setUsdAmount(result.toFixed(2))
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Exchange Rate" subtitle="Manage currency exchange rates" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Exchange Rate" 
        subtitle="Manage currency exchange rates"
        icon={<DollarSign size={24} />}
        action={
          <Button variant="secondary" onClick={loadRates}>
            <RefreshCw size={18} />
            Refresh
          </Button>
        }
      />

      <PageContainer>
        {/* Current Rate Card */}
        {currentRate && (
          <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground p-6 lg:p-8 rounded-2xl mb-6 lg:mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <p className="text-primary-foreground/90 text-sm font-medium">Current Exchange Rate</p>
                    <p className="text-xs text-primary-foreground/70 mt-0.5">
                      Updated {new Date(currentRate.set_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge variant="success">Active</Badge>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl lg:text-5xl font-bold">1</span>
                <span className="text-xl lg:text-2xl font-semibold opacity-90">USD</span>
                <span className="text-2xl lg:text-3xl mx-3 opacity-70">=</span>
                <span className="text-4xl lg:text-5xl font-bold">{currentRate.usd_to_srd}</span>
                <span className="text-xl lg:text-2xl font-semibold opacity-90">SRD</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-6 lg:mb-8">
          {/* Set New Rate */}
          <div className="bg-card rounded-2xl border border-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[hsl(var(--primary-muted))] rounded-xl flex items-center justify-center">
                <TrendingUp size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Set New Rate</h3>
                <p className="text-sm text-muted-foreground">Update exchange rate</p>
              </div>
            </div>
            <form onSubmit={handleSetRate} className="space-y-4">
              <Input
                label="Exchange Rate (1 USD equals)"
                type="number"
                step="0.0001"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="0.0000"
                suffix="SRD"
                required
              />
              <Button type="submit" variant="primary" fullWidth loading={submitting}>
                Update Rate
              </Button>
            </form>
          </div>

          {/* Quick Converter */}
          <div className="bg-card rounded-2xl border border-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[hsl(var(--primary-muted))] rounded-xl flex items-center justify-center">
                <ArrowRightLeft size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Quick Converter</h3>
                <p className="text-sm text-muted-foreground">Convert currencies instantly</p>
              </div>
            </div>
            <div className="space-y-4">
              <Input
                label="USD Amount"
                type="number"
                step="0.01"
                value={usdAmount}
                onChange={(e) => handleUsdChange(e.target.value)}
                placeholder="0.00"
                prefix="$"
              />
              <div className="flex justify-center">
                <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                  <ArrowRightLeft size={18} className="text-muted-foreground" />
                </div>
              </div>
              <Input
                label="SRD Amount"
                type="number"
                step="0.01"
                value={srdAmount}
                onChange={(e) => handleSrdChange(e.target.value)}
                placeholder="0.00"
                suffix="SRD"
              />
            </div>
          </div>
        </div>

        {/* Rate History */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[hsl(var(--secondary))] rounded-xl flex items-center justify-center">
              <History size={20} className="text-secondary-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Rate History</h3>
              <p className="text-sm text-muted-foreground">Previous exchange rates</p>
            </div>
          </div>
          <div className="space-y-2">
            {rates.length > 0 ? (
              rates.map((rate) => (
                <div
                  key={rate.id}
                  className={`p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                    rate.is_active 
                      ? 'border-primary bg-[hsl(var(--primary-muted))]' 
                      : 'border-border bg-muted/50 hover:border-[hsl(var(--border-hover))]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-foreground">
                          1 USD = {rate.usd_to_srd} SRD
                        </span>
                        {rate.is_active && <Badge variant="orange">Active</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(rate.set_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No rate history available</p>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </div>
  )
}

