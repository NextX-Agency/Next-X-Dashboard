import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { FinanceRegisterInputError, parseRegisterCurrency, parseRegisterDate, parseRegisterMoney, text, toNumber } from '@/lib/financeRegister'

function serialise(asset: { id: string; name: string; category: string; acquiredOn: Date; cost: unknown; residualValue: unknown; currency: string; depreciationMethod: string; usefulLifeMonths: number | null; accumulatedDepreciation: unknown; status: string; disposedOn: Date | null; disposalProceeds: unknown; notes: string | null }) {
  return { ...asset, acquiredOn: asset.acquiredOn.toISOString().slice(0, 10), cost: toNumber(asset.cost as never), residualValue: toNumber(asset.residualValue as never), accumulatedDepreciation: toNumber(asset.accumulatedDepreciation as never), disposedOn: asset.disposedOn?.toISOString().slice(0, 10) ?? null, disposalProceeds: asset.disposalProceeds == null ? null : toNumber(asset.disposalProceeds as never) }
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })
  const assets = await prisma.fixedAsset.findMany({ where: { companyId: company.id }, orderBy: [{ status: 'asc' }, { acquiredOn: 'desc' }] })
  return NextResponse.json({ data: assets.map(serialise) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json() as Record<string, unknown>
    const name = text(body.name, 'name')!
    const category = text(body.category, 'category')!
    const acquiredOn = parseRegisterDate(body.acquiredOn, 'acquiredOn')!
    const cost = parseRegisterMoney(body.cost, 'cost')!
    const residualValue = parseRegisterMoney(body.residualValue ?? 0, 'residualValue')!
    const depreciationMethod = body.depreciationMethod === 'none' ? 'none' : 'straight_line'
    const usefulLifeMonths = depreciationMethod === 'none' ? null : Number(body.usefulLifeMonths)
    if (residualValue > cost) throw new FinanceRegisterInputError('residualValue cannot exceed cost.')
    if (depreciationMethod === 'straight_line' && (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0)) throw new FinanceRegisterInputError('usefulLifeMonths must be a positive whole number for straight-line depreciation.')
    const asset = await runSerializableTransaction(async (tx) => {
      const company = await tx.company.findFirst({ where: { isActive: true }, select: { id: true } })
      if (!company) throw new FinanceRegisterInputError('No active company is configured.')
      return tx.fixedAsset.create({ data: { companyId: company.id, name, category, acquiredOn, cost, residualValue, currency: parseRegisterCurrency(body.currency ?? 'SRD'), depreciationMethod, usefulLifeMonths, notes: text(body.notes, 'notes', false) } })
    })
    return NextResponse.json({ data: serialise(asset) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add asset.' }, { status: error instanceof FinanceRegisterInputError ? 400 : 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json() as Record<string, unknown>
    const id = text(body.id, 'id')!
    const asset = await runSerializableTransaction(async (tx) => {
      const current = await tx.fixedAsset.findUnique({ where: { id } })
      if (!current) throw new FinanceRegisterInputError('Asset not found.')
      if (current.status === 'disposed') throw new FinanceRegisterInputError('Disposed assets are retained as immutable history.')
      const isDisposal = body.action === 'dispose'
      if (isDisposal) {
        const disposedOn = parseRegisterDate(body.disposedOn, 'disposedOn')!
        return tx.fixedAsset.update({ where: { id }, data: { status: 'disposed', disposedOn, disposalProceeds: parseRegisterMoney(body.disposalProceeds ?? 0, 'disposalProceeds')! } })
      }
      return tx.fixedAsset.update({ where: { id }, data: { name: body.name === undefined ? current.name : text(body.name, 'name')!, category: body.category === undefined ? current.category : text(body.category, 'category')!, notes: body.notes === undefined ? current.notes : text(body.notes, 'notes', false) } })
    })
    return NextResponse.json({ data: serialise(asset) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update asset.' }, { status: error instanceof FinanceRegisterInputError ? 400 : 500 })
  }
}
