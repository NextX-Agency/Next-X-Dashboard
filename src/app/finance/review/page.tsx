'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, FileWarning, Package, Receipt, RefreshCcw, ShoppingCart } from 'lucide-react'

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
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 p-4 pb-20 sm:p-6 lg:p-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-primary">Finance review</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Records the system will not guess about</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Every row here is excluded from margin, run rate and payout calculations. Nothing has been
            deleted or altered — these are questions only you can answer, kept visible rather than
            quietly averaged into a number that looks right.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold"
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />Refresh
        </button>
      </header>

      {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700">{error}</div>}
      {loading && !data ? <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">Loading…</div> : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Flagged records</p>
              <p className={`mt-1 text-2xl font-bold ${totalFlagged > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{totalFlagged}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Sales needing review</p>
              <p className="mt-1 text-2xl font-bold">{data.sales.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Expenses needing review</p>
              <p className="mt-1 text-2xl font-bold">{data.expenses.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Voided sales</p>
              <p className="mt-1 text-2xl font-bold">{data.voidedSales}</p>
            </div>
          </section>

          {/* The single largest known gap in the books. */}
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><FileWarning size={19} className="text-amber-700" />Commission payouts with no expense behind them</h2>
            <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
              <strong>{data.commissionPayoutGap.paidCommissions} commissions</strong> are marked paid,
              totalling <strong>{money(data.commissionPayoutGap.totalSrd, 'SRD')}</strong>, against{' '}
              <strong>{data.commissionPayoutGap.payoutExpensesRecorded}</strong> payout expenses recorded.
              The old payout wrote to columns that do not exist and never checked the error, so the
              money left without ever being booked as a cost (F-15).
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              These are <strong>not</strong> inserted automatically — backdating 106 expenses would rewrite
              months already reviewed. The proposed rows are listed in{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{data.commissionPayoutGap.reportPath}</code>{' '}
              for you and your accountant to decide on.
            </p>
          </section>

          <ReviewTable
            title="Sales"
            icon={<ShoppingCart size={19} className="text-primary" />}
            empty="No sales are flagged."
            rows={data.sales.map((sale) => ({
              key: sale.id,
              primary: `${money(sale.totalAmount, sale.currency)} · ${sale.locationName}`,
              secondary: `${new Date(sale.createdAt).toLocaleDateString()} · ${sale.lineItemCount} line item${sale.lineItemCount === 1 ? '' : 's'} · ${sale.id.slice(0, 8)}`,
              reason: sale.reason,
            }))}
          />

          <ReviewTable
            title="Expenses"
            icon={<Receipt size={19} className="text-primary" />}
            empty="No expenses are flagged."
            rows={data.expenses.map((expense) => ({
              key: expense.id,
              primary: `${money(expense.amount, expense.currency)} · ${expense.categoryName ?? 'Uncategorised'}`,
              secondary: `${new Date(expense.createdAt).toLocaleDateString()} · ${expense.classification} · ${expense.description ?? 'No description'}`,
              reason: expense.reason,
            }))}
          />

          <ReviewTable
            title="Products"
            icon={<Package size={19} className="text-primary" />}
            empty="No products are flagged."
            rows={data.items.map((item) => ({
              key: item.id,
              primary: item.name,
              secondary: `Purchase cost ${money(item.purchasePriceUsd, 'USD')}`,
              reason: item.reason,
            }))}
          />
        </>
      ) : null}
    </main>
  )
}

function ReviewTable({ title, icon, rows, empty }: {
  title: string
  icon: React.ReactNode
  empty: string
  rows: Array<{ key: string; primary: string; secondary: string; reason: string | null }>
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">{icon}{title}</h2>
        <span className="text-sm text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{row.primary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.secondary}</p>
              </div>
              <p className="flex max-w-xl items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {row.reason ?? 'Flagged for review.'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
