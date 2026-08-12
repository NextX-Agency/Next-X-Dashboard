import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

function parseName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 2) throw new Error('Category names need at least 2 characters.')
  if (name.length > 80) throw new Error('Category names can be at most 80 characters.')
  return name
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const name = parseName(body.name)
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.expenseCategory.create({ data: { name } })
      await writeActivityLog({
        action: 'create', entityType: 'expense_category', entityId: created.id, entityName: name,
        details: `Created protected expense category ${name}.`, user, request, source: 'expense-categories-api', client: tx,
      })
      return created
    })
    return NextResponse.json({ data: category }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create expense category.' }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw new Error('Category id is required.')
    const name = parseName(body.name)
    const category = await prisma.$transaction(async (tx) => {
      const current = await tx.expenseCategory.findUnique({ where: { id }, select: { id: true, name: true } })
      if (!current) throw new Error('Expense category not found.')
      const updated = await tx.expenseCategory.update({ where: { id }, data: { name } })
      await writeActivityLog({
        action: 'update', entityType: 'expense_category', entityId: id, entityName: name,
        details: `Renamed expense category from ${current.name} to ${name}.`, user, request, source: 'expense-categories-api', client: tx,
      })
      return updated
    })
    return NextResponse.json({ data: category })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update expense category.' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user

  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) throw new Error('Category id is required.')
    await prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.findUnique({ where: { id }, select: { id: true, name: true } })
      if (!category) throw new Error('Expense category not found.')
      const expenseCount = await tx.expense.count({ where: { categoryId: id } })
      if (expenseCount > 0) throw new Error('This category is used by recorded expenses and cannot be deleted. Rename it instead to preserve financial history.')
      await tx.expenseCategory.delete({ where: { id } })
      await writeActivityLog({
        action: 'delete', entityType: 'expense_category', entityId: id, entityName: category.name,
        details: `Deleted unused expense category ${category.name}.`, user, request, source: 'expense-categories-api', client: tx,
      })
    })
    return NextResponse.json({ data: { id } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete expense category.' }, { status: 400 })
  }
}
