'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, FileText, Landmark, RefreshCcw, ShieldCheck, Sparkles, XCircle } from 'lucide-react'

type Gate = { id: string; label: string; complete: boolean; detail: string }
type Checklist = {
  period: { key: string; start: string; end: string }
  gates: Gate[]
  blockers: string[]
  canClose: boolean
  approvedBills: number
  fxRun: { status: string } | null
  payoutRun: { status: string; blockedBy: string | null } | null
}
type Bill = { id: string; sourceDocumentName: string; vendorName: string | null; invoiceNumber: string | null; invoiceDate: string | null; dueDate: string | null; description: string | null; amount: number | null; currency: string | null; classification: string; categoryId: string | null; walletId: string | null; locationId: string | null; status: string; createdAt: string }
type Asset = { id: string; status: string }
type Investment = { id: string; status: string }
type BillOptions = { wallets: Array<{ id: string; label: string; currency: string; location_id: string | null }>; locations: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }> }
const CLASSIFICATIONS = ['operating', 'inventory', 'payroll', 'marketing', 'tax_fee', 'owner_draw', 'other', 'unclassified']

function priorMonthEnd() {
  return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 0)).toISOString().slice(0, 10)
}
function monthStart(periodEnd: string) { return `${periodEnd.slice(0, 7)}-01` }
function money(amount: number | null, currency: string | null) { return amount == null ? 'Needs amount' : `${currency ?? ''} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

export default function FinanceClosePage() {
  const [periodEnd, setPeriodEnd] = useState(priorMonthEnd)
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [options, setOptions] = useState<BillOptions>({ wallets: [], locations: [], categories: [] })
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [documentName, setDocumentName] = useState('Pasted supplier invoice')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [checkRes, billRes, assetRes, investmentRes, optionsRes] = await Promise.all([
        fetch(`/api/finance/close-checklist?periodEnd=${encodeURIComponent(periodEnd)}`, { cache: 'no-store' }),
        fetch('/api/finance/bills', { cache: 'no-store' }),
        fetch('/api/finance/assets', { cache: 'no-store' }),
        fetch('/api/finance/investments', { cache: 'no-store' }),
        fetch('/api/finance/bill-options', { cache: 'no-store' }),
      ])
      const checkPayload = await checkRes.json() as { data?: Checklist; error?: string }
      if (!checkRes.ok || !checkPayload.data) throw new Error(checkPayload.error ?? 'Unable to load close checklist.')
      setChecklist(checkPayload.data)
      const [billPayload, assetPayload, investmentPayload, optionsPayload] = await Promise.all([billRes.json(), assetRes.json(), investmentRes.json(), optionsRes.json()]) as [{ data?: Bill[] }, { data?: Asset[] }, { data?: Investment[] }, { data?: BillOptions }]
      setBills(billRes.ok ? billPayload.data ?? [] : [])
      setAssets(assetRes.ok ? assetPayload.data ?? [] : [])
      setInvestments(investmentRes.ok ? investmentPayload.data ?? [] : [])
      setOptions(optionsRes.ok && optionsPayload.data ? optionsPayload.data : { wallets: [], locations: [], categories: [] })
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load finance controls.') }
    finally { setLoading(false) }
  }, [periodEnd])

  useEffect(() => { void load() }, [load])

  const activeAssets = assets.filter((asset) => asset.status === 'active').length
  const activeInvestments = investments.filter((investment) => investment.status === 'active').length
  const run = async (name: string, url: string, body: Record<string, unknown>) => {
    setWorking(name); setError(null); setNotice(null)
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json() as { data?: { status?: string; blockedDetail?: string }; error?: string }
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${name}.`)
      setNotice(payload.data?.blockedDetail ?? `${name} completed.`)
      await load()
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : `Unable to ${name}.`) }
    finally { setWorking(null) }
  }
  const addBillDraft = async () => {
    if (!ocrText.trim()) { setError('Paste OCR text from the supplier document first.'); return }
    await run('Create supplier-bill draft', '/api/finance/bills', { ocrText, sourceDocumentName: documentName })
    setOcrText('')
  }
  const updateBill = async (action: 'update' | 'approve' | 'post') => {
    if (!selectedBill) return
    setWorking(`${action} bill`); setError(null); setNotice(null)
    try {
      const body = action === 'update' ? { ...selectedBill, action } : { id: selectedBill.id, action }
      const response = await fetch('/api/finance/bills', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json() as { data?: Bill; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error ?? `Unable to ${action} bill.`)
      setSelectedBill(payload.data); setNotice(action === 'update' ? 'Draft saved.' : action === 'approve' ? 'Bill approved. Post it only after one final review.' : 'Bill posted to the expense and immutable ledger.')
      await load()
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : `Unable to ${action} bill.`) }
    finally { setWorking(null) }
  }

  return <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-4 pb-20 sm:p-6 lg:p-10">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><Link href="/finance" className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft size={15} />Money trail</Link><p className="mt-4 text-sm font-semibold text-primary">Month-end control center</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Close only when the evidence agrees</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">This workspace turns the finance controls into a checklist. Closing is enforced again by the database, so an API or browser cannot bypass a failed gate.</p></div>
      <div className="flex flex-wrap items-center gap-2"><input aria-label="Period end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="rounded-xl border bg-card px-3 py-2 text-sm" /><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm font-semibold"><RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />Refresh</button></div>
    </header>
    {error ? <div className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-800"><AlertTriangle size={17} />{error}</div> : null}
    {notice ? <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-900"><CheckCircle2 size={17} />{notice}</div> : null}
    {checklist ? <>
      <section className={`rounded-2xl border p-5 shadow-sm ${checklist.canClose ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold">{checklist.period.key} close window</p><p className="mt-1 text-sm text-muted-foreground">{checklist.period.start} through {checklist.period.end}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${checklist.canClose ? 'bg-emerald-600 text-white' : 'bg-amber-500/20 text-amber-900'}`}>{checklist.canClose ? 'Ready to lock' : `${checklist.blockers.length} gate${checklist.blockers.length === 1 ? '' : 's'} open`}</span></div>{!checklist.canClose ? <ul className="mt-4 space-y-1 text-sm text-amber-950">{checklist.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul> : null}</section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{checklist.gates.map((gate) => <article key={gate.id} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold">{gate.label}</p>{gate.complete ? <CheckCircle2 className="shrink-0 text-emerald-600" size={20} /> : <XCircle className="shrink-0 text-amber-600" size={20} />}</div><p className="mt-3 text-sm text-muted-foreground">{gate.detail}</p></article>)}</section>
        <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-primary" /><h2 className="text-lg font-bold">Close controls</h2></div><p className="mt-1 text-sm text-muted-foreground">These actions create evidence before the immutable period lock is requested.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => void run('Run FX revaluation', '/api/finance/fx-revaluation', { periodEnd })} disabled={working !== null} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary disabled:opacity-50"><p className="font-semibold">Run FX revaluation</p><p className="mt-1 text-xs text-muted-foreground">Uses a current USD/SRD rate; stale rates are blocked.</p></button><button type="button" onClick={() => void run('Draft payout evaluation', '/api/cron/payouts', { periodEnd })} disabled={working !== null} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary disabled:opacity-50"><p className="font-semibold">Draft payout evaluation</p><p className="mt-1 text-xs text-muted-foreground">Records a conservative draft when any breaker applies.</p></button><button type="button" onClick={() => void run('Close accounting period', '/api/finance/periods', { periodStart: monthStart(periodEnd), periodEnd })} disabled={!checklist.canClose || working !== null} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-left transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"><p className="font-semibold">Lock period</p><p className="mt-1 text-xs text-muted-foreground">Database rechecks every gate inside the Serializable close transaction.</p></button></div></div>
        <aside className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><Landmark size={19} className="text-primary" /><h2 className="text-lg font-bold">Finance registers</h2></div><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between rounded-xl border bg-background p-3"><span>Active fixed assets</span><strong>{activeAssets}</strong></div><div className="flex justify-between rounded-xl border bg-background p-3"><span>Active investments</span><strong>{activeInvestments}</strong></div><div className="flex justify-between rounded-xl border bg-background p-3"><span>Approved bills awaiting post</span><strong className={checklist.approvedBills ? 'text-amber-700' : 'text-emerald-700'}>{checklist.approvedBills}</strong></div></div></aside></section>
      <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]"><div className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><Sparkles size={19} className="text-primary" /><h2 className="text-lg font-bold">Supplier bill intake</h2></div><p className="mt-1 text-sm text-muted-foreground">Paste OCR text from an invoice to create a reviewable draft. Nothing is paid until it is approved and explicitly posted.</p><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} className="mt-4 w-full rounded-xl border bg-background px-3 py-2 text-sm" placeholder="Document label" /><textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} className="mt-3 min-h-36 w-full rounded-xl border bg-background p-3 text-sm" placeholder={'Supplier name\nInvoice INV-123\nDate 2026-07-31\nTotal USD 25.00'} /><button type="button" onClick={() => void addBillDraft()} disabled={working !== null} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><FileText size={16} />Create draft from text</button></div><div className="overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="border-b p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardCheck size={19} className="text-primary" />Recent supplier-bill queue</h2><p className="mt-1 text-sm text-muted-foreground">Select a draft to complete its review. Posted bills link to immutable expense evidence.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{bills.slice(0, 8).map((bill) => <tr key={bill.id} className={`cursor-pointer border-t ${selectedBill?.id === bill.id ? 'bg-primary/5' : 'hover:bg-muted/30'}`} onClick={() => setSelectedBill(bill)}><td className="px-4 py-3 font-medium">{bill.sourceDocumentName}</td><td className="px-4 py-3 text-muted-foreground">{bill.vendorName ?? 'Needs review'}</td><td className="px-4 py-3">{money(bill.amount, bill.currency)}</td><td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold capitalize">{bill.status}</span></td></tr>)}{bills.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No supplier bills in the inbox.</td></tr> : null}</tbody></table></div></div></section>
      {selectedBill ? <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-primary">Bill review</p><h2 className="text-lg font-bold">{selectedBill.sourceDocumentName}</h2></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold capitalize">{selectedBill.status}</span></div>{selectedBill.status === 'draft' ? <><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input value={selectedBill.vendorName ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, vendorName: event.target.value })} className="rounded-xl border bg-background px-3 py-2 text-sm" placeholder="Supplier" /><input value={selectedBill.invoiceNumber ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, invoiceNumber: event.target.value })} className="rounded-xl border bg-background px-3 py-2 text-sm" placeholder="Invoice number" /><input type="date" value={selectedBill.invoiceDate ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, invoiceDate: event.target.value })} className="rounded-xl border bg-background px-3 py-2 text-sm" /><input type="number" min="0" step="0.01" value={selectedBill.amount ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, amount: event.target.value === '' ? null : Number(event.target.value) })} className="rounded-xl border bg-background px-3 py-2 text-sm" placeholder="Amount" /><select value={selectedBill.currency ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, currency: event.target.value || null })} className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="">Currency</option><option value="SRD">SRD</option><option value="USD">USD</option></select><select value={selectedBill.classification} onChange={(event) => setSelectedBill({ ...selectedBill, classification: event.target.value })} className="rounded-xl border bg-background px-3 py-2 text-sm">{CLASSIFICATIONS.map((classification) => <option key={classification} value={classification}>{classification.replaceAll('_', ' ')}</option>)}</select><select value={selectedBill.locationId ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, locationId: event.target.value || null })} className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="">Location</option>{options.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><select value={selectedBill.walletId ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, walletId: event.target.value || null })} className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="">Wallet</option>{options.wallets.filter((wallet) => !selectedBill.locationId || wallet.location_id === selectedBill.locationId).filter((wallet) => !selectedBill.currency || wallet.currency === selectedBill.currency).map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.label}</option>)}</select><select value={selectedBill.categoryId ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, categoryId: event.target.value || null })} className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="">Optional category</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input value={selectedBill.description ?? ''} onChange={(event) => setSelectedBill({ ...selectedBill, description: event.target.value })} className="rounded-xl border bg-background px-3 py-2 text-sm md:col-span-2 xl:col-span-3" placeholder="Clear business purpose" /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void updateBill('update')} disabled={working !== null} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50">Save draft</button><button type="button" onClick={() => void updateBill('approve')} disabled={working !== null} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Approve for posting</button></div></> : selectedBill.status === 'approved' ? <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"><AlertTriangle size={18} className="text-amber-700" /><p className="flex-1 text-sm">Approval is recorded. Posting will debit the selected wallet and create the expense + ledger evidence in one transaction.</p><button type="button" onClick={() => void updateBill('post')} disabled={working !== null} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Post approved bill</button></div> : <p className="mt-4 text-sm text-muted-foreground">This bill is retained as {selectedBill.status} history and cannot be changed.</p>}</section> : null}
    </> : <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Loading close controls…</div>}
  </main>
}
