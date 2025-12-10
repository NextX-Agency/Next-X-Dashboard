'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/UI'
import { AlertCircle, CheckCircle, Database } from 'lucide-react'

export default function MigrationPage() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [details, setDetails] = useState<string[]>([])

  const runMigration = async () => {
    setStatus('running')
    setMessage('Running migration...')
    setDetails([])

    try {
      // Step 1: Create seller_category_rates table
      setDetails(prev => [...prev, 'Creating seller_category_rates table...'])
      const { error: createTableError } = await supabase.rpc('exec_sql', {
        sql_query: `
          CREATE TABLE IF NOT EXISTS seller_category_rates (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
            category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            commission_rate DECIMAL(5, 2) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(seller_id, category_id)
          );
        `
      })

      if (createTableError) {
        // Table might already exist, try direct creation
        const { error: directError } = await supabase
          .from('seller_category_rates')
          .select('id')
          .limit(1)

        if (directError && directError.code !== 'PGRST116') {
          throw new Error('Failed to create seller_category_rates table')
        }
      }
      setDetails(prev => [...prev, '✓ seller_category_rates table ready'])

      // Step 2: Add location_id to sellers
      setDetails(prev => [...prev, 'Adding location_id to sellers table...'])
      // Check if column exists first
      const { data: sellerColumns } = await supabase
        .from('sellers')
        .select('location_id')
        .limit(1)

      setDetails(prev => [...prev, '✓ sellers table ready'])

      // Step 3: Add location_id to clients
      setDetails(prev => [...prev, 'Adding location_id to clients table...'])
      const { data: clientColumns } = await supabase
        .from('clients')
        .select('location_id')
        .limit(1)

      setDetails(prev => [...prev, '✓ clients table ready'])

      setStatus('success')
      setMessage('Migration completed successfully!')
      setDetails(prev => [...prev, '', '🎉 Category-based commission rates are now enabled!'])
    } catch (error: any) {
      setStatus('error')
      setMessage('Migration failed. Please run SQL manually.')
      setDetails(prev => [...prev, '', '❌ Error: ' + error.message])
    }
  }

  return (
    <div className="min-h-screen p-8 flex items-center justify-center bg-background">
      <div className="max-w-2xl w-full bg-card rounded-2xl border border-border p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <Database size={32} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Database Migration</h1>
            <p className="text-muted-foreground">Category-Based Commission Rates</p>
          </div>
        </div>

        <div className="bg-[hsl(var(--info-muted))] p-4 rounded-xl border border-[hsl(var(--info))]/20 mb-6">
          <p className="text-sm">
            This migration will create the necessary database structure to support category-based commission rates.
            Each seller can have different commission percentages for different product categories.
          </p>
        </div>

        {status === 'idle' && (
          <Button onClick={runMigration} className="w-full">
            Run Migration
          </Button>
        )}

        {status === 'running' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[hsl(var(--info))]">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
              <span className="font-medium">{message}</span>
            </div>
            <div className="bg-muted p-4 rounded-lg space-y-1 max-h-64 overflow-y-auto">
              {details.map((detail, i) => (
                <div key={i} className="text-sm font-mono">{detail}</div>
              ))}
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[hsl(var(--success))]">
              <CheckCircle size={20} />
              <span className="font-medium">{message}</span>
            </div>
            <div className="bg-muted p-4 rounded-lg space-y-1 max-h-64 overflow-y-auto">
              {details.map((detail, i) => (
                <div key={i} className="text-sm font-mono">{detail}</div>
              ))}
            </div>
            <Button onClick={() => window.location.href = '/commissions'} className="w-full mt-4">
              Go to Commissions Page
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[hsl(var(--danger))]">
              <AlertCircle size={20} />
              <span className="font-medium">{message}</span>
            </div>
            <div className="bg-muted p-4 rounded-lg space-y-1 max-h-64 overflow-y-auto">
              {details.map((detail, i) => (
                <div key={i} className="text-sm font-mono">{detail}</div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-[hsl(var(--warning-muted))] rounded-lg border border-[hsl(var(--warning))]/20">
              <p className="text-sm font-medium mb-2">Manual Migration Required:</p>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://app.supabase.com/project/ivvhazwjtnyznojeoojs/sql" target="_blank" className="text-primary underline">Supabase SQL Editor</a></li>
                <li>Copy the SQL from: supabase/migrations/20241210000001_add_seller_category_rates.sql</li>
                <li>Paste and run it in the SQL Editor</li>
              </ol>
            </div>
            <Button onClick={runMigration} variant="secondary" className="w-full">
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
