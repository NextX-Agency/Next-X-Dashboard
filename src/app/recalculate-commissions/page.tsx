'use client'

import { useState } from 'react'
import { PageHeader, PageContainer, Button } from '@/components/UI'
import { RefreshCw } from 'lucide-react'

export default function RecalculateCommissionsPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleRecalculate = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/recalculate-commissions', {
        method: 'POST'
      })

      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      setResult({ error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        icon={RefreshCw}
        title="Recalculate Commissions"
        description="Fix commission amounts that were calculated incorrectly"
      />

      <div className="max-w-2xl mx-auto">
        <div className="bg-card p-6 rounded-2xl border border-border">
          <h3 className="text-lg font-bold mb-4">Commission Recalculation</h3>
          <p className="text-muted-foreground mb-6">
            This will recalculate all commission amounts based on the actual sale item subtotals and category-specific commission rates.
            This is useful after fixing bugs in commission calculation logic.
          </p>

          <Button
            onClick={handleRecalculate}
            loading={loading}
            variant="primary"
            className="w-full"
          >
            <RefreshCw size={18} />
            Recalculate All Commissions
          </Button>

          {result && (
            <div className={`mt-6 p-4 rounded-xl ${result.error ? 'bg-red-500/10 border border-red-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
              {result.error ? (
                <div>
                  <h4 className="font-bold text-red-500 mb-2">Error</h4>
                  <p className="text-sm">{result.error}</p>
                </div>
              ) : (
                <div>
                  <h4 className="font-bold text-green-500 mb-2">Success</h4>
                  <p className="text-sm mb-4">{result.message}</p>
                  
                  {result.updates && result.updates.length > 0 && (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {result.updates.map((update: any, index: number) => (
                        <div key={index} className="bg-background/50 p-3 rounded-lg text-sm">
                          <div className="font-medium">Commission {update.id.substring(0, 8)}...</div>
                          <div className="text-muted-foreground">
                            Sale: {update.saleId.substring(0, 8)}... | Rate: {update.rate}%
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-red-400">Old: ${update.oldAmount}</span>
                            <span className="text-green-400">New: ${update.newAmount}</span>
                            <span className="text-blue-400">Diff: ${(update.newAmount - update.oldAmount).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
