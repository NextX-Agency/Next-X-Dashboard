import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { runSerializableTransaction } from '@/lib/serializableTransaction'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

const mapCategory = (value: any) => ({ ...value, catalog_type: value.catalogType, created_at: value.createdAt })
const mapItem = (value: any) => ({ ...value, category_id: value.categoryId, purchase_price_usd: Number(value.purchasePriceUsd), selling_price_srd: value.sellingPriceSrd == null ? null : Number(value.sellingPriceSrd), selling_price_usd: value.sellingPriceUsd == null ? null : Number(value.sellingPriceUsd), image_url: value.imageUrl, is_public: value.isPublic, is_combo: value.is_combo, allow_custom_price: value.allow_custom_price, catalog_type: value.catalogType, deleted_at: value.deletedAt, created_at: value.createdAt, updated_at: value.updatedAt })

export async function GET(request: NextRequest) {
  const actor = await requireAdmin(request); if (actor instanceof NextResponse) return actor
  const [categories, items] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.item.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' }, include: { combo_items_combo_items_combo_idToitems: { include: { items_combo_items_item_idToitems: true } } } }),
  ])
  return NextResponse.json({ data: { categories: categories.map(mapCategory), items: items.map((item) => ({ ...mapItem(item), combo_items: item.combo_items_combo_items_combo_idToitems.map((combo) => ({ ...combo, combo_id: combo.combo_id, item_id: combo.item_id, item: mapItem(combo.items_combo_items_item_idToitems) })) })) } })
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request); if (actor instanceof NextResponse) return actor
  try {
    const body = await request.json() as Record<string, any>
    const data = await runSerializableTransaction(async (tx) => {
      if (body.action === 'saveCategory') {
        const name = String(body.name ?? '').trim(); if (!name) throw new Error('Category name is required.')
        const values = { name, catalogType: body.catalog_type === 'watches' ? 'watches' : 'audio' }
        const category = body.id ? await tx.category.update({ where: { id: body.id }, data: values }) : await tx.category.create({ data: values })
        await writeActivityLog({ action: body.id ? 'update' : 'create', entityType: 'category', entityId: category.id, entityName: name, details: `${body.id ? 'Updated' : 'Created'} catalog category.`, user: actor, request, source: 'server', client: tx })
        return { id: category.id }
      }
      if (body.action === 'retireCategory') throw new Error('Categories are retained for audit. Rename the category instead.')
      if (body.action === 'retireItem') {
        const item = await tx.item.update({ where: { id: String(body.id) }, data: { deletedAt: new Date(), isPublic: false }, select: { id: true, name: true } })
        await writeActivityLog({ action: 'delete', entityType: 'item', entityId: item.id, entityName: item.name, details: 'Retired catalog item without deleting sales or item history.', user: actor, request, source: 'server', client: tx })
        return { id: item.id }
      }
      if (body.action === 'saveItem') {
        const name = String(body.name ?? '').trim(); if (!name) throw new Error('Item name is required.')
        const comboItems = Array.isArray(body.combo_items) ? body.combo_items.map((value: any) => ({ item_id: String(value.item_id), quantity: Math.max(1, Math.floor(Number(value.quantity) || 0)) })) : []
        const values = { name, brand: body.brand || null, description: body.description || null, categoryId: body.category_id || null, purchasePriceUsd: Math.max(0, Number(body.purchase_price_usd) || 0), sellingPriceSrd: body.selling_price_srd == null ? null : Math.max(0, Number(body.selling_price_srd)), sellingPriceUsd: body.selling_price_usd == null ? null : Math.max(0, Number(body.selling_price_usd)), imageUrl: body.image_url || null, isPublic: Boolean(body.is_public), is_combo: Boolean(body.is_combo), allow_custom_price: Boolean(body.allow_custom_price), catalogType: body.catalog_type === 'watches' ? 'watches' : 'audio' }
        if (values.is_combo && values.catalogType === 'watches') throw new Error('Watch combos are disabled.')
        const item = body.id ? await tx.item.update({ where: { id: String(body.id) }, data: values, select: { id: true, name: true } }) : await tx.item.create({ data: values, select: { id: true, name: true } })
        if (values.is_combo) { await tx.combo_items.deleteMany({ where: { combo_id: item.id } }); if (comboItems.length) await tx.combo_items.createMany({ data: comboItems.map((value: any) => ({ combo_id: item.id, item_id: value.item_id, quantity: value.quantity })) }) }
        await writeActivityLog({ action: body.id ? 'update' : 'create', entityType: 'item', entityId: item.id, entityName: item.name, details: `${body.id ? 'Updated' : 'Created'} catalog ${values.is_combo ? 'combo' : 'item'}.`, user: actor, request, source: 'server', client: tx })
        return { id: item.id }
      }
      throw new Error('Unsupported catalog action.')
    })
    return NextResponse.json({ data })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save catalog data.' }, { status: 400 }) }
}
