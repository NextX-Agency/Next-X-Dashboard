import { Prisma } from '@prisma/client'

export class FinanceRegisterInputError extends Error {}

export function parseRegisterDate(value: unknown, field: string, required = true) {
  if (value == null || value === '') {
    if (required) throw new FinanceRegisterInputError(`${field} is required.`)
    return null
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FinanceRegisterInputError(`${field} must use YYYY-MM-DD.`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new FinanceRegisterInputError(`${field} is invalid.`)
  return date
}

export function parseRegisterMoney(value: unknown, field: string, required = true) {
  if ((value == null || value === '') && !required) return null
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new FinanceRegisterInputError(`${field} must be a non-negative number.`)
  return Math.round((amount + Number.EPSILON) * 10000) / 10000
}

export function parseRegisterCurrency(value: unknown) {
  if (value === 'SRD' || value === 'USD') return value
  throw new FinanceRegisterInputError('currency must be SRD or USD.')
}

export function text(value: unknown, field: string, required = true) {
  const parsed = typeof value === 'string' ? value.trim() : ''
  if (required && !parsed) throw new FinanceRegisterInputError(`${field} is required.`)
  return parsed || null
}

export function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0)
}
