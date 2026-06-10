import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  FinanceObligationRecord,
  FinanceObligationStatus,
  FinanceObligationType,
  FinanceObligationsResponse,
} from '@/types/finance'
import type { Currency } from '@/lib/currency'

class ApiError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function toIsoString(value: Date | null | undefined): string {
  return value?.toISOString() ?? new Date(0).toISOString()
}

function toNullableIsoString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new ApiError(`${field} is required.`)
}

function parseOptionalUuid(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new ApiError('Invalid id value.')
}

function parseRequiredText(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new ApiError(`${field} is required.`)
}

function parseOptionalText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

function parseMoney(value: unknown, field: string): number {
  const amount = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'))
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(`${field} must be a positive amount or zero.`)
  }
  return roundMoney(amount)
}

function parseType(value: unknown): FinanceObligationType {
  if (value === 'receivable' || value === 'payable') return value
  throw new ApiError('Type must be receivable or payable.')
}

function parseCurrency(value: unknown): Currency {
  if (value === 'USD' || value === 'SRD') return value
  throw new ApiError('Currency must be SRD or USD.')
}

function parseStatus(value: unknown): FinanceObligationStatus | null {
  if (value == null || value === '') return null
  if (value === 'open' || value === 'partial' || value === 'paid' || value === 'cancelled') return value
  throw new ApiError('Status must be open, partial, paid, or cancelled.')
}

function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new ApiError('Invalid due date.')
  return date
}

function deriveStatus(originalAmount: number, paidAmount: number, requestedStatus: FinanceObligationStatus | null): FinanceObligationStatus {
  if (requestedStatus === 'cancelled') return 'cancelled'
  if (requestedStatus === 'paid') return 'paid'
  if (paidAmount >= originalAmount && originalAmount > 0) return 'paid'
  if (paidAmount > 0) return 'partial'
  return requestedStatus === 'partial' ? 'partial' : 'open'
}

function mapObligation(obligation: {
  id: string
  type: string
  counterpartyName: string
  locationId: string | null
  currency: string
  originalAmount: unknown
  paidAmount: unknown
  status: string
  dueDate: Date | null
  issuedAt: Date
  notes: string | null
  sourceType: string | null
  sourceId: string | null
  createdAt: Date
  updatedAt: Date
  location: { name: string } | null
}): FinanceObligationRecord {
  const originalAmount = toNumber(obligation.originalAmount)
  const paidAmount = toNumber(obligation.paidAmount)

  return {
    id: obligation.id,
    type: obligation.type === 'payable' ? 'payable' : 'receivable',
    counterparty_name: obligation.counterpartyName,
    location_id: obligation.locationId,
    location_name: obligation.location?.name ?? null,
    currency: obligation.currency === 'USD' ? 'USD' : 'SRD',
    original_amount: originalAmount,
    paid_amount: paidAmount,
    outstanding_amount: roundMoney(Math.max(0, originalAmount - paidAmount)),
    status: obligation.status === 'partial' || obligation.status === 'paid' || obligation.status === 'cancelled'
      ? obligation.status
      : 'open',
    due_date: toNullableIsoString(obligation.dueDate),
    issued_at: toIsoString(obligation.issuedAt),
    notes: obligation.notes,
    source_type: obligation.sourceType,
    source_id: obligation.sourceId,
    created_at: toIsoString(obligation.createdAt),
    updated_at: toIsoString(obligation.updatedAt),
  }
}

function financeMutationError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return jsonError(error.message, error.status)

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2022') {
      return jsonError('The finance obligations table is not available yet. Apply the additive finance migration, then try again.', 500)
    }

    if (error.code === 'P2003') {
      return jsonError('The selected location does not exist.', 409)
    }
  }

  console.error(fallback, error)
  return jsonError(fallback, 500)
}

const obligationSelect = {
  id: true,
  type: true,
  counterpartyName: true,
  locationId: true,
  currency: true,
  originalAmount: true,
  paidAmount: true,
  status: true,
  dueDate: true,
  issuedAt: true,
  notes: true,
  sourceType: true,
  sourceId: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { name: true } },
} satisfies Prisma.FinanceObligationSelect

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const type = request.nextUrl.searchParams.get('type')
    const status = request.nextUrl.searchParams.get('status')

    const obligations = await prisma.financeObligation.findMany({
      where: {
        ...(type === 'receivable' || type === 'payable' ? { type } : {}),
        ...(status === 'open' || status === 'partial' || status === 'paid' || status === 'cancelled' ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      select: obligationSelect,
    })

    const data: FinanceObligationsResponse['data'] = {
      obligations: obligations.map(mapObligation),
    }

    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return financeMutationError(error, 'Failed to load finance obligations.')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json() as Record<string, unknown>
    const type = parseType(body.type)
    const counterpartyName = parseRequiredText(body.counterparty_name, 'Counterparty')
    const locationId = parseOptionalUuid(body.location_id)
    const currency = parseCurrency(body.currency ?? 'SRD')
    const originalAmount = parseMoney(body.original_amount, 'Amount')
    const requestedStatus = parseStatus(body.status)
    let paidAmount = parseMoney(body.paid_amount ?? 0, 'Paid amount')

    if (requestedStatus === 'paid') paidAmount = originalAmount
    if (paidAmount > originalAmount) throw new ApiError('Paid amount cannot exceed the original amount.')

    const status = deriveStatus(originalAmount, paidAmount, requestedStatus)

    const obligation = await prisma.$transaction(async (tx) => {
      const created = await tx.financeObligation.create({
        data: {
          type,
          counterpartyName,
          locationId,
          currency,
          originalAmount,
          paidAmount,
          status,
          dueDate: parseOptionalDate(body.due_date),
          issuedAt: parseOptionalDate(body.issued_at) ?? new Date(),
          notes: parseOptionalText(body.notes),
          sourceType: parseOptionalText(body.source_type) ?? 'manual',
          sourceId: parseOptionalUuid(body.source_id),
        },
        select: obligationSelect,
      })

      await tx.activityLog.create({
        data: {
          action: 'create',
          entityType: 'finance_obligation',
          entityId: created.id,
          entityName: counterpartyName,
          details: `Created ${type} for ${counterpartyName}: ${originalAmount.toFixed(2)} ${currency}`,
          userId: authResult.id,
        },
      })

      return created
    })

    return NextResponse.json({ data: mapObligation(obligation) }, { status: 201 })
  } catch (error) {
    return financeMutationError(error, 'Failed to save finance obligation.')
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json() as Record<string, unknown>
    const id = parseUuid(body.id, 'id')

    const obligation = await prisma.$transaction(async (tx) => {
      const current = await tx.financeObligation.findUnique({
        where: { id },
        select: obligationSelect,
      })

      if (!current) throw new ApiError('Finance obligation not found.', 404)

      const type = body.type == null ? current.type as FinanceObligationType : parseType(body.type)
      const counterpartyName = body.counterparty_name == null
        ? current.counterpartyName
        : parseRequiredText(body.counterparty_name, 'Counterparty')
      const locationId = body.location_id === undefined ? current.locationId : parseOptionalUuid(body.location_id)
      const currency = body.currency == null ? current.currency as Currency : parseCurrency(body.currency)
      const originalAmount = body.original_amount == null
        ? toNumber(current.originalAmount)
        : parseMoney(body.original_amount, 'Amount')
      const requestedStatus = parseStatus(body.status)
      let paidAmount = body.paid_amount == null
        ? toNumber(current.paidAmount)
        : parseMoney(body.paid_amount, 'Paid amount')

      if (requestedStatus === 'paid') paidAmount = originalAmount
      if (paidAmount > originalAmount) throw new ApiError('Paid amount cannot exceed the original amount.')

      const status = deriveStatus(originalAmount, paidAmount, requestedStatus ?? current.status as FinanceObligationStatus)

      const updated = await tx.financeObligation.update({
        where: { id },
        data: {
          type,
          counterpartyName,
          locationId,
          currency,
          originalAmount,
          paidAmount,
          status,
          dueDate: body.due_date === undefined ? current.dueDate : parseOptionalDate(body.due_date),
          issuedAt: body.issued_at === undefined ? current.issuedAt : parseOptionalDate(body.issued_at) ?? current.issuedAt,
          notes: body.notes === undefined ? current.notes : parseOptionalText(body.notes),
        },
        select: obligationSelect,
      })

      await tx.activityLog.create({
        data: {
          action: 'update',
          entityType: 'finance_obligation',
          entityId: updated.id,
          entityName: updated.counterpartyName,
          details: `Updated ${updated.type} for ${updated.counterpartyName}: status ${updated.status}`,
          userId: authResult.id,
        },
      })

      return updated
    })

    return NextResponse.json({ data: mapObligation(obligation) })
  } catch (error) {
    return financeMutationError(error, 'Failed to update finance obligation.')
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const id = parseUuid(request.nextUrl.searchParams.get('id'), 'id')

    await prisma.$transaction(async (tx) => {
      const current = await tx.financeObligation.findUnique({
        where: { id },
        select: { id: true, counterpartyName: true, type: true },
      })

      if (!current) throw new ApiError('Finance obligation not found.', 404)

      await tx.financeObligation.delete({ where: { id } })
      await tx.activityLog.create({
        data: {
          action: 'delete',
          entityType: 'finance_obligation',
          entityId: id,
          entityName: current.counterpartyName,
          details: `Deleted ${current.type} for ${current.counterpartyName}`,
          userId: authResult.id,
        },
      })
    })

    return NextResponse.json({ data: { id } })
  } catch (error) {
    return financeMutationError(error, 'Failed to delete finance obligation.')
  }
}
