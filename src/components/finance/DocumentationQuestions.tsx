'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, HelpCircle, Layers, RefreshCcw, Sparkles } from 'lucide-react'
import { EXPENSE_CLASSIFICATIONS, EXPENSE_CLASSIFICATION_LABELS, type ExpenseClassification } from '@/lib/expenseClassification'

/**
 * Turns the documentation gaps into questions instead of a to-do list.
 *
 * The point of grouping is arithmetic: 83 blank suppliers and 64 blank
 * explanations across six categories is six questions, not 147 edits. Answering
 * "every Shipping expense went to <supplier>" fills that whole group at once and
 * can be remembered so new expenses in the category start out documented.
 *
 * Classification is asked per expense on purpose — the open rows are a
 * headlight, a subscription and stock sitting in one category, and a single
 * answer for all of them would be wrong.
 */

type GroupQuestion = {
  key: string
  field: 'vendor' | 'description'
  categoryId: string | null
  categoryName: string
  suggestion: string | null
  count: number
  totals: Array<{ currency: string; amount: number }>
  earliest: string | null
  latest: string | null
  samples: Array<{ id: string; date: string; amount: number; currency: string; description: string | null }>
}

type IndividualQuestion = {
  id: string
  date: string
  amount: number
  currency: string
  categoryName: string
  description: string | null
  vendorName: string | null
  reviewReason: string | null
  dateIsInferred: boolean
}

export type DocumentationData = {
  generatedAt: string
  summary: {
    expensesNeedingAttention: number
    openFields: number
    byField: Record<'classification' | 'vendor' | 'description' | 'date', number>
    documented: number
    refunded: number
    total: number
  }
  inferred: { dates: number; vendors: number; descriptions: number }
  groups: GroupQuestion[]
  individual: IndividualQuestion[]
}

const CLASSIFICATION_CHOICES = EXPENSE_CLASSIFICATIONS.filter(
  (value): value is Exclude<ExpenseClassification, 'unclassified'> => value !== 'unclassified',
)

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function range(earliest: string | null, latest: string | null) {
  if (!earliest || !latest) return null
  return earliest === latest ? shortDate(earliest) : `${shortDate(earliest)} – ${shortDate(latest)}`
}

export function DocumentationQuestions({ onResolved }: { onResolved?: () => void }) {
  const [data, setData] = useState<DocumentationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/finance/documentation', { cache: 'no-store' })
      const payload = (await response.json()) as { data?: DocumentationData; error?: string }
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Unable to load the questions.')
      setData(payload.data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the questions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = useCallback(async (body: Record<string, unknown>, success: string) => {
    setError(null)
    setNotice(null)
    const response = await fetch('/api/finance/documentation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as { data?: { updated: number }; error?: string }
    if (!response.ok || !payload.data) {
      setError(payload.error || 'Unable to record that answer.')
      return false
    }
    setNotice(success.replace('{n}', String(payload.data.updated)))
    await load()
    onResolved?.()
    return true
  }, [load, onResolved])

  const remaining = useMemo(
    () => (data ? data.groups.length + data.individual.length : 0),
    [data],
  )

  if (loading && !data) {
    return <section className="grid min-h-40 place-items-center rounded-2xl border border-white/[0.08] bg-[#101620]">
      <span className="inline-flex items-center gap-2 text-sm text-slate-400">
        <RefreshCcw size={17} className="animate-spin text-orange-300" />Building your questions
      </span>
    </section>
  }

  if (!data) {
    return error ? <section role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.08] p-4 text-sm text-rose-100">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" />{error}
    </section> : null
  }

  return <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101620]">
    <div className="border-b border-white/[0.08] px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-300">Answer instead of edit</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
            {remaining ? `${remaining} question${remaining === 1 ? '' : 's'} close ${data.summary.expensesNeedingAttention} expense${data.summary.expensesNeedingAttention === 1 ? '' : 's'}` : 'Every expense is documented'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {remaining
              ? 'Each answer below is applied to every expense it covers, so you never fill the same field twice. Answers are stored as your words, flagged as a group answer, and written by the server inside one transaction.'
              : 'Nothing is waiting for an answer. New expenses already require a supplier, an explanation and a classification when they are recorded.'}
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]">
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />Refresh
        </button>
      </div>
      {data.inferred.dates > 0 ? <p className="mt-4 flex items-start gap-2 rounded-xl border border-sky-300/15 bg-sky-300/[0.06] px-3 py-2.5 text-xs leading-5 text-sky-100">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-sky-300" />
        {data.inferred.dates} expense dates were filled in from the moment each expense was recorded, because the date column was added without one. They are flagged as inferred, not recorded, and none of them changed the month an expense falls in.
      </p> : null}
    </div>

    {error ? <p role="alert" className="mx-5 mt-5 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2.5 text-sm text-rose-100 sm:mx-6">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-300" />{error}
    </p> : null}
    {notice ? <p className="mx-5 mt-5 flex items-start gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2.5 text-sm text-emerald-100 sm:mx-6">
      <Check size={15} className="mt-0.5 shrink-0 text-emerald-300" />{notice}
    </p> : null}

    {remaining === 0 ? null : <div className="space-y-3 p-4 sm:p-5">
      {data.groups.map((group) => <GroupCard key={group.key} group={group} onSubmit={submit} />)}
      {data.individual.map((expense) => <IndividualCard key={expense.id} expense={expense} onSubmit={submit} />)}
    </div>}
  </section>
}

function GroupCard({ group, onSubmit }: {
  group: GroupQuestion
  onSubmit: (body: Record<string, unknown>, success: string) => Promise<boolean>
}) {
  const [value, setValue] = useState(group.suggestion ?? '')
  const [remember, setRemember] = useState(Boolean(group.categoryId))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const question = group.field === 'vendor'
    ? `Who were these ${group.count} ${group.categoryName} expenses paid to?`
    : `What were these ${group.count} ${group.categoryName} expenses for?`
  const period = range(group.earliest, group.latest)

  const handle = async () => {
    setBusy(true)
    await onSubmit(
      { kind: 'group', field: group.field, categoryId: group.categoryId, value, remember },
      `Answered for {n} ${group.categoryName} expense${group.count === 1 ? '' : 's'}.`,
    )
    setBusy(false)
  }

  return <article className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-300/10 text-orange-300"><Layers size={17} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold leading-6 text-white">{question}</h3>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="tabular-nums">{group.totals.map((total) => money(total.amount, total.currency)).join(' · ')}</span>
          {period ? <span className="tabular-nums">{period}</span> : null}
        </p>
      </div>
    </div>

    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={group.field === 'vendor' ? 'Supplier, shop or person paid' : 'What the money was spent on'}
        maxLength={group.field === 'vendor' ? 160 : 500}
        className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#0b1119] px-3.5 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-300/40 focus:ring-2 focus:ring-orange-300/20"
      />
      <button
        type="button"
        onClick={() => void handle()}
        disabled={busy || value.trim().length < 2}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-400 px-4 py-2.5 text-sm font-semibold text-[#1a1206] transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-500"
      >
        {busy ? <RefreshCcw size={15} className="animate-spin" /> : <Check size={15} />}
        Answer for all {group.count}
      </button>
    </div>

    {group.categoryId ? <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-slate-400">
      <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent accent-orange-400" />
      Remember this for new {group.categoryName} expenses, so this question does not come back.
    </label> : null}

    <button type="button" onClick={() => setOpen((previous) => !previous)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200">
      <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
      {open ? 'Hide' : 'Show'} what this answer covers
    </button>
    {open ? <ul className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-3">
      {group.samples.map((sample) => <li key={sample.id} className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
        <span className="tabular-nums text-slate-500">{shortDate(sample.date)}</span>
        <span className="tabular-nums font-semibold text-slate-300">{money(sample.amount, sample.currency)}</span>
        <span className="w-full text-slate-500 sm:w-auto">{sample.description?.trim() || 'no explanation yet'}</span>
      </li>)}
      {group.count > group.samples.length ? <li className="pt-1 text-xs text-slate-600">and {group.count - group.samples.length} more</li> : null}
    </ul> : null}
  </article>
}

function IndividualCard({ expense, onSubmit }: {
  expense: IndividualQuestion
  onSubmit: (body: Record<string, unknown>, success: string) => Promise<boolean>
}) {
  const [choice, setChoice] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const handle = async (classification: string) => {
    setChoice(classification)
    setBusy(true)
    await onSubmit(
      { kind: 'expense', expenseId: expense.id, classification },
      `Classified as ${EXPENSE_CLASSIFICATION_LABELS[classification as ExpenseClassification]}.`,
    )
    setBusy(false)
  }

  return <article className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-300"><HelpCircle size={17} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold leading-6 text-white">
          How should this {money(expense.amount, expense.currency)} expense be classified?
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="tabular-nums">{shortDate(expense.date)}{expense.dateIsInferred ? ' (inferred)' : ''}</span>
          <span>{expense.categoryName}</span>
          {expense.vendorName ? <span>paid to {expense.vendorName}</span> : null}
        </p>
        <p className="mt-2 text-sm text-slate-300">{expense.description?.trim() || 'No explanation recorded yet.'}</p>
        {expense.reviewReason ? <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-xs leading-5 text-amber-100">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" />{expense.reviewReason}
        </p> : null}
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      {CLASSIFICATION_CHOICES.map((classification) => <button
        key={classification}
        type="button"
        disabled={busy}
        onClick={() => void handle(classification)}
        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${
          choice === classification && busy
            ? 'border-orange-300/40 bg-orange-300/15 text-orange-100'
            : 'border-white/[0.1] bg-white/[0.03] text-slate-300 hover:border-orange-300/30 hover:bg-orange-300/10 hover:text-orange-100 disabled:opacity-50'
        }`}
      >
        {EXPENSE_CLASSIFICATION_LABELS[classification]}
      </button>)}
    </div>
  </article>
}
