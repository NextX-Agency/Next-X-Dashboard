'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, FileText, RefreshCcw, Wallet } from 'lucide-react'
import { FinanceWorkspaceNav } from '@/components/finance/FinanceWorkspaceNav'

type Summary = { inflow: number; outflow: number; net: number }
type FinanceData = {
  windowStart: string
  byCurrency: Record<string, Summary>
  byEvent: Record<string, Record<string, Summary>>
  byLocation: Record<string, Record<string, Summary>>
  expenseReview: { total: number; unclassified: number; missingDate: number; missingVendor: number; missingReceipt: number; missingDescription: number; refunded: number }
  expenseClassification: Array<{ classification: string; label: string; currencies: Array<{ currency: string; amount: number }> }>
  entries: Array<{ id: string; eventType: string; direction: 'in' | 'out'; amount: number; currency: string; description: string | null; occurredAt: string; location: string; wallet: string | null; seller: string | null; category: string | null; actor: string }>
}
type JournalData = {
  company: { id: string; name: string }
  accounts: Array<{ id: string; code: string; name: string; type: string; currency: string; balance: number }>
  entries: Array<{ id: string; date: string; description: string; sourceType: string | null; status: string; lines: Array<{ id: string; account: string; currency: string; debit: number; credit: number }> }>
}
type InventoryStatus = 'out' | 'dead' | 'overstocked' | 'low' | 'healthy'
type InventoryHealth = {
  thresholds: { windowDays: number; overstockDays: number; lowDays: number }
  totals: { rows: number; cashTiedUpUsd: number; deadCashUsd: number; overstockedCashUsd: number; releasableCashUsd: number; excessCashUsd: number; byStatus: Record<InventoryStatus, { rows: number; cashTiedUpUsd: number; excessCashUsd: number }> }
  purchasingCeiling: { windowMonths: number; bufferPct: number; monthlyCogsSrd: number; monthlyCeilingSrd: number; monthlySpendSrd: number; monthlyOverspendSrd: number }
  rows: Array<{ itemId: string; itemName: string; locationId: string; locationName: string; quantityOnHand: number; daysOfCover: number | null; cashTiedUpUsd: number; excessUnits: number; excessCashUsd: number; status: InventoryStatus }>
}
type PurchasingData = {
  generatedAt: string
  summary: {
    draftCount: number
    linkedCount: number
    unlinkedCount: number
    awaitingReceiptCount: number
    outstandingByCurrency: Array<{ currency: string; amount: number }>
    unlinkedByCurrency: Array<{ currency: string; amount: number }>
  }
  rows: Array<{
    id: string
    status: string
    totalAmount: number
    currency: string
    expectedArrival: string | null
    createdAt: string
    supplier: string
    location: string
    fundingSource: string | null
    orderedUnits: number
    receivedUnits: number
    financeStage: 'draft' | 'needs_link' | 'payable' | 'partially_settled' | 'settled'
    commitment: { id: string; status: string; outstandingAmount: number | null } | null
  }>
}

const INVENTORY_TONE: Record<InventoryStatus, string> = {
  dead: 'border-rose-300/20 bg-rose-300/[0.08] text-rose-200',
  overstocked: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100',
  low: 'border-sky-300/20 bg-sky-300/[0.08] text-sky-100',
  healthy: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100',
  out: 'border-white/[0.1] bg-white/[0.05] text-slate-300',
}

const PURCHASE_STAGE: Record<PurchasingData['rows'][number]['financeStage'], { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'border-sky-300/20 bg-sky-300/[0.08] text-sky-100' },
  needs_link: { label: 'Finance link needed', tone: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100' },
  payable: { label: 'Payable recorded', tone: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100' },
  partially_settled: { label: 'Partly settled', tone: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100' },
  settled: { label: 'Settled', tone: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100' },
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}
function readable(value: string) { return value.replaceAll('_', ' ') }

function CashMetric({ currency, summary }: { currency: string; summary: Summary }) {
  const total = Math.max(summary.inflow + summary.outflow, 1)
  return <article className="rounded-xl border border-white/[0.08] bg-[#0b111a] p-4"><div className="flex items-start justify-between"><p className="text-xs font-semibold text-slate-300">{currency}</p><Wallet size={16} className="text-orange-300" /></div><p className={`mt-3 text-2xl font-semibold tracking-[-0.03em] tabular-nums ${summary.net >= 0 ? 'text-white' : 'text-rose-200'}`}>{money(summary.net, currency)}</p><p className="mt-1 text-xs text-slate-500">Net movement in this period</p><div className="mt-4 flex h-1.5 gap-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="rounded-full bg-emerald-400" style={{ width: `${Math.max((summary.inflow / total) * 100, 2)}%` }} /><span className="rounded-full bg-rose-400" style={{ width: `${Math.max((summary.outflow / total) * 100, 2)}%` }} /></div><div className="mt-2 flex justify-between text-[10px] tabular-nums"><span className="text-emerald-300">In {money(summary.inflow, currency)}</span><span className="text-rose-300">Out {money(summary.outflow, currency)}</span></div></article>
}

function NextStep({ number, title, detail, href, complete }: { number: string; title: string; detail: string; href: string; complete?: boolean }) {
  return <Link href={href} className="group flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 transition hover:border-orange-300/25 hover:bg-white/[0.055]"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${complete ? 'bg-emerald-300/10 text-emerald-200' : 'bg-orange-300/10 text-orange-200'}`}>{complete ? <CheckCircle2 size={16} /> : number}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-100">{title}</span><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span><ArrowRight size={16} className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-orange-300" /></Link>
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [inventory, setInventory] = useState<InventoryHealth | null>(null)
  const [journal, setJournal] = useState<JournalData | null>(null)
  const [purchasing, setPurchasing] = useState<PurchasingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [ledgerRes, inventoryRes, journalRes, purchasingRes] = await Promise.all([fetch('/api/finance/ledger', { cache: 'no-store' }), fetch('/api/finance/inventory-health', { cache: 'no-store' }), fetch('/api/finance/journal', { cache: 'no-store' }), fetch('/api/finance/purchasing', { cache: 'no-store' })])
      const ledgerPayload = await ledgerRes.json() as { data?: FinanceData; error?: string }
      if (!ledgerRes.ok || !ledgerPayload.data) throw new Error(ledgerPayload.error || 'Unable to load finance data.')
      setData(ledgerPayload.data)
      const inventoryPayload = await inventoryRes.json() as { data?: InventoryHealth }
      setInventory(inventoryRes.ok ? inventoryPayload.data ?? null : null)
      const journalPayload = await journalRes.json() as { data?: JournalData }
      setJournal(journalRes.ok ? journalPayload.data ?? null : null)
      const purchasingPayload = await purchasingRes.json() as { data?: PurchasingData }
      setPurchasing(purchasingRes.ok ? purchasingPayload.data ?? null : null)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load finance data.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const reviewFlags = data ? data.expenseReview.unclassified + data.expenseReview.missingDate + data.expenseReview.missingVendor + data.expenseReview.missingReceipt + data.expenseReview.missingDescription : 0
  const cashAccounts = useMemo(() => {
    const accounts = journal?.accounts ?? []
    return accounts.filter((account) => /cash|wallet|bank/i.test(`${account.name} ${account.code}`)).slice(0, 4)
  }, [journal])
  const events = useMemo(() => Object.entries(data?.byEvent ?? {}).slice(0, 6), [data])

  return <main className="finance-control-workspace min-h-full bg-[#090d13] text-slate-100"><div className="mx-auto max-w-[1440px] px-4 pb-20 pt-5 sm:px-6 lg:px-10 lg:pt-8">
    <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">Money & finance</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">See the money. Then decide what to do.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">This page separates the current picture from work that needs a decision. It does not change any financial record.</p></div><button type="button" onClick={() => void load()} className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></header>
    <div className="mt-5"><FinanceWorkspaceNav active="overview" /></div>
    {error ? <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" />{error}</div> : null}
    {loading && !data ? <div className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-white/[0.08] bg-[#101620]"><span className="inline-flex items-center gap-2 text-sm text-slate-400"><RefreshCcw size={18} className="animate-spin text-orange-300" />Loading finance picture</span></div> : null}
    {data ? <>
      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(350px,.85fr)]"><article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="border-b border-white/[0.08] px-5 py-5 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Your next finance steps</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Follow the purchase-to-close path.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Start with what the order desk has committed. Then resolve evidence gaps before the close center locks a period.</p></div><div className="space-y-2 p-4 sm:p-5"><NextStep number="1" title={purchasing?.summary.unlinkedCount ? `${purchasing.summary.unlinkedCount} purchase order${purchasing.summary.unlinkedCount === 1 ? '' : 's'} need a Finance link` : `${purchasing?.summary.linkedCount ?? 0} purchase commitments are linked`} detail={purchasing?.summary.unlinkedCount ? 'Review each existing order, then record its payable commitment from the order desk.' : 'Confirm new orders there to create their payable commitment automatically.'} href="/purchasing" complete={Boolean(purchasing) && purchasing.summary.unlinkedCount === 0} /><NextStep number="2" title={reviewFlags ? `${reviewFlags} record${reviewFlags === 1 ? '' : 's'} need review` : 'No documentation exceptions'} detail={reviewFlags ? 'Missing fields are excluded from calculations until they are reviewed.' : 'The current review queue is clear.'} href="/finance/review" complete={!reviewFlags} /><NextStep number="3" title="Check money movement" detail="Compare incoming and outgoing cash by currency and source." href="#movement" /><NextStep number="4" title="Prepare the month close" detail="Run the required checks and lock only when the checklist is clear." href="/finance/close" /></div></article><article className="rounded-2xl border border-white/[0.09] bg-[#101620] p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Review status</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">What needs attention</h2></div><FileText size={19} className={reviewFlags ? 'text-amber-300' : 'text-emerald-300'} /></div><p className={`mt-5 text-5xl font-semibold tracking-[-0.05em] tabular-nums ${reviewFlags ? 'text-amber-200' : 'text-emerald-200'}`}>{reviewFlags}</p><p className="mt-1 text-sm text-slate-400">open documentation checks</p><div className="mt-6 space-y-3 border-t border-white/[0.08] pt-4">{[['Missing classification', data.expenseReview.unclassified], ['Missing supplier', data.expenseReview.missingVendor], ['Missing receipt', data.expenseReview.missingReceipt], ['Missing explanation', data.expenseReview.missingDescription]].map(([label, count]) => <div key={label as string} className="flex justify-between text-sm"><span className="text-slate-400">{label}</span><span className={`font-semibold tabular-nums ${Number(count) ? 'text-amber-200' : 'text-emerald-200'}`}>{count}</span></div>)}</div><Link href="/finance/review" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-300 hover:text-orange-200">Open review queue <ArrowRight size={15} /></Link></article></section>
      {purchasing ? <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] px-5 py-5 sm:flex-row sm:items-end sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Purchases and commitments</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">The order desk is the first finance control.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A confirmed purchase order creates a payable commitment, not a payment. It stays visible here until Finance reviews the supplier bill.</p></div><Link href="/purchasing" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-orange-300 hover:text-orange-200">Open order desk <ArrowRight size={15} /></Link></div><div className="grid divide-y divide-white/[0.07] md:grid-cols-3 md:divide-x md:divide-y-0"><div className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Outstanding supplier commitments</p><div className="mt-3 flex flex-wrap gap-2">{purchasing.summary.outstandingByCurrency.length ? purchasing.summary.outstandingByCurrency.map((entry) => <span key={entry.currency} className="rounded-lg bg-orange-300/10 px-3 py-2 text-lg font-semibold tabular-nums text-orange-100">{money(entry.amount, entry.currency)}</span>) : <span className="text-sm text-slate-500">No unpaid commitments.</span>}</div><p className="mt-3 text-xs text-slate-500">{purchasing.summary.linkedCount} confirmed order{purchasing.summary.linkedCount === 1 ? '' : 's'} linked to Finance</p></div><div className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Receipt follow-up</p><p className="mt-3 text-3xl font-semibold tabular-nums text-white">{purchasing.summary.awaitingReceiptCount}</p><p className="mt-1 text-sm text-slate-400">order{purchasing.summary.awaitingReceiptCount === 1 ? '' : 's'} in transit or partially received</p></div><div className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Link check</p>{purchasing.summary.unlinkedCount ? <><p className="mt-3 text-3xl font-semibold tabular-nums text-amber-200">{purchasing.summary.unlinkedCount}</p><p className="mt-1 text-sm leading-5 text-slate-400">existing order{purchasing.summary.unlinkedCount === 1 ? '' : 's'} need a reviewed payable link.</p></> : <><p className="mt-3 text-lg font-semibold text-emerald-200">All clear</p><p className="mt-1 text-sm leading-5 text-slate-400">Every confirmed order is represented in Finance.</p></>}</div></div><div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">{purchasing.rows.map((order) => { const stage = PURCHASE_STAGE[order.financeStage]; const received = `${order.receivedUnits}/${order.orderedUnits} units received`; return <article key={order.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_155px_165px] sm:items-center sm:px-6"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-200">{order.supplier}</p><span className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${stage.tone}`}>{stage.label}</span></div><p className="mt-1 text-xs text-slate-500">Order #{order.id.slice(0, 8)} · {order.location} · {received}{order.fundingSource ? ` · planned source: ${order.fundingSource}` : ''}</p></div><div className="sm:text-right"><p className="text-sm font-semibold tabular-nums text-white">{money(order.totalAmount, order.currency)}</p><p className="mt-0.5 text-xs text-slate-500">{order.commitment?.outstandingAmount != null ? `${money(order.commitment.outstandingAmount, order.currency)} open` : order.status === 'pending' ? 'Awaiting confirmation' : 'Review from order desk'}</p></div><div className="sm:text-right"><p className="text-xs text-slate-400">{order.expectedArrival ? `ETA ${new Date(order.expectedArrival).toLocaleDateString()}` : `Created ${new Date(order.createdAt).toLocaleDateString()}`}</p><Link href="/purchasing" className="mt-1 inline-flex text-xs font-semibold text-orange-300 hover:text-orange-200">Open order desk</Link></div></article>})}{purchasing.rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No active purchase orders are currently shown.</p> : null}</div></section> : null}
      <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex flex-col justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-end sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Cash movement</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Net movement in the last 90 days</h2></div><p className="text-xs text-slate-500">Separated by currency. No conversion is mixed into these numbers.</p></div><div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">{Object.entries(data.byCurrency).map(([currency, summary]) => <CashMetric key={currency} currency={currency} summary={summary} />)}</div></section>
      <section id="movement" className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]"><article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="border-b border-white/[0.08] px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Where movement comes from</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Sources of money movement</h2></div><div className="divide-y divide-white/[0.06]">{events.map(([eventType, currencies]) => <div key={eventType} className="grid gap-3 px-5 py-4 sm:grid-cols-[150px_1fr] sm:px-6"><p className="text-sm font-semibold capitalize text-slate-200">{readable(eventType)}</p><div className="grid gap-2 sm:grid-cols-2">{Object.entries(currencies).map(([currency, summary]) => <div key={currency} className="flex justify-between gap-3 text-xs"><span className="font-semibold text-slate-400">{currency}</span><span className="tabular-nums"><span className="text-emerald-300">+{money(summary.inflow, currency)}</span><span className="mx-1.5 text-slate-600">/</span><span className="text-rose-300">-{money(summary.outflow, currency)}</span></span></div>)}</div></div>)}</div></article><article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="border-b border-white/[0.08] px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Wallet position</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Cash accounts</h2></div>{cashAccounts.length ? <div className="divide-y divide-white/[0.06]">{cashAccounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-sm font-semibold text-slate-200">{account.name}</p><p className="mt-0.5 text-xs text-slate-500">{account.code} · {account.currency}</p></div><p className="text-lg font-semibold tabular-nums text-white">{money(account.balance, account.currency)}</p></div>)}</div> : <p className="p-8 text-center text-sm text-slate-500">Cash accounts will appear after journal data is available.</p>}<Link href="/wallets" className="flex items-center justify-between border-t border-white/[0.08] px-5 py-4 text-sm font-semibold text-orange-300 hover:bg-white/[0.03]">Open wallets <ArrowRight size={16} /></Link></article></section>
      {inventory ? <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-end sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Stock and cash</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Inventory that needs a money decision</h2><p className="mt-1 text-sm text-slate-400">Only items with stock status are shown below. Use stock levels for all inventory work.</p></div><Link href="/stock" className="text-sm font-semibold text-orange-300 hover:text-orange-200">Open stock levels</Link></div><div className="grid divide-y divide-white/[0.07] sm:grid-cols-3 sm:divide-x sm:divide-y-0"><div className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Cash in stock</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{money(inventory.totals.cashTiedUpUsd, 'USD')}</p><p className="mt-1 text-xs text-slate-500">{inventory.totals.rows} stocked lines</p></div><div className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Dead or excess stock</p><p className="mt-2 text-2xl font-semibold tabular-nums text-amber-200">{money(inventory.totals.deadCashUsd + inventory.totals.overstockedCashUsd, 'USD')}</p><p className="mt-1 text-xs text-slate-500">Value with no or too much cover</p></div><div className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Purchasing ceiling</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">SRD {inventory.purchasingCeiling.monthlyCeilingSrd.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Recommended monthly stock purchase cap</p></div></div><div className="divide-y divide-white/[0.06] border-t border-white/[0.08]">{inventory.rows.filter((row) => row.status !== 'healthy').slice(0, 5).map((row) => <div key={`${row.itemId}:${row.locationId}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_120px_130px_110px] sm:items-center sm:px-6"><div><p className="text-sm font-semibold text-slate-200">{row.itemName}</p><p className="mt-0.5 text-xs text-slate-500">{row.locationName}</p></div><p className="text-sm tabular-nums text-slate-400">{row.daysOfCover === null ? 'No sales' : `${Math.round(row.daysOfCover)} days cover`}</p><p className="text-sm font-semibold tabular-nums text-slate-200">{money(row.cashTiedUpUsd, 'USD')}</p><span className={`w-fit rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${INVENTORY_TONE[row.status]}`}>{row.status}</span></div>)}{inventory.rows.every((row) => row.status === 'healthy') ? <p className="px-5 py-8 text-center text-sm text-emerald-200">No inventory exceptions are currently shown.</p> : null}</div></section> : null}
      <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex flex-col justify-between gap-2 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-end sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Recent record</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Latest ledger entries</h2></div><p className="text-xs text-slate-500">Immutable source records. See the full trail in reports if needed.</p></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-white/[0.025] text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-3">When</th><th className="px-5 py-3">Movement</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Location</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{data.entries.slice(0, 8).map((entry) => <tr key={entry.id} className="hover:bg-white/[0.025]"><td className="whitespace-nowrap px-5 py-3.5 text-xs tabular-nums text-slate-500">{new Date(entry.occurredAt).toLocaleString()}</td><td className={`px-5 py-3.5 font-semibold tabular-nums ${entry.direction === 'in' ? 'text-emerald-300' : 'text-rose-300'}`}>{entry.direction === 'in' ? <span className="inline-flex items-center gap-1"><ArrowUpRight size={15} />+{money(entry.amount, entry.currency)}</span> : <span className="inline-flex items-center gap-1"><ArrowDownRight size={15} />-{money(entry.amount, entry.currency)}</span>}</td><td className="px-5 py-3.5"><p className="capitalize text-slate-200">{readable(entry.eventType)}</p><p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{entry.description || entry.category || 'No description'}</p></td><td className="px-5 py-3.5 text-slate-400">{entry.location}</td></tr>)}</tbody></table></div></section>
    </> : null}
  </div></main>
}
