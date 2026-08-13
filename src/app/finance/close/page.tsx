'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, FileText, Landmark, RefreshCcw, Sparkles, XCircle } from 'lucide-react'
import { FinanceWorkspaceNav } from '@/components/finance/FinanceWorkspaceNav'

type Gate = { id: string; label: string; complete: boolean; detail: string }
type Checklist = { period: { key: string; start: string; end: string }; gates: Gate[]; blockers: string[]; canClose: boolean; approvedBills: number; fxRun: { status: string } | null; payoutRun: { status: string; blockedBy: string | null } | null }
type Bill = { id: string; sourceDocumentName: string; vendorName: string | null; invoiceNumber: string | null; invoiceDate: string | null; dueDate: string | null; description: string | null; amount: number | null; currency: string | null; classification: string; categoryId: string | null; walletId: string | null; locationId: string | null; status: string; createdAt: string }
type BillOptions = {
  wallets: Array<{ id: string; label: string; currency: string; location_id: string | null }>
  locations: Array<{ id: string; name: string }>
  categories: Array<{ id: string; name: string }>
  purchaseOrders: Array<{ id: string; supplier: string; locationId: string; location: string; currency: string; outstandingAmount: number }>
}

const CLASSIFICATIONS = ['operating', 'inventory', 'payroll', 'marketing', 'tax_fee', 'owner_draw', 'other', 'unclassified']
const EMPTY_OPTIONS: BillOptions = { wallets: [], locations: [], categories: [], purchaseOrders: [] }

function priorMonthEnd() {
  return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0)).toISOString().slice(0, 10)
}

function monthStart(periodEnd: string) {
  return `${periodEnd.slice(0, 7)}-01`
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return 'Needs amount'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency === 'USD' ? 'USD' : 'SRD', maximumFractionDigits: 2 }).format(amount)
}

function statusTone(status: string) {
  if (status === 'posted' || status === 'paid') return 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100'
  if (status === 'approved' || status === 'partial') return 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100'
  if (status === 'rejected' || status === 'cancelled') return 'border-rose-300/20 bg-rose-300/[0.08] text-rose-100'
  return 'border-white/[0.1] bg-white/[0.05] text-slate-300'
}

export default function FinanceClosePage() {
  const [periodEnd, setPeriodEnd] = useState(priorMonthEnd)
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [options, setOptions] = useState<BillOptions>(EMPTY_OPTIONS)
  const [activeAssets, setActiveAssets] = useState(0)
  const [activeInvestments, setActiveInvestments] = useState(0)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [documentName, setDocumentName] = useState('Pasted supplier invoice')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [checkRes, billRes, assetRes, investmentRes, optionsRes] = await Promise.all([
        fetch(`/api/finance/close-checklist?periodEnd=${encodeURIComponent(periodEnd)}`, { cache: 'no-store' }),
        fetch('/api/finance/bills', { cache: 'no-store' }),
        fetch('/api/finance/assets', { cache: 'no-store' }),
        fetch('/api/finance/investments', { cache: 'no-store' }),
        fetch('/api/finance/bill-options', { cache: 'no-store' }),
      ])
      const checkPayload = await checkRes.json() as { data?: Checklist; error?: string }
      if (!checkRes.ok || !checkPayload.data) throw new Error(checkPayload.error ?? 'Unable to load the close checklist.')
      const [billPayload, assetPayload, investmentPayload, optionsPayload] = await Promise.all([billRes.json(), assetRes.json(), investmentRes.json(), optionsRes.json()]) as [{ data?: Bill[] }, { data?: Array<{ status: string }> }, { data?: Array<{ status: string }> }, { data?: BillOptions }]
      setChecklist(checkPayload.data)
      setBills(billRes.ok ? billPayload.data ?? [] : [])
      setActiveAssets(assetRes.ok ? (assetPayload.data ?? []).filter((asset) => asset.status === 'active').length : 0)
      setActiveInvestments(investmentRes.ok ? (investmentPayload.data ?? []).filter((investment) => investment.status === 'active').length : 0)
      setOptions(optionsRes.ok && optionsPayload.data ? optionsPayload.data : EMPTY_OPTIONS)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load finance controls.')
    } finally {
      setLoading(false)
    }
  }, [periodEnd])

  useEffect(() => { void load() }, [load])

  const matchingPurchaseOrders = useMemo(() => options.purchaseOrders.filter((order) => (
    (!selectedBill?.currency || order.currency === selectedBill.currency) &&
    (!selectedBill?.locationId || order.locationId === selectedBill.locationId)
  )), [options.purchaseOrders, selectedBill?.currency, selectedBill?.locationId])

  const run = async (name: string, url: string, body: Record<string, unknown>) => {
    setWorking(name)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json() as { data?: { blockedDetail?: string }; error?: string }
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${name}.`)
      setNotice(payload.data?.blockedDetail ?? `${name} completed.`)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${name}.`)
    } finally {
      setWorking(null)
    }
  }

  const addBillDraft = async () => {
    if (!ocrText.trim()) {
      setError('Paste OCR text from the supplier document first.')
      return
    }
    await run('Create supplier-bill draft', '/api/finance/bills', { ocrText, sourceDocumentName: documentName })
    setOcrText('')
  }

  const updateBill = async (action: 'update' | 'approve' | 'post') => {
    if (!selectedBill) return
    setWorking(`${action} bill`)
    setError(null)
    setNotice(null)
    try {
      const body = action === 'update'
        ? { ...selectedBill, action }
        : { id: selectedBill.id, action, ...(action === 'post' && selectedPurchaseOrderId ? { purchaseOrderId: selectedPurchaseOrderId } : {}) }
      const response = await fetch('/api/finance/bills', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json() as { data?: Bill; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error ?? `Unable to ${action} bill.`)
      setSelectedBill(payload.data)
      setNotice(action === 'update' ? 'Draft saved.' : action === 'approve' ? 'Bill approved. Post it only after one final review.' : selectedPurchaseOrderId ? 'Bill posted and its purchase commitment was settled in the same transaction.' : 'Bill posted to the expense and immutable ledger.')
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} bill.`)
    } finally {
      setWorking(null)
    }
  }

  const selectBill = (bill: Bill) => {
    setSelectedBill(bill)
    setSelectedPurchaseOrderId('')
  }

  return <main className="finance-control-workspace min-h-screen bg-[#090d13] text-slate-100">
    <div className="mx-auto max-w-[1440px] px-4 pb-20 pt-5 sm:px-6 lg:px-10 lg:pt-8">
      <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/finance" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-300 transition hover:text-orange-200"><ArrowLeft size={14} />Finance overview</Link>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">Month-end workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl">Close only when the evidence agrees.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">This workspace follows an order from its payable commitment through supplier-bill settlement and into an immutable close.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2">
          <label className="px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="period-end">Period end</label>
          <input id="period-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="rounded-lg border border-white/[0.1] bg-[#0b111a] px-3 py-2 text-sm text-slate-100" />
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.1]"><RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>
        </div>
      </header>

      <div className="mt-5"><FinanceWorkspaceNav active="close" /></div>
      {error ? <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" />{error}</div> : null}
      {notice ? <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-sm text-emerald-100"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />{notice}</div> : null}

      {!checklist && loading ? <div className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-white/[0.08] bg-[#101620] text-sm text-slate-400"><span className="inline-flex items-center gap-2"><RefreshCcw size={17} className="animate-spin text-orange-300" />Loading close controls</span></div> : null}
      {checklist ? <>
        <section className={`mt-5 overflow-hidden rounded-2xl border ${checklist.canClose ? 'border-emerald-300/20 bg-emerald-300/[0.06]' : 'border-amber-300/20 bg-[#171411]'}`}>
          <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{checklist.period.key} close window</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{checklist.canClose ? 'Evidence is ready for a period lock.' : `${checklist.blockers.length} close gate${checklist.blockers.length === 1 ? '' : 's'} remain open.`}</h2><p className="mt-2 text-sm text-slate-400">{checklist.period.start} through {checklist.period.end}</p></div>
            <span className={`w-fit rounded-lg border px-3 py-2 text-xs font-bold ${checklist.canClose ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'}`}>{checklist.canClose ? 'Ready to lock' : 'Action required'}</span>
          </div>
          {!checklist.canClose ? <ul className="border-t border-amber-100/10 px-5 py-4 text-sm leading-6 text-amber-100 sm:px-6">{checklist.blockers.map((blocker) => <li key={blocker} className="flex gap-2"><span className="text-amber-300">•</span>{blocker}</li>)}</ul> : null}
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{checklist.gates.map((gate) => <article key={gate.id} className="rounded-xl border border-white/[0.08] bg-[#101620] p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-100">{gate.label}</p>{gate.complete ? <CheckCircle2 size={18} className="shrink-0 text-emerald-300" /> : <XCircle size={18} className="shrink-0 text-amber-300" />}</div><p className="mt-3 text-xs leading-5 text-slate-500">{gate.detail}</p></article>)}</section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="border-b border-white/[0.08] px-5 py-5 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Close controls</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Create proof before you lock.</h2><p className="mt-2 text-sm leading-6 text-slate-400">Each action is checked again inside its server transaction. A lock cannot rely on a stale screen.</p></div><div className="grid gap-px bg-white/[0.08] sm:grid-cols-3"><button type="button" onClick={() => void run('Run FX revaluation', '/api/finance/fx-revaluation', { periodEnd })} disabled={working !== null} className="bg-[#101620] p-5 text-left transition hover:bg-white/[0.035] disabled:cursor-not-allowed disabled:opacity-50"><p className="font-semibold text-slate-100">Run FX revaluation</p><p className="mt-2 text-xs leading-5 text-slate-500">Blocks if the active USD/SRD rate is stale.</p></button><button type="button" onClick={() => void run('Draft payout evaluation', '/api/cron/payouts', { periodEnd })} disabled={working !== null} className="bg-[#101620] p-5 text-left transition hover:bg-white/[0.035] disabled:cursor-not-allowed disabled:opacity-50"><p className="font-semibold text-slate-100">Draft payout evaluation</p><p className="mt-2 text-xs leading-5 text-slate-500">Records a conservative draft whenever a breaker applies.</p></button><button type="button" onClick={() => void run('Close accounting period', '/api/finance/periods', { periodStart: monthStart(periodEnd), periodEnd })} disabled={!checklist.canClose || working !== null} className="bg-emerald-300/[0.06] p-5 text-left transition hover:bg-emerald-300/[0.1] disabled:cursor-not-allowed disabled:opacity-50"><p className="font-semibold text-emerald-100">Lock period</p><p className="mt-2 text-xs leading-5 text-emerald-100/65">The database rechecks every close gate in the Serializable transaction.</p></button></div></article>
          <aside className="rounded-2xl border border-white/[0.09] bg-[#101620] p-5 sm:p-6"><div className="flex items-center gap-2"><Landmark size={18} className="text-orange-300" /><h2 className="font-semibold text-white">Finance registers</h2></div><div className="mt-5 space-y-3"><div className="flex items-center justify-between rounded-xl bg-white/[0.035] px-3 py-3 text-sm"><span className="text-slate-400">Active fixed assets</span><strong className="tabular-nums text-white">{activeAssets}</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[0.035] px-3 py-3 text-sm"><span className="text-slate-400">Active investments</span><strong className="tabular-nums text-white">{activeInvestments}</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[0.035] px-3 py-3 text-sm"><span className="text-slate-400">Approved bills to post</span><strong className={`tabular-nums ${checklist.approvedBills ? 'text-amber-200' : 'text-emerald-200'}`}>{checklist.approvedBills}</strong></div></div></aside>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(300px,.78fr)_minmax(0,1.22fr)]">
          <article className="rounded-2xl border border-white/[0.09] bg-[#101620] p-5 sm:p-6"><div className="flex items-center gap-2"><Sparkles size={18} className="text-orange-300" /><h2 className="text-lg font-semibold text-white">Supplier bill intake</h2></div><p className="mt-2 text-sm leading-6 text-slate-400">Paste invoice text to create a reviewable draft. Nothing is paid from this form until approval and posting.</p><label className="mt-5 block text-xs font-semibold text-slate-300" htmlFor="document-name">Document label</label><input id="document-name" value={documentName} onChange={(event) => setDocumentName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[0.1] bg-[#0b111a] px-3 py-2.5 text-sm text-slate-100" /><label className="mt-4 block text-xs font-semibold text-slate-300" htmlFor="bill-ocr">Invoice text</label><textarea id="bill-ocr" value={ocrText} onChange={(event) => setOcrText(event.target.value)} className="mt-2 min-h-40 w-full rounded-xl border border-white/[0.1] bg-[#0b111a] p-3 text-sm text-slate-100" placeholder={'Supplier name\nInvoice INV-123\nDate 2026-07-31\nTotal USD 25.00'} /><button type="button" onClick={() => void addBillDraft()} disabled={working !== null} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-300 px-4 py-2.5 text-sm font-bold text-[#17100b] transition hover:bg-orange-200 disabled:opacity-50"><FileText size={16} />Create draft</button></article>
          <article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex items-end justify-between gap-3 border-b border-white/[0.08] px-5 py-5 sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Supplier-bill queue</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Review the evidence, then settle the commitment.</h2></div><ClipboardCheck size={19} className="text-orange-300" /></div>{bills.length ? <div className="divide-y divide-white/[0.06]">{bills.slice(0, 8).map((bill) => <button key={bill.id} type="button" onClick={() => selectBill(bill)} className={`grid w-full gap-3 px-5 py-4 text-left transition sm:grid-cols-[minmax(0,1fr)_130px_110px] sm:items-center sm:px-6 ${selectedBill?.id === bill.id ? 'bg-orange-300/[0.08]' : 'hover:bg-white/[0.025]'}`}><span><span className="block truncate text-sm font-semibold text-slate-200">{bill.sourceDocumentName}</span><span className="mt-1 block truncate text-xs text-slate-500">{bill.vendorName ?? 'Supplier needs review'} · {bill.invoiceNumber ?? 'No invoice number'}</span></span><span className="text-sm font-semibold tabular-nums text-slate-200 sm:text-right">{money(bill.amount, bill.currency)}</span><span className={`w-fit rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide sm:justify-self-end ${statusTone(bill.status)}`}>{bill.status}</span></button>)}</div> : <div className="grid min-h-52 place-items-center px-5 text-center text-sm text-slate-500">No supplier bills are waiting for review.</div>}</article>
        </section>

        {selectedBill ? <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]"><div className="flex flex-col justify-between gap-3 border-b border-white/[0.08] px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-300">Bill review</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{selectedBill.sourceDocumentName}</h2></div><span className={`w-fit rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${statusTone(selectedBill.status)}`}>{selectedBill.status}</span></div>{selectedBill.status === 'draft' ? <><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4 sm:p-6"><Field label="Supplier"><input value={selectedBill.vendorName ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, vendorName: event.target.value })} className="field" /></Field><Field label="Invoice number"><input value={selectedBill.invoiceNumber ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, invoiceNumber: event.target.value })} className="field" /></Field><Field label="Invoice date"><input type="date" value={selectedBill.invoiceDate ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, invoiceDate: event.target.value })} className="field" /></Field><Field label="Amount"><input type="number" min="0" step="0.01" value={selectedBill.amount ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, amount: event.target.value === '' ? null : Number(event.target.value) })} className="field tabular-nums" /></Field><Field label="Currency"><select value={selectedBill.currency ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, currency: event.target.value || null })} className="field"><option value="">Choose currency</option><option value="SRD">SRD</option><option value="USD">USD</option></select></Field><Field label="Classification"><select value={selectedBill.classification} onChange={(event) => setSelectedBill({ ...selectedBill, classification: event.target.value })} className="field">{CLASSIFICATIONS.map((classification) => <option key={classification} value={classification}>{classification.replaceAll('_', ' ')}</option>)}</select></Field><Field label="Location"><select value={selectedBill.locationId ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, locationId: event.target.value || null })} className="field"><option value="">Choose location</option>{options.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field><Field label="Wallet"><select value={selectedBill.walletId ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, walletId: event.target.value || null })} className="field"><option value="">Choose wallet</option>{options.wallets.filter((wallet) => !selectedBill.locationId || wallet.location_id === selectedBill.locationId).filter((wallet) => !selectedBill.currency || wallet.currency === selectedBill.currency).map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.label}</option>)}</select></Field><Field label="Expense category"><select value={selectedBill.categoryId ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, categoryId: event.target.value || null })} className="field"><option value="">Optional category</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Purchase commitment"><select value={selectedPurchaseOrderId} onChange={(event) => setSelectedPurchaseOrderId(event.target.value)} className="field"><option value="">Not linked to a purchase order</option>{matchingPurchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.supplier} · {money(order.outstandingAmount, order.currency)} · {order.location}</option>)}</select></Field><Field label="Business purpose" className="md:col-span-2 xl:col-span-2"><input value={selectedBill.description ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, description: event.target.value })} className="field" /></Field></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-5 py-4 sm:px-6"><p className="max-w-2xl text-xs leading-5 text-slate-500">Link an eligible purchase commitment when this invoice settles an order. The server checks location, currency, and remaining payable amount before any wallet write.</p><div className="flex gap-2"><button type="button" onClick={() => void updateBill('update')} disabled={working !== null} className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50">Save draft</button><button type="button" onClick={() => void updateBill('approve')} disabled={working !== null} className="rounded-xl bg-orange-300 px-4 py-2.5 text-sm font-bold text-[#17100b] transition hover:bg-orange-200 disabled:opacity-50">Approve for posting</button></div></div></> : selectedBill.status === 'approved' ? <div className="p-5 sm:p-6"><div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4"><div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" /><div><h3 className="font-semibold text-amber-100">Final posting check</h3><p className="mt-1 text-sm leading-6 text-slate-400">Posting creates the expense, wallet transaction, ledger entry, and — when selected — settles the purchase commitment in one Serializable transaction.</p></div></div><label className="mt-4 block text-xs font-semibold text-slate-300" htmlFor="approved-purchase-order">Purchase commitment to settle (optional)</label><select id="approved-purchase-order" value={selectedPurchaseOrderId} onChange={(event) => setSelectedPurchaseOrderId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[0.1] bg-[#0b111a] px-3 py-2.5 text-sm text-slate-100"><option value="">No purchase-order link</option>{matchingPurchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.supplier} · {money(order.outstandingAmount, order.currency)} outstanding · {order.location}</option>)}</select><div className="mt-4 flex justify-end"><button type="button" onClick={() => void updateBill('post')} disabled={working !== null} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-[#07140e] transition hover:bg-emerald-200 disabled:opacity-50">Post approved bill</button></div></div></div> : <p className="p-6 text-sm text-slate-400">This bill is retained as immutable {selectedBill.status} history.</p>}</section> : null}
      </> : null}
    </div>
  </main>
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-semibold text-slate-300">{label}</span>{children}</label>
}
