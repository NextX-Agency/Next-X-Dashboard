'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, FileCheck2, RefreshCcw, Wallet } from 'lucide-react'

type Summary = { inflow: number; outflow: number; net: number }
type FinanceData = {
  windowStart: string
  byCurrency: Record<string, Summary>
  byEvent: Record<string, Record<string, Summary>>
  byLocation: Record<string, Record<string, Summary>>
  expenseReview: { total: number; unclassified: number; missingDate: number; missingVendor: number; missingReceipt: number; missingDescription: number; refunded: number }
  expenseClassification: Array<{ classification: string; label: string; currencies: Array<{ currency: string; amount: number }> }>
  entries: Array<{
    id: string
    eventType: string
    direction: 'in' | 'out'
    amount: number
    currency: string
    description: string | null
    occurredAt: string
    location: string
    wallet: string | null
    seller: string | null
    category: string | null
    actor: string
  }>
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/finance/ledger', { cache: 'no-store' })
      const payload = await response.json() as { data?: FinanceData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to load finance data.')
      setData(payload.data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load finance data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const outflowGroups = useMemo(() => Object.entries(data?.byEvent ?? {}).map(([eventType, currencies]) => ({
    eventType,
    currencies: Object.entries(currencies),
  })), [data])

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-4 pb-20 sm:p-6 lg:p-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-primary">Finance traceability</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Where money is going</h1><p className="mt-2 text-sm text-muted-foreground">Append-only ledger activity from the last 90 days, separated by currency.</p></div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
      </header>
      {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700">{error}</div>}
      {loading && !data ? <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Loading immutable finance events…</div> : null}
      {data ? <>
        <section className="grid gap-4 md:grid-cols-2">
          {Object.entries(data.byCurrency).map(([currency, summary]) => <div key={currency} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="font-bold">{currency} flow</p><Wallet size={19} className="text-primary" /></div><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><p className="text-muted-foreground">In</p><p className="mt-1 font-bold text-emerald-600">{money(summary.inflow, currency)}</p></div><div><p className="text-muted-foreground">Out</p><p className="mt-1 font-bold text-red-600">{money(summary.outflow, currency)}</p></div><div><p className="text-muted-foreground">Net</p><p className={`mt-1 font-bold ${summary.net >= 0 ? 'text-foreground' : 'text-red-600'}`}>{money(summary.net, currency)}</p></div></div></div>)}
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-bold"><BarChart3 size={19} className="text-primary" />Money movement by type</h2><div className="mt-4 space-y-3">{outflowGroups.map((group) => <div key={group.eventType} className="rounded-xl border bg-background p-3"><p className="text-sm font-semibold capitalize">{group.eventType.replaceAll('_', ' ')}</p><div className="mt-2 flex flex-wrap gap-3 text-sm">{group.currencies.map(([currency, summary]) => <span key={currency} className="text-muted-foreground"><span className="text-emerald-600">+{money(summary.inflow, currency)}</span> <span className="text-red-600">−{money(summary.outflow, currency)}</span></span>)}</div></div>)}</div></div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-bold">Location accountability</h2><div className="mt-4 space-y-3">{Object.entries(data.byLocation).map(([location, currencies]) => <div key={location} className="flex items-center justify-between gap-4 rounded-xl border bg-background p-3"><p className="text-sm font-semibold">{location}</p><div className="text-right text-xs">{Object.entries(currencies).map(([currency, summary]) => <p key={currency} className={summary.net >= 0 ? 'text-emerald-700' : 'text-red-700'}>{currency}: {money(summary.net, currency)}</p>)}</div></div>)}</div></div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-bold"><FileCheck2 size={19} className="text-primary" />Expense documentation</h2><p className="mt-1 text-sm text-muted-foreground">Posted expenses need a purpose, supplier, classification, and preferably a receipt reference.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${data.expenseReview.unclassified || data.expenseReview.missingVendor || data.expenseReview.missingDescription ? 'bg-amber-500/15 text-amber-800' : 'bg-emerald-500/15 text-emerald-800'}`}>{data.expenseReview.unclassified || data.expenseReview.missingVendor || data.expenseReview.missingDescription ? 'Review needed' : 'Documented'}</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5"><div className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">Posted</p><p className="mt-1 text-xl font-bold">{data.expenseReview.total}</p></div><div className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">No date</p><p className={`mt-1 text-xl font-bold ${data.expenseReview.missingDate ? 'text-amber-700' : ''}`}>{data.expenseReview.missingDate}</p></div><div className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">No classification</p><p className={`mt-1 text-xl font-bold ${data.expenseReview.unclassified ? 'text-amber-700' : ''}`}>{data.expenseReview.unclassified}</p></div><div className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">No supplier</p><p className={`mt-1 text-xl font-bold ${data.expenseReview.missingVendor ? 'text-amber-700' : ''}`}>{data.expenseReview.missingVendor}</p></div><div className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">No receipt ref.</p><p className="mt-1 text-xl font-bold">{data.expenseReview.missingReceipt}</p></div></div>
            {data.expenseReview.missingDescription > 0 && <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-900"><AlertTriangle size={16} />{data.expenseReview.missingDescription} historical expense{data.expenseReview.missingDescription === 1 ? '' : 's'} still need a clear explanation.</p>}
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-bold">Expense purpose</h2><p className="mt-1 text-sm text-muted-foreground">Separated from transfers and other wallet activity.</p><div className="mt-4 space-y-3">{data.expenseClassification.map((group) => <div key={group.classification} className="flex items-center justify-between gap-4 rounded-xl border bg-background p-3"><p className="text-sm font-semibold">{group.label}</p><div className="text-right text-sm font-bold">{group.currencies.map(({ currency, amount }) => <p key={currency}>{money(amount, currency)}</p>)}</div></div>)}{data.expenseClassification.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No posted expenses in this period.</p>}</div></div>
        </section>
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="border-b p-5"><h2 className="text-lg font-bold">Finance timeline</h2><p className="mt-1 text-sm text-muted-foreground">Every amount carries its source, wallet, location, and accountable actor when available.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Flow</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Location / wallet</th><th className="px-4 py-3">Actor</th></tr></thead><tbody>{data.entries.map((entry) => <tr key={entry.id} className="border-t"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 font-semibold ${entry.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}`}>{entry.direction === 'in' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{entry.direction === 'in' ? '+' : '−'}{money(entry.amount, entry.currency)}</span></td><td className="px-4 py-3"><p className="capitalize">{entry.eventType.replaceAll('_', ' ')}</p><p className="max-w-xs text-xs text-muted-foreground">{entry.description || entry.category || 'No description'}</p></td><td className="px-4 py-3 text-muted-foreground"><p>{entry.location}</p><p className="text-xs">{entry.wallet || 'No wallet'}</p></td><td className="px-4 py-3 text-muted-foreground">{entry.actor}</td></tr>)}</tbody></table></div></section>
      </> : null}
    </main>
  )
}
