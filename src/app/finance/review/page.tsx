'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, FileWarning, Package, Receipt, RefreshCcw, ShoppingCart } from 'lucide-react'

type ReviewData = {
  generatedAt: string
  sales: Array<{ id: string; createdAt: string; totalAmount: number; currency: string; locationName: string; lineItemCount: number; reason: string | null }>
  expenses: Array<{ id: string; createdAt: string; amount: number; currency: string; description: string | null; categoryName: string | null; classification: string; reason: string | null }>
  items: Array<{ id: string; name: string; purchasePriceUsd: number; reason: string | null }>
  commissionPayoutGap: { paidCommissions: number; totalSrd: number; payoutExpensesRecorded: number; reportPath: string }
  voidedSales: number
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function Stat({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${warning ? 'border-amber-300/15 bg-[#171411]' : 'border-white/[0.08] bg-[#101620]'}`}>
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
    <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${warning && value > 0 ? 'text-amber-200' : value === 0 ? 'text-emerald-200' : 'text-white'}`}>{value}</p>
  </div>
}

export default function FinanceReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/finance/review', { cache: 'no-store' })
      const payload = await response.json() as { data?: ReviewData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to load the review queue.')
      setData(payload.data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the review queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const totalFlagged = (data?.sales.length ?? 0) + (data?.expenses.length ?? 0) + (data?.items.length ?? 0)

  return (
    <main className="finance-control-workspace min-h-screen bg-[#090d13] text-slate-100">
      <div className="mx-auto max-w-[1560px] space-y-6 px-4 pb-20 pt-4 sm:px-6 lg:px-10 lg:pt-7">
        <header className="flex flex-col justify-between gap-5 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end">
          <div>
            <Link href="/finance" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-300 transition hover:text-orange-200"><ArrowLeft size={14} />Finance command</Link>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/75">Controlled exception queue</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Records the system<br className="hidden sm:block" /> will not guess about.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Every row here is excluded from margin, run rate, and payout calculations. Nothing has been deleted or altered. These questions stay visible until a person resolves them.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.1]"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />Refresh queue</button>
        </header>

        {error ? <div role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div> : null}
        {loading && !data ? <div className="grid min-h-64 place-items-center rounded-2xl border border-white/[0.08] bg-[#101620] text-sm text-slate-400"><span className="inline-flex items-center gap-2"><RefreshCcw size={17} className="animate-spin text-orange-300" />Loading review evidence</span></div> : null}

        {data ? <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Flagged records" value={totalFlagged} warning />
            <Stat label="Sales needing review" value={data.sales.length} />
            <Stat label="Expenses needing review" value={data.expenses.length} />
            <Stat label="Voided sales" value={data.voidedSales} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-amber-300/20 bg-[#171411]">
            <div className="flex flex-col justify-between gap-4 border-b border-amber-100/10 px-5 py-4 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-amber-100"><FileWarning size={19} className="text-amber-300" /><h2 className="text-lg font-semibold">Commission payouts with no expense behind them</h2></div><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200"><AlertTriangle size={13} />Accountant decision</span></div>
            <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div><p className="text-sm leading-6 text-amber-100/90"><strong>{data.commissionPayoutGap.paidCommissions} commissions</strong> are marked paid, totalling <strong>{money(data.commissionPayoutGap.totalSrd, 'SRD')}</strong>, against <strong>{data.commissionPayoutGap.payoutExpensesRecorded}</strong> payout expenses recorded. The previous payout path did not record the cost.</p><p className="mt-3 text-sm leading-6 text-slate-400">No historical expenses are inserted automatically. Backdating them would rewrite periods that may already have been reviewed.</p></div><div className="rounded-xl border border-amber-100/10 bg-black/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Decision file</p><code className="mt-2 block break-all text-xs text-amber-200">{data.commissionPayoutGap.reportPath}</code></div></div>
          </section>

          <ReviewTable title="Sales" icon={<ShoppingCart size={18} className="text-orange-300" />} empty="No sales are flagged." rows={data.sales.map((sale) => ({ key: sale.id, primary: `${money(sale.totalAmount, sale.currency)} · ${sale.locationName}`, secondary: `${new Date(sale.createdAt).toLocaleDateString()} · ${sale.lineItemCount} line item${sale.lineItemCount === 1 ? '' : 's'} · ${sale.id.slice(0, 8)}`, reason: sale.reason }))} />
          <ReviewTable title="Expenses" icon={<Receipt size={18} className="text-orange-300" />} empty="No expenses are flagged." rows={data.expenses.map((expense) => ({ key: expense.id, primary: `${money(expense.amount, expense.currency)} · ${expense.categoryName ?? 'Uncategorised'}`, secondary: `${new Date(expense.createdAt).toLocaleDateString()} · ${expense.classification} · ${expense.description ?? 'No description'}`, reason: expense.reason }))} />
          <ReviewTable title="Products" icon={<Package size={18} className="text-orange-300" />} empty="No products are flagged." rows={data.items.map((item) => ({ key: item.id, primary: item.name, secondary: `Purchase cost ${money(item.purchasePriceUsd, 'USD')}`, reason: item.reason }))} />

          {totalFlagged === 0 ? <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-5 py-4 text-sm text-emerald-100"><CheckCircle2 size={18} className="text-emerald-300" />No open exceptions are currently excluded from finance calculations.</div> : null}
        </> : null}
      </div>
    </main>
  )
}

function ReviewTable({ title, icon, rows, empty }: { title: string; icon: React.ReactNode; empty: string; rows: Array<{ key: string; primary: string; secondary: string; reason: string | null }> }) {
  return <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]">
    <div className="flex items-center justify-between border-b border-white/[0.08] p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-white">{icon}{title}</h2><span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-bold tabular-nums text-slate-300">{rows.length}</span></div>
    {rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{empty}</p> : <ul className="divide-y divide-white/[0.06]">{rows.map((row) => <li key={row.key} className="flex flex-col gap-2 p-4 transition hover:bg-white/[0.025] sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-semibold text-slate-100">{row.primary}</p><p className="mt-0.5 text-xs text-slate-500">{row.secondary}</p></div><p className="flex max-w-xl items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.08] px-3 py-2 text-xs text-amber-100"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />{row.reason ?? 'Flagged for review.'}</p></li>)}</ul>}
  </section>
}
