'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  PackageSearch,
  RefreshCcw,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

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

type JournalData = {
  company: { id: string; name: string }
  accounts: Array<{ id: string; code: string; name: string; type: string; currency: string; balance: number }>
  entries: Array<{
    id: string
    date: string
    description: string
    sourceType: string | null
    status: string
    lines: Array<{ id: string; account: string; currency: string; debit: number; credit: number }>
  }>
}

type InventoryStatus = 'out' | 'dead' | 'overstocked' | 'low' | 'healthy'
type InventoryHealth = {
  generatedAt: string
  thresholds: { windowDays: number; overstockDays: number; lowDays: number; restockBufferPct: number; cogsWindowMonths: number }
  totals: {
    rows: number
    cashTiedUpUsd: number
    deadCashUsd: number
    overstockedCashUsd: number
    releasableCashUsd: number
    excessCashUsd: number
    byStatus: Record<InventoryStatus, { rows: number; cashTiedUpUsd: number; excessCashUsd: number }>
  }
  purchasingCeiling: {
    windowMonths: number
    bufferPct: number
    monthlyCogsSrd: number
    monthlyCeilingSrd: number
    monthlySpendSrd: number
    monthlyOverspendSrd: number
  }
  rows: Array<{
    itemId: string
    itemName: string
    locationId: string
    locationName: string
    quantityOnHand: number
    dailyVelocity: number
    daysOfCover: number | null
    cashTiedUpUsd: number
    excessUnits: number
    excessCashUsd: number
    status: InventoryStatus
  }>
}

const STATUS_STYLE: Record<InventoryStatus, string> = {
  dead: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
  overstocked: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
  low: 'border-sky-400/20 bg-sky-400/10 text-sky-100',
  healthy: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  out: 'border-white/10 bg-white/[0.05] text-slate-300',
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function readable(value: string) {
  return value.replaceAll('_', ' ')
}

function EventBar({ currency, summary }: { currency: string; summary: Summary }) {
  const total = Math.max(summary.inflow + summary.outflow, 1)
  const incomeWidth = `${Math.max((summary.inflow / total) * 100, 2)}%`
  const spendWidth = `${Math.max((summary.outflow / total) * 100, 2)}%`

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-300">{currency}</span><span className="tabular-nums text-slate-500">Net {money(summary.net, currency)}</span></div>
    <div className="flex h-1.5 gap-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="rounded-full bg-emerald-400" style={{ width: incomeWidth }} /><span className="rounded-full bg-rose-400" style={{ width: spendWidth }} /></div>
    <div className="flex justify-between text-[11px] tabular-nums"><span className="text-emerald-300">In {money(summary.inflow, currency)}</span><span className="text-rose-300">Out {money(summary.outflow, currency)}</span></div>
  </div>
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [inventory, setInventory] = useState<InventoryHealth | null>(null)
  const [journal, setJournal] = useState<JournalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ledgerRes, inventoryRes, journalRes] = await Promise.all([
        fetch('/api/finance/ledger', { cache: 'no-store' }),
        fetch('/api/finance/inventory-health', { cache: 'no-store' }),
        fetch('/api/finance/journal', { cache: 'no-store' }),
      ])
      const payload = await ledgerRes.json() as { data?: FinanceData; error?: string }
      if (!ledgerRes.ok || !payload.data) throw new Error(payload.error || 'Unable to load finance data.')
      setData(payload.data)

      const inventoryPayload = await inventoryRes.json() as { data?: InventoryHealth }
      setInventory(inventoryRes.ok && inventoryPayload.data ? inventoryPayload.data : null)
      const journalPayload = await journalRes.json() as { data?: JournalData }
      setJournal(journalRes.ok && journalPayload.data ? journalPayload.data : null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load finance data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const eventGroups = useMemo(() => Object.entries(data?.byEvent ?? {}).map(([eventType, currencies]) => ({ eventType, currencies: Object.entries(currencies) })), [data])
  const cashAccounts = useMemo(() => {
    const accounts = journal?.accounts ?? []
    const likelyCash = accounts.filter((account) => /cash|wallet|bank/i.test(`${account.name} ${account.code}`))
    return (likelyCash.length ? likelyCash : accounts).slice(0, 4)
  }, [journal])
  const reviewFlags = data ? data.expenseReview.unclassified + data.expenseReview.missingDate + data.expenseReview.missingVendor + data.expenseReview.missingReceipt + data.expenseReview.missingDescription : 0

  return (
    <main className="min-h-screen bg-[#090d13] text-slate-100">
      <div className="mx-auto max-w-[1560px] px-4 pb-20 pt-4 sm:px-6 lg:px-10 lg:pt-7">
        <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-300"><CircleDollarSign size={20} /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">NextX operating system</p><h1 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Finance command</h1></div>
          </div>
          <nav aria-label="Finance workspace" className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.03] p-1 lg:w-auto">
            <Link href="/finance" className="whitespace-nowrap rounded-lg bg-white/[0.1] px-3 py-1.5 text-xs font-semibold text-white">Overview</Link>
            <Link href="/finance/review" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.07] hover:text-white">Review queue</Link>
            <Link href="/finance/close" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.07] hover:text-white">Close center</Link>
          </nav>
          <button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.08]"><RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />Refresh data</button>
        </header>

        {error ? <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"><AlertTriangle className="mt-0.5 shrink-0" size={17} />{error}</div> : null}

        {loading && !data ? <section className="mt-6 grid min-h-72 place-items-center rounded-[28px] border border-white/[0.08] bg-[#111722]"><div className="text-center"><RefreshCcw className="mx-auto animate-spin text-orange-300" size={24} /><p className="mt-3 text-sm text-slate-400">Loading the immutable money trail</p></div></section> : null}

        {data ? <>
          <section className="relative mt-6 overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#111722] shadow-2xl shadow-black/20">
            <div aria-hidden className="absolute right-0 top-0 h-64 w-[44%] border-l border-b border-white/[0.04] bg-[radial-gradient(circle_at_70%_0%,rgba(249,112,21,0.13),transparent_62%)]" />
            <div className="relative grid gap-8 p-6 lg:grid-cols-[minmax(0,1.16fr)_minmax(360px,.84fr)] lg:p-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-300"><span className="h-1.5 w-1.5 rounded-full bg-orange-300" />Live control surface</div>
                <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-4xl">Know what moved.<br /><span className="text-slate-400">Know what needs attention.</span></h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Verified ledger activity since {new Date(data.windowStart).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}. Every balance movement links to accountable evidence.</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/finance/review" className="inline-flex items-center gap-2 rounded-xl bg-orange-400 px-4 py-2.5 text-sm font-bold text-[#17100b] transition hover:bg-orange-300">Resolve review queue <ArrowRight size={16} /></Link>
                  <Link href="/finance/close" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.13] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-white/25 hover:bg-white/[0.08]"><FileCheck2 size={16} />Prepare month close</Link>
                </div>
                <div className="mt-9 grid max-w-2xl grid-cols-2 border-t border-white/[0.08] pt-5 sm:grid-cols-4">
                  <div className="border-r border-white/[0.08] pr-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Ledger events</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{data.entries.length}</p></div>
                  <div className="border-r border-white/[0.08] px-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Open review flags</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${reviewFlags ? 'text-amber-200' : 'text-emerald-300'}`}>{reviewFlags}</p></div>
                  <div className="mt-4 sm:mt-0 sm:border-r sm:border-white/[0.08] sm:px-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Journal checks</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><CheckCircle2 size={15} />Paired</p></div>
                  <div className="mt-4 sm:mt-0 sm:pl-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Inventory lines</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{inventory?.totals.rows ?? '—'}</p></div>
                </div>
              </div>

              <div className="self-end rounded-2xl border border-white/[0.09] bg-[#0c1119]/85 p-5 backdrop-blur">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">90-day cash flow</p><p className="mt-1 text-sm font-medium text-slate-200">Currency-separated movement</p></div><Wallet size={19} className="text-orange-300" /></div>
                <div className="mt-6 space-y-5">{Object.entries(data.byCurrency).map(([currency, summary]) => <EventBar key={currency} currency={currency} summary={summary} />)}</div>
                <div className="mt-6 flex items-center gap-2 border-t border-white/[0.08] pt-4 text-xs text-slate-500"><ShieldCheck size={15} className="text-emerald-300" />Source and currency never merge in this view.</div>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,.65fr)]">
            <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]">
              <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Flow map</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Money movement by source</h2></div><p className="text-xs text-slate-500">Income green. Spend rose.</p></div>
              <div className="grid divide-y divide-white/[0.07] md:grid-cols-2 md:divide-x md:divide-y-0">{eventGroups.map((group) => <article key={group.eventType} className="p-5"><p className="text-sm font-semibold capitalize text-slate-100">{readable(group.eventType)}</p><div className="mt-4 space-y-4">{group.currencies.map(([currency, summary]) => <EventBar key={currency} currency={currency} summary={summary} />)}</div></article>)}</div>
            </div>
            <aside className="overflow-hidden rounded-2xl border border-amber-300/15 bg-[#171411]">
              <div className="border-b border-amber-100/10 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300/70">Attention queue</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Review before close</h2></div>
              <div className="divide-y divide-amber-100/10">{[
                ['Unclassified expenses', data.expenseReview.unclassified],
                ['Missing supplier', data.expenseReview.missingVendor],
                ['Missing receipt reference', data.expenseReview.missingReceipt],
                ['Missing explanation', data.expenseReview.missingDescription],
              ].map(([label, count]) => <div key={label as string} className="flex items-center justify-between gap-4 px-5 py-3.5"><span className="text-sm text-slate-300">{label}</span><span className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold tabular-nums ${Number(count) ? 'bg-amber-300/15 text-amber-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{count}</span></div>)}</div>
              <Link href="/finance/review" className="flex items-center justify-between border-t border-amber-100/10 px-5 py-4 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/[0.06]">Open review workbench <ArrowRight size={16} /></Link>
            </aside>
          </section>

          {inventory ? <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]">
            <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] px-5 py-5 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500"><PackageSearch size={14} className="text-orange-300" />Inventory intelligence</div><h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Cash tied up in stock</h2><p className="mt-1 max-w-2xl text-sm text-slate-400">Velocity is measured over the last {inventory.thresholds.windowDays} days for each product and location.</p></div><div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${inventory.purchasingCeiling.monthlyOverspendSrd > 0 ? 'border-amber-300/20 bg-amber-300/10 text-amber-200' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}`}>{inventory.purchasingCeiling.monthlyOverspendSrd > 0 ? `SRD ${inventory.purchasingCeiling.monthlyOverspendSrd.toLocaleString()} above monthly ceiling` : 'Within monthly purchasing ceiling'}</div></div>
            <div className="grid divide-y divide-white/[0.07] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">{[
              ['Capital in stock', money(inventory.totals.cashTiedUpUsd, 'USD'), `${inventory.totals.rows} stocked lines`],
              ['Dead inventory', money(inventory.totals.deadCashUsd, 'USD'), `${inventory.totals.byStatus.dead.rows} lines with no movement`],
              ['Overstocked', money(inventory.totals.overstockedCashUsd, 'USD'), `${inventory.totals.byStatus.overstocked.rows} lines beyond cover`],
              ['Releasable cash', money(inventory.totals.releasableCashUsd, 'USD'), `${money(inventory.totals.excessCashUsd, 'USD')} excess value`],
            ].map(([label, amount, note]) => <div key={label} className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-white">{amount}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>)}</div>
            <div className="overflow-x-auto border-t border-white/[0.08]"><table className="min-w-full text-left text-sm"><thead className="bg-white/[0.025] text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">Location</th><th className="px-5 py-3 text-right">On hand</th><th className="px-5 py-3 text-right">Cover</th><th className="px-5 py-3 text-right">Capital</th><th className="px-5 py-3">State</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{inventory.rows.map((row) => <tr key={`${row.itemId}:${row.locationId}`} className="transition hover:bg-white/[0.025]"><td className="px-5 py-3.5 font-medium text-slate-100">{row.itemName}</td><td className="px-5 py-3.5 text-slate-400">{row.locationName}</td><td className="px-5 py-3.5 text-right tabular-nums text-slate-300">{row.quantityOnHand}</td><td className="px-5 py-3.5 text-right tabular-nums text-slate-400">{row.daysOfCover === null ? 'No sales' : `${Math.round(row.daysOfCover).toLocaleString()} days`}</td><td className="px-5 py-3.5 text-right font-medium tabular-nums text-slate-200">{money(row.cashTiedUpUsd, 'USD')}</td><td className="px-5 py-3.5"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[row.status]}`}>{row.status}</span></td></tr>)}</tbody></table></div>
          </section> : null}

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
            <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex items-end justify-between gap-4 border-b border-white/[0.08] px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Double-entry journal</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Balances with an audit trail</h2></div><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200"><CheckCircle2 size={13} />Balanced</span></div>
              <div className="grid divide-y divide-white/[0.07] sm:grid-cols-2 sm:divide-x sm:divide-y-0">{cashAccounts.map((account) => <div key={account.id} className="p-5"><div className="flex justify-between gap-3"><p className="text-xs font-semibold text-slate-300">{account.name}</p><span className="text-[10px] font-bold text-slate-500">{account.code}</span></div><p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-white">{money(account.balance, account.currency)}</p><p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{account.currency} {account.type}</p></div>)}</div>
              <div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">{journal?.entries.slice(0, 4).map((entry) => <div key={entry.id} className="flex items-start justify-between gap-4 px-5 py-4"><div><p className="text-sm font-medium text-slate-200">{entry.description}</p><p className="mt-1 text-xs capitalize text-slate-500">{entry.date} · {entry.sourceType ? readable(entry.sourceType) : 'manual journal'} · {entry.lines.length} lines</p></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase text-emerald-200">{entry.status}</span></div>)}</div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="border-b border-white/[0.08] px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Expense allocation</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Purpose of spend</h2></div><div className="divide-y divide-white/[0.06]">{data.expenseClassification.map((group) => <div key={group.classification} className="flex items-center justify-between gap-4 px-5 py-4"><p className="text-sm font-medium text-slate-200">{group.label}</p><div className="text-right text-sm font-semibold tabular-nums text-white">{group.currencies.map(({ currency, amount }) => <p key={currency}>{money(amount, currency)}</p>)}</div></div>)}{data.expenseClassification.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No posted expenses in this period.</p> : null}</div></section>
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]">
            <div className="flex flex-col justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Immutable ledger</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Latest money trail</h2></div><p className="text-xs text-slate-500">Source, location, wallet, and actor travel with every entry.</p></div>
            <div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left text-sm"><thead className="bg-white/[0.025] text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-3">When</th><th className="px-5 py-3">Movement</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Location / wallet</th><th className="px-5 py-3">Actor</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{data.entries.slice(0, 15).map((entry) => <tr key={entry.id} className="transition hover:bg-white/[0.025]"><td className="whitespace-nowrap px-5 py-3.5 text-xs tabular-nums text-slate-500">{new Date(entry.occurredAt).toLocaleString()}</td><td className="px-5 py-3.5"><span className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${entry.direction === 'in' ? 'text-emerald-300' : 'text-rose-300'}`}>{entry.direction === 'in' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{entry.direction === 'in' ? '+' : '−'}{money(entry.amount, entry.currency)}</span></td><td className="px-5 py-3.5"><p className="capitalize text-slate-200">{readable(entry.eventType)}</p><p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{entry.description || entry.category || 'No description'}</p></td><td className="px-5 py-3.5 text-xs text-slate-400"><p>{entry.location}</p><p className="mt-0.5 text-slate-500">{entry.wallet || 'No wallet'}</p></td><td className="px-5 py-3.5 text-slate-400">{entry.actor}</td></tr>)}</tbody></table></div>
          </section>
        </> : null}
      </div>
    </main>
  )
}
