'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, Package, Receipt, RefreshCcw, ShoppingCart } from 'lucide-react'
import { FinanceWorkspaceNav } from '@/components/finance/FinanceWorkspaceNav'
import { DocumentationQuestions } from '@/components/finance/DocumentationQuestions'

type ReviewData = {
  generatedAt: string
  sales: Array<{ id: string; createdAt: string; totalAmount: number; currency: string; locationName: string; lineItemCount: number; reason: string | null }>
  expenses: Array<{ id: string; createdAt: string; amount: number; currency: string; description: string | null; categoryName: string | null; classification: string; reason: string | null }>
  items: Array<{ id: string; name: string; purchasePriceUsd: number; reason: string | null }>
  commissionPayoutGap: { paidCommissions: number; totalSrd: number; payoutExpensesRecorded: number; reportPath: string }
  voidedSales: number
}
type ReviewKind = 'all' | 'sales' | 'expenses' | 'products'

function money(value: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value) }

function Count({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border px-3 py-2 text-left transition ${active ? 'border-orange-300/30 bg-orange-300/10 text-orange-100' : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'}`}><span className="block text-[10px] font-bold uppercase tracking-[0.13em]">{label}</span><span className="mt-1 block text-xl font-semibold tabular-nums">{count}</span></button>
}

export default function FinanceReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ReviewKind>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const response = await fetch('/api/finance/review', { cache: 'no-store' })
      const payload = await response.json() as { data?: ReviewData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to load the review queue.')
      setData(payload.data)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load the review queue.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const total = (data?.sales.length ?? 0) + (data?.expenses.length ?? 0) + (data?.items.length ?? 0)
  const sections = useMemo(() => data ? [
    { id: 'sales' as const, title: 'Sales records', description: 'Sales excluded from reports until their record is complete.', icon: ShoppingCart, empty: 'No sales need review.', rows: data.sales.map((sale) => ({ id: sale.id, title: `${money(sale.totalAmount, sale.currency)} · ${sale.locationName}`, meta: `${new Date(sale.createdAt).toLocaleDateString()} · ${sale.lineItemCount} line item${sale.lineItemCount === 1 ? '' : 's'}`, reason: sale.reason })) },
    { id: 'expenses' as const, title: 'Expense records', description: 'Expenses that need a classification, supplier, or explanation.', icon: Receipt, empty: 'No expenses need review.', rows: data.expenses.map((expense) => ({ id: expense.id, title: `${money(expense.amount, expense.currency)} · ${expense.categoryName ?? 'Uncategorised'}`, meta: `${new Date(expense.createdAt).toLocaleDateString()} · ${expense.classification} · ${expense.description ?? 'No description'}`, reason: expense.reason })) },
    { id: 'products' as const, title: 'Product cost records', description: 'Products excluded from margin figures until cost information is resolved.', icon: Package, empty: 'No products need review.', rows: data.items.map((item) => ({ id: item.id, title: item.name, meta: `Purchase cost ${money(item.purchasePriceUsd, 'USD')}`, reason: item.reason })) },
  ] : [], [data])

  return <main className="finance-control-workspace min-h-full bg-[#090d13] text-slate-100"><div className="mx-auto max-w-[1160px] px-4 pb-20 pt-5 sm:px-6 lg:pt-8">
    <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">Money & finance</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">Resolve records before they reach the books.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Answer the grouped questions first — one answer documents a whole category of expenses. What is left below is deliberately excluded from margin, payout, and close calculations until its source record is corrected.</p></div><button type="button" onClick={() => void load()} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></header>
    <div className="mt-5"><FinanceWorkspaceNav active="review" /></div>
    <div className="mt-5"><DocumentationQuestions onResolved={() => void load()} /></div>
    {error ? <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" />{error}</div> : null}
    {loading && !data ? <div className="mt-5 grid min-h-64 place-items-center rounded-2xl border border-white/[0.08] bg-[#101620]"><span className="inline-flex items-center gap-2 text-sm text-slate-400"><RefreshCcw size={17} className="animate-spin text-orange-300" />Loading records to review</span></div> : null}
    {data ? <>
      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><article className="rounded-2xl border border-amber-300/20 bg-[#171411] p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300/75">Review queue</p><p className={`mt-3 text-5xl font-semibold tracking-[-0.06em] tabular-nums ${total ? 'text-amber-100' : 'text-emerald-200'}`}>{total}</p><p className="mt-1 text-sm text-slate-400">record{total === 1 ? '' : 's'} currently excluded from finance calculations</p><p className="mt-5 max-w-2xl border-t border-amber-100/10 pt-4 text-sm leading-6 text-slate-400">No amount, wallet or ledger entry is ever guessed. Answer the questions above to document expenses in groups; the records below need a fact only their source page can supply.</p></article><aside className="rounded-2xl border border-white/[0.09] bg-[#101620] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">How to clear a record</p><ol className="mt-4 space-y-3 text-sm"><li className="flex gap-3"><span className="text-orange-300">1</span><span className="text-slate-300">Read why the record was stopped.</span></li><li className="flex gap-3"><span className="text-orange-300">2</span><span className="text-slate-300">Open the source page and add the missing fact.</span></li><li className="flex gap-3"><span className="text-orange-300">3</span><span className="text-slate-300">Refresh this queue to verify it cleared.</span></li></ol></aside></section>
      <section className="mt-5 grid gap-2 sm:grid-cols-4"><Count label="All records" count={total} active={filter === 'all'} onClick={() => setFilter('all')} /><Count label="Sales" count={data.sales.length} active={filter === 'sales'} onClick={() => setFilter('sales')} /><Count label="Expenses" count={data.expenses.length} active={filter === 'expenses'} onClick={() => setFilter('expenses')} /><Count label="Products" count={data.items.length} active={filter === 'products'} onClick={() => setFilter('products')} /></section>
      {data.commissionPayoutGap.paidCommissions > 0 ? <section className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5"><div className="flex items-start gap-3"><FileWarning size={19} className="mt-0.5 shrink-0 text-amber-300" /><div><h2 className="font-semibold text-amber-100">Commission payout history needs an accountant decision</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400"><strong className="text-amber-100">{data.commissionPayoutGap.paidCommissions} paid commissions</strong> total {money(data.commissionPayoutGap.totalSrd, 'SRD')}, while {data.commissionPayoutGap.payoutExpensesRecorded} payout expenses exist. These are intentionally not backfilled automatically because that could rewrite an already-reviewed period.</p><code className="mt-3 block break-all text-xs text-amber-200">Decision file: {data.commissionPayoutGap.reportPath}</code></div></div></section> : null}
      <section className="mt-5 space-y-4">{sections.filter((section) => filter === 'all' || filter === section.id).map((section) => <ReviewSection key={section.id} {...section} />)}</section>
      {total === 0 ? <section className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-5"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-300" /><div><h2 className="font-semibold text-emerald-100">The review queue is clear</h2><p className="mt-1 text-sm text-emerald-100/70">You can continue to the month-end checklist when other close controls are ready.</p><Link href="/finance/close" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-200">Open close month <ArrowRight size={15} /></Link></div></section> : null}
    </> : null}
  </div></main>
}

function ReviewSection({ title, description, icon: Icon, empty, rows }: { title: string; description: string; icon: typeof ShoppingCart; empty: string; rows: Array<{ id: string; title: string; meta: string; reason: string | null }> }) {
  return <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4"><div className="flex gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-300/10 text-orange-300"><Icon size={17} /></span><div><h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{description}</p></div></div><span className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-bold tabular-nums text-slate-300">{rows.length}</span></div>{rows.length ? <ul className="divide-y divide-white/[0.06]">{rows.map((row) => <li key={row.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.7fr)] lg:items-center"><div><p className="font-semibold text-slate-200">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.meta}</p></div><p className="flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-xs leading-5 text-amber-100"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />{row.reason ?? 'This record needs a review.'}</p></li>)}</ul> : <p className="p-7 text-center text-sm text-slate-500">{empty}</p>}</section>
}
