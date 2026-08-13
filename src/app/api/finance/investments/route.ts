import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { FinanceRegisterInputError, parseRegisterCurrency, parseRegisterDate, parseRegisterMoney, text, toNumber } from '@/lib/financeRegister'

function serialise(holding: { id: string; investee: string; instrument: string; ownershipPercent: unknown; cost: unknown; carryingValue: unknown; currency: string; valuationMethod: string; valuedOn: Date | null; status: string; disposedOn: Date | null; disposalProceeds: unknown; notes: string | null }) {
  return { ...holding, ownershipPercent: holding.ownershipPercent == null ? null : toNumber(holding.ownershipPercent as never), cost: toNumber(holding.cost as never), carryingValue: toNumber(holding.carryingValue as never), valuedOn: holding.valuedOn?.toISOString().slice(0, 10) ?? null, disposedOn: holding.disposedOn?.toISOString().slice(0, 10) ?? null, disposalProceeds: holding.disposalProceeds == null ? null : toNumber(holding.disposalProceeds as never) }
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })
  const holdings = await prisma.investmentHolding.findMany({ where: { companyId: company.id }, orderBy: [{ status: 'asc' }, { investee: 'asc' }] })
  return NextResponse.json({ data: holdings.map(serialise) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json() as Record<string, unknown>
    const cost = parseRegisterMoney(body.cost, 'cost')!
    const carryingValue = parseRegisterMoney(body.carryingValue ?? cost, 'carryingValue')!
    const ownershipPercent = body.ownershipPercent == null || body.ownershipPercent === '' ? null : parseRegisterMoney(body.ownershipPercent, 'ownershipPercent')!
    if (ownershipPercent != null && ownershipPercent > 100) throw new FinanceRegisterInputError('ownershipPercent cannot exceed 100.')
    const holding = await runSerializableTransaction(async (tx) => {
      const company = await tx.company.findFirst({ where: { isActive: true }, select: { id: true } })
      if (!company) throw new FinanceRegisterInputError('No active company is configured.')
      return tx.investmentHolding.create({ data: { companyId: company.id, investee: text(body.investee, 'investee')!, instrument: text(body.instrument, 'instrument')!, ownershipPercent, cost, carryingValue, currency: parseRegisterCurrency(body.currency ?? 'SRD'), valuationMethod: text(body.valuationMethod ?? 'cost', 'valuationMethod')!, valuedOn: parseRegisterDate(body.valuedOn, 'valuedOn', false), notes: text(body.notes, 'notes', false) } })
    })
    return NextResponse.json({ data: serialise(holding) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add investment.' }, { status: error instanceof FinanceRegisterInputError ? 400 : 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json() as Record<string, unknown>
    const id = text(body.id, 'id')!
    const holding = await runSerializableTransaction(async (tx) => {
      const current = await tx.investmentHolding.findUnique({ where: { id } })
      if (!current) throw new FinanceRegisterInputError('Investment not found.')
      if (current.status === 'disposed') throw new FinanceRegisterInputError('Disposed investments are retained as immutable history.')
      if (body.action === 'dispose') return tx.investmentHolding.update({ where: { id }, data: { status: 'disposed', disposedOn: parseRegisterDate(body.disposedOn, 'disposedOn')!, disposalProceeds: parseRegisterMoney(body.disposalProceeds ?? 0, 'disposalProceeds')! } })
      return tx.investmentHolding.update({ where: { id }, data: { carryingValue: body.carryingValue === undefined ? current.carryingValue : parseRegisterMoney(body.carryingValue, 'carryingValue')!, valuationMethod: body.valuationMethod === undefined ? current.valuationMethod : text(body.valuationMethod, 'valuationMethod')!, valuedOn: body.valuedOn === undefined ? current.valuedOn : parseRegisterDate(body.valuedOn, 'valuedOn', false), notes: body.notes === undefined ? current.notes : text(body.notes, 'notes', false) } })
    })
    return NextResponse.json({ data: serialise(holding) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update investment.' }, { status: error instanceof FinanceRegisterInputError ? 400 : 500 })
  }
}
