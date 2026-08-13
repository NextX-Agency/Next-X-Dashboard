import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

export async function GET(request: NextRequest) {
  const actor = await requireAdmin(request)
  if (actor instanceof NextResponse) return actor
  const rates = await prisma.exchangeRate.findMany({ orderBy: { setAt: 'desc' } })
  return NextResponse.json({ data: rates })
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request)
  if (actor instanceof NextResponse) return actor
  try {
    const body = await request.json() as { usdToSrd?: unknown }
    const usdToSrd = Number(body.usdToSrd)
    if (!Number.isFinite(usdToSrd) || usdToSrd <= 0) return NextResponse.json({ error: 'Exchange rate must be greater than zero.' }, { status: 400 })
    const data = await runSerializableTransaction(async (tx) => {
      const previous = await tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } })
      await tx.exchangeRate.updateMany({ where: { isActive: true }, data: { isActive: false } })
      const rate = await tx.exchangeRate.create({ data: { usdToSrd, isActive: true }, select: { id: true } })
      const items = await tx.item.findMany({ where: { deletedAt: null, sellingPriceSrd: { not: null } }, select: { id: true, sellingPriceSrd: true } })
      for (const item of items) {
        const srd = Number(item.sellingPriceSrd)
        if (srd > 0) await tx.item.update({ where: { id: item.id }, data: { sellingPriceUsd: Math.round((srd / usdToSrd) * 10000) / 10000 } })
      }
      await writeActivityLog({ action: 'update', entityType: 'exchange_rate', entityId: rate.id, entityName: `1 USD = ${usdToSrd} SRD`, details: `Changed rate from ${previous ? Number(previous.usdToSrd) : 'none'}; repriced ${items.length} active catalog items.`, user: actor, request, source: 'server', client: tx })
      return { id: rate.id, repricedItems: items.length }
    })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Exchange mutation error:', error)
    return NextResponse.json({ error: 'Unable to update exchange rate.' }, { status: 500 })
  }
}
