'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, ClipboardCheck, PackagePlus, RefreshCcw, ShoppingCart, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

type Currency = 'SRD' | 'USD'

interface PortalWallet {
  id: string
  type: string
  currency: Currency
  purpose: string
  balance: number
  lastActivityAt: string
  lastReconciledAt: string | null
}

interface PortalLocation {
  id: string
  name: string
  catalogType: string
  stockQuantity: number
  wallets: PortalWallet[]
}

interface PortalProduct {
  id: string
  name: string
  sellingPriceSrd: number | null
  sellingPriceUsd: number | null
  availability: Array<{ locationId: string; quantity: number }>
}

interface SellerPortalData {
  locations: PortalLocation[]
  products: PortalProduct[]
  notifications: Array<{
    id: string
    walletId: string | null
    title: string
    body: string
    createdAt: string
  }>
}

interface SaleLine {
  itemId: string
  quantity: string
}

function money(value: number, currency: Currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : 'Never'
}

export default function SellerPage() {
  const { user } = useAuth()
  const [portal, setPortal] = useState<SellerPortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ itemId: '', quantity: '1' }])
  const [stockItemId, setStockItemId] = useState('')
  const [stockQuantity, setStockQuantity] = useState('1')
  const [stockAction, setStockAction] = useState<'add' | 'remove'>('add')
  const [busy, setBusy] = useState(false)
  const [reconcileBalances, setReconcileBalances] = useState<Record<string, string>>({})
  const [reconcileNotes, setReconcileNotes] = useState<Record<string, string>>({})

  const loadPortal = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/seller/portal', { cache: 'no-store' })
      const payload = await response.json() as { data?: SellerPortalData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to load your seller workspace.')
      setPortal(payload.data)
      setLocationId((current) => current || payload.data?.locations[0]?.id || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your seller workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPortal()
  }, [loadPortal])

  const selectedLocation = useMemo(
    () => portal?.locations.find((location) => location.id === locationId) ?? null,
    [locationId, portal],
  )
  const availableProducts = useMemo(() => (
    portal?.products.filter((product) => product.availability.some((stock) => stock.locationId === locationId && stock.quantity > 0)) ?? []
  ), [locationId, portal])
  const selectedWallet = useMemo(
    () => selectedLocation?.wallets.find((wallet) => wallet.id === walletId) ?? null,
    [selectedLocation, walletId],
  )

  useEffect(() => {
    if (!selectedLocation) return
    if (!selectedLocation.wallets.some((wallet) => wallet.id === walletId)) {
      setWalletId(selectedLocation.wallets[0]?.id ?? '')
    }
  }, [selectedLocation, walletId])

  const updateSaleLine = (index: number, patch: Partial<SaleLine>) => {
    setSaleLines((lines) => lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  const handleSale = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedWallet || !locationId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/seller/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          walletId: selectedWallet.id,
          currency: selectedWallet.currency,
          items: saleLines.map((line) => ({ itemId: line.itemId, quantity: Number.parseInt(line.quantity, 10) })),
        }),
      })
      const payload = await response.json() as { data?: { totalAmount: number; currency: Currency }; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to record this sale.')
      setSaleLines([{ itemId: '', quantity: '1' }])
      setMessage(`Sale recorded: ${money(payload.data.totalAmount, payload.data.currency)} is now traceable in the finance ledger.`)
      await loadPortal()
    } catch (saleError) {
      setError(saleError instanceof Error ? saleError.message : 'Unable to record this sale.')
    } finally {
      setBusy(false)
    }
  }

  const handleStockUpdate = async (event: FormEvent) => {
    event.preventDefault()
    if (!locationId || !stockItemId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: stockAction,
          itemId: stockItemId,
          locationId,
          quantity: Number.parseInt(stockQuantity, 10),
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to update stock.')
      setStockItemId('')
      setStockQuantity('1')
      setMessage('Stock updated and recorded in the activity log.')
      await loadPortal()
    } catch (stockError) {
      setError(stockError instanceof Error ? stockError.message : 'Unable to update stock.')
    } finally {
      setBusy(false)
    }
  }

  const handleReconciliation = async (event: FormEvent, wallet: PortalWallet) => {
    event.preventDefault()
    const confirmedBalance = reconcileBalances[wallet.id]
    if (confirmedBalance === undefined || confirmedBalance === '') return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/seller/wallet-reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: wallet.id, confirmedBalance: Number(confirmedBalance), note: reconcileNotes[wallet.id] ?? '' }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to reconcile this wallet.')
      setReconcileBalances((values) => ({ ...values, [wallet.id]: '' }))
      setReconcileNotes((values) => ({ ...values, [wallet.id]: '' }))
      setMessage('Wallet reconciliation saved. Any difference was recorded as a separate finance event.')
      await loadPortal()
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error ? reconciliationError.message : 'Unable to reconcile this wallet.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen p-8 text-sm text-muted-foreground">Loading seller workspace…</div>
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-4 pb-20 sm:p-6 lg:p-10">
      <header className="rounded-3xl border border-orange-500/20 bg-linear-to-br from-orange-600 via-orange-700 to-orange-900 p-6 text-white shadow-xl sm:p-8">
        <p className="text-sm font-semibold text-orange-100">Seller workspace</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Hello{user?.name ? `, ${user.name}` : ''}.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-orange-100">
          Record sales, add stock, and confirm wallet balances for only the locations assigned to your account.
        </p>
      </header>

      {error && <div className="flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700"><AlertCircle size={18} />{error}</div>}
      {message && <div className="flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} />{message}</div>}

      {portal?.notifications.length ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <h2 className="flex items-center gap-2 font-bold text-foreground"><AlertCircle size={18} className="text-amber-600" />Wallet attention needed</h2>
          <div className="mt-3 space-y-2">
            {portal.notifications.map((notification) => <p key={notification.id} className="text-sm text-muted-foreground">{notification.body}</p>)}
          </div>
        </section>
      ) : null}

      {!portal?.locations.length ? (
        <section className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Your account has no assigned location yet. Ask an administrator to assign one.</section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            {portal.locations.map((location) => (
              <button key={location.id} type="button" onClick={() => setLocationId(location.id)} className={`rounded-2xl border p-5 text-left transition-colors ${location.id === locationId ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/40'}`}>
                <p className="text-sm text-muted-foreground">{location.catalogType}</p>
                <p className="mt-1 text-lg font-bold text-foreground">{location.name}</p>
                <p className="mt-3 text-sm text-muted-foreground">{location.stockQuantity} items in stock</p>
              </button>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <form onSubmit={handleSale} className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><ShoppingCart size={19} className="text-primary" />Record sale</h2>
              <p className="mt-1 text-sm text-muted-foreground">Prices and totals are calculated on the server; no manual price overrides.</p>
              <label className="mt-4 block text-sm font-medium">Deposit wallet
                <select value={walletId} onChange={(event) => setWalletId(event.target.value)} className="mt-1 w-full rounded-xl border bg-background p-3" required>
                  <option value="">Select a wallet</option>
                  {selectedLocation?.wallets.filter((wallet) => wallet.purpose === 'operational').map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.type} · {wallet.currency} · {money(wallet.balance, wallet.currency)}</option>)}
                </select>
              </label>
              <div className="mt-4 space-y-3">
                {saleLines.map((line, index) => (
                  <div className="grid grid-cols-[1fr_90px_auto] gap-2" key={index}>
                    <select value={line.itemId} onChange={(event) => updateSaleLine(index, { itemId: event.target.value })} className="rounded-xl border bg-background p-3" required>
                      <option value="">Product</option>
                      {availableProducts.map((product) => {
                        const quantity = product.availability.find((stock) => stock.locationId === locationId)?.quantity ?? 0
                        const price = selectedWallet?.currency === 'USD' ? product.sellingPriceUsd : product.sellingPriceSrd
                        return <option key={product.id} value={product.id}>{product.name} · {quantity} left · {price === null ? 'No price' : money(price, selectedWallet?.currency ?? 'SRD')}</option>
                      })}
                    </select>
                    <input value={line.quantity} onChange={(event) => updateSaleLine(index, { quantity: event.target.value })} type="number" min="1" className="rounded-xl border bg-background p-3" required />
                    <button type="button" onClick={() => setSaleLines((lines) => lines.length === 1 ? lines : lines.filter((_, lineIndex) => lineIndex !== index))} className="rounded-xl border px-3 text-sm" aria-label="Remove sale line">×</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2"><button type="button" onClick={() => setSaleLines((lines) => [...lines, { itemId: '', quantity: '1' }])} className="rounded-xl border px-3 py-2 text-sm">Add product</button><button disabled={busy || !selectedWallet} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save sale</button></div>
            </form>

            <form onSubmit={handleStockUpdate} className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><PackagePlus size={19} className="text-primary" />Add stock</h2>
              <p className="mt-1 text-sm text-muted-foreground">Stock changes are limited to your selected location and fully logged.</p>
              <label className="mt-4 block text-sm font-medium">Change
                <select value={stockAction} onChange={(event) => setStockAction(event.target.value as 'add' | 'remove')} className="mt-1 w-full rounded-xl border bg-background p-3">
                  <option value="add">Add stock</option>
                  <option value="remove">Remove stock</option>
                </select>
              </label>
              <label className="mt-4 block text-sm font-medium">Product
                <select value={stockItemId} onChange={(event) => setStockItemId(event.target.value)} className="mt-1 w-full rounded-xl border bg-background p-3" required>
                  <option value="">Select a product</option>
                  {portal.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className="mt-4 block text-sm font-medium">Quantity
                <input value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} type="number" min="1" className="mt-1 w-full rounded-xl border bg-background p-3" required />
              </label>
              <button type="submit" disabled={busy} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{stockAction === 'add' ? 'Add stock' : 'Remove stock'}</button>
            </form>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><Wallet size={19} className="text-primary" />Wallet confirmations</h2>
            <p className="mt-1 text-sm text-muted-foreground">Confirm the real amount in each wallet. Any difference becomes a separate, immutable finance event.</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {selectedLocation?.wallets.map((wallet) => (
                <form key={wallet.id} onSubmit={(event) => void handleReconciliation(event, wallet)} className="rounded-xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{wallet.type} · {wallet.currency}</p><p className="text-sm text-muted-foreground">Recorded: {money(wallet.balance, wallet.currency)}</p></div><ClipboardCheck size={20} className="text-primary" /></div>
                  <p className="mt-2 text-xs text-muted-foreground">Last confirmed: {displayDate(wallet.lastReconciledAt)}</p>
                  <input value={reconcileBalances[wallet.id] ?? ''} onChange={(event) => setReconcileBalances((values) => ({ ...values, [wallet.id]: event.target.value }))} placeholder="Confirmed balance" type="number" min="0" step="0.01" className="mt-3 w-full rounded-xl border bg-card p-3" required />
                  <input value={reconcileNotes[wallet.id] ?? ''} onChange={(event) => setReconcileNotes((values) => ({ ...values, [wallet.id]: event.target.value }))} placeholder="Reason if the amount differs" className="mt-2 w-full rounded-xl border bg-card p-3" />
                  <button disabled={busy} className="mt-3 rounded-xl border border-primary/30 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">Confirm wallet</button>
                </form>
              ))}
            </div>
          </section>
        </>
      )}

      <div className="flex justify-end"><button type="button" onClick={() => void loadPortal()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"><RefreshCcw size={16} />Refresh</button></div>
      <p className="text-center text-xs text-muted-foreground">Need a different location or account change? <Link href="/" className="underline">Contact an administrator.</Link></p>
    </main>
  )
}
