import { isExpenseClassification } from '@/lib/expenseClassification'

type ParsedBill = {
  vendorName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  amount: number | null
  currency: 'SRD' | 'USD' | null
  description: string | null
}

function date(value: string | undefined) {
  if (!value) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : /^\d{2}[/-]\d{2}[/-]\d{4}$/.test(value)
    ? `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}` : null
  return iso && !Number.isNaN(new Date(`${iso}T00:00:00.000Z`).getTime()) ? iso : null
}

/** Deterministic fallback when no OCR vendor has been configured. */
export function parseBillText(sourceText: string): ParsedBill {
  const lines = sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const currency = /\bUSD\b|\$/.test(sourceText) ? 'USD' : /\bSRD\b/i.test(sourceText) ? 'SRD' : null
  const numeric = [...sourceText.matchAll(/(?:SRD|USD|\$)?\s*([0-9]{1,3}(?:[,.][0-9]{3})*(?:[,.][0-9]{2})|[0-9]+(?:[,.][0-9]{2}))/gi)]
    .map((match) => Number(match[1].replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')))
    .filter(Number.isFinite)
  const invoice = sourceText.match(/(?:invoice|factuur|inv\.?|bill)\s*(?:no\.?|nr\.?|number|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i)?.[1] ?? null
  const dates = [...sourceText.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})\b/g)].map((match) => date(match[0])).filter((value): value is string => Boolean(value))
  return {
    vendorName: lines[0] && lines[0].length <= 160 ? lines[0] : null,
    invoiceNumber: invoice,
    invoiceDate: dates[0] ?? null,
    dueDate: dates[1] ?? null,
    amount: numeric.length ? numeric.at(-1)! : null,
    currency,
    description: lines.slice(0, 3).join(' · ').slice(0, 500) || null,
  }
}

export function text(value: unknown, field: string, required = false) {
  if (value == null || value === '') {
    if (required) throw new Error(`${field} is required.`)
    return null
  }
  const output = String(value).trim()
  if (!output && required) throw new Error(`${field} is required.`)
  return output || null
}

export function billDate(value: unknown, field: string, required = false) {
  const output = text(value, field, required)
  if (!output) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(output) || Number.isNaN(new Date(`${output}T00:00:00.000Z`).getTime())) throw new Error(`${field} must use YYYY-MM-DD.`)
  return new Date(`${output}T00:00:00.000Z`)
}

export function billAmount(value: unknown, required = false) {
  if ((value == null || value === '') && !required) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be greater than zero.')
  return Math.round((amount + Number.EPSILON) * 10000) / 10000
}

export function billCurrency(value: unknown, required = false) {
  if ((value == null || value === '') && !required) return null
  if (value === 'SRD' || value === 'USD') return value
  throw new Error('currency must be SRD or USD.')
}

export function billClassification(value: unknown, required = false) {
  if ((value == null || value === '') && !required) return 'unclassified'
  if (!isExpenseClassification(value)) throw new Error('classification is invalid.')
  if (required && value === 'unclassified') throw new Error('Choose a financial classification before approval.')
  return value
}
