import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

const mapLocation = (location: any) => ({ ...location, company_id: location.companyId, seller_name: location.seller_name, seller_phone: location.seller_phone, commission_rate: Number(location.commission_rate), is_active: location.is_active, catalog_type: location.catalogType, created_at: location.createdAt, updated_at: location.updatedAt, wallets: location.wallets?.map((wallet: any) => ({ ...wallet, company_id: wallet.companyId, person_name: wallet.personName, location_id: wallet.location_id, created_at: wallet.createdAt, updated_at: wallet.updatedAt })) })

export async function GET(request: NextRequest) {
  const actor = await requireAdmin(request); if (actor instanceof NextResponse) return actor
  const [locations, stock] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: 'asc' }, include: { wallets: true } }),
    prisma.stock.findMany(),
  ])
  return NextResponse.json({ data: { locations: locations.map(mapLocation), stock: stock.map((row) => ({ ...row, item_id: row.itemId, location_id: row.locationId, created_at: row.createdAt, updated_at: row.updatedAt })) } })
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request); if (actor instanceof NextResponse) return actor
  try {
    const body = await request.json() as Record<string, unknown>
    const action = body.action
    const data = await runSerializableTransaction(async (tx) => {
      const id = typeof body.id === 'string' ? body.id : null
      if (action === 'retire') {
        if (!id) throw new Error('Location is required.')
        const location = await tx.location.update({ where: { id }, data: { is_active: false }, select: { id: true, name: true } })
        await writeActivityLog({ action: 'update', entityType: 'location', entityId: location.id, entityName: location.name, details: 'Retired location without deleting linked financial or stock history.', user: actor, request, source: 'server', client: tx })
        return location
      }
      if (action !== 'save') throw new Error('Unsupported location action.')
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw new Error('Location name is required.')
      const catalogType = body.catalog_type === 'audio' || body.catalog_type === 'watches' ? body.catalog_type : 'all'
      const values = { name, address: typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null, seller_name: typeof body.seller_name === 'string' && body.seller_name.trim() ? body.seller_name.trim() : null, seller_phone: typeof body.seller_phone === 'string' && body.seller_phone.trim() ? body.seller_phone.trim() : null, is_active: body.is_active !== false, catalogType }
      const location = id ? await tx.location.update({ where: { id }, data: values, select: { id: true, name: true } }) : await tx.location.create({ data: { companyId: (await tx.company.findFirstOrThrow({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } })).id, ...values }, select: { id: true, name: true } })
      await writeActivityLog({ action: id ? 'update' : 'create', entityType: 'location', entityId: location.id, entityName: location.name, details: `${id ? 'Updated' : 'Created'} location.`, user: actor, request, source: 'server', client: tx })
      return location
    })
    return NextResponse.json({ data })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save location.' }, { status: 400 }) }
}
